import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { DbService } from '../db/db.service';
import { siteTemplateEntity } from '../db/schema';
import { AuditLogService } from '../common/audit-log.service';
import { AuthInfo } from '../common/types';
import type { SiteTemplatesQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { BLOCK_REGISTRY_TOKEN, BlockRegistry } from '../blocks/block-registry';
import { BlockTreeValidatorService } from '../blocks/validator/block-tree-validator.service';
import { BlockPropSanitizerService } from '../common/sanitizer/block-prop-sanitizer.service';
import { ValidatableBlockNode } from '../blocks/validator/validatable-node.types';
import { migrateEnvelope, ENVELOPE_VERSION } from '../blocks/migration/envelope-migration.engine';
import { migrateBlockTree } from '../blocks/migration/block-tree-migration.engine';
import { MigratableBlockNode } from '../blocks/migration/block-migration.types';
import {
  assertValidContentTreeShape,
  assertPayloadWithinLimit,
  ContentTree,
} from '../pages/content-tree';
import { CreateSiteTemplateDto } from './dto/create-site-template.dto';
import { UpdateSiteTemplateDto } from './dto/update-site-template.dto';
import { SiteTemplateResponseDto } from './dto/site-template.dto';
import { DisplayConditionRuleDto } from './dto/display-condition-rule.dto';

type SiteTemplateRow = typeof siteTemplateEntity.$inferSelect;
type PersistableContent = { version: number; blocks: unknown[] };

/** Colonne ammesse per l'ordinamento dell'elenco admin (`?o=`). */
const ORDERABLE_COLUMNS: Record<string, PgColumn> = {
  title: siteTemplateEntity.title,
  type: siteTemplateEntity.type,
  language: siteTemplateEntity.language,
  priority: siteTemplateEntity.priority,
  createdAt: siteTemplateEntity.createdAt,
  updatedAt: siteTemplateEntity.updatedAt,
};

/**
 * CRUD amministrativo dei Template di tema (RFC-40 Opzione B, decisione
 * umana 2026-08-31). Nessuna ownership per riga: guard `Manager`+ sul
 * controller basta, coerente con la riga di permessi "Gestire Menu,
 * Template, Sezioni globali". `contentTree` riusa integralmente la pipeline
 * di ADR-21 (migrazione → validazione di registro → sanitizzazione per
 * `kind`), stesso schema di `PagesService`/`GlobalSectionsService`.
 */
@Injectable()
export class SiteTemplatesService {
  private readonly logger = new Logger(SiteTemplatesService.name);

  /** Inietta DB, audit log e pipeline blocchi (ADR-21). */
  constructor(
    private readonly db: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly blockTreeValidator: BlockTreeValidatorService,
    private readonly blockPropSanitizer: BlockPropSanitizerService,
    @Inject(BLOCK_REGISTRY_TOKEN) private readonly blockRegistry: BlockRegistry,
  ) {}

  /** Lista paginata dei Template di tema attivi, filtrabile per tipo/lingua/stato pubblicazione. */
  async findAll(params: SiteTemplatesQueryParams): Promise<Pagination<SiteTemplateResponseDto>> {
    const page = params.p && params.p > 0 ? params.p : 1;
    const perPage = params.i && params.i > 0 ? params.i : 20;

    const conditions: (SQL | undefined)[] = [eq(siteTemplateEntity.isActive, true)];
    if (params.q) {
      conditions.push(ilike(siteTemplateEntity.title, `%${params.q}%`));
    }
    if (params.type) {
      conditions.push(eq(siteTemplateEntity.type, params.type));
    }
    if (params.language) {
      conditions.push(eq(siteTemplateEntity.language, params.language));
    }
    if (params.isPublished !== undefined) {
      conditions.push(eq(siteTemplateEntity.isPublished, params.isPublished));
    }
    const where = and(...conditions);

    const orderColumn = (params.o && ORDERABLE_COLUMNS[params.o]) || siteTemplateEntity.updatedAt;
    const orderBy = params.d === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const [rows, [{ total }]] = await Promise.all([
      this.db.db.query.siteTemplateEntity.findMany({
        where,
        orderBy,
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.db.db.select({ total: count() }).from(siteTemplateEntity).where(where),
    ]);

    return new Pagination(
      rows.map((row) => this.toDto(row)),
      total,
      page,
      perPage,
    );
  }

  /** Dettaglio di un Template di tema attivo. `404` se inesistente o soft-eliminato. */
  async findOne(guid: string): Promise<SiteTemplateResponseDto> {
    const row = await this.loadActiveByGuid(guid);
    return this.toDto(row);
  }

  /** Crea un Template di tema. */
  async create(dto: CreateSiteTemplateDto, authInfo: AuthInfo): Promise<SiteTemplateResponseDto> {
    const contentInput = dto.contentTree ?? { version: ENVELOPE_VERSION, blocks: [] };
    const contentTree = this.runWriteContentPipeline(contentInput);

    const row = await this.insertOrThrow({
      guid: Utils.randomString(16),
      title: dto.title,
      type: dto.type,
      contentTree,
      isPublished: dto.isPublished ?? false,
      language: dto.language ?? 'IT',
      priority: dto.priority ?? 0,
      displayConditions: dto.displayConditions ?? [],
      createdBy: authInfo.userId,
      updatedBy: authInfo.userId,
    });

    this.logger.log(`Template di tema creato (guid=${row.guid}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'site-templates.create',
      'site_templates',
      row.guid,
      { type: row.type, language: row.language },
      authInfo.impersonatedBy,
    );
    return this.toDto(row);
  }

  /**
   * Aggiorna un Template di tema. Lock ottimistico: `WHERE version =
   * :version`, incrementata nello stesso `UPDATE`; zero righe aggiornate ⇒
   * `409 SITE_TEMPLATE_VERSION_CONFLICT`.
   */
  async update(
    guid: string,
    dto: UpdateSiteTemplateDto,
    authInfo: AuthInfo,
  ): Promise<SiteTemplateResponseDto> {
    const row = await this.loadActiveByGuid(guid);

    const values: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: authInfo.userId,
    };
    if (dto.title !== undefined) values.title = dto.title;
    if (dto.type !== undefined) values.type = dto.type;
    if (dto.isPublished !== undefined) values.isPublished = dto.isPublished;
    if (dto.language !== undefined) values.language = dto.language;
    if (dto.priority !== undefined) values.priority = dto.priority;
    if (dto.displayConditions !== undefined) values.displayConditions = dto.displayConditions;
    if (dto.contentTree !== undefined)
      values.contentTree = this.runWriteContentPipeline(dto.contentTree);

    const updatedRow = await this.updateOrThrowConflict(row.id, dto.version, values);

    this.logger.log(`Template di tema aggiornato (guid=${guid}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'site-templates.update',
      'site_templates',
      guid,
      { fields: Object.keys(values) },
      authInfo.impersonatedBy,
    );
    return this.toDto(updatedRow);
  }

  /** Soft delete di un Template di tema. */
  async remove(guid: string, authInfo: AuthInfo, ip?: string): Promise<void> {
    const row = await this.loadActiveByGuid(guid);

    await this.db.db
      .update(siteTemplateEntity)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(eq(siteTemplateEntity.id, row.id));

    this.logger.log(`Template di tema eliminato (guid=${guid}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'site-templates.delete',
      'site_templates',
      guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async loadActiveByGuid(guid: string): Promise<SiteTemplateRow> {
    const row = await this.db.db.query.siteTemplateEntity.findFirst({
      where: and(eq(siteTemplateEntity.guid, guid), eq(siteTemplateEntity.isActive, true)),
    });
    if (!row) {
      throw new NotFoundException('Template di tema non trovato.');
    }
    return row;
  }

  private async insertOrThrow(
    values: typeof siteTemplateEntity.$inferInsert,
  ): Promise<SiteTemplateRow> {
    const [row] = await this.db.db.insert(siteTemplateEntity).values(values).returning();
    return row;
  }

  private async updateOrThrowConflict(
    id: number,
    expectedVersion: number,
    setValues: Record<string, unknown>,
  ): Promise<SiteTemplateRow> {
    const [row] = await this.db.db
      .update(siteTemplateEntity)
      .set({ ...setValues, version: expectedVersion + 1 })
      .where(
        and(
          eq(siteTemplateEntity.id, id),
          eq(siteTemplateEntity.version, expectedVersion),
          eq(siteTemplateEntity.isActive, true),
        ),
      )
      .returning();
    if (!row) {
      throw new ConflictException({
        message: 'Il Template di tema è stato modificato da un altro utente. Ricarica e riprova.',
        code: 'SITE_TEMPLATE_VERSION_CONFLICT',
      });
    }
    return row;
  }

  private toDto(row: SiteTemplateRow): SiteTemplateResponseDto {
    return {
      guid: row.guid,
      title: row.title,
      type: row.type as SiteTemplateResponseDto['type'],
      contentTree: row.contentTree as Record<string, unknown>,
      isPublished: row.isPublished,
      language: row.language,
      priority: row.priority,
      displayConditions: (row.displayConditions ?? []) as DisplayConditionRuleDto[],
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ─── Pipeline blocchi (riuso di ADR-21, stesso schema di PagesService/GlobalSectionsService) ────

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

    const resultEnvelope: PersistableContent = {
      version: ENVELOPE_VERSION,
      blocks: sanitized.tree,
    };
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
