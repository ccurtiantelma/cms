import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, or, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { DbService } from '../db/db.service';
import { auditLogEntity, pageEntity, pageRevisionEntity } from '../db/schema';
import { AppUserRoles } from '../common/enums';
import { AuditLogService } from '../common/audit-log.service';
import { AuthInfo, PagesQueryParams, PaginationParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { assertRowOwnership, hasElevatedRowAccess, rowOwnershipFilter } from '../common/ownership';
import { mapPgError } from '../common/db-error.mapper';
import { TreeSanitizerService } from '../common/sanitizer/tree-sanitizer.service';
import { BlockPropSanitizerService } from '../common/sanitizer/block-prop-sanitizer.service';
import { BLOCK_REGISTRY_TOKEN, BlockRegistry } from '../blocks/block-registry';
import { BlockTreeValidatorService } from '../blocks/validator/block-tree-validator.service';
import { PublicPageCacheService } from './public-page-cache.service';
import { ValidatableBlockNode } from '../blocks/validator/validatable-node.types';
import { migrateEnvelope, ENVELOPE_VERSION } from '../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../blocks/migration/block-migration.types';
import { assertValidContentTreeShape, assertPayloadWithinLimit, ContentTree } from './content-tree';
import { isReservedSlug, normalizeSlug } from './slug.util';
import {
  isTransitionAllowed,
  PageStatus,
  auditActionForStatusTransition,
  statusTransitionRequiresElevation,
} from './pages.state-machine';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { PageDto } from './dto/page.dto';
import { PageRevisionDetailDto, PageRevisionSummaryDto } from './dto/page-revision.dto';

type PageRow = typeof pageEntity.$inferSelect;
type PageRowWithParent = PageRow & { parent: { guid: string } | null };
type PageRevisionRow = typeof pageRevisionEntity.$inferSelect;
type PageRevisionRowWithAuthor = PageRevisionRow & {
  author: { name: string; surname: string | null };
};

/** Soglia di elevazione editoriale (ADR-18 § D3): sopra `Manager` l'ownership per riga non si applica. */
const OWNERSHIP_ELEVATED_THRESHOLD = AppUserRoles.Manager;

/**
 * Esito dell'innesto della pipeline blocchi (F02/T5, ADR-21 § 3): envelope
 * pronto per la persistenza, alla versione corrente, con `blocks` migrati,
 * validati contro il registro e sanitizzati per `kind`.
 */
interface PersistableContent {
  version: number;
  blocks: ValidatableBlockNode[];
}

/** Un nodo dell'albero segnalato in lettura (SPEC-F02-blocchi.md § 4.3): mai un'eccezione, mai un albero mutato. */
interface ContentIssue {
  path: string;
  code: string;
  details: unknown;
}

/** Colonne ordinabili di `GET /app/pages` (`?o=`), lette per nome dal client. */
const ORDERABLE_PAGE_COLUMNS: Record<string, PgColumn> = {
  title: pageEntity.title,
  slug: pageEntity.slug,
  status: pageEntity.status,
  locale: pageEntity.locale,
  createdAt: pageEntity.createdAt,
  updatedAt: pageEntity.updatedAt,
};

/**
 * CRUD amministrativo delle Pagine (F01/T4). La macchina a stati e la
 * pubblicazione transazionale sono fuori da questo service (T5): qui si
 * scrive solo la bozza (`draftContent`/`draftSeo`), mai `status`.
 *
 * Ordine vincolante di ogni percorso di scrittura dell'albero blocchi
 * (ADR-21 § 3, F02/T5): forma envelope → migrazione → validazione registro →
 * sanitizzazione per `kind` → persistenza. Nessuna `SELECT` preventiva per
 * l'unicità dello slug: il conflitto arriva dal constraint DB e passa da
 * {@link mapPgError}.
 */
@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  /**
   * Inietta l'accesso al DB, l'audit log, il sanitizzatore cieco (F01, resta
   * per `draftSeo`), il validator di registro (T2), il sanitizzatore per
   * `kind` (T3) dell'albero blocchi, e il registro dei tipi dietro il token
   * `BLOCK_REGISTRY_TOKEN` (F02/T7): mai `DEFAULT_BLOCK_REGISTRY` importato come
   * costante fissa qui, perché è questo il punto di consumo che un test e2e
   * deve poter sovrascrivere con un registro di test per verificare la
   * migrazione v1→v2 sul percorso HTTP reale.
   */
  constructor(
    private readonly db: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly treeSanitizer: TreeSanitizerService,
    private readonly blockTreeValidator: BlockTreeValidatorService,
    private readonly blockPropSanitizer: BlockPropSanitizerService,
    @Inject(BLOCK_REGISTRY_TOKEN) private readonly blockRegistry: BlockRegistry,
    private readonly publicPageCache: PublicPageCacheService,
  ) {}

  /** Lista paginata delle Pagine attive. Un `User` vede solo le proprie (ADR-18 § D6). */
  async findAll(authInfo: AuthInfo, params: PagesQueryParams): Promise<Pagination<PageDto>> {
    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;

    const conditions: (SQL | undefined)[] = [eq(pageEntity.isActive, true)];
    const ownership = rowOwnershipFilter(
      authInfo,
      pageEntity.createdBy,
      OWNERSHIP_ELEVATED_THRESHOLD,
    );
    if (ownership) conditions.push(ownership);
    if (params.status) conditions.push(eq(pageEntity.status, params.status));
    if (params.locale) conditions.push(eq(pageEntity.locale, params.locale));
    if (params.q) {
      conditions.push(
        or(ilike(pageEntity.title, `%${params.q}%`), ilike(pageEntity.slug, `%${params.q}%`)),
      );
    }
    const where = and(...conditions);

    const orderColumn = (params.o && ORDERABLE_PAGE_COLUMNS[params.o]) || pageEntity.updatedAt;
    const orderBy = params.d === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const [rows, [{ total }]] = await Promise.all([
      this.db.db.query.pageEntity.findMany({
        where,
        orderBy,
        limit: perPage,
        offset: (page - 1) * perPage,
        with: { parent: { columns: { guid: true } } },
      }),
      this.db.db.select({ total: count() }).from(pageEntity).where(where),
    ]);

    return new Pagination(
      rows.map((row) => this.toDto(row, row.parent?.guid ?? null)),
      total,
      page,
      perPage,
    );
  }

  /** Crea una Pagina in `draft`. `translationGroupId` è sempre generato ex novo (S4). */
  async create(dto: CreatePageDto, authInfo: AuthInfo): Promise<PageDto> {
    const slug = this.normalizeAndValidateSlug(dto.slug ?? dto.title);
    const parent = dto.parentGuid ? await this.loadActiveParentOrThrow(dto.parentGuid) : null;

    const contentInput = dto.draftContent ?? { version: ENVELOPE_VERSION, blocks: [] };
    const content = this.runWriteContentPipeline(contentInput, authInfo);
    const seo = this.toPlainSeo(dto.draftSeo);

    const row = await this.insertOrMapConflict({
      guid: Utils.randomString(16),
      title: dto.title,
      slug,
      locale: dto.locale,
      parentId: parent?.id ?? null,
      translationGroupId: Utils.randomString(16),
      draftContent: content,
      draftSeo: seo,
      createdBy: authInfo.userId,
      updatedBy: authInfo.userId,
    });

    this.logger.log(`Pagina creata (guid=${row.guid}).`);
    return this.toDtoWithContentIssues(row, parent?.guid ?? null);
  }

  /** Dettaglio di una Pagina attiva. `403` su riga altrui, `404` solo su guid inesistente/soft-deleted (ADR-18 § D7). */
  async findOne(guid: string, authInfo: AuthInfo): Promise<PageDto> {
    const row = await this.loadActiveByGuidWithParent(guid);
    assertRowOwnership(
      authInfo,
      row,
      OWNERSHIP_ELEVATED_THRESHOLD,
      'Non puoi visualizzare la pagina di un altro utente.',
    );
    return this.toDtoWithContentIssues(row, row.parent?.guid ?? null);
  }

  /**
   * Aggiorna la bozza. Lock ottimistico: `WHERE version = :version`,
   * incrementata nello stesso `UPDATE`; zero righe aggiornate ⇒ `409`
   * `PAGE_VERSION_CONFLICT`, distinto da `409` `PAGE_SLUG_DUPLICATE`.
   */
  async update(guid: string, dto: UpdatePageDto, authInfo: AuthInfo): Promise<PageDto> {
    const row = await this.loadActiveByGuidWithParent(guid);

    assertRowOwnership(
      authInfo,
      row,
      OWNERSHIP_ELEVATED_THRESHOLD,
      'Non puoi modificare la bozza di un altro utente.',
    );
    if (!hasElevatedRowAccess(authInfo, OWNERSHIP_ELEVATED_THRESHOLD) && row.status !== 'draft') {
      // 403, non 400: la riga È tua, ma "propria bozza" (ADR-18 § D4) significa
      // propria E in draft — fuori da questa condizione sei fuori perimetro, non
      // hai inviato un payload malformato (SPEC-F01 § Test richiesti).
      throw new ForbiddenException('Puoi modificare solo le tue pagine in stato "draft".');
    }

    const setValues: Record<string, unknown> = {
      version: sql`${pageEntity.version} + 1`,
      updatedAt: new Date(),
      updatedBy: authInfo.userId,
    };

    if (dto.title !== undefined) {
      setValues.title = dto.title;
    }
    if (dto.slug !== undefined) {
      setValues.slug = this.normalizeAndValidateSlug(dto.slug);
    }

    let parentGuid = row.parent?.guid ?? null;
    if (Object.prototype.hasOwnProperty.call(dto, 'parentGuid')) {
      if (dto.parentGuid === null) {
        setValues.parentId = null;
        parentGuid = null;
      } else if (dto.parentGuid) {
        const parent = await this.resolveParentForUpdate(row.id, dto.parentGuid);
        setValues.parentId = parent.id;
        parentGuid = parent.guid;
      }
    }

    if (dto.draftContent !== undefined) {
      setValues.draftContent = this.runWriteContentPipeline(dto.draftContent, authInfo);
    }
    if (dto.draftSeo !== undefined) {
      setValues.draftSeo = this.toPlainSeo(dto.draftSeo);
    }

    // Percorso pubblico calcolato **prima** dell'UPDATE (ADR-23 § 4/§ 5): dopo
    // il commit lo slug/genitore in database è già il nuovo, quindi non è più
    // la chiave davvero cacheata. Solo `slug`/`parentGuid` toccano il
    // percorso — un cambio di solo `title`/`draftContent` non muove nulla.
    const pathMayChange = setValues.slug !== undefined || setValues.parentId !== undefined;
    const staleLocations = pathMayChange
      ? await this.publicPageCache.computeSubtreeLocationsBeforeWrite(row.id)
      : [];

    const updatedRow = await this.updateOrMapConflict(row.id, dto.version, setValues);
    if (!updatedRow) {
      throw new ConflictException({
        message: 'La pagina è stata modificata da un altro utente. Ricarica e riprova.',
        code: 'PAGE_VERSION_CONFLICT',
      });
    }

    if (staleLocations.length > 0) {
      await this.publicPageCache.invalidateLocations(staleLocations, authInfo.userId);
    }

    return this.toDtoWithContentIssues(updatedRow, parentGuid);
  }

  /** Soft delete (Admin+, `GuardAdmin` sul controller). Traccia in audit log. */
  async remove(guid: string, authInfo: AuthInfo, ip?: string): Promise<void> {
    const row = await this.loadActiveByGuid(guid);
    assertRowOwnership(
      authInfo,
      row,
      AppUserRoles.Admin,
      'Permessi insufficienti per eliminare questa pagina.',
    );

    // Sottoalbero calcolato prima del soft delete (ADR-23 § 4): `isActive`
    // rompe la risoluzione di un intero ramo (ogni antenato inattivo blocca
    // la discesa a segmenti di T2), quindi anche il pubblico dei discendenti
    // diventa stantio, non solo quello della riga eliminata.
    const staleLocations = await this.publicPageCache.computeSubtreeLocationsBeforeWrite(row.id);

    await this.db.db
      .update(pageEntity)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(eq(pageEntity.id, row.id));

    if (staleLocations.length > 0) {
      await this.publicPageCache.invalidateLocations(staleLocations, authInfo.userId);
    }

    this.logger.log(`Pagina eliminata (guid=${guid}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'pages.delete',
      'pages',
      guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
  }

  /**
   * Transizione di stato (F01/T5). La mappa delle transizioni ammesse è la
   * costante {@link isTransitionAllowed}: ogni transizione fuori mappa è
   * `400 PAGE_STATUS_TRANSITION_NOT_ALLOWED` con il nome della transizione
   * rifiutata. La transizione verso `review` è consentita a un `User` solo
   * sulla propria riga (ADR-18 § D3); ogni altra transizione richiede la
   * soglia elevata (`Manager`+) indipendentemente dalla proprietà della riga.
   * La transizione verso `published` è delegata a {@link publishTransactionally}.
   */
  async changeStatus(
    guid: string,
    dto: ChangeStatusDto,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<PageDto> {
    const row = await this.loadActiveByGuidWithParent(guid);
    const fromStatus = row.status as PageStatus;

    if (!isTransitionAllowed(fromStatus, dto.status)) {
      throw new BadRequestException({
        message: `Transizione di stato non ammessa: "${fromStatus} -> ${dto.status}".`,
        code: 'PAGE_STATUS_TRANSITION_NOT_ALLOWED',
        details: { transition: `${fromStatus}->${dto.status}` },
      });
    }
    const toStatus = dto.status;

    if (statusTransitionRequiresElevation(toStatus)) {
      if (!hasElevatedRowAccess(authInfo, OWNERSHIP_ELEVATED_THRESHOLD)) {
        throw new ForbiddenException('Permessi insufficienti per questa transizione di stato.');
      }
    } else {
      // toStatus === 'review': ammessa a un User, ma solo sulla propria riga.
      assertRowOwnership(
        authInfo,
        row,
        OWNERSHIP_ELEVATED_THRESHOLD,
        'Puoi inviare in revisione solo le tue pagine.',
      );
    }

    if (toStatus === 'published') {
      return this.publishTransactionally(row, authInfo, ip);
    }

    const scheduledAt =
      toStatus === 'scheduled' ? this.parseFutureScheduledAt(dto.scheduledAt) : null;

    const updatedRow = await this.updateOrMapConflict(row.id, row.version, {
      status: toStatus,
      scheduledAt,
      version: sql`${pageEntity.version} + 1`,
      updatedAt: new Date(),
      updatedBy: authInfo.userId,
    });
    if (!updatedRow) {
      throw new ConflictException({
        message: 'La pagina è stata modificata da un altro utente. Ricarica e riprova.',
        code: 'PAGE_VERSION_CONFLICT',
      });
    }

    // Sola chiave della Pagina (ADR-23 § 4): nessuna transizione di stato
    // tocca `slug`/`parentId`, quindi il percorso dei discendenti non è
    // toccato. Invalidazione incondizionata: su una Pagina mai pubblicata è
    // un `DEL` a vuoto, innocuo.
    await this.publicPageCache.invalidatePage(row.id, authInfo.userId);

    this.logger.log(`Pagina guid=${guid}: transizione di stato ${fromStatus} -> ${toStatus}.`);
    await this.auditLogService.log(
      authInfo.userId,
      auditActionForStatusTransition(fromStatus, toStatus),
      'pages',
      guid,
      { from: fromStatus, to: toStatus },
      authInfo.impersonatedBy,
      ip,
    );

    return this.toDtoWithContentIssues(updatedRow, row.parent?.guid ?? null);
  }

  /**
   * Pubblicazione transazionale (SPEC-F01 § Logica di servizio, punto 2):
   * creazione della Revisione (snapshot sanitizzato di `draftContent`/`draftSeo`),
   * aggiornamento di `pages` (`status`/`publishedAt`/`publishedRevisionId`) e
   * scrittura dell'audit log avvengono in un'unica `db.transaction` (pattern
   * di `admin.service.ts`). Il ciclo di FK si risolve inserendo prima la
   * Revisione e aggiornando poi `publishedRevisionId`.
   *
   * `revisionNumber` NON è letto con una `SELECT MAX` prima dell'`UPDATE`
   * (sarebbe la stessa race condition della SELECT preventiva sullo slug):
   * l'`UPDATE ... WHERE version = :version` sulla riga `pages` viene eseguito
   * per primo e acquisisce il lock di riga della transazione, serializzando
   * ogni pubblicazione concorrente sulla stessa Pagina; il numero di
   * revisione successivo è quindi calcolato **dopo** quel lock, all'interno
   * della stessa transazione.
   */
  private async publishTransactionally(
    row: PageRowWithParent,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<PageDto> {
    // Bozza già persistita, non un payload client fresco: pipeline
    // lettura-tollerante (senza richiedere "v"), ma comunque migrazione →
    // validazione → sanitizzazione → controllo payload "persist" (ADR-21
    // § 3). Un albero che ha smesso di essere valido (tipo diventato
    // deprecated/enabled:false nel frattempo) blocca la pubblicazione con lo
    // stesso 400 di una scrittura: non si pubblica un albero non valido.
    const sanitizedContent = this.runPersistedContentPipeline(row.draftContent, authInfo);
    const sanitizedSeo = this.treeSanitizer.sanitizeTree(row.draftSeo);

    const finalRow = await this.db.db.transaction(async (tx) => {
      const [lockedPage] = await tx
        .update(pageEntity)
        .set({
          status: 'published',
          publishedAt: new Date(),
          scheduledAt: null,
          version: sql`${pageEntity.version} + 1`,
          updatedAt: new Date(),
          updatedBy: authInfo.userId,
        })
        .where(
          and(
            eq(pageEntity.id, row.id),
            eq(pageEntity.version, row.version),
            eq(pageEntity.isActive, true),
          ),
        )
        .returning();

      if (!lockedPage) {
        throw new ConflictException({
          message: 'La pagina è stata modificata da un altro utente. Ricarica e riprova.',
          code: 'PAGE_VERSION_CONFLICT',
        });
      }

      const [{ maxRevisionNumber }] = await tx
        .select({
          maxRevisionNumber: sql<number>`coalesce(max(${pageRevisionEntity.revisionNumber}), 0)`,
        })
        .from(pageRevisionEntity)
        .where(eq(pageRevisionEntity.pageId, lockedPage.id));

      let revision: PageRevisionRow;
      try {
        [revision] = await tx
          .insert(pageRevisionEntity)
          .values({
            guid: Utils.randomString(16),
            pageId: lockedPage.id,
            revisionNumber: maxRevisionNumber + 1,
            title: lockedPage.title,
            slug: lockedPage.slug,
            content: sanitizedContent,
            seo: sanitizedSeo,
            createdBy: authInfo.userId,
          })
          .returning();
      } catch (err) {
        mapPgError(err); // rilancia sempre — 409 REVISION_NUMBER_CONFLICT su `page_revisions_page_number_uq`
      }

      const [publishedPage] = await tx
        .update(pageEntity)
        .set({ publishedRevisionId: revision.id })
        .where(eq(pageEntity.id, lockedPage.id))
        .returning();

      // Audit log nella stessa transazione: se fallisce, l'intera pubblicazione
      // viene annullata (SPEC-F01 § Logica di servizio, punto 2).
      await tx.insert(auditLogEntity).values({
        guid: Utils.randomString(16),
        userId: authInfo.userId,
        action: 'pages.publish',
        entity: 'pages',
        entityId: row.guid,
        details: JSON.stringify({
          revisionGuid: revision.guid,
          revisionNumber: revision.revisionNumber,
        }),
        impersonatedBy: authInfo.impersonatedBy ?? null,
        ip: ip ?? null,
      });

      return publishedPage;
    });

    // Dopo il commit (ADR-23 § 4): una lettura concorrente prima di questo
    // punto ripopolerebbe la chiave con lo stato pre-pubblicazione.
    await this.publicPageCache.invalidatePage(finalRow.id, authInfo.userId);

    this.logger.log(`Pagina pubblicata (guid=${row.guid}).`);
    return this.toDtoWithContentIssues(finalRow, row.parent?.guid ?? null);
  }

  /**
   * Elenco paginato delle Revisioni di una Pagina, più recenti prima.
   * Stessa visibilità del dettaglio Pagina (ADR-18 § D6): `403` su riga
   * altrui, `404` solo su guid inesistente/soft-deleted.
   */
  async listRevisions(
    guid: string,
    authInfo: AuthInfo,
    params: PaginationParams,
  ): Promise<Pagination<PageRevisionSummaryDto>> {
    const row = await this.loadActiveByGuid(guid);
    assertRowOwnership(
      authInfo,
      row,
      OWNERSHIP_ELEVATED_THRESHOLD,
      'Non puoi visualizzare le revisioni di una pagina di un altro utente.',
    );

    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;
    const where = eq(pageRevisionEntity.pageId, row.id);

    const [rows, [{ total }]] = await Promise.all([
      this.db.db.query.pageRevisionEntity.findMany({
        where,
        orderBy: desc(pageRevisionEntity.revisionNumber),
        limit: perPage,
        offset: (page - 1) * perPage,
        with: { author: { columns: { name: true, surname: true } } },
      }),
      this.db.db.select({ total: count() }).from(pageRevisionEntity).where(where),
    ]);

    return new Pagination(
      rows.map((r) => this.toRevisionSummaryDto(r)),
      total,
      page,
      perPage,
    );
  }

  /**
   * Dettaglio di una Revisione, snapshot completo incluso (S1). Stessa
   * visibilità dell'elenco: `403` su riga altrui, `404` se la Pagina o la
   * Revisione non esistono/non appartengono l'una all'altra.
   */
  async getRevision(
    guid: string,
    revisionGuid: string,
    authInfo: AuthInfo,
  ): Promise<PageRevisionDetailDto> {
    const row = await this.loadActiveByGuid(guid);
    assertRowOwnership(
      authInfo,
      row,
      OWNERSHIP_ELEVATED_THRESHOLD,
      'Non puoi visualizzare le revisioni di una pagina di un altro utente.',
    );

    const revision = await this.loadRevisionOrThrow(row.id, revisionGuid);
    return this.toRevisionDetailDto(revision);
  }

  /**
   * Ripristina una Revisione: crea una **nuova bozza** a partire dallo
   * snapshot scelto (`draftContent`/`draftSeo`), senza toccare la Revisione
   * (immutabile, ADR-19) né lo stato della Pagina né la ripubblicazione, che
   * restano una decisione separata dell'operatore (business-rules.md §
   * Revisioni, regola 3). Riservato a `Manager`+ (`GuardManager` sul
   * controller); il check qui è una difesa in profondità, non l'unica linea.
   */
  async restoreRevision(
    guid: string,
    revisionGuid: string,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<PageDto> {
    const row = await this.loadActiveByGuidWithParent(guid);
    assertRowOwnership(
      authInfo,
      row,
      AppUserRoles.Manager,
      'Permessi insufficienti per ripristinare una revisione di questa pagina.',
    );

    const revision = await this.loadRevisionOrThrow(row.id, revisionGuid);

    // La Revisione è stata sanitizzata/migrata con lo schema in vigore al
    // momento della pubblicazione: ripassa dall'intera pipeline di lettura-
    // tollerante (migrazione → validazione → sanitizzazione, senza
    // richiedere "v" — la Revisione può essere pre-F02) prima di scrivere la
    // bozza, altrimenti un'allowlist inasprita o un tipo diventato
    // deprecated/enabled:false nel frattempo verrebbero aggirati dal
    // ripristino. Il risultato porta ogni nodo già alla `v` corrente
    // (prodotto dalla migrazione): coerente con "restore produce una bozza
    // già alla versione corrente" (PLAN-F02 T5). Se la Revisione ripristinata
    // fallisce la validazione di registro oggi, il ripristino è respinto con
    // lo stesso 400 di una scrittura — non si scrive un albero non valido.
    const sanitizedContent = this.runPersistedContentPipeline(revision.content, authInfo);
    const sanitizedSeo = this.treeSanitizer.sanitizeTree(revision.seo);

    const updatedRow = await this.updateOrMapConflict(row.id, row.version, {
      draftContent: sanitizedContent,
      draftSeo: sanitizedSeo,
      version: sql`${pageEntity.version} + 1`,
      updatedAt: new Date(),
      updatedBy: authInfo.userId,
    });
    if (!updatedRow) {
      throw new ConflictException({
        message: 'La pagina è stata modificata da un altro utente. Ricarica e riprova.',
        code: 'PAGE_VERSION_CONFLICT',
      });
    }

    this.logger.log(
      `Pagina guid=${guid}: ripristinata bozza dalla revisione ${revision.revisionNumber}.`,
    );
    await this.auditLogService.log(
      authInfo.userId,
      'pages.restore-revision',
      'pages',
      guid,
      { revisionGuid, revisionNumber: revision.revisionNumber },
      authInfo.impersonatedBy,
      ip,
    );

    return this.toDtoWithContentIssues(updatedRow, row.parent?.guid ?? null);
  }

  // ─── Helpers privati ──────────────────────────────────────────────────────

  /** Normalizza uno slug/titolo e lo respinge se vuoto dopo normalizzazione o riservato. */
  private normalizeAndValidateSlug(source: string): string {
    const slug = normalizeSlug(source);
    if (!slug) {
      throw new BadRequestException({
        message: 'Slug non valido: nessun carattere alfanumerico utilizzabile.',
        code: 'PAGE_SLUG_INVALID',
      });
    }
    if (isReservedSlug(slug)) {
      throw new BadRequestException({
        message: "Slug riservato: collide con un prefisso tecnico dell'applicazione.",
        code: 'PAGE_SLUG_RESERVED',
      });
    }
    return slug;
  }

  /** Carica una Pagina genitore attiva per guid, o respinge con `400` (mai `404`: è un campo del payload). */
  private async loadActiveParentOrThrow(parentGuid: string): Promise<{ id: number; guid: string }> {
    const parent = await this.db.db.query.pageEntity.findFirst({
      where: and(eq(pageEntity.guid, parentGuid), eq(pageEntity.isActive, true)),
      columns: { id: true, guid: true },
    });
    if (!parent) {
      throw new BadRequestException({
        message: 'La pagina genitore indicata non esiste o non è attiva.',
        code: 'PAGE_PARENT_NOT_FOUND',
      });
    }
    return parent;
  }

  /**
   * Risolve il genitore proposto per un `PATCH` (deve esistere ed essere
   * attivo, `400` altrimenti) e risale la sua catena di antenati
   * respingendo con `400` se vi incontra la Pagina stessa — cioè se
   * l'assegnazione la renderebbe genitore di se stessa o di un proprio
   * antenato (business-rules.md § Slug/gerarchia, regola 6; SPEC-F01 §
   * Logica di servizio, punto 5).
   */
  private async resolveParentForUpdate(
    pageId: number,
    parentGuid: string,
  ): Promise<{ id: number; guid: string }> {
    const parent = await this.loadActiveParentOrThrow(parentGuid);

    const visited = new Set<number>();
    let currentId: number | null = parent.id;
    while (currentId !== null) {
      if (currentId === pageId) {
        throw new BadRequestException({
          message: 'Assegnazione respinta: creerebbe un ciclo nella gerarchia delle pagine.',
          code: 'PAGE_HIERARCHY_CYCLE',
        });
      }
      if (visited.has(currentId)) break; // dato già corrotto: non aggravarlo, esce senza looppare
      visited.add(currentId);

      const ancestor: { parentId: number | null } | undefined =
        await this.db.db.query.pageEntity.findFirst({
          where: eq(pageEntity.id, currentId),
          columns: { parentId: true },
        });
      currentId = ancestor?.parentId ?? null;
    }

    return parent;
  }

  /** Converte il DTO SEO (istanza di classe, eventualmente annidata) in un oggetto piano per il jsonb. */
  private toPlainSeo(dto: unknown): Record<string, unknown> {
    return dto ? (JSON.parse(JSON.stringify(dto)) as Record<string, unknown>) : {};
  }

  /**
   * Valida `scheduledAt` per la transizione a `scheduled`
   * (business-rules.md § Stati di una Pagina, regola 3: "richiede una data
   * futura"). `400` se assente, non parsabile o non futura.
   */
  private parseFutureScheduledAt(input?: string): Date {
    if (!input) {
      throw new BadRequestException({
        message: 'scheduledAt è obbligatorio per la transizione a "scheduled".',
        code: 'PAGE_SCHEDULED_AT_REQUIRED',
      });
    }
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        message: 'scheduledAt non è una data valida.',
        code: 'PAGE_SCHEDULED_AT_INVALID',
      });
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException({
        message: 'scheduledAt deve essere una data futura.',
        code: 'PAGE_SCHEDULED_AT_NOT_FUTURE',
      });
    }
    return date;
  }

  /** Carica una Revisione per guid, verificando che appartenga alla Pagina indicata. */
  private async loadRevisionOrThrow(
    pageId: number,
    revisionGuid: string,
  ): Promise<PageRevisionRowWithAuthor> {
    const revision = await this.db.db.query.pageRevisionEntity.findFirst({
      where: and(eq(pageRevisionEntity.guid, revisionGuid), eq(pageRevisionEntity.pageId, pageId)),
      with: { author: { columns: { name: true, surname: true } } },
    });
    if (!revision) {
      throw new NotFoundException('Revisione non trovata.');
    }
    return revision;
  }

  private toRevisionSummaryDto(row: PageRevisionRowWithAuthor): PageRevisionSummaryDto {
    return {
      guid: row.guid,
      revisionNumber: row.revisionNumber,
      title: row.title,
      slug: row.slug,
      createdAt: row.createdAt!,
      authorName: row.author.surname ? `${row.author.name} ${row.author.surname}` : row.author.name,
    };
  }

  /**
   * `content` resta il valore **grezzo** come persistito (mai migrato a
   * metà, mai mutato): `contentIssues` è calcolato a parte, in sola lettura,
   * senza sostituire quel valore (SPEC-F02-blocchi.md § 4.3).
   */
  private toRevisionDetailDto(row: PageRevisionRowWithAuthor): PageRevisionDetailDto {
    return {
      ...this.toRevisionSummaryDto(row),
      content: row.content as Record<string, unknown>,
      seo: row.seo as Record<string, unknown>,
      contentIssues: this.migrateContentForRead(row.content).issues,
    };
  }

  private async loadActiveByGuid(guid: string): Promise<PageRow> {
    const row = await this.db.db.query.pageEntity.findFirst({
      where: and(eq(pageEntity.guid, guid), eq(pageEntity.isActive, true)),
    });
    if (!row) {
      throw new NotFoundException('Pagina non trovata.');
    }
    return row;
  }

  private async loadActiveByGuidWithParent(
    guid: string,
  ): Promise<PageRow & { parent: { guid: string } | null }> {
    const row = await this.db.db.query.pageEntity.findFirst({
      where: and(eq(pageEntity.guid, guid), eq(pageEntity.isActive, true)),
      with: { parent: { columns: { guid: true } } },
    });
    if (!row) {
      throw new NotFoundException('Pagina non trovata.');
    }
    return row;
  }

  /** Esegue l'INSERT mappando una violazione di unicità (slug) sul `409` applicativo, mai una `SELECT` preventiva. */
  private async insertOrMapConflict(values: typeof pageEntity.$inferInsert): Promise<PageRow> {
    try {
      const [row] = await this.db.db.insert(pageEntity).values(values).returning();
      return row;
    } catch (err) {
      return mapPgError(err);
    }
  }

  /**
   * Esegue l'UPDATE con lock ottimistico, mappando una violazione di
   * unicità (slug) sul `409` applicativo. Restituisce `undefined` se zero
   * righe sono state aggiornate (version obsoleta) — il chiamante traduce
   * l'assenza in `409 PAGE_VERSION_CONFLICT`.
   */
  private async updateOrMapConflict(
    id: number,
    expectedVersion: number,
    setValues: Record<string, unknown>,
  ): Promise<PageRow | undefined> {
    try {
      const [row] = await this.db.db
        .update(pageEntity)
        .set(setValues)
        .where(
          and(
            eq(pageEntity.id, id),
            eq(pageEntity.version, expectedVersion),
            eq(pageEntity.isActive, true),
          ),
        )
        .returning();
      return row;
    } catch (err) {
      return mapPgError(err);
    }
  }

  /**
   * Converte una riga DB nel DTO pubblico (mai `id`/`createdBy`/`updatedBy`
   * numerici). Senza `contentIssues`: usato da {@link findAll}, dove
   * calcolarlo per ogni riga di una lista sarebbe un costo non richiesto
   * (SPEC-F02-blocchi.md § 4.3 lo prescrive per il dettaglio, non per le
   * liste). Per il dettaglio vedi {@link toDtoWithContentIssues}.
   */
  private toDto(row: PageRow, parentGuid: string | null): PageDto {
    return {
      guid: row.guid,
      title: row.title,
      slug: row.slug,
      locale: row.locale,
      parentGuid,
      translationGroupId: row.translationGroupId,
      status: row.status,
      publishedAt: row.publishedAt,
      scheduledAt: row.scheduledAt,
      draftContent: row.draftContent as Record<string, unknown>,
      draftSeo: row.draftSeo as Record<string, unknown>,
      version: row.version,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
    };
  }

  /**
   * Come {@link toDto}, con `contentIssues` calcolato in sola lettura su
   * `draftContent` (SPEC-F02-blocchi.md § 4.3) **e** `draftContent` sostituito
   * dalla proiezione migrata (ADR-21 § 3.4/§ 1): un nodo pre-F02 privo di `v`
   * arriva al client con `v` già riempito, altrimenti il client non ha alcun
   * valore legittimo da restituire in un `PATCH` successivo — `v` è
   * obbligatorio in scrittura (§ 1) ma non esisteva ancora quando F01 ha
   * scritto la riga. La riga in DB resta invariata: la migrazione è una
   * proiezione pura (§ 3.4), non un `UPDATE`.
   */
  private toDtoWithContentIssues(row: PageRow, parentGuid: string | null): PageDto {
    const { content, issues } = this.migrateContentForRead(row.draftContent);
    return {
      ...this.toDto(row, parentGuid),
      draftContent: content,
      contentIssues: issues,
    };
  }

  // ─── Pipeline blocchi (F02/T5, ADR-21 § 3) ────────────────────────────────

  /**
   * Pipeline di **scrittura**, applicata a un payload client fresco
   * (`POST`/`PATCH`): forma envelope (`v` obbligatorio per nodo, limiti di
   * profondità/numero di nodi/payload in ingresso) → migrazione → validazione
   * contro il registro → sanitizzazione per `kind` → controllo payload
   * "persist". Un albero non conforme è respinto **per intero** al primo
   * errore incontrato — mai un salvataggio parziale.
   */
  private runWriteContentPipeline(input: unknown, authInfo: AuthInfo): PersistableContent {
    assertValidContentTreeShape(input);
    const tree = input as ContentTree;
    const blocksAfterEnvelope = this.migrateEnvelopeOrThrow(
      tree as unknown as Record<string, unknown>,
      tree.version,
    );
    return this.migrateValidateSanitize(blocksAfterEnvelope, authInfo);
  }

  /**
   * Pipeline di **lettura-tollerante**, applicata a un contenuto già
   * persistito (bozza alla pubblicazione, snapshot di Revisione al
   * ripristino): non richiede `v` per nodo (contenuto pre-F02) né i
   * controlli di forma/limiti già passati alla scrittura originaria — esegue
   * comunque migrazione → validazione → sanitizzazione → controllo payload
   * "persist", perché un albero valido ieri può non esserlo più oggi (tipo
   * diventato `deprecated`/`enabled:false`). Un fallimento qui rifiuta
   * l'operazione con lo stesso `400` di una scrittura: non si
   * pubblica/scrive un albero non valido.
   */
  private runPersistedContentPipeline(rawEnvelope: unknown, authInfo: AuthInfo): PersistableContent {
    const envelope = this.asEnvelopeRecord(rawEnvelope);
    const fromVersion = typeof envelope.version === 'number' ? envelope.version : 1;
    const blocksInput = this.migrateEnvelopeOrThrow(envelope, fromVersion);
    return this.migrateValidateSanitize(blocksInput, authInfo);
  }

  /**
   * Proietta un contenuto già persistito alla forma migrata corrente
   * (migrazione + validazione di registro, **senza** sanitizzazione — solo
   * per la scrittura) e calcola `contentIssues` (SPEC-F02-blocchi.md § 4.3)
   * nello stesso passaggio. Non modifica né rilancia mai un'eccezione HTTP:
   * la lettura di una Pagina/Revisione non deve mai rompersi per contenuto
   * malformato, solo segnalarlo con il path del nodo colpevole. `content` è
   * ciò che il client deve poter rimandare inalterato in un `PATCH`
   * successivo: se un nodo fallisce la migrazione dell'envelope l'intero
   * contenuto torna così com'è persistito (nessuna proiezione possibile),
   * altrimenti torna `{ version, blocks }` alla versione corrente con `v` per
   * nodo sempre presente.
   */
  private migrateContentForRead(rawEnvelope: unknown): {
    content: Record<string, unknown>;
    issues: ContentIssue[];
  } {
    const envelope = this.asEnvelopeRecord(rawEnvelope);
    const fromVersion = typeof envelope.version === 'number' ? envelope.version : 1;

    const envelopeOutcome = migrateEnvelope(envelope, fromVersion);
    if (envelopeOutcome.unsupported) {
      return {
        content: envelope,
        issues: [
          {
            path: '',
            code: 'CONTENT_ENVELOPE_VERSION_UNSUPPORTED',
            details: envelopeOutcome.unsupported,
          },
        ],
      };
    }
    const blocksInput = this.asMigratableBlocks(envelopeOutcome.envelope.blocks);

    const migration = migrateBlockTree(blocksInput, this.blockRegistry);
    const validation = this.blockTreeValidator.validateTree(
      migration.blocks as ValidatableBlockNode[],
      this.blockRegistry,
    );

    const issues = [...migration.errors, ...validation.errors].map((error) => ({
      path: (error.details as { path: string }).path,
      code: error.code,
      details: error.details,
    }));

    return { content: { version: ENVELOPE_VERSION, blocks: migration.blocks }, issues };
  }

  /** Applica la catena di migrazione d'envelope, o rilancia `400 CONTENT_ENVELOPE_VERSION_UNSUPPORTED`. */
  private migrateEnvelopeOrThrow(
    envelope: Record<string, unknown>,
    fromVersion: number,
  ): MigratableBlockNode[] {
    const outcome = migrateEnvelope(envelope, fromVersion);
    if (outcome.unsupported) {
      throw new BadRequestException({
        message: `Versione d'envelope non supportata: ${outcome.unsupported.version} (corrente: ${outcome.unsupported.current}).`,
        code: 'CONTENT_ENVELOPE_VERSION_UNSUPPORTED',
        details: outcome.unsupported,
      });
    }
    return this.asMigratableBlocks(outcome.envelope.blocks);
  }

  /** Stadi comuni a scrittura e lettura-tollerante: migrazione per nodo → validazione registro → sanitizzazione per `kind` → controllo payload "persist". */
  private migrateValidateSanitize(
    blocksInput: MigratableBlockNode[],
    authInfo: AuthInfo,
  ): PersistableContent {
    const migration = migrateBlockTree(blocksInput, this.blockRegistry);
    if (migration.errors.length > 0) {
      throw this.blockErrorToBadRequest(migration.errors[0]);
    }

    const validation = this.blockTreeValidator.validateTree(
      migration.blocks as ValidatableBlockNode[],
      this.blockRegistry,
      { roleLevel: authInfo.role },
    );
    if (!validation.valid) {
      throw this.blockErrorToBadRequest(validation.errors[0]);
    }

    const sanitized = this.blockPropSanitizer.sanitizeTree(
      migration.blocks as ValidatableBlockNode[],
      this.blockRegistry,
    );
    if (sanitized.errors.length > 0) {
      throw this.blockErrorToBadRequest(sanitized.errors[0]);
    }

    const resultEnvelope: PersistableContent = { version: ENVELOPE_VERSION, blocks: sanitized.tree };
    assertPayloadWithinLimit(resultEnvelope, 'persist');
    return resultEnvelope;
  }

  /** Un solo `400` per l'intero albero, con `code`/`details` del **primo** errore incontrato (mai salvataggio parziale). */
  private blockErrorToBadRequest(error: { code: string; details: unknown }): BadRequestException {
    return new BadRequestException({
      message: `Albero blocchi non valido: ${error.code}.`,
      code: error.code,
      details: error.details,
    });
  }

  /** Normalizza un contenuto grezzo (jsonb, potenzialmente `null`/malformato) in un record d'envelope trattabile dalla pipeline. */
  private asEnvelopeRecord(rawEnvelope: unknown): Record<string, unknown> {
    if (rawEnvelope !== null && typeof rawEnvelope === 'object' && !Array.isArray(rawEnvelope)) {
      return rawEnvelope as Record<string, unknown>;
    }
    return { version: ENVELOPE_VERSION, blocks: [] };
  }

  /** Estrae `blocks` da un envelope migrato, tollerante a un valore assente/malformato (array vuoto). */
  private asMigratableBlocks(blocks: unknown): MigratableBlockNode[] {
    return Array.isArray(blocks) ? (blocks as MigratableBlockNode[]) : [];
  }
}
