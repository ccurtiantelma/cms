import 'reflect-metadata';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { NextFunction, Request, Response } from 'express';
import { FilesController } from '../../src/files/files.controller';
import { FilesService } from '../../src/files/files.service';
import { STORAGE_DRIVER, StorageDriver } from '../../src/files/storage/storage-driver.interface';
import { AuditLogService } from '../../src/common/audit-log.service';
import { AuthMiddleware } from '../../src/auth/auth.middleware';
import { DbService } from '../../src/db/db.service';
import { RedisService } from '../../src/redis/redis.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';

/**
 * Test di integrazione per `FilesController` (upload/download/delete, ADR-8).
 * L'autenticazione passa dal VERO `AuthMiddleware` (JWT + cookie rtk + allowlist
 * Redis mockata). `DbService`, `STORAGE_DRIVER` e `AuditLogService` sono mockati:
 * nessuna connessione reale a Postgres/Redis e nessuna scrittura reale su disco/S3
 * (la verifica del driver reale è coperta da `test/unit/files/*.spec.ts`).
 */
describe('FilesController (integration)', () => {
  let app: INestApplication;
  let insertValuesMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let findManyMock: jest.Mock;
  let countWhereMock: jest.Mock;
  let publishedRevisionsJoinWhereMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let updateSetMock: jest.Mock;
  let storageUploadMock: jest.Mock;
  let storageDownloadMock: jest.Mock;

  const activeSessions = new Set<string>();

  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  function makeAuthFor(
    userId: number,
    role: AppUserRoles = AppUserRoles.User,
  ): { bearer: string; cookie: string } {
    const token = jwt.sign(
      { id: userId, role, name: 'E2E', scopeId: null },
      AppConstants.securityKey,
      { expiresIn: '15m' },
    );
    activeSessions.add(`login:${token}`);
    const rtk = signCookieValue('e2e-refresh-token', AppConstants.cookieSecret);
    return { bearer: `Bearer ${token}`, cookie: `rtk=${encodeURIComponent(rtk)}` };
  }

  const storedRow = {
    id: 1,
    guid: 'a1b2c3d4e5f6a7b8',
    originalName: 'contratto.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 11,
    storageDriver: 'local',
    storageKey: 'k'.repeat(40),
    checksumSha256: 'x'.repeat(64),
    entity: null,
    entityId: null,
    isActive: true,
    createdAt: new Date('2026-07-26T10:00:00.000Z'),
    updatedAt: new Date('2026-07-26T10:00:00.000Z'),
    createdBy: 7,
    updatedBy: 7,
  };

  beforeEach(async () => {
    activeSessions.clear();
    insertValuesMock = jest
      .fn()
      .mockReturnValue({ returning: jest.fn().mockResolvedValue([storedRow]) });
    findFirstMock = jest.fn().mockResolvedValue(storedRow);
    findManyMock = jest.fn().mockResolvedValue([storedRow]);
    // `FilesService.list()` fa `select({total: count()}).from(fileEntity).where(...)`.
    countWhereMock = jest.fn().mockResolvedValue([{ total: 1 }]);
    // `FilesService.assertNotReferencedByPublishedPage()` (softDelete, RFC-F09 N7) fa
    // `select({content}).from(pageEntity).innerJoin(pageRevisionEntity, ...).where(...)`.
    // Vuoto di default: nessuna Pagina pubblicata referenzia il file nei test di soft-delete.
    publishedRevisionsJoinWhereMock = jest.fn().mockResolvedValue([]);
    updateWhereMock = jest.fn().mockResolvedValue(undefined);
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });
    storageUploadMock = jest.fn().mockResolvedValue(undefined);
    storageDownloadMock = jest.fn().mockResolvedValue(Readable.from([Buffer.from('contenuto')]));

    const dbServiceMock = {
      db: {
        insert: jest.fn().mockReturnValue({ values: insertValuesMock }),
        update: jest.fn().mockReturnValue({ set: updateSetMock }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: countWhereMock,
            innerJoin: jest.fn().mockReturnValue({ where: publishedRevisionsJoinWhereMock }),
          }),
        }),
        query: { fileEntity: { findFirst: findFirstMock, findMany: findManyMock } },
      },
    };

    const storageDriverMock: StorageDriver = {
      upload: storageUploadMock,
      download: storageDownloadMock,
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const redisServiceMock = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(activeSessions.has(key) ? 'session-attiva' : null),
        ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        FilesService,
        { provide: DbService, useValue: dbServiceMock },
        { provide: STORAGE_DRIVER, useValue: storageDriverMock },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));

    const authMiddleware = new AuthMiddleware(redisServiceMock as unknown as RedisService);
    app.use((req: Request, res: Response, next: NextFunction) =>
      authMiddleware.use(req, res, next),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /app/files', () => {
    it('happy path: carica un file e restituisce i metadata (mai storageKey/checksum)', async () => {
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .post('/api/v1/app/files')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .attach('file', Buffer.from('contenuto del documento'), 'contratto.pdf')
        .expect(201);

      expect(res.body.guid).toBe(storedRow.guid);
      expect(res.body.originalName).toBe(storedRow.originalName);
      expect(res.body.storageKey).toBeUndefined();
      expect(res.body.checksumSha256).toBeUndefined();
      expect(storageUploadMock).toHaveBeenCalledTimes(1);
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/app/files')
        .attach('file', Buffer.from('contenuto'), 'file.txt')
        .expect(401);

      expect(storageUploadMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /app/files/:guid', () => {
    it('happy path: scarica lo stream con gli header corretti', async () => {
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.headers['content-type']).toContain(storedRow.mimeType);
      expect(res.headers['content-disposition']).toContain('contratto.pdf');
      // `mimeType` è 'application/pdf' (binario per supertest/superagent): il
      // corpo arriva in `res.body` come Buffer, non decodificato in `res.text`.
      expect(Buffer.isBuffer(res.body) ? res.body.toString() : res.text).toBe('contenuto');
    });

    it('errore: file inesistente o soft-deleted → 404', async () => {
      findFirstMock.mockResolvedValue(undefined);
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/files/guid-inesistente')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(404);

      expect(res.body.message).toContain('non trovato');
    });
  });

  describe('GET /app/files (list)', () => {
    it('happy path: ruolo Manager+ riceve la lista paginata dei file attivi', async () => {
      const auth = makeAuthFor(7, AppUserRoles.Manager);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/files')
        .query({ p: 1, i: 20 })
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toMatchObject({
        totalItems: 1,
        currentPage: 1,
        itemsPerPage: 20,
      });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].guid).toBe(storedRow.guid);
      expect(res.body.items[0].storageKey).toBeUndefined();
      expect(res.body.items[0].checksumSha256).toBeUndefined();
      expect(findManyMock).toHaveBeenCalledTimes(1);
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/app/files')
        .query({ p: 1, i: 20 })
        .expect(401);

      expect(findManyMock).not.toHaveBeenCalled();
    });

    it('ruolo User riceve la lista paginata (nessun predicato di ownership, ADR-35)', async () => {
      const auth = makeAuthFor(7, AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/files')
        .query({ p: 1, i: 20 })
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toMatchObject({
        totalItems: 1,
        currentPage: 1,
        itemsPerPage: 20,
      });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].guid).toBe(storedRow.guid);
    });
  });

  describe('GET /app/files/:guid/metadata', () => {
    it('happy path: restituisce i metadata senza storageKey/checksumSha256', async () => {
      const auth = makeAuthFor(7, AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/app/files/${storedRow.guid}/metadata`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.guid).toBe(storedRow.guid);
      expect(res.body.originalName).toBe(storedRow.originalName);
      expect(res.body.storageKey).toBeUndefined();
      expect(res.body.checksumSha256).toBeUndefined();
    });

    it('errore: guid inesistente o soft-eliminato → 404', async () => {
      findFirstMock.mockResolvedValue(undefined);
      const auth = makeAuthFor(7, AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/files/guid-inesistente/metadata')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(404);

      expect(res.body.message).toContain('non trovato');
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/app/files/${storedRow.guid}/metadata`)
        .expect(401);
    });
  });

  describe('DELETE /app/files/:guid', () => {
    it("happy path: l'autore elimina (soft-delete) il proprio file → 204", async () => {
      const auth = makeAuthFor(7); // stesso userId di storedRow.createdBy

      await request(app.getHttpServer())
        .delete(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(204);

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: 7 }),
      );
    });

    it("RBAC: un utente diverso dall'autore, senza ruolo Admin/superiore → 403", async () => {
      const auth = makeAuthFor(99, AppUserRoles.User); // non autore, ruolo insufficiente

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(403);

      expect(res.body.message).toContain('Admin');
      expect(updateSetMock).not.toHaveBeenCalled();
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/app/files/${storedRow.guid}`).expect(401);
    });
  });
});
