import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import { networkMocks } from './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { auditLogEntity, userEntity } from '../../src/db/schema';
import { ExportService } from '../../src/export/export.service';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * `POST app/admin/system/rebuild-static-site`: rigenerazione completa del sito
 * statico, funzione di sistema riservata al SuperAdmin (business-rules.md
 * § Funzioni di sistema). `ExportService` è mockato: la coda è un confine.
 */
describe('POST /app/admin/system/rebuild-static-site (e2e)', () => {
  let app: INestApplication;
  let exportServiceMock: { enqueueFullSiteExport: jest.Mock };

  beforeAll(async () => {
    await runMigrations();
    exportServiceMock = { enqueueFullSiteExport: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ExportService)
      .useValue(exportServiceMock)
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
    exportServiceMock.enqueueFullSiteExport.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  async function authFor(
    role: AppUserRoles,
  ): Promise<{ userId: number; bearer: string; cookie: string }> {
    const [user] = await getTestDb()
      .insert(userEntity)
      .values({
        name: 'E2E',
        surname: String(role),
        email: `rebuild.e2e.${role}.${Date.now()}.${Math.random()}@cms.test`,
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
      {
        expiresIn: '15m',
      },
    );
    await getTestRedisClient().set(`login:${token}`, 'sessione-e2e');
    const rtk = signCookieValue(`e2e-refresh-token-${user.id}`, AppConstants.cookieSecret);
    return { userId: user.id, bearer: `Bearer ${token}`, cookie: `rtk=${encodeURIComponent(rtk)}` };
  }

  function rebuild(auth?: { bearer: string; cookie: string }): request.Test {
    const req = request(app.getHttpServer()).post('/api/v1/app/admin/system/rebuild-static-site');
    return auth ? req.set('Authorization', auth.bearer).set('Cookie', auth.cookie) : req;
  }

  it('SuperAdmin: 202, rigenerazione accodata e registrata su audit log', async () => {
    const superAdmin = await authFor(AppUserRoles.SuperAdmin);

    await rebuild(superAdmin).expect(202);

    expect(exportServiceMock.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
    const audit = await getTestDb()
      .select()
      .from(auditLogEntity)
      .where(eq(auditLogEntity.action, 'system.rebuild-static-site'));
    expect(audit).toHaveLength(1);
    expect(audit[0].userId).toBe(superAdmin.userId);
  });

  it('Admin: 403, nessuna rigenerazione accodata', async () => {
    const admin = await authFor(AppUserRoles.Admin);

    await rebuild(admin).expect(403);

    expect(exportServiceMock.enqueueFullSiteExport).not.toHaveBeenCalled();
  });

  it('senza autenticazione: 401', async () => {
    await rebuild().expect(401);

    expect(exportServiceMock.enqueueFullSiteExport).not.toHaveBeenCalled();
  });

  it('sanity: il mock nodemailer non riceve mai chiamate', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
