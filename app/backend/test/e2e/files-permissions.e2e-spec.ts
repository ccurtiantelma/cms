import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { Readable } from 'stream';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { and, eq } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import {
  auditLogEntity,
  fileEntity,
  pageEntity,
  pageRevisionEntity,
  userEntity,
} from '../../src/db/schema';
import { STORAGE_DRIVER, StorageDriver } from '../../src/files/storage/storage-driver.interface';
import { PermissionsSeedService } from '../../src/permissions/permissions-seed.service';
import { EmailQueueService } from '../../src/queues/email-queue/email.queue.service';
import { MediaQueueService } from '../../src/queues/media-queue/media-queue.service';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Permessi `media:*` su `app/files` (SPEC-RBAC-F2c criteri 14–20) su DB
 * `cms_db_test` e Redis DB #1 reali: seed, cache permessi, assegnazione e
 * revoca di ruoli, retrocessione e disattivazione con effetto immediato, senza
 * rilogin (S45, S47). Il JWT non trasporta permessi (ADR-99 § 6): ogni
 * cambiamento passa dalle API di amministrazione e dall'invalidazione della cache.
 *
 * Setup S22 come `roles.e2e-spec.ts`. `STORAGE_DRIVER`, `MediaQueueService` ed
 * `EmailQueueService` sono mockati: nessun blob su disco, nessun job BullMQ.
 */
describe('RBAC F2c — permessi media:* su app/files (e2e, DB reale)', () => {
  let app: INestApplication;
  let storageUpload: jest.Mock;
  let userSeq = 0;
  let fileSeq = 0;

  interface TestUser {
    id: number;
    guid: string;
    bearer: string;
    cookie: string;
  }

  /** PNG minimo (firma + IHDR 1×1): basta a `detectRasterMimeType` di `public/media`. */
  const pngBytes = (): Buffer => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(1, 16);
    png.writeUInt32BE(1, 20);
    return png;
  };

  beforeAll(async () => {
    await runMigrations();
    storageUpload = jest.fn().mockResolvedValue(undefined);
    const storageDriverMock: StorageDriver = {
      upload: storageUpload,
      download: jest.fn().mockImplementation(() => Promise.resolve(Readable.from([pngBytes()]))),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(storageDriverMock)
      .overrideProvider(MediaQueueService)
      .useValue({ enqueueTransform: jest.fn().mockResolvedValue('job-e2e') })
      .overrideProvider(EmailQueueService)
      .useValue({ enqueueEmail: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));
    await app.init();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    await app.get(PermissionsSeedService).sync();
    storageUpload.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  // ─── Helper ────────────────────────────────────────────────────────────────

  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  /** Utente inserito a DB con JWT firmato e sessione `login:` su Redis. */
  async function createUser(role: AppUserRoles): Promise<TestUser> {
    const [user] = await getTestDb()
      .insert(userEntity)
      .values({
        name: 'E2E',
        surname: String(role),
        email: `files.rbac.e2e.${role}.${++userSeq}@cms.test`,
        pwd: 'x',
        role,
        isActive: true,
        pwdSet: true,
        isMfaEnabled: false,
      })
      .returning();
    const token = jwt.sign(
      { id: user.id, role, name: 'E2E', scopeId: null },
      AppConstants.securityKey,
      { expiresIn: '15m' },
    );
    await getTestRedisClient().set(`login:${token}`, 'sessione-e2e');
    const rtk = signCookieValue(`e2e-refresh-token-${user.id}`, AppConstants.cookieSecret);
    return {
      id: user.id,
      guid: user.guid,
      bearer: `Bearer ${token}`,
      cookie: `rtk=${encodeURIComponent(rtk)}`,
    };
  }

  /** Client HTTP su `api/v1`, autenticato se `auth` è passato. */
  function http(auth?: TestUser) {
    const server = app.getHttpServer();
    const withAuth = (req: request.Test): request.Test =>
      auth ? req.set('Authorization', auth.bearer).set('Cookie', auth.cookie) : req;
    return {
      get: (path: string) => withAuth(request(server).get(`/api/v1${path}`)),
      post: (path: string, body?: object) =>
        withAuth(request(server).post(`/api/v1${path}`)).send(body),
      patch: (path: string, body?: object) =>
        withAuth(request(server).patch(`/api/v1${path}`)).send(body),
      delete: (path: string) => withAuth(request(server).delete(`/api/v1${path}`)),
      upload: () =>
        withAuth(request(server).post('/api/v1/app/files')).attach(
          'file',
          Buffer.from('%PDF-1.7 e2e'),
          'contratto.pdf',
        ),
    };
  }

  /** Riga `files` attiva di `owner`, inserita direttamente (nessun blob). */
  async function insertFile(owner: TestUser, entity: string | null = null): Promise<string> {
    const [row] = await getTestDb()
      .insert(fileEntity)
      .values({
        originalName: `file-${++fileSeq}.png`,
        mimeType: 'image/png',
        sizeBytes: 24,
        storageDriver: 'local',
        storageKey: crypto.randomBytes(20).toString('hex'),
        entity,
        createdBy: owner.id,
        updatedBy: owner.id,
      })
      .returning();
    return row.guid;
  }

  /** Pagina `published` la cui Revisione pubblicata contiene un blocco immagine su `fileGuid`. */
  async function publishPageReferencing(owner: TestUser, fileGuid: string): Promise<void> {
    const db = getTestDb();
    const content = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'image', v: 1, props: { mediaRef: fileGuid, alt: 'x' }, children: [] },
      ],
    };
    const [page] = await db
      .insert(pageEntity)
      .values({
        title: 'Pagina con media',
        slug: `pagina-media-${fileSeq}`,
        locale: 'it-IT',
        translationGroupId: crypto.randomBytes(8).toString('hex'),
        status: 'published',
        publishedAt: new Date(),
        draftContent: content,
        draftSeo: {},
        createdBy: owner.id,
        updatedBy: owner.id,
      })
      .returning();
    const [revision] = await db
      .insert(pageRevisionEntity)
      .values({
        pageId: page.id,
        revisionNumber: 1,
        title: page.title,
        slug: page.slug,
        content,
        seo: {},
        createdBy: owner.id,
      })
      .returning();
    await db
      .update(pageEntity)
      .set({ publishedRevisionId: revision.id })
      .where(eq(pageEntity.id, page.id));
  }

  async function createRole(superAdmin: TestUser, code: string, codes: string[]): Promise<string> {
    const res = await http(superAdmin)
      .post('/app/admin/roles', { code, name: code, permissionCodes: codes })
      .expect(201);
    return res.body.guid as string;
  }

  async function isFileActive(guid: string): Promise<boolean> {
    const [row] = await getTestDb()
      .select({ isActive: fileEntity.isActive })
      .from(fileEntity)
      .where(eq(fileEntity.guid, guid));
    return row.isActive;
  }

  async function deleteAuditCount(fileGuid: string): Promise<number> {
    const rows = await getTestDb()
      .select({ id: auditLogEntity.id })
      .from(auditLogEntity)
      .where(and(eq(auditLogEntity.action, 'files.delete'), eq(auditLogEntity.entityId, fileGuid)));
    return rows.length;
  }

  // ─── media:upload ──────────────────────────────────────────────────────────

  describe('POST app/files — media:upload', () => {
    it('User attivo → 201 (criterio 14)', async () => {
      const user = await createUser(AppUserRoles.User);

      const res = await http(user).upload().expect(201);

      expect(res.body.guid).toHaveLength(16);
      expect(storageUpload).toHaveBeenCalledTimes(1);
    });

    it('User disattivato, stesso token → 403 media:upload; GET app/files resta 200 (criterio 15, S47)', async () => {
      const admin = await createUser(AppUserRoles.Admin);
      const user = await createUser(AppUserRoles.User);
      await http(user).upload().expect(201);
      storageUpload.mockClear();

      await http(admin).patch(`/app/admin/users/${user.guid}/toggle-active`).expect(200);

      const res = await http(user).upload().expect(403);
      expect(res.body.code).toBe('ForbiddenException');
      expect(res.body.message).toBe('Permessi insufficienti (richiesto permesso: media:upload).');
      expect(storageUpload).not.toHaveBeenCalled();

      // Effetto collaterale dichiarato (S47): le rotte senza permesso accettano
      // ancora il JWT fino alla scadenza.
      await http(user).get('/app/files').expect(200);
    });
  });

  // ─── media:delete_any ──────────────────────────────────────────────────────

  describe('DELETE app/files/:guid — media:delete_any', () => {
    it('ruolo personalizzato con media:delete_any: assegnazione e revoca senza rilogin (criteri 16–17)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const author = await createUser(AppUserRoles.User);
      const other = await createUser(AppUserRoles.User);
      const first = await insertFile(author);
      const second = await insertFile(author);

      const denied = await http(other).delete(`/app/files/${first}`).expect(403);
      expect(denied.body.message).toBe(
        "Solo l'autore del file, un Admin o chi ha il permesso media:delete_any possono eliminarlo.",
      );
      expect(await isFileActive(first)).toBe(true);

      const mediaCleaner = await createRole(superAdmin, 'media_cleaner', ['media:delete_any']);
      await http(superAdmin)
        .patch(`/app/admin/users/${other.guid}`, { roleGuids: [mediaCleaner] })
        .expect(200);

      await http(other).delete(`/app/files/${first}`).expect(204);
      expect(await isFileActive(first)).toBe(false);
      expect(await deleteAuditCount(first)).toBe(1);

      await http(superAdmin).patch(`/app/admin/users/${other.guid}`, { roleGuids: [] }).expect(200);

      await http(other).delete(`/app/files/${second}`).expect(403);
      expect(await isFileActive(second)).toBe(true);
    });

    it('Admin elimina un file altrui; retrocesso a User, con lo stesso token → 403 (criterio 18, S47)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const admin = await createUser(AppUserRoles.Admin);
      const author = await createUser(AppUserRoles.User);
      const first = await insertFile(author);
      const second = await insertFile(author);

      await http(admin).delete(`/app/files/${first}`).expect(204);
      expect(await isFileActive(first)).toBe(false);

      await http(superAdmin)
        .patch(`/app/admin/users/${admin.guid}`, { role: AppUserRoles.User })
        .expect(200);

      // Il JWT dice ancora `role: 10`: conta il ruolo letto dal DB.
      await http(admin).delete(`/app/files/${second}`).expect(403);
      expect(await isFileActive(second)).toBe(true);
    });

    it("l'autore User elimina il proprio file; su un file referenziato da una Pagina pubblicata → 409 (criterio 19)", async () => {
      const author = await createUser(AppUserRoles.User);
      const own = await insertFile(author);
      const referenced = await insertFile(author, 'page-media');
      await publishPageReferencing(author, referenced);

      await http(author).delete(`/app/files/${own}`).expect(204);
      expect(await isFileActive(own)).toBe(false);

      await http(author).delete(`/app/files/${referenced}`).expect(409);
      expect(await isFileActive(referenced)).toBe(true);
    });
  });

  // ─── public/media ──────────────────────────────────────────────────────────

  describe('GET public/media/:guid', () => {
    it('anonimo → 200 image/png, nessun 401/403 (criterio 20, ADR-99 § 9)', async () => {
      const author = await createUser(AppUserRoles.User);
      const guid = await insertFile(author, 'page-media');

      const res = await http().get(`/public/media/${guid}`).expect(200);

      expect(res.headers['content-type']).toContain('image/png');
    });
  });
});
