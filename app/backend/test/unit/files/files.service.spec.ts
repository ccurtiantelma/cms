import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FilesService } from '../../../src/files/files.service';
import { DbService } from '../../../src/db/db.service';
import { AuditLogService } from '../../../src/common/audit-log.service';
import { StorageDriver } from '../../../src/files/storage/storage-driver.interface';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo, FilesQueryParams } from '../../../src/common/types';
import { MediaQueueService } from '../../../src/queues/media-queue/media-queue.service';
import { MediaTransformPreset } from '../../../src/files/dto/media-transform.dto';

/**
 * Albero minimale di contenuto pagina (`page_revisions.content`) usato per i
 * test della protezione referenziale N7 — stessa forma di `content.blocks`
 * validata dal registro blocchi reale (`src/blocks/block-registry.ts`).
 */
interface TestBlockNode {
  id: string;
  type: string;
  v: number;
  props: Record<string, unknown>;
  children: TestBlockNode[];
}

interface TestPageContent {
  version: number;
  blocks: TestBlockNode[];
}

/**
 * Serializza un oggetto SQL di drizzle-orm (`and(...)`/`ilike`/`eq`) in una
 * stringa ispezionabile nei test, saltando la chiave `table` (circolare) e
 * ogni altro riferimento già visitato. Usata solo per verificare che la
 * `where` costruita da `FilesService.list` includa davvero gli operatori
 * attesi (`ilike`, valore del filtro) — non per accoppiarsi ai dettagli
 * interni della libreria oltre questo.
 */
function serializeWhere(node: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (key, value) => {
    if (key === 'table') {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value as object)) {
        return undefined;
      }
      seen.add(value as object);
    }
    return value;
  });
}

describe('FilesService (unit)', () => {
  let filesService: FilesService;
  let insertValuesMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let updateReturningMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let findManyMock: jest.Mock;
  let selectWhereMock: jest.Mock;
  let innerJoinMock: jest.Mock;
  let auditLogMock: jest.Mock;
  let storageDriver: jest.Mocked<StorageDriver>;
  let enqueueTransformMock: jest.Mock;

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
    // `updateWhereMock` restituisce un oggetto con `.returning()` per coprire sia
    // `updateFocalPoint` (che ora usa `.returning()`, vedi ADR-49) sia `softDelete`
    // (che continua a fare solo `await ... .where(...)`, ignorando il valore).
    updateReturningMock = jest.fn().mockResolvedValue([{ ...insertedRow, focalX: 50, focalY: 50 }]);
    updateWhereMock = jest.fn().mockReturnValue({ returning: updateReturningMock });
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    findFirstMock = jest.fn();
    findManyMock = jest.fn().mockResolvedValue([]);
    // Default: nessuna pagina pubblicata referenzia il file — soddisfa i test
    // di `softDelete` preesistenti senza che debbano configurare la query
    // referenziale (RFC-F09 N7). Ogni test che vuole simulare un match la
    // sovrascrive con `mockResolvedValueOnce`.
    selectWhereMock = jest.fn().mockResolvedValue([]);
    innerJoinMock = jest.fn().mockReturnValue({ where: selectWhereMock });
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
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({ where: selectWhereMock, innerJoin: innerJoinMock }),
        }),
        query: { fileEntity: { findFirst: findFirstMock, findMany: findManyMock } },
      },
    } as unknown as DbService;

    const auditLogService = { log: auditLogMock } as unknown as AuditLogService;

    enqueueTransformMock = jest.fn().mockResolvedValue('job-default');
    const mediaQueueService = {
      enqueueTransform: enqueueTransformMock,
    } as unknown as MediaQueueService;

    filesService = new FilesService(dbService, storageDriver, auditLogService, mediaQueueService);
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
        // Metadata media (RFC-F09 § 2): `width`/`height` restano `null` — le colonne
        // non esistono ancora —, `url` è derivato dal solo `entity` ed è `null` per
        // tutto ciò che non è `page-media`.
        width: null,
        height: null,
        url: null,
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

  describe('list', () => {
    const fileRow1 = { ...insertedRow };
    const fileRow2 = {
      ...insertedRow,
      id: 2,
      guid: 'b2c3d4e5f6a7b8c9',
      originalName: 'logo.png',
      mimeType: 'image/png',
      entity: null,
      entityId: null,
      createdAt: new Date('2026-08-01T09:00:00.000Z'),
    };
    const managerAuthInfo = buildAuthInfo(7, AppUserRoles.Manager);

    it('restituisce una Pagination costruita da findMany + count eseguiti in parallelo', async () => {
      findManyMock.mockResolvedValue([fileRow1, fileRow2]);
      selectWhereMock.mockResolvedValueOnce([{ total: 2 }]);
      const params: FilesQueryParams = { p: 1, i: 20 };

      const result = await filesService.list(params, managerAuthInfo);

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
      expect(result.items).toEqual([
        {
          guid: fileRow1.guid,
          originalName: fileRow1.originalName,
          mimeType: fileRow1.mimeType,
          sizeBytes: fileRow1.sizeBytes,
          entity: fileRow1.entity,
          entityId: fileRow1.entityId,
          createdAt: fileRow1.createdAt,
          width: null,
          height: null,
          url: null,
        },
        {
          guid: fileRow2.guid,
          originalName: fileRow2.originalName,
          mimeType: fileRow2.mimeType,
          sizeBytes: fileRow2.sizeBytes,
          entity: fileRow2.entity,
          entityId: fileRow2.entityId,
          createdAt: fileRow2.createdAt,
          width: null,
          height: null,
          url: null,
        },
      ]);
      expect(result.totalItems).toBe(2);
      expect(result.currentPage).toBe(1);
      expect(result.itemsPerPage).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('calcola limit/offset coerenti con p/i espliciti (pagina 3, 5 per pagina)', async () => {
      findManyMock.mockResolvedValue([]);
      selectWhereMock.mockResolvedValueOnce([{ total: 0 }]);
      const params: FilesQueryParams = { p: 3, i: 5 };

      const result = await filesService.list(params, managerAuthInfo);

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, offset: 10 }));
      expect(result.currentPage).toBe(3);
      expect(result.itemsPerPage).toBe(5);
    });

    it('applica i default p=1/i=20 quando p/i non sono valorizzati (0)', async () => {
      findManyMock.mockResolvedValue([]);
      selectWhereMock.mockResolvedValueOnce([{ total: 0 }]);
      const params: FilesQueryParams = { p: 0, i: 0 };

      const result = await filesService.list(params, managerAuthInfo);

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
      expect(result.currentPage).toBe(1);
      expect(result.itemsPerPage).toBe(20);
    });

    it('applica un filtro ilike su originalName quando q è presente', async () => {
      findManyMock.mockResolvedValue([]);
      selectWhereMock.mockResolvedValueOnce([{ total: 0 }]);
      const params: FilesQueryParams = { p: 1, i: 20, q: 'fattura' };

      const result = await filesService.list(params, managerAuthInfo);

      const whereArg: unknown = (findManyMock.mock.calls[0][0] as { where: unknown }).where;
      const serialized = serializeWhere(whereArg);
      expect(serialized).toContain('ilike');
      expect(serialized).toContain('%fattura%');
      expect(result.totalItems).toBe(0);
    });

    it('applica un match esatto su mimeType quando presente, senza ilike', async () => {
      findManyMock.mockResolvedValue([]);
      selectWhereMock.mockResolvedValueOnce([{ total: 0 }]);
      const params: FilesQueryParams = { p: 1, i: 20, mimeType: 'image/png' };

      await filesService.list(params, managerAuthInfo);

      const whereArg: unknown = (findManyMock.mock.calls[0][0] as { where: unknown }).where;
      const serialized = serializeWhere(whereArg);
      expect(serialized).toContain('image/png');
      expect(serialized).not.toContain('ilike');
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

  describe('softDelete — protezione referenziale (N7)', () => {
    const referencingContent: TestPageContent = {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'image',
          v: 1,
          props: { mediaRef: insertedRow.guid, alt: 'Logo' },
          children: [],
        },
      ],
    };

    const nestedReferencingContent: TestPageContent = {
      version: 1,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            {
              id: 'b1',
              type: 'image',
              v: 1,
              props: { mediaRef: insertedRow.guid, alt: 'Logo annidato' },
              children: [],
            },
          ],
        },
      ],
    };

    const nonReferencingContent: TestPageContent = {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'image',
          v: 1,
          props: { mediaRef: 'altro-guid-16chr', alt: 'Altra immagine' },
          children: [],
        },
      ],
    };

    it('rifiuta con ConflictException (409) se il file è referenziato da una pagina pubblicata, senza eseguire alcuna scrittura', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      selectWhereMock.mockResolvedValueOnce([{ content: referencingContent }]);
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      await expect(filesService.softDelete(insertedRow.guid, authInfo)).rejects.toThrow(
        ConflictException,
      );
      expect(updateSetMock).not.toHaveBeenCalled();
      expect(updateWhereMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('rifiuta con ConflictException (409) anche quando il riferimento è annidato sotto un blocco contenitore', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      selectWhereMock.mockResolvedValueOnce([{ content: nestedReferencingContent }]);
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      await expect(filesService.softDelete(insertedRow.guid, authInfo)).rejects.toThrow(
        ConflictException,
      );
      expect(updateSetMock).not.toHaveBeenCalled();
    });

    it('procede alla cancellazione se nessuna pagina pubblicata referenzia il file', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      selectWhereMock.mockResolvedValueOnce([]);
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      await filesService.softDelete(insertedRow.guid, authInfo, '1.2.3.4');

      expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      expect(auditLogMock).toHaveBeenCalled();
    });

    it('procede alla cancellazione se le pagine pubblicate esistono ma nessuna referenzia questo guid', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      selectWhereMock.mockResolvedValueOnce([{ content: nonReferencingContent }]);
      const authInfo = buildAuthInfo(7, AppUserRoles.User);

      await filesService.softDelete(insertedRow.guid, authInfo);

      expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });
  });

  describe('requestImageTransform', () => {
    it('verifica che il file sorgente esista, accoda la trasformazione e ritorna il jobId', async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      enqueueTransformMock.mockResolvedValue('job-123');
      const transformDto = { preset: MediaTransformPreset.Card, focalX: 50, focalY: 50 };

      const result = await filesService.requestImageTransform(insertedRow.guid, transformDto);

      expect(enqueueTransformMock).toHaveBeenCalledWith(insertedRow.guid, transformDto);
      expect(result).toEqual({ jobId: 'job-123' });
    });

    it('lancia NotFoundException e non accoda nulla se il file sorgente non esiste', async () => {
      findFirstMock.mockResolvedValue(undefined);

      await expect(
        filesService.requestImageTransform('guid-inesistente', {
          preset: MediaTransformPreset.Card,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(enqueueTransformMock).not.toHaveBeenCalled();
    });
  });

  describe('updateFocalPoint', () => {
    it("aggiorna focalX/focalY sull'asset esistente e ritorna i metadata aggiornati", async () => {
      findFirstMock.mockResolvedValue(insertedRow);
      updateReturningMock.mockResolvedValueOnce([{ ...insertedRow, focalX: 30, focalY: 70 }]);

      const result = await filesService.updateFocalPoint(insertedRow.guid, 30, 70);

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ focalX: 30, focalY: 70 }),
      );
      expect(updateWhereMock).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ guid: insertedRow.guid, focalX: 30, focalY: 70 }),
      );
    });

    it('lancia NotFoundException se il file non esiste o è stato eliminato', async () => {
      findFirstMock.mockResolvedValue(undefined);

      await expect(filesService.updateFocalPoint('guid-inesistente', 30, 70)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rifiuta valori fuori dal range 0-100 senza toccare il DB', async () => {
      await expect(filesService.updateFocalPoint(insertedRow.guid, -1, 50)).rejects.toThrow(
        BadRequestException,
      );
      await expect(filesService.updateFocalPoint(insertedRow.guid, 50, 101)).rejects.toThrow(
        BadRequestException,
      );
      expect(updateSetMock).not.toHaveBeenCalled();
    });
  });
});
