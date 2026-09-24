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
import { MediaQueueService } from '../../src/queues/media-queue/media-queue.service';
import { PermissionsService } from '../../src/permissions/permissions.service';
import { PermissionCode, SYSTEM_ROLES } from '../../src/permissions/permissions.registry';

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
  /**
   * Codici concessi dal mock di `PermissionsService.hasAll` a ogni `userId`
   * (SPEC-RBAC-F2c S44). Default: il seed `user`, quindi i test preesistenti
   * danno lo stesso esito di prima della F2c. Ogni test può riassegnarlo.
   */
  let grantedCodes: readonly PermissionCode[];
  let hasAllMock: jest.Mock;

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
    /** Riga non raster: nessuna dimensione intrinseca da leggere (RFC-F09 N2). */
    width: null,
    height: null,
    isActive: true,
    createdAt: new Date('2026-07-26T10:00:00.000Z'),
    updatedAt: new Date('2026-07-26T10:00:00.000Z'),
    createdBy: 7,
    updatedBy: 7,
  };

  beforeEach(async () => {
    activeSessions.clear();
    grantedCodes = SYSTEM_ROLES.user.permissions;
    hasAllMock = jest.fn((_userId: number, codes: readonly PermissionCode[]) => {
      const missing = codes.filter((code) => !grantedCodes.includes(code));
      return Promise.resolve({ ok: missing.length === 0, missing });
    });
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
        // `FilesService` dipende da `MediaQueueService` dall'introduzione della
        // pipeline di ADR-49 (`POST :guid/transform`). Mock obbligatorio: questa
        // suite non deve toccare BullMQ/Redis reali.
        {
          provide: MediaQueueService,
          useValue: { enqueueTransform: jest.fn().mockResolvedValue('job-1') },
        },
        // `@Permissions` su upload monta `PermissionsGuard` e `delete` legge
        // `media:delete_any` (SPEC-RBAC-F2c S41, S44): i permessi si pilotano
        // con `grantedCodes`, non con il JWT (ADR-99 § 6).
        { provide: PermissionsService, useValue: { hasAll: hasAllMock } },
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

    /**
     * Verifica raster in scrittura (RFC-F09 **N4**) e dimensioni intrinseche
     * (**N2**), firmate il 2026-09-11. Attraversa il controller reale e
     * `AllExceptionsFilter`: interessa che il rifiuto arrivi al client come `400`
     * normalizzato, non solo che il service lanci.
     */
    it('media editoriale raster: persiste le dimensioni lette dagli header (N2)', async () => {
      const auth = makeAuthFor(7);
      const png = Buffer.alloc(24);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
      png.writeUInt32BE(13, 8);
      png.write('IHDR', 12, 'ascii');
      png.writeUInt32BE(1200, 16);
      png.writeUInt32BE(628, 20);

      await request(app.getHttpServer())
        .post('/api/v1/app/files')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .field('entity', 'page-media')
        .attach('file', png, 'hero.png')
        .expect(201);

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'page-media', width: 1200, height: 628 }),
      );
    });

    it('media editoriale non raster (SVG travestito da PNG) → 400 normalizzato, nessuna scrittura (N4)', async () => {
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .post('/api/v1/app/files')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .field('entity', 'page-media')
        .attach('file', Buffer.from('<svg onload="alert(1)"/>'), 'logo.png')
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
      expect(storageUploadMock).not.toHaveBeenCalled();
      expect(insertValuesMock).not.toHaveBeenCalled();
    });

    it('lo storage documenti di ADR-8 non regredisce: un PDF senza entity editoriale resta accettato', async () => {
      const auth = makeAuthFor(7);

      await request(app.getHttpServer())
        .post('/api/v1/app/files')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .field('entity', 'invoice')
        .attach('file', Buffer.from('%PDF-1.7 contenuto'), 'contratto.pdf')
        .expect(201);

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'invoice', width: null, height: null }),
      );
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

  describe('permessi media:* (SPEC-RBAC-F2c)', () => {
    it('POST senza media:upload → 403 dal guard, nessuna scrittura (criterio 10)', async () => {
      grantedCodes = [];
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .post('/api/v1/app/files')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .attach('file', Buffer.from('%PDF-1.7'), 'contratto.pdf')
        .expect(403);

      expect(res.body.code).toBe('ForbiddenException');
      expect(res.body.message).toBe('Permessi insufficienti (richiesto permesso: media:upload).');
      expect(hasAllMock).toHaveBeenCalledWith(7, ['media:upload']);
      expect(storageUploadMock).not.toHaveBeenCalled();
      expect(insertValuesMock).not.toHaveBeenCalled();
    });

    it('DELETE di un non autore con media:delete_any → 204 (criterio 11)', async () => {
      grantedCodes = [...SYSTEM_ROLES.user.permissions, 'media:delete_any'];
      const auth = makeAuthFor(99, AppUserRoles.User);

      await request(app.getHttpServer())
        .delete(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(204);

      expect(hasAllMock).toHaveBeenCalledWith(99, ['media:delete_any']);
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: 99 }),
      );
    });

    it('DELETE di un non autore Admin nel JWT ma senza media:delete_any → 403', async () => {
      grantedCodes = SYSTEM_ROLES.user.permissions;
      const auth = makeAuthFor(99, AppUserRoles.Admin);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(403);

      expect(res.body.message).toBe(
        "Solo l'autore del file, un Admin o chi ha il permesso media:delete_any possono eliminarlo.",
      );
      expect(updateSetMock).not.toHaveBeenCalled();
    });

    it("DELETE dell'autore senza media:delete_any → 204 (criterio 12, ADR-18)", async () => {
      grantedCodes = [];
      const auth = makeAuthFor(7);

      await request(app.getHttpServer())
        .delete(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(204);

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, updatedBy: 7 }),
      );
    });

    it('le rotte di lettura non consultano i permessi (criterio 13, S39)', async () => {
      grantedCodes = [];
      const auth = makeAuthFor(7);
      const server = app.getHttpServer();

      await request(server)
        .get('/api/v1/app/files')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);
      await request(server)
        .get(`/api/v1/app/files/${storedRow.guid}`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);
      await request(server)
        .get(`/api/v1/app/files/${storedRow.guid}/metadata`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      findFirstMock.mockResolvedValue(undefined);
      await request(server)
        .get('/api/v1/app/files/guid-inesistente/metadata')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(404);

      expect(hasAllMock).not.toHaveBeenCalled();
    });
  });
});
