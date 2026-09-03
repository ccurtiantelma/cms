import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { and, count, desc, eq, ilike, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { fileEntity, pageEntity, pageRevisionEntity } from '../db/schema';
import { AppConstants } from '../common/app-constants';
import { AppUserRoles } from '../common/enums';
import { AuditLogService } from '../common/audit-log.service';
import { AuthInfo, FilesQueryParams } from '../common/types';
import { Pagination } from '../common/pagination';
import { Utils } from '../common/utils';
import { findBlockDefinition } from '../blocks/block-registry';
import { STORAGE_DRIVER, StorageDriver } from './storage/storage-driver.interface';
import { FileMetadataDto } from './dto/file-metadata.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { MediaTransformDto } from './dto/media-transform.dto';
import { MediaQueueService } from '../queues/media-queue/media-queue.service';

/** Contenuto di un file pronto per lo streaming al client (vedi `FilesService.download`). */
export interface FileDownload {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  originalName: string;
}

/**
 * Service dell'astrazione di storage documenti (ADR-8). Dipende solo dal
 * contratto `StorageDriver`, mai da un'implementazione concreta — il driver
 * attivo è iniettato da `files.module.ts` in base a `AppConstants.storageDriver`.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  /** Inietta l'accesso al DB, il driver di storage attivo e l'audit log. */
  constructor(
    private readonly db: DbService,
    @Inject(STORAGE_DRIVER) private readonly storageDriver: StorageDriver,
    private readonly auditLogService: AuditLogService,
    private readonly mediaQueueService: MediaQueueService,
  ) {}

  /**
   * Salva il blob tramite il driver attivo e ne registra i metadata.
   * @param file File multipart ricevuto da `FileInterceptor` (dimensione già validata in `files.controller.ts`).
   * @param dto Associazione opzionale a un'entità di dominio del progetto verticale.
   * @param authInfo Identità del chiamante (autore del file).
   * @param ip Indirizzo IP del chiamante, per l'audit log.
   */
  async upload(
    file: Express.Multer.File,
    dto: UploadFileDto,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<FileMetadataDto> {
    const storageKey = Utils.randomString(40);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

    await this.storageDriver.upload(storageKey, file.buffer, file.mimetype);

    const [row] = await this.db.db
      .insert(fileEntity)
      .values({
        guid: Utils.randomString(16),
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageDriver: AppConstants.storageDriver,
        storageKey,
        checksumSha256,
        entity: dto.entity,
        entityId: dto.entityId,
        createdBy: authInfo.userId,
        updatedBy: authInfo.userId,
      })
      .returning();

    this.logger.log(`File caricato (guid=${row.guid}, driver=${AppConstants.storageDriver}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'files.upload',
      'files',
      row.guid,
      row.originalName,
      authInfo.impersonatedBy,
      ip,
    );

    return this.toMetadataDto(row);
  }

  /**
   * Lista paginata dei media editoriali attivi, più recenti prima (RFC-F09 § 1,
   * ADR-35). Nessun filtro di ownership: i media sono risorsa condivisa
   * mono-tenant (A5), leggibile da ogni ruolo autenticato — il controller non
   * applica alcuna soglia RBAC oltre l'autenticazione JWT globale.
   *
   * L'esclusione delle righe non editoriali (`entity <> 'page-media'`) è un
   * default **server-side**, mai delegato a un parametro del chiamante
   * (ADR-35, decisione § 1): `files` è storage documenti generico (ADR-8) e
   * vi finiscono anche allegati privati di altri domini verticali (es.
   * `entity: 'invoice'`) che questa rotta non deve mai enumerare.
   * @param params Filtri di paginazione/ricerca (`p`/`i`/`q` su `originalName`/`mimeType` esatto).
   * @param authInfo Identità del chiamante — accettata per coerenza di firma con gli altri
   * elenchi del modulo (`PagesService.findAll`, `NotificationsService.findAllForUser`),
   * non usata a filtro qui: nessuna regola di ownership è definita per questo elenco.
   */
  async list(
    params: FilesQueryParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- vedi JSDoc: firma coerente con gli altri elenchi, nessun filtro di ownership per questo endpoint
    authInfo: AuthInfo,
  ): Promise<Pagination<FileMetadataDto>> {
    const page = params.p > 0 ? params.p : 1;
    const perPage = params.i > 0 ? params.i : 20;

    const conditions: (SQL | undefined)[] = [
      eq(fileEntity.isActive, true),
      eq(fileEntity.entity, 'page-media'),
    ];
    if (params.q) {
      conditions.push(ilike(fileEntity.originalName, `%${params.q}%`));
    }
    if (params.mimeType) {
      conditions.push(eq(fileEntity.mimeType, params.mimeType));
    }
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      this.db.db.query.fileEntity.findMany({
        where,
        orderBy: desc(fileEntity.createdAt),
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      this.db.db.select({ total: count() }).from(fileEntity).where(where),
    ]);

    return new Pagination(
      rows.map((row) => this.toMetadataDto(row)),
      total,
      page,
      perPage,
    );
  }

  /**
   * Recupera lo stream del blob associato a `guid`, se il file esiste ed è attivo.
   * @param guid Identificatore pubblico del file.
   */
  async download(guid: string): Promise<FileDownload> {
    const row = await this.findActiveByGuid(guid);
    const stream = await this.storageDriver.download(row.storageKey);
    return { stream, mimeType: row.mimeType, originalName: row.originalName };
  }

  /**
   * Metadati di un file attivo, senza toccare lo storage (RFC-F09 § 1, T1).
   * Serve alla `PropertyInspector` per mostrare nome/anteprima di un media
   * già referenziato da un blocco salvato, senza scaricare il blob e senza
   * enumerare l'intera libreria. Nessun filtro `entity`: a differenza di
   * `list()`, qui il chiamante conosce già il `guid` esatto.
   * @param guid Identificatore pubblico del file.
   */
  async getMetadata(guid: string): Promise<FileMetadataDto> {
    const row = await this.findActiveByGuid(guid);
    return this.toMetadataDto(row);
  }

  /**
   * Accoda la generazione di una variante trasformata dell'asset (ADR-49):
   * verifica solo che il file sorgente esista e sia attivo, poi delega
   * l'intero lavoro pixel-level a `MediaProcessor` via `MediaQueueService` —
   * mai eseguito nel path di questa chiamata.
   * @param fileGuid Identificatore pubblico del file sorgente.
   * @param transformDto Crop esplicito e/o preset richiesto.
   * @returns L'id del job BullMQ accodato, utile al chiamante per un eventuale tracking.
   */
  async requestImageTransform(
    fileGuid: string,
    transformDto: MediaTransformDto,
  ): Promise<{ jobId: string }> {
    await this.findActiveByGuid(fileGuid);
    const jobId = await this.mediaQueueService.enqueueTransform(fileGuid, transformDto);
    return { jobId };
  }

  /**
   * Aggiorna il focal point persistito sull'asset (ADR-49 § M4): percentuale
   * 0-100 del soggetto, usata da `MediaProcessor` come centro del ritaglio
   * quando una trasformazione non fornisce un crop esplicito.
   * @param fileGuid Identificatore pubblico del file.
   * @param focalX Percentuale orizzontale (0-100).
   * @param focalY Percentuale verticale (0-100).
   * @returns I metadata aggiornati del file, con il nuovo focal point.
   */
  async updateFocalPoint(
    fileGuid: string,
    focalX: number,
    focalY: number,
  ): Promise<FileMetadataDto> {
    if (focalX < 0 || focalX > 100 || focalY < 0 || focalY > 100) {
      throw new BadRequestException(
        'focalX/focalY devono essere percentuali comprese fra 0 e 100.',
      );
    }

    const row = await this.findActiveByGuid(fileGuid);

    const [updatedRow] = await this.db.db
      .update(fileEntity)
      .set({ focalX, focalY, updatedAt: new Date() })
      .where(eq(fileEntity.id, row.id))
      .returning();

    this.logger.log(
      `Focal point aggiornato (guid=${fileGuid}, focalX=${focalX}, focalY=${focalY}).`,
    );

    return this.toMetadataDto(updatedRow);
  }

  /**
   * Soft-delete del file (`isActive = false`): il blob fisico non viene
   * rimosso subito (ADR-8, Conseguenze — pulizia rimandata a un job futuro,
   * per non rendere irreversibile un'operazione pensata come reversibile).
   * Consentito solo all'autore del file o a un ruolo Admin/superiore.
   * Protezione referenziale (RFC-F09 N7): rifiutata con `409` se il file è
   * referenziato da un nodo `mediaRef` nell'albero della Revisione
   * attualmente pubblicata di una Pagina `published` — verificato **prima**
   * di qualunque side-effect (nessuna scrittura DB, nessuna chiamata al
   * driver di storage).
   * @param guid Identificatore pubblico del file.
   * @param authInfo Identità del chiamante.
   * @param ip Indirizzo IP del chiamante, per l'audit log.
   */
  async softDelete(guid: string, authInfo: AuthInfo, ip?: string): Promise<void> {
    const row = await this.findActiveByGuid(guid);

    if (authInfo.role > AppUserRoles.Admin && row.createdBy !== authInfo.userId) {
      throw new ForbiddenException("Solo l'autore del file o un Admin possono eliminarlo.");
    }

    await this.assertNotReferencedByPublishedPage(guid);

    await this.db.db
      .update(fileEntity)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: authInfo.userId })
      .where(eq(fileEntity.id, row.id));

    this.logger.log(`File eliminato (guid=${guid}).`);
    await this.auditLogService.log(
      authInfo.userId,
      'files.delete',
      'files',
      guid,
      undefined,
      authInfo.impersonatedBy,
      ip,
    );
  }

  /**
   * Lancia `409 Conflict` se `guid` è referenziato da un nodo `mediaRef`
   * nell'albero della Revisione attualmente pubblicata di una Pagina
   * `published` (RFC-F09 N7). Legge tutte le Revisioni che sono la revisione
   * pubblicata corrente di una Pagina `published`/attiva (join
   * `pages`↔`page_revisions` su `publishedRevisionId`), poi cammina ciascun
   * albero in JS con {@link pageReferencesFile} — il registro dei tipi
   * (`kind: 'mediaRef'`) non è esprimibile in SQL.
   */
  private async assertNotReferencedByPublishedPage(guid: string): Promise<void> {
    const publishedRevisions = await this.db.db
      .select({ content: pageRevisionEntity.content })
      .from(pageEntity)
      .innerJoin(pageRevisionEntity, eq(pageRevisionEntity.id, pageEntity.publishedRevisionId))
      .where(and(eq(pageEntity.status, 'published'), eq(pageEntity.isActive, true)));

    const isReferenced = publishedRevisions.some((row) =>
      this.pageReferencesFile(row.content, guid),
    );
    if (isReferenced) {
      throw new ConflictException(
        'Impossibile eliminare il file: è referenziato da una o più pagine pubblicate.',
      );
    }
  }

  /**
   * Cammina ricorsivamente l'albero `content.blocks` (qualunque profondità,
   * via `children`, vedi `pages/content-tree.ts`) cercando un nodo la cui
   * definizione (`findBlockDefinition`, registro blocchi) dichiara una prop
   * di `kind: 'mediaRef'` con valore uguale a `guid`. Genera per **ogni**
   * prop `kind: 'mediaRef'` del registro, presente o futura — mai un nome di
   * prop hardcoded (oggi solo `image.mediaRef`, ma il registro può
   * estendersi senza toccare questa protezione).
   * @param content Contenuto grezzo di `page_revisions.content` (`unknown`: snapshot jsonb non tipizzato).
   * @param guid Guid del file cercato.
   */
  private pageReferencesFile(content: unknown, guid: string): boolean {
    const walk = (node: unknown): boolean => {
      if (node === null || typeof node !== 'object' || Array.isArray(node)) {
        return false;
      }
      const block = node as Record<string, unknown>;

      if (typeof block.type === 'string') {
        const definition = findBlockDefinition(block.type);
        const props = (
          block.props !== null && typeof block.props === 'object' ? block.props : {}
        ) as Record<string, unknown>;
        if (definition) {
          for (const [propName, propSpec] of Object.entries(definition.props)) {
            if (propSpec.kind === 'mediaRef' && props[propName] === guid) {
              return true;
            }
          }
        }
      }

      const children = Array.isArray(block.children) ? block.children : [];
      return children.some(walk);
    };

    if (content === null || typeof content !== 'object' || Array.isArray(content)) {
      return false;
    }
    const tree = content as Record<string, unknown>;
    const blocks = Array.isArray(tree.blocks) ? tree.blocks : [];
    return blocks.some(walk);
  }

  /** Cerca un file attivo per guid, lanciando 404 se assente o soft-deleted. */
  private async findActiveByGuid(guid: string): Promise<typeof fileEntity.$inferSelect> {
    const row = await this.db.db.query.fileEntity.findFirst({
      where: and(eq(fileEntity.guid, guid), eq(fileEntity.isActive, true)),
    });
    if (!row) {
      throw new NotFoundException('File non trovato.');
    }
    return row;
  }

  /**
   * Converte una riga DB nel DTO pubblico (mai storageKey/checksum, dettagli
   * interni del driver). `width`/`height` sono sempre `null`: le colonne non
   * esistono ancora in schema (RFC-F09 N2, non firmata) — il campo resta nel
   * contratto perché il frontend già lo consuma (`MediaFileRecord`), pronto a
   * valorizzarsi senza un secondo giro di `openapi:types` quando N2 sarà
   * firmata. `url` è derivato dal solo `entity` (RFC-F09 § 2): non implica
   * che il blob sia raster-riconosciuto, verificato invece in lettura da
   * `PublicMediaService` (ADR-27 § 3/§ 4).
   */
  private toMetadataDto(row: typeof fileEntity.$inferSelect): FileMetadataDto {
    return {
      guid: row.guid,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      entity: row.entity,
      entityId: row.entityId,
      width: null,
      height: null,
      url: row.entity === 'page-media' ? `api/v1/public/media/${row.guid}` : null,
      focalX: row.focalX,
      focalY: row.focalY,
      createdAt: row.createdAt!,
    };
  }
}
