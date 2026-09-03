import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { and, asc, count, desc, eq, ilike, or, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { AppConstants } from '../common/app-constants';
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
import { ExportService } from '../export/export.service';
import { ValidatableBlockNode } from '../blocks/validator/validatable-node.types';
import { migrateEnvelope, ENVELOPE_VERSION } from '../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../blocks/migration/block-migration.types';
import {
  assertValidContentTreeShape,
  assertPayloadWithinLimit,
  BlockNode,
  ContentTree,
} from './content-tree';
import { getPageBlueprint } from './blueprints/page-blueprints.registry';
import { isReservedSlug, normalizeSlug } from './slug.util';
import {
  isTransitionAllowed,
  PageStatus,
  auditActionForStatusTransition,
  statusTransitionRequiresElevation,
} from './pages.state-machine';
import { SettingsService } from '../settings/settings.service';
import { CreatePageDto } from './dto/create-page.dto';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { PageDto } from './dto/page.dto';
import { PageRevisionDetailDto, PageRevisionSummaryDto } from './dto/page-revision.dto';
import { PageRevisionDiffResponseDto } from './dto/page-revision-diff.dto';
import { PageTranslationDto } from './dto/page-translation.dto';
import { PagePreviewTokenDto } from './dto/page-preview-token.dto';
import { BlockDiffEngineService } from './diff/block-diff-engine.service';
import { SeoGraphService } from './seo-graph.service';
import { PageSeoDto } from './dto/page-seo.dto';

type PageRow = typeof pageEntity.$inferSelect;
type PageRowWithParent = PageRow & { parent: { guid: string } | null };
type PageRevisionRow = typeof pageRevisionEntity.$inferSelect;
type PageRevisionRowWithAuthor = PageRevisionRow & {
  author: { name: string; surname: string | null };
};

/** Soglia di elevazione editoriale (ADR-18 § D3): sopra `Manager` l'ownership per riga non si applica. */
const OWNERSHIP_ELEVATED_THRESHOLD = AppUserRoles.Manager;

/**
 * Scadenza del JWT di anteprima (ADR-25 § 2): fissa a 15 minuti, non
 * rinnovabile e non configurabile via env — è una decisione dell'ADR, non
 * un parametro di deploy (a differenza di `AppConstants.jwtExpiration`
 * dell'access token).
 */
const PAGE_PREVIEW_TOKEN_EXPIRATION: StringValue = '15m';

/** `purpose` fisso del JWT di anteprima (ADR-25 § 1): distingue questo token da ogni altro JWT dell'app. */
const PAGE_PREVIEW_TOKEN_PURPOSE = 'page-preview' as const;

/** Payload del JWT di anteprima, firmato/verificato con il segreto dedicato `AppConstants.pagePreviewTokenSecret`. */
export interface PagePreviewTokenPayload {
  pageGuid: string;
  purpose: typeof PAGE_PREVIEW_TOKEN_PURPOSE;
}

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
    private readonly settingsService: SettingsService,
    private readonly exportService: ExportService,
    private readonly blockDiffEngine: BlockDiffEngineService,
    private readonly seoGraphService: SeoGraphService,
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

    const contentInput = dto.templateSlug
      ? this.resolveBlueprintContent(dto.templateSlug)
      : (dto.draftContent ?? { version: ENVELOPE_VERSION, blocks: [] });
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

  /**
   * Crea una traduzione da una Pagina sorgente (RFC-F05 § 3, M3): nuova riga
   * nello stesso `translationGroupId`, `locale` richiesto, `status: 'draft'`,
   * `draftContent`/`draftSeo` copiati per deep-clone dalla sorgente (regola 5
   * `business-rules.md` § Multilingua: lascia i testi da tradurre, non li
   * svuota), `slug` copiato invariato (resta unico perché confrontato per
   * `locale`), `parentId` **non copiato** — nasce root (RFC-F05 § 3.4: una
   * gerarchia parallela nel Locale sorgente non è garantita, riparentare è
   * un'azione manuale successiva). `404` se la sorgente non esiste o è
   * soft-eliminata; `400` se `locale` non è fra i Locale attivi; `409` se il
   * gruppo ha già una riga in quel `locale` — mai una `SELECT` preventiva,
   * il vincolo DB (`pages_translation_group_locale_uq`) arriva da
   * {@link mapPgError}. Nessuna ownership diversa da `create()`: chiunque
   * possa creare una Pagina può creare una traduzione. `draftContent.blocks`
   * è clonato nodo per nodo con {@link cloneBlockNodeWithFreshIds}, non
   * `structuredClone` diretto: gli `id` dei nodi sono rigenerati per
   * prevenire collisioni d'identità fra la Pagina sorgente e la traduzione
   * (due righe DB distinte non possono condividere lo stesso `id` di nodo).
   */
  async createTranslation(
    guid: string,
    dto: CreateTranslationDto,
    authInfo: AuthInfo,
  ): Promise<PageDto> {
    const source = await this.loadActiveByGuid(guid);

    const multilingualConfig = await this.settingsService.getMultilingualConfig();
    if (!multilingualConfig.active.includes(dto.locale)) {
      throw new BadRequestException('Il locale richiesto non è fra i Locale attivi.');
    }

    const row = await this.insertOrMapConflict({
      guid: Utils.randomString(16),
      title: dto.title ?? source.title,
      slug: source.slug,
      locale: dto.locale,
      parentId: null,
      translationGroupId: source.translationGroupId,
      draftContent: this.cloneContentTreeWithFreshIds(source.draftContent as ContentTree),
      draftSeo: structuredClone(source.draftSeo),
      createdBy: authInfo.userId,
      updatedBy: authInfo.userId,
    });

    this.logger.log(
      `Traduzione creata (guid=${row.guid}, translationGroupId=${row.translationGroupId}, locale=${dto.locale}).`,
    );
    return this.toDtoWithContentIssues(row, null);
  }

  /**
   * Elenco delle righe sorelle attive dello stesso gruppo di traduzione,
   * sorgente inclusa (RFC-F05 § 3, dipendenza aperta di T6: "lo switcher
   * elenca le traduzioni esistenti del gruppo"). Deliberatamente distinto
   * da {@link PublicPagesService}/T5 (hreflang): quello è pubblico e
   * limitato a `published`, questo è admin e deve mostrare anche le bozze
   * sorelle — l'esclusione della riga corrente (`:guid`) dal risultato è
   * lasciata al frontend, che la distingue confrontando guid/locale
   * lato client, non a questa query.
   *
   * `404` se `:guid` non esiste o è soft-eliminata. Nessuna
   * `assertRowOwnership`, né sulla sorgente né sulle righe sorelle: stessa
   * scelta già presa in {@link createTranslation} ("chiunque possa creare
   * una Pagina può creare una traduzione") — per coerenza, chi può
   * vedere/creare una traduzione può anche listare il gruppo. La ricaduta
   * dell'assenza di ownership è mitigata dal DTO: {@link PageTranslationDto}
   * espone solo guid/locale/title/status, mai `draftContent`/`draftSeo` di
   * una riga potenzialmente non posseduta dal chiamante.
   */
  async listTranslations(guid: string): Promise<PageTranslationDto[]> {
    const source = await this.loadActiveByGuid(guid);

    const rows = await this.db.db.query.pageEntity.findMany({
      where: and(
        eq(pageEntity.translationGroupId, source.translationGroupId),
        eq(pageEntity.isActive, true),
      ),
      orderBy: asc(pageEntity.locale),
      columns: { guid: true, locale: true, title: true, status: true },
    });

    return rows.map((row) => ({
      guid: row.guid,
      locale: row.locale,
      title: row.title,
      status: row.status,
    }));
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

      // RFC-44 Decisione 5: la Pagina resta pubblicata ma cambia percorso —
      // il vecchio file statico va rimosso e il nuovo generato, non solo la
      // cache invalidata.
      if (row.status === 'published') {
        await Promise.all(
          staleLocations.map((stale) =>
            this.exportService.enqueuePageTombstone(row.guid, stale.locale, stale.path),
          ),
        );
        const newLocation = await this.publicPageCache.resolveLocation(updatedRow.id);
        if (newLocation) {
          await this.exportService.enqueuePageExport(
            row.guid,
            newLocation.locale,
            newLocation.path,
          );
        }
      }
    }

    return this.toDtoWithContentIssues(updatedRow, parentGuid);
  }

  /**
   * Emette un token di anteprima della bozza corrente (ADR-25 § 1). Stessa
   * guard di ownership dell'aggiornamento della bozza: un `User` genera
   * l'anteprima solo delle **proprie** pagine, e solo mentre sono in stato
   * `draft` — esattamente la stessa condizione di {@link update}, non una
   * nuova regola. Il token è un JWT stateless, firmato con un segreto
   * dedicato (`AppConstants.pagePreviewTokenSecret`, mai quello di
   * access/refresh), scadenza fissa a 15 minuti, nessun refresh. Emissione
   * audit-logged; il token stesso non finisce mai nell'audit log per
   * intero (business-rules.md § Security).
   */
  async issuePreviewToken(
    guid: string,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<PagePreviewTokenDto> {
    const row = await this.loadActiveByGuid(guid);

    assertRowOwnership(
      authInfo,
      row,
      OWNERSHIP_ELEVATED_THRESHOLD,
      "Non puoi generare l'anteprima della bozza di un altro utente.",
    );
    if (!hasElevatedRowAccess(authInfo, OWNERSHIP_ELEVATED_THRESHOLD) && row.status !== 'draft') {
      // Stessa condizione di update() (ADR-18 § D4): la riga È tua, ma
      // "propria bozza" significa propria E in draft.
      throw new ForbiddenException(
        'Puoi generare l\'anteprima solo delle tue pagine in stato "draft".',
      );
    }

    const payload: PagePreviewTokenPayload = {
      pageGuid: row.guid,
      purpose: PAGE_PREVIEW_TOKEN_PURPOSE,
    };
    const token = jwt.sign(payload, AppConstants.pagePreviewTokenSecret, {
      expiresIn: PAGE_PREVIEW_TOKEN_EXPIRATION,
    });
    const decoded = jwt.decode(token) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    this.logger.log(
      // Solo un prefisso del token nel log (business-rules.md § Security), mai per intero.
      `Token di anteprima emesso per pagina guid=${guid} (token prefix=${token.substring(0, 10)}...).`,
    );
    await this.auditLogService.log(
      authInfo.userId,
      'pages.preview-token.issue',
      'pages',
      guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );

    return { token, expiresAt };
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

      // RFC-44 Decisione 5: il soft delete su Postgres non deve mai lasciare
      // raggiungibile da Nginx il file statico di una Pagina (ex-)pubblicata.
      if (row.status === 'published') {
        await Promise.all(
          staleLocations.map((stale) =>
            this.exportService.enqueuePageTombstone(row.guid, stale.locale, stale.path),
          ),
        );
      }
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

    // RFC-44 Decisione 5: `toStatus === 'published'` è già intercettato sopra
    // (delegato a `publishTransactionally`), quindi qui si arriva solo per
    // transizioni che lasciano `published` (tombstone) o che restano fuori
    // da `published` (nessun file statico esisteva, no-op innocuo se accodato
    // comunque — ma si evita per non generare rumore su transizioni che non
    // hanno mai avuto un export).
    if (fromStatus === 'published') {
      const location = await this.publicPageCache.resolveLocation(row.id);
      if (location) {
        await this.exportService.enqueuePageTombstone(row.guid, location.locale, location.path);
      }
    }

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
    const sanitizedSeo = this.treeSanitizer.sanitizeTree(row.draftSeo) as PageSeoDto;
    // ADR-48: JSON-LD/OpenGraph generati a publish-time, prima dell'INSERT
    // della Revisione — il risultato entra nello snapshot immutabile, mai in
    // `pages.draftSeo` (bozza e pubblicato restano indipendenti).
    const enrichedSeo = this.seoGraphService.generateSeoMetadata(
      row.title,
      sanitizedContent.blocks,
      sanitizedSeo,
    );

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
            seo: enrichedSeo,
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

    // RFC-44 Decisione 1/4: job di export a singola pagina, stesso percorso
    // appena invalidato in cache, priorità alta/SLA 5s (ExportService).
    const location = await this.publicPageCache.resolveLocation(finalRow.id);
    if (location) {
      await this.exportService.enqueuePageExport(row.guid, location.locale, location.path);
    }

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
   * Confronto strutturale fra due Revisioni della stessa Pagina (F07-01,
   * business-rules.md § Revisioni, regola 4). Identificatori sempre `guid`
   * (mai `id` numerico in URL, CLAUDE.md § Divieti assoluti): `revA`/`revB`
   * sono i `guid` delle due Revisioni, non i loro `id` di riga. Stessa
   * visibilità di {@link getRevision}. Confronta la forma **migrata** del
   * contenuto ({@link migrateContentForRead}, come già in lettura per
   * `contentIssues`), non il payload grezzo persistito: due snapshot scritti
   * da versioni di schema diverse restano comparabili sullo stesso schema
   * corrente.
   */
  async diffRevisions(
    guid: string,
    revA: string,
    revB: string,
    authInfo: AuthInfo,
  ): Promise<PageRevisionDiffResponseDto> {
    const row = await this.loadActiveByGuid(guid);
    assertRowOwnership(
      authInfo,
      row,
      OWNERSHIP_ELEVATED_THRESHOLD,
      'Non puoi visualizzare le revisioni di una pagina di un altro utente.',
    );

    const [sourceRevision, targetRevision] = await Promise.all([
      this.loadRevisionOrThrow(row.id, revA),
      this.loadRevisionOrThrow(row.id, revB),
    ]);

    const sourceBlocks = this.migrateContentForRead(sourceRevision.content).content
      .blocks as BlockNode[];
    const targetBlocks = this.migrateContentForRead(targetRevision.content).content
      .blocks as BlockNode[];

    return this.blockDiffEngine.compareTrees(sourceBlocks, targetBlocks);
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

  /**
   * Carica il contenuto di bozza di una Pagina attiva per l'anteprima
   * (ADR-25 § 3, T3): riusa esattamente la pipeline di lettura-tollerante
   * già impiegata per il dettaglio Pagina ({@link migrateContentForRead} —
   * migrazione + validazione di registro, mai sanitizzazione: quella resta
   * un passo di scrittura), non una lettura ad-hoc. `null` se la Pagina non
   * esiste o è stata soft-eliminata — il chiamante (`PreviewPagesService`)
   * traduce l'assenza in `404` uniforme, indistinguibile da un token
   * invalido/scaduto (ADR-25 § 3). Nessun controllo di ownership qui: la
   * prova di accesso è il token già verificato dal chiamante, non
   * l'identità di chi legge.
   */
  async findDraftForPreview(pageGuid: string): Promise<{
    title: string;
    slug: string;
    locale: string;
    content: Record<string, unknown>;
    seo: Record<string, unknown>;
  } | null> {
    const row = await this.db.db.query.pageEntity.findFirst({
      where: and(eq(pageEntity.guid, pageGuid), eq(pageEntity.isActive, true)),
    });
    if (!row) {
      return null;
    }

    const { content } = this.migrateContentForRead(row.draftContent);
    return {
      title: row.title,
      slug: row.slug,
      locale: row.locale,
      content,
      seo: (row.draftSeo as Record<string, unknown>) ?? {},
    };
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
   * Risolve `templateSlug` (RFC-43) nel registro dei Template di partenza e
   * ne clona l'albero blocchi con `id` rigenerati (evita collisioni fra
   * Pagine nate dallo stesso blueprint). Il risultato ha la stessa forma di
   * un `draftContent` client, quindi attraversa invariata
   * {@link runWriteContentPipeline}. `400` se lo slug non è registrato.
   */
  private resolveBlueprintContent(templateSlug: string): ContentTree {
    const blueprint = getPageBlueprint(templateSlug);
    if (!blueprint) {
      throw new BadRequestException({
        message: `Template di partenza sconosciuto: ${templateSlug}.`,
        code: 'PAGE_TEMPLATE_UNKNOWN',
        details: { templateSlug },
      });
    }
    return this.cloneContentTreeWithFreshIds(blueprint.content);
  }

  /** Copia profonda di un {@link ContentTree}: `version` invariato, ogni nodo di `blocks` clonato via {@link cloneBlockNodeWithFreshIds}. */
  private cloneContentTreeWithFreshIds(content: ContentTree): ContentTree {
    return {
      version: content.version,
      blocks: content.blocks.map((block) => this.cloneBlockNodeWithFreshIds(block)),
    };
  }

  /** Copia profonda ricorsiva di un nodo blocco: `id` sempre rigenerato con `Utils.randomString(16)`, `type`/`v`/`props` copiati, `children` clonati alla stessa regola. */
  private cloneBlockNodeWithFreshIds(node: BlockNode): BlockNode {
    return {
      id: Utils.randomString(16),
      type: node.type,
      v: node.v,
      props: structuredClone(node.props),
      children: node.children.map((child) => this.cloneBlockNodeWithFreshIds(child)),
    };
  }

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
  private runPersistedContentPipeline(
    rawEnvelope: unknown,
    authInfo: AuthInfo,
  ): PersistableContent {
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

    const resultEnvelope: PersistableContent = {
      version: ENVELOPE_VERSION,
      blocks: sanitized.tree,
    };
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
