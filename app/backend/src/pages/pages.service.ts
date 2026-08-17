import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, or, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { DbService } from '../db/db.service';
import { pageEntity } from '../db/schema';
import { AppUserRoles } from '../common/enums';
import { AuditLogService } from '../common/audit-log.service';
import { AuthInfo, PagesQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { assertRowOwnership, hasElevatedRowAccess, rowOwnershipFilter } from '../common/ownership';
import { mapPgError } from '../common/db-error.mapper';
import { TreeSanitizerService } from '../common/sanitizer/tree-sanitizer.service';
import { assertValidContentTreeShape } from './content-tree';
import { isReservedSlug, normalizeSlug } from './slug.util';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PageDto } from './dto/page.dto';

type PageRow = typeof pageEntity.$inferSelect;

/** Soglia di elevazione editoriale (ADR-18 § D3): sopra `Manager` l'ownership per riga non si applica. */
const OWNERSHIP_ELEVATED_THRESHOLD = AppUserRoles.Manager;

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
 * Ordine vincolante di ogni percorso di scrittura: validazione della forma
 * dell'albero → sanitizzazione → ownership → persistenza. Nessuna `SELECT`
 * preventiva per l'unicità dello slug: il conflitto arriva dal constraint DB
 * e passa da {@link mapPgError}.
 */
@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  /** Inietta l'accesso al DB, l'audit log e il sanitizzatore dell'albero blocchi (T3). */
  constructor(
    private readonly db: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly treeSanitizer: TreeSanitizerService,
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

    const contentTree = dto.draftContent ?? { version: 1, blocks: [] };
    assertValidContentTreeShape(contentTree);
    const sanitizedContent = this.treeSanitizer.sanitizeTree(contentTree);
    const seo = this.toPlainSeo(dto.draftSeo);

    const row = await this.insertOrMapConflict({
      guid: Utils.randomString(16),
      title: dto.title,
      slug,
      locale: dto.locale,
      parentId: parent?.id ?? null,
      translationGroupId: Utils.randomString(16),
      draftContent: sanitizedContent,
      draftSeo: seo,
      createdBy: authInfo.userId,
      updatedBy: authInfo.userId,
    });

    this.logger.log(`Pagina creata (guid=${row.guid}).`);
    return this.toDto(row, parent?.guid ?? null);
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
    return this.toDto(row, row.parent?.guid ?? null);
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
      assertValidContentTreeShape(dto.draftContent);
      setValues.draftContent = this.treeSanitizer.sanitizeTree(dto.draftContent);
    }
    if (dto.draftSeo !== undefined) {
      setValues.draftSeo = this.toPlainSeo(dto.draftSeo);
    }

    const updatedRow = await this.updateOrMapConflict(row.id, dto.version, setValues);
    if (!updatedRow) {
      throw new ConflictException({
        message: 'La pagina è stata modificata da un altro utente. Ricarica e riprova.',
        code: 'PAGE_VERSION_CONFLICT',
      });
    }

    return this.toDto(updatedRow, parentGuid);
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

    await this.db.db
      .update(pageEntity)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(eq(pageEntity.id, row.id));

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

  /** Converte una riga DB nel DTO pubblico (mai `id`/`createdBy`/`updatedBy` numerici). */
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
}
