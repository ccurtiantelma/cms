import { createHash } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FilesService } from '../../../src/files/files.service';
import { DbService } from '../../../src/db/db.service';
import { AuditLogService } from '../../../src/common/audit-log.service';
import { StorageDriver } from '../../../src/files/storage/storage-driver.interface';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';

describe('FilesService (unit)', () => {
  let filesService: FilesService;
  let insertValuesMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let auditLogMock: jest.Mock;
  let storageDriver: jest.Mocked<StorageDriver>;

  const buildAuthInfo = (userId: number, role: AppUserRoles): AuthInfo => ({
    userId,
    role,
    name: 'Test',
    scopeId: null,
  });

  const insertedRow = {
    id: 1,
    guid: 'a1b2c3d4e5f6a7b8',
    originalName: 'fattura.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4,
    storageDriver: 'local',
    storageKey: 'generated-key',
    checksumSha256: createHash('sha256').update(Buffer.from('test')).digest('hex'),
    entity: 'invoice',
    entityId: 'inv-1',
    isActive: true,
    createdAt: new Date('2026-07-23T10:00:00.000Z'),
    createdBy: 7,
    updatedBy: 7,
  };

  beforeEach(() => {
    insertValuesMock = jest
      .fn()
      .mockReturnValue({ returning: jest.fn().mockResolvedValue([insertedRow]) });
    updateWhereMock = jest.fn().mockResolvedValue(undefined);
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    findFirstMock = jest.fn();
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    storageDriver = {
      upload: jest.fn().mockResolvedValue(undefined),
      download: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const dbService = {
      db: {
        insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
        update: jest.fn().mockReturnValue({ set: updateSetMock }),
        query: { fileEntity: { findFirst: findFirstMock } },
      },
    } as unknown as DbService;

    const auditLogService = { log: auditLogMock } as unknown as AuditLogService;

    filesService = new FilesService(dbService, storageDriver, auditLogService);
  });

  describe('upload', () => {
    it("salva il blob tramite il driver, registra i metadata e l'audit log", async () => {
      const file = {
        originalname: 'fattura.pdf',
        mimetype: 'application/pdf',
        size: 4,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      const result = await filesService.upload(
        file,
        { entity: 'invoice', entityId: 'inv-1' },
        authInfo,
        '1.2.3.4',
      );

      expect(storageDriver.upload).toHaveBeenCalledWith(
        expect.any(String),
        file.buffer,
        file.mimetype,
      );
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: 'fattura.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
          entity: 'invoice',
          entityId: 'inv-1',
          createdBy: 7,
          updatedBy: 7,
        }),
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        7,
        'files.upload',
        'files',
        insertedRow.guid,
        insertedRow.originalName,
        undefined,
        '1.2.3.4',
      );
      expect(result).toEqual({
        guid: insertedRow.guid,
        originalName: insertedRow.originalName,
        mimeType: insertedRow.mimeType,
        sizeBytes: insertedRow.sizeBytes,
        entity: insertedRow.entity,
        entityId: insertedRow.entityId,
        createdAt: insertedRow.createdAt,
      });
      expect(result).not.toHaveProperty('storageKey');
      expect(result).not.toHaveProperty('checksumSha256');
    });
  });

  describe('download', () => {
    it('restituisce stream/mimeType/originalName per un file attivo esistente', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      const fakeStream = {} as NodeJS.ReadableStream;
      storageDriver.download.mockResolvedValue(fakeStream);

      const result = await filesService.download(insertedRow.guid);

      expect(storageDriver.download).toHaveBeenCalledWith(insertedRow.storageKey);
      expect(result).toEqual({
        stream: fakeStream,
        mimeType: insertedRow.mimeType,
        originalName: insertedRow.originalName,
      });
    });

    it('lancia NotFoundException se il file non esiste o è stato eliminato', async () => {
      findFirstMock.mockResolvedValue(undefined);

      await expect(filesService.download('guid-inesistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it("consente all'autore del file di eliminarlo", async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      await filesService.softDelete(insertedRow.guid, authInfo, '1.2.3.4');

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: 7 }),
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        7,
        'files.delete',
        'files',
        insertedRow.guid,
        undefined,
        undefined,
        '1.2.3.4',
      );
    });

    it('consente a un ruolo Admin/superiore di eliminare il file di un altro utente', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      const authInfo = buildAuthInfo(99, AppUserRoles.Admin);

      await expect(filesService.softDelete(insertedRow.guid, authInfo)).resolves.toBeUndefined();
      expect(updateSetMock).toHaveBeenCalled();
    });

    it('rifiuta la cancellazione da parte di un utente non autore e non Admin (RBAC)', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      const authInfo = buildAuthInfo(99, AppUserRoles.User);

      await expect(filesService.softDelete(insertedRow.guid, authInfo)).rejects.toThrow(
        ForbiddenException,
      );
      expect(updateSetMock).not.toHaveBeenCalled();
    });

    it('lancia NotFoundException se il file non esiste o è già eliminato', async () => {
      findFirstMock.mockResolvedValue(undefined);
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      await expect(filesService.softDelete('guid-inesistente', authInfo)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
