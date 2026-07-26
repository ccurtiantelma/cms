import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { fileEntity } from '../db/schema';
import { AppConstants } from '../common/app-constants';
import { AppUserRoles } from '../common/enums';
import { AuditLogService } from '../common/audit-log.service';
import { AuthInfo } from '../common/types';
import { Utils } from '../common/utils';
import { STORAGE_DRIVER, StorageDriver } from './storage/storage-driver.interface';
import { FileMetadataDto } from './dto/file-metadata.dto';
import { UploadFileDto } from './dto/upload-file.dto';

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
   * Recupera lo stream del blob associato a `guid`, se il file esiste ed è attivo.
   * @param guid Identificatore pubblico del file.
   */
  async download(guid: string): Promise<FileDownload> {
    const row = await this.findActiveByGuid(guid);
    const stream = await this.storageDriver.download(row.storageKey);
    return { stream, mimeType: row.mimeType, originalName: row.originalName };
  }

  /**
   * Soft-delete del file (`isActive = false`): il blob fisico non viene
   * rimosso subito (ADR-8, Conseguenze — pulizia rimandata a un job futuro,
   * per non rendere irreversibile un'operazione pensata come reversibile).
   * Consentito solo all'autore del file o a un ruolo Admin/superiore.
   * @param guid Identificatore pubblico del file.
   * @param authInfo Identità del chiamante.
   * @param ip Indirizzo IP del chiamante, per l'audit log.
   */
  async softDelete(guid: string, authInfo: AuthInfo, ip?: string): Promise<void> {
    const row = await this.findActiveByGuid(guid);

    if (authInfo.role > AppUserRoles.Admin && row.createdBy !== authInfo.userId) {
      throw new ForbiddenException("Solo l'autore del file o un Admin possono eliminarlo.");
    }

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

  /** Converte una riga DB nel DTO pubblico (mai storageKey/checksum, dettagli interni del driver). */
  private toMetadataDto(row: typeof fileEntity.$inferSelect): FileMetadataDto {
    return {
      guid: row.guid,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      entity: row.entity,
      entityId: row.entityId,
      createdAt: row.createdAt!,
    };
  }
}
