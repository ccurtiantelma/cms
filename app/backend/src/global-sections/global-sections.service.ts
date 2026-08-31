import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, or, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { DbService } from '../db/db.service';
import { globalSectionEntity } from '../db/schema';
import { GlobalSectionLayoutSlot } from '../common/enums';
import { AuditLogService } from '../common/audit-log.service';
import { AuthInfo, PaginationParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { mapPgError } from '../common/db-error.mapper';
import { BLOCK_REGISTRY_TOKEN, BlockRegistry } from '../blocks/block-registry';
import { BlockTreeValidatorService } from '../blocks/validator/block-tree-validator.service';
import { BlockPropSanitizerService } from '../common/sanitizer/block-prop-sanitizer.service';
import { ValidatableBlockNode } from '../blocks/validator/validatable-node.types';
import { migrateEnvelope, ENVELOPE_VERSION } from '../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../blocks/migration/block-migration.types';
import { assertValidContentTreeShape, assertPayloadWithinLimit, ContentTree } from '../pages/content-tree';
import { normalizeSlug, isReservedSlug } from '../pages/slug.util';
import { PublicGlobalSectionsCacheService } from './public-global-sections-cache.service';
import { CreateGlobalSectionDto } from './dto/create-global-section.dto';
import { UpdateGlobalSectionDto } from './dto/update-global-section.dto';
import { GlobalSectionDto } from './dto/global-section.dto';
import { PublicActiveGlobalSectionsDto } from './dto/public-active-global-sections.dto';

type GlobalSectionRow = typeof globalSectionEntity.$inferSelect;
type PersistableContent = { version: number; blocks: unknown[] };

/** Colonne ammesse per l'ordinamento dell'elenco admin (`?o=`). */
const ORDERABLE_COLUMNS: Record<string, PgColumn> = {
  title: globalSectionEntity.title,
  slug: globalSectionEntity.slug,
  layoutSlot: globalSectionEntity.layoutSlot,
  createdAt: globalSectionEntity.createdAt,
  updatedAt: globalSectionEntity.updatedAt,
};

/**
 * CRUD amministrativo e superficie pubblica di sola lettura delle Sezioni
 * Globali (F06, ADR-40). Nessuna ownership per riga (a differenza delle
 * Pagine): la guard `Manager`+ sul controller basta, non esiste nozione di
 * "proprie" Sezioni Globali. Il contenuto riusa integralmente la pipeline
 * di ADR-21 (migrazione → validazione di registro → sanitizzazione per
 * `kind`): nessuna logica di dominio sui blocchi duplicata qui.
 */
@Injectable()
export class GlobalSectionsService {
  private readonly logger = new Logger(GlobalSectionsService.name);

  constructor(
    private readonly db: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly blockTreeValidator: BlockTreeValidatorService,
    private readonly blockPropSanitizer: BlockPropSanitizerService,
    private readonly publicCache: PublicGlobalSectionsCacheService,
    @Inject(BLOCK_REGISTRY_TOKEN) private readonly blockRegistry: BlockRegistry,
  ) {}

  /** Lista paginata delle Sezioni Globali attive. */
  async findAll(params: PaginationParams): Promise<Pagination<GlobalSectionDto>> {
    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;

    const conditions: (SQL | undefined)[] = [eq(globalSectionEntity.isActive, true)];
    if (params.q) {
      conditions.push(
        or(
          ilike(globalSectionEntity.title, `%${params.q}%`),
          ilike(globalSectionEntity.slug, `%${params.q}%`),
        ),
      );
    }
    const where = and(...conditions);

    const orderColumn = (params.o && ORDERABLE_COLUMNS[params.o]) || globalSectionEntity.updatedAt;
    const orderBy = params.d === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const [rows, [{ total }]] = await Promise.all([
      this.db.db.query.globalSectionEntity.findMany({
        where,
        orderBy,
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.db.db.select({ total: count() }).from(globalSectionEntity).where(where),
    ]);

    return new Pagination(rows.map((row) => this.toDto(row)), total, page, perPage);
  }

  /** Dettaglio di una Sezione Globale attiva. `404` se inesistente o soft-eliminata. */
  async findOne(guid: string): Promise<GlobalSectionDto> {
    const row = await this.loadActiveByGuid(guid);
    return this.toDto(row);
  }

  /** Crea una Sezione Globale. `layoutSlot` di default `none`. */
  async create(dto: CreateGlobalSectionDto, authInfo: AuthInfo): Promise<GlobalSectionDto> {
    const slug = this.normalizeAndValidateSlug(dto.slug ?? dto.title);
    const contentInput = dto.content ?? { version: ENVELOPE_VERSION, blocks: [] };
    const content = this.runWriteContentPipeline(contentInput);

    const layoutSlot = dto.layoutSlot ?? GlobalSectionLayoutSlot.None;
    const isSticky = layoutSlot === GlobalSectionLayoutSlot.Header ? Boolean(dto.isSticky) : false;

    const row = await this.insertOrMapConflict({
      guid: Utils.randomString(16),
      title: dto.title,
      slug,
      layoutSlot,
      isSticky,
      content,
      createdBy: authInfo.userId,
      updatedBy: authInfo.userId,
    });

    if (row.layoutSlot !== GlobalSectionLayoutSlot.None) {
      await this.publicCache.invalidate(authInfo.userId);
    }

    this.logger.log(`Sezione Globale creata (guid=${row.guid}).`);
    return this.toDto(row);
  }

  /**
   * Aggiorna una Sezione Globale. Lock ottimistico: `WHERE version =
   * :version`, incrementata nello stesso `UPDATE`; zero righe aggiornate ⇒
   * `409 GLOBAL_SECTION_VERSION_CONFLICT`, distinto dal `409` di slug/slot
   * duplicati mappato da {@link mapPgError}.
   */
  async update(
    guid: string,
    dto: UpdateGlobalSectionDto,
    authInfo: AuthInfo,
  ): Promise<GlobalSectionDto> {
    const row = await this.loadActiveByGuid(guid);

    const values: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: authInfo.userId,
    };
    if (dto.title !== undefined) values.title = dto.title;
    if (dto.slug !== undefined) values.slug = this.normalizeAndValidateSlug(dto.slug);
    if (dto.layoutSlot !== undefined) values.layoutSlot = dto.layoutSlot;
    const targetSlot = dto.layoutSlot ?? row.layoutSlot;
    if (dto.layoutSlot !== undefined || dto.isSticky !== undefined) {
      values.isSticky =
        targetSlot === GlobalSectionLayoutSlot.Header ? Boolean(dto.isSticky ?? row.isSticky) : false;
    }
    if (dto.content !== undefined) values.content = this.runWriteContentPipeline(dto.content);

    const slotOrContentChanged = values.layoutSlot !== undefined || values.content !== undefined;
    const wasAssigned = row.layoutSlot !== GlobalSectionLayoutSlot.None;

    const updatedRow = await this.updateOrMapConflict(row.id, dto.version, values);
    if (!updatedRow) {
      throw new ConflictException({
        message: 'La Sezione Globale è stata modificata da un altro utente. Ricarica e riprova.',
        code: 'GLOBAL_SECTION_VERSION_CONFLICT',
      });
    }

    const isAssignedNow = updatedRow.layoutSlot !== GlobalSectionLayoutSlot.None;
    if (slotOrContentChanged && (wasAssigned || isAssignedNow)) {
      await this.publicCache.invalidate(authInfo.userId);
    }

    this.logger.log(`Sezione Globale aggiornata (guid=${guid}).`);
    return this.toDto(updatedRow);
  }

  /** Soft delete. Invalida la cache pubblica se la riga era assegnata a uno slot. */
  async remove(guid: string, authInfo: AuthInfo, ip?: string): Promise<void> {
    const row = await this.loadActiveByGuid(guid);

    await this.db.db
      .update(globalSectionEntity)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(eq(globalSectionEntity.id, row.id));

    if (row.layoutSlot !== GlobalSectionLayoutSlot.None) {
      await this.publicCache.invalidate(authInfo.userId);
    }

    this.logger.log(`Sezione Globale eliminata (guid=${guid}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'global-sections.delete',
      'global_sections',
      guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
  }

  /**
   * Sezioni pubbliche attive per `header`/`footer` (ADR-40). Cache-first: un
   * `miss` legge dal database e ripopola la cache; sempre `200`, slot senza
   * Sezione assegnata → `null`.
   */
  async getActivePublic(): Promise<PublicActiveGlobalSectionsDto> {
    const cached = await this.publicCache.getCached();
    if (cached) return cached;

    const rows = await this.db.db.query.globalSectionEntity.findMany({
      where: and(
        eq(globalSectionEntity.isActive, true),
        or(
          eq(globalSectionEntity.layoutSlot, GlobalSectionLayoutSlot.Header),
          eq(globalSectionEntity.layoutSlot, GlobalSectionLayoutSlot.Footer),
        ),
      ),
    });

    const header = rows.find((r) => r.layoutSlot === GlobalSectionLayoutSlot.Header) ?? null;
    const footer = rows.find((r) => r.layoutSlot === GlobalSectionLayoutSlot.Footer) ?? null;

    const dto: PublicActiveGlobalSectionsDto = {
      header: header
        ? {
            slug: header.slug,
            isSticky: header.isSticky,
            content: header.content as Record<string, unknown>,
          }
        : null,
      footer: footer
        ? {
            slug: footer.slug,
            isSticky: footer.isSticky,
            content: footer.content as Record<string, unknown>,
          }
        : null,
    };

    await this.publicCache.setCached(dto);
    return dto;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private normalizeAndValidateSlug(input: string): string {
    const slug = normalizeSlug(input);
    if (!slug) {
      throw new BadRequestException('Slug non valido: nessun carattere alfanumerico.');
    }
    if (isReservedSlug(slug)) {
      throw new BadRequestException(`Slug "${slug}" riservato, non assegnabile.`);
    }
    return slug;
  }

  private async loadActiveByGuid(guid: string): Promise<GlobalSectionRow> {
    const row = await this.db.db.query.globalSectionEntity.findFirst({
      where: and(eq(globalSectionEntity.guid, guid), eq(globalSectionEntity.isActive, true)),
    });
    if (!row) {
      throw new NotFoundException('Sezione Globale non trovata.');
    }
    return row;
  }

  private async insertOrMapConflict(
    values: typeof globalSectionEntity.$inferInsert,
  ): Promise<GlobalSectionRow> {
    try {
      const [row] = await this.db.db.insert(globalSectionEntity).values(values).returning();
      return row;
    } catch (err) {
      return mapPgError(err);
    }
  }

  private async updateOrMapConflict(
    id: number,
    expectedVersion: number,
    setValues: Record<string, unknown>,
  ): Promise<GlobalSectionRow | undefined> {
    try {
      const [row] = await this.db.db
        .update(globalSectionEntity)
        .set({ ...setValues, version: expectedVersion + 1 })
        .where(
          and(
            eq(globalSectionEntity.id, id),
            eq(globalSectionEntity.version, expectedVersion),
            eq(globalSectionEntity.isActive, true),
          ),
        )
        .returning();
      return row;
    } catch (err) {
      return mapPgError(err);
    }
  }

  private toDto(row: GlobalSectionRow): GlobalSectionDto {
    return {
      guid: row.guid,
      title: row.title,
      slug: row.slug,
      layoutSlot: row.layoutSlot as GlobalSectionLayoutSlot,
      isSticky: row.isSticky,
      content: row.content as Record<string, unknown>,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ─── Pipeline blocchi (riuso di ADR-21, stesso schema di PagesService) ────

  /**
   * Pipeline di scrittura per un payload client fresco (`POST`/`PATCH`):
   * forma envelope (`v` obbligatorio per nodo) → migrazione → validazione
   * contro il registro → sanitizzazione per `kind` → controllo payload
   * "persist". Un albero non conforme è respinto per intero al primo
   * errore incontrato.
   */
  private runWriteContentPipeline(input: unknown): PersistableContent {
    assertValidContentTreeShape(input);
    const tree = input as ContentTree;

    const envelopeOutcome = migrateEnvelope(
      tree as unknown as Record<string, unknown>,
      tree.version,
    );
    if (envelopeOutcome.unsupported) {
      throw new BadRequestException({
        message: `Versione d'envelope non supportata: ${envelopeOutcome.unsupported.version} (corrente: ${envelopeOutcome.unsupported.current}).`,
        code: 'CONTENT_ENVELOPE_VERSION_UNSUPPORTED',
        details: envelopeOutcome.unsupported,
      });
    }
    const blocksInput = Array.isArray(envelopeOutcome.envelope.blocks)
      ? (envelopeOutcome.envelope.blocks as MigratableBlockNode[])
      : [];

    const migration = migrateBlockTree(blocksInput, this.blockRegistry);
    if (migration.errors.length > 0) {
      throw this.blockErrorToBadRequest(migration.errors[0]);
    }

    const validation = this.blockTreeValidator.validateTree(
      migration.blocks as ValidatableBlockNode[],
      this.blockRegistry,
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

  private blockErrorToBadRequest(error: { code: string; details: unknown }): BadRequestException {
    return new BadRequestException({
      message: `Albero blocchi non valido: ${error.code}.`,
      code: error.code,
      details: error.details,
    });
  }
}
