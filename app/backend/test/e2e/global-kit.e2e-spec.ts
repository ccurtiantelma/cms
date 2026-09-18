import 'reflect-metadata';
import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { NextFunction, Request, Response } from 'express';
import { SettingsController } from '../../src/settings/settings.controller';
import { GlobalKitPublicController } from '../../src/settings/global-kit-public.controller';
import {
  BREAKPOINTS_SETTING_KEY,
  DEFAULT_BREAKPOINTS,
  DEFAULT_GLOBAL_KIT,
  GLOBAL_KIT_SETTING_KEY,
  SettingsService,
} from '../../src/settings/settings.service';
import { GlobalKitDto } from '../../src/settings/dto/global-kit.dto';
import { BreakpointsDto } from '../../src/settings/dto/breakpoints.dto';
import { AuthMiddleware } from '../../src/auth/auth.middleware';
import { DbService } from '../../src/db/db.service';
import { RedisService } from '../../src/redis/redis.service';
import { AuditLogService } from '../../src/common/audit-log.service';
import { ExportService } from '../../src/export/export.service';
import { STATIC_SITE_DEPLOYER } from '../../src/export/deploy/static-site-deployer.interface';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';

/**
 * Test di integrazione per `app/settings/global-kit`, `app/settings/breakpoints`
 * e `public/global-kit.css` (Sub-Task S1.3, `SPEC-GLOBAL-KIT.md`,
 * `ADR-76-breakpoints-configurabili.md`). Mirror di `test/e2e/settings.e2e-
 * spec.ts`: `AuthMiddleware` reale, `DbService`/`AuditLogService`/
 * `ExportService`/`StaticSiteDeployer` mockati.
 */
describe('SettingsController / GlobalKitPublicController — Global Kit & Breakpoints (integration)', () => {
  let app: INestApplication;
  let findFirstMock: jest.Mock;
  let onConflictMock: jest.Mock;
  let valuesMock: jest.Mock;
  let insertMock: jest.Mock;
  let auditLogMock: jest.Mock;
  let deployerWriteMock: jest.Mock;
  let enqueueFullSiteExportMock: jest.Mock;

  const activeSessions = new Set<string>();

  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  function makeAuthFor(role: AppUserRoles, userId = 1): { bearer: string; cookie: string } {
    const token = jwt.sign(
      { id: userId, role, name: 'E2E', scopeId: null },
      AppConstants.securityKey,
      { expiresIn: '15m' },
    );
    activeSessions.add(`login:${token}`);
    const rtk = signCookieValue('e2e-refresh-token', AppConstants.cookieSecret);
    return { bearer: `Bearer ${token}`, cookie: `rtk=${encodeURIComponent(rtk)}` };
  }

  const validGlobalKit: GlobalKitDto = JSON.parse(
    JSON.stringify(DEFAULT_GLOBAL_KIT),
  ) as GlobalKitDto;
  const validBreakpoints: BreakpointsDto = JSON.parse(
    JSON.stringify(DEFAULT_BREAKPOINTS),
  ) as BreakpointsDto;

  beforeEach(async () => {
    activeSessions.clear();
    findFirstMock = jest.fn().mockResolvedValue(undefined);
    onConflictMock = jest.fn().mockResolvedValue(undefined);
    valuesMock = jest.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
    insertMock = jest.fn().mockReturnValue({ values: valuesMock });
    auditLogMock = jest.fn().mockResolvedValue(undefined);
    deployerWriteMock = jest.fn().mockResolvedValue(undefined);
    enqueueFullSiteExportMock = jest.fn().mockResolvedValue(undefined);

    const redisServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(activeSessions.has(key) ? 'session-attiva' : null);
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ name: 'public', ttl: 60_000, limit: 300 }] }),
      ],
      controllers: [SettingsController, GlobalKitPublicController],
      providers: [
        SettingsService,
        {
          provide: DbService,
          useValue: {
            db: {
              query: { appSettingEntity: { findFirst: findFirstMock } },
              insert: insertMock,
            },
          },
        },
        { provide: AuditLogService, useValue: { log: auditLogMock } },
        {
          provide: ExportService,
          useValue: { enqueueFullSiteExport: enqueueFullSiteExportMock },
        },
        {
          provide: STATIC_SITE_DEPLOYER,
          useValue: { write: deployerWriteMock, remove: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));

    // Stessa esclusione di `app.module.ts` (`.exclude({ path: 'public/*path', ... })`):
    // qui montata a mano perché l'app di test non usa `AppModule.configure()`.
    const authMiddleware = new AuthMiddleware(redisServiceMock as unknown as RedisService);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/v1/public/')) {
        next();
        return;
      }
      authMiddleware.use(req, res, next);
    });

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /app/settings/global-kit', () => {
    it('installazione mai personalizzata → seed di default, nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(DEFAULT_GLOBAL_KIT);
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('senza JWT → 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/app/settings/global-kit').expect(401);
    });
  });

  describe('PUT /app/settings/global-kit', () => {
    it('Manager: cambio del solo colors[] → 200, salvato, CSS rigenerato, nessun enqueueFullSiteExport', async () => {
      const auth = makeAuthFor(AppUserRoles.Manager);
      const payload: GlobalKitDto = {
        ...validGlobalKit,
        colors: validGlobalKit.colors.map((c) =>
          c.id === 'primary' ? { ...c, value: '#123456' } : c,
        ),
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(200);

      expect(res.body.colors.find((c: { id: string }) => c.id === 'primary').value).toBe('#123456');
      expect(insertMock).toHaveBeenCalled();
      expect(deployerWriteMock).toHaveBeenCalledTimes(1);
      expect(deployerWriteMock.mock.calls[0][0]).toMatch(/^assets\/global-kit\.[0-9a-f]+\.css$/);
      expect(enqueueFullSiteExportMock).not.toHaveBeenCalled();
    });

    it('Manager con customCode valorizzato → 403 PRIMA della validazione del body (body altrimenti malformato)', async () => {
      const auth = makeAuthFor(AppUserRoles.Manager);
      const malformedButRestricted = {
        colors: 'questo-non-e-un-array', // renderebbe il body 400 se la validazione DTO girasse prima
        customCode: [{ location: 'head', priority: 0, code: 'alert(1)', conditions: {} }],
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(malformedButRestricted)
        .expect(403);

      expect(res.body.message).toContain('Admin');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('Admin: può salvare themeStyle/layout/customCode → 200', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload: GlobalKitDto = {
        ...validGlobalKit,
        layout: { ...validGlobalKit.layout, widgetSpace: { value: 30, unit: 'px' } },
      };

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(200);

      expect(insertMock).toHaveBeenCalled();
    });

    it('system: false su id "primary" → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload: GlobalKitDto = {
        ...validGlobalKit,
        colors: validGlobalKit.colors.map((c) =>
          c.id === 'primary' ? { ...c, system: false } : c,
        ),
      };

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(insertMock).not.toHaveBeenCalled();
    });

    it("rimozione di un colore system esistente (assente nell'array) → 409", async () => {
      findFirstMock.mockResolvedValue({
        id: 1,
        key: GLOBAL_KIT_SETTING_KEY,
        value: DEFAULT_GLOBAL_KIT,
      });
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload: GlobalKitDto = {
        ...validGlobalKit,
        colors: validGlobalKit.colors.filter((c) => c.id !== 'accent'),
      };

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(409);

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('User (sotto la soglia Manager) → 403 dal guard del controller', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-kit')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(validGlobalKit)
        .expect(403);
    });
  });

  describe('GET public/global-kit.css', () => {
    it('nessuna autenticazione richiesta, Content-Type text/css, contiene :root', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/global-kit.css')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/css');
      expect(res.text).toContain(':root {');
      expect(res.text).toContain('--gk-color-primary:');
    });
  });

  describe('GET /app/settings/breakpoints', () => {
    it('installazione mai personalizzata → default (tablet+mobile attivi)', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/breakpoints')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(DEFAULT_BREAKPOINTS);
    });
  });

  describe('PUT /app/settings/breakpoints', () => {
    it('Admin: salva con successo', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload: BreakpointsDto = {
        ...validBreakpoints,
        widescreen: { active: true, minWidth: 2400 },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/breakpoints')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(200);

      expect(res.body.widescreen.active).toBe(true);
      expect(insertMock).toHaveBeenCalled();
      expect(auditLogMock).toHaveBeenCalledWith(
        1,
        'settings.breakpoints.update',
        'app_settings',
        BREAKPOINTS_SETTING_KEY,
        JSON.stringify(payload),
        undefined,
        expect.any(String),
      );
    });

    it('Manager → 403 (Admin+ only, ADR-76 § "Conseguenze")', async () => {
      const auth = makeAuthFor(AppUserRoles.Manager);

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/breakpoints')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(validBreakpoints)
        .expect(403);

      expect(insertMock).not.toHaveBeenCalled();
    });
  });
});
