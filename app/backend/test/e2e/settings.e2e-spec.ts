import 'reflect-metadata';
import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { NextFunction, Request, Response } from 'express';
import { SettingsController } from '../../src/settings/settings.controller';
import {
  DEFAULT_GLOBAL_TOKENS,
  DEFAULT_MULTILINGUAL_CONFIG,
  DEFAULT_THEME_CONFIG,
  GLOBAL_TOKENS_SETTING_KEY,
  MULTILINGUAL_SETTING_KEY,
  SettingsService,
  THEME_SETTING_KEY,
} from '../../src/settings/settings.service';
import { ThemeConfigDto } from '../../src/settings/dto/theme-config.dto';
import { MultilingualConfigDto } from '../../src/settings/dto/multilingual-config.dto';
import { GlobalTokensDto } from '../../src/settings/dto/global-tokens.dto';
import { AuthMiddleware } from '../../src/auth/auth.middleware';
import { DbService } from '../../src/db/db.service';
import { RedisService } from '../../src/redis/redis.service';
import { AuditLogService } from '../../src/common/audit-log.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';

/**
 * Test di integrazione per `SettingsController` (Global Theme Customizer,
 * ADR-4). L'autenticazione passa dal VERO `AuthMiddleware`: JWT firmati con la
 * `SECURITY_KEY` di test, cookie `rtk` firmato simulato (stesso algoritmo di
 * cookie-parser) e allowlist di sessione Redis mockata. `DbService` e
 * `AuditLogService` sono mockati: nessuna connessione reale a Postgres/Redis.
 */
describe('SettingsController (integration)', () => {
  let app: INestApplication;
  let findFirstMock: jest.Mock;
  let onConflictMock: jest.Mock;
  let valuesMock: jest.Mock;
  let insertMock: jest.Mock;
  let auditLogMock: jest.Mock;

  /** Sessioni attive simulate: chiavi `login:${token}` riconosciute dal mock Redis. */
  const activeSessions = new Set<string>();

  /** Firma un valore cookie come farebbe cookie-parser (`s:<valore>.<hmac>`). */
  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  /** Genera JWT + sessione Redis + cookie rtk firmato per un utente col ruolo dato. */
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

  /** Payload valido di riferimento per il PUT (clone dei default di fabbrica). */
  const validTheme: ThemeConfigDto = JSON.parse(
    JSON.stringify(DEFAULT_THEME_CONFIG),
  ) as ThemeConfigDto;

  /** Payload valido di riferimento per il PUT dei Global Design Tokens (clone dei default di fabbrica). */
  const validGlobalTokens: GlobalTokensDto = JSON.parse(
    JSON.stringify(DEFAULT_GLOBAL_TOKENS),
  ) as GlobalTokensDto;

  /** Estrae gli 11 token del contratto storico (v1/v2) da un blocco scheme v3, scartando i colori titolo. */
  function toLegacyTokens(tokens: ThemeConfigDto['light']): Record<string, string> {
    const {
      pageBg,
      cardBg,
      cardBorder,
      textPrimary,
      textSecondary,
      navbarBg,
      navbarText,
      navbarHoverBg,
      navbarActiveBg,
      navbarActiveText,
      navbarBorder,
    } = tokens;
    return {
      pageBg,
      cardBg,
      cardBorder,
      textPrimary,
      textSecondary,
      navbarBg,
      navbarText,
      navbarHoverBg,
      navbarActiveBg,
      navbarActiveText,
      navbarBorder,
    };
  }

  /** Estrae i messaggi di validazione dal body normalizzato dall'AllExceptionsFilter. */
  function validationMessages(body: { message?: string | string[] }): string {
    return Array.isArray(body.message) ? body.message.join(' | ') : String(body.message);
  }

  /**
   * Ricostruisce i campi della forma v6 storica (senza le unità dei campi
   * dimensionali, introdotte in v7 e sempre implicitamente px prima) a
   * partire da `validTheme` — stessa base usata dalla migrazione v6 → v7
   * lato server.
   */
  function legacyV6Fields(): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(validTheme)) as Record<string, unknown>;
    delete clone.spacingUnit;
    delete clone.radiusScaleUnit;
    delete clone.shadowUnit;
    delete clone.navbarWidthUnit;
    const typography = clone.typography as Record<string, unknown>;
    delete typography.fontSizeUnit;
    delete (typography.headings as Record<string, unknown>).fontSizeUnit;
    return { ...clone, version: 6 };
  }

  /**
   * Ricostruisce i campi della forma v5 storica (selezione `primaryColor`/
   * `customPrimary` invece del blocco `colors` a 9 voci, e senza le unità dei
   * campi dimensionali) a partire da `validTheme` — stessa base usata dalle
   * migrazioni v1–v4 → v7 lato server.
   */
  function legacyV5Fields(): Record<string, unknown> {
    const clone = legacyV6Fields();
    delete clone.colors;
    return {
      ...clone,
      version: 5,
      primaryColor: 'blue',
      customPrimary: [
        '#e7f5ff',
        '#d0ebff',
        '#a5d8ff',
        '#74c0fc',
        '#4dabf7',
        '#339af0',
        '#228be6',
        '#1c7ed6',
        '#1971c2',
        '#1864ab',
      ],
    };
  }

  beforeEach(async () => {
    activeSessions.clear();
    findFirstMock = jest.fn().mockResolvedValue(undefined);
    onConflictMock = jest.fn().mockResolvedValue(undefined);
    valuesMock = jest.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
    insertMock = jest.fn().mockReturnValue({ values: valuesMock });
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    const redisServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(activeSessions.has(key) ? 'session-attiva' : null);
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Stesse opzioni di main.ts: forbidNonWhitelisted respinge i campi extra.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));

    // AuthMiddleware reale (JWT + cookie rtk + allowlist di sessione mockata):
    // in AppModule è applicato da `configure()`, qui va montato a mano.
    const authMiddleware = new AuthMiddleware(redisServiceMock as unknown as RedisService);
    app.use((req: Request, res: Response, next: NextFunction) =>
      authMiddleware.use(req, res, next),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /app/settings/theme', () => {
    it('happy path: installazione mai personalizzata → default di fabbrica (ogni ruolo)', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(DEFAULT_THEME_CONFIG);
      expect(findFirstMock).toHaveBeenCalledTimes(1);
    });

    it('happy path: tema salvato → restituisce il jsonb della riga theme', async () => {
      const savedTheme: ThemeConfigDto = {
        ...validTheme,
        colors: { ...validTheme.colors, primary: '#12b886' },
        light: { ...validTheme.light, pageBg: '#123456' },
      };
      findFirstMock.mockResolvedValue({ id: 1, key: THEME_SETTING_KEY, value: savedTheme });
      const auth = makeAuthFor(AppUserRoles.Manager);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(savedTheme);
    });

    it('migrazione: riga v6 storica → restituita come v7 con le unità di ogni campo dimensionale a px', async () => {
      const legacyV6 = { ...legacyV6Fields(), radius: 'lg' };
      findFirstMock.mockResolvedValue({ id: 1, key: THEME_SETTING_KEY, value: legacyV6 });
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.version).toBe(7);
      expect(res.body.radius).toBe('lg');
      expect(res.body.typography.fontSizeUnit).toBe('px');
      expect(res.body.typography.headings.fontSizeUnit).toBe('px');
      expect(res.body.spacingUnit).toBe('px');
      expect(res.body.radiusScaleUnit).toBe('px');
      expect(res.body.shadowUnit).toBe('px');
      expect(res.body.navbarWidthUnit).toBe('px');
    });

    it('migrazione: riga v1 storica → restituita come v7 con radius/token preservati e colors derivato dal nome nativo', async () => {
      const legacyV1 = {
        version: 1,
        primaryColor: 'grape',
        radius: 'xl',
        light: { ...toLegacyTokens(validTheme.light), pageBg: '#112233' },
        dark: { ...toLegacyTokens(validTheme.dark), navbarActiveBg: '#445566' },
      };
      findFirstMock.mockResolvedValue({ id: 1, key: THEME_SETTING_KEY, value: legacyV1 });
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.version).toBe(7);
      expect(res.body.colors.primary).toBe('#be4bdb'); // grape[6]
      expect(res.body.radius).toBe('xl');
      expect(res.body.light.pageBg).toBe('#112233');
      expect(res.body.dark.navbarActiveBg).toBe('#445566');
      // I campi nuovi del contratto v7 adottano i default di fabbrica, colori titolo, semantici e unità inclusi.
      expect(res.body.typography).toEqual(DEFAULT_THEME_CONFIG.typography);
      expect(res.body.components).toEqual(DEFAULT_THEME_CONFIG.components);
      expect(res.body.colors.secondary).toBe(DEFAULT_THEME_CONFIG.colors.secondary);
      expect(res.body.light.headingH1).toBe(DEFAULT_THEME_CONFIG.light.headingH1);
      expect(res.body.dark.headingH6).toBe(DEFAULT_THEME_CONFIG.dark.headingH6);
      expect(res.body.spacingUnit).toBe('px');
      expect(res.body.navbarWidthUnit).toBe('px');
    });

    it('migrazione: riga v2 storica → restituita come v7 con ogni campo preservato e colori titolo di default', async () => {
      const legacyV2 = {
        ...legacyV5Fields(),
        version: 2,
        primaryColor: 'teal',
        light: { ...toLegacyTokens(validTheme.light), textPrimary: '#111111' },
        dark: { ...toLegacyTokens(validTheme.dark), textPrimary: '#eeeeee' },
      };
      findFirstMock.mockResolvedValue({ id: 1, key: THEME_SETTING_KEY, value: legacyV2 });
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.version).toBe(7);
      expect(res.body.colors.primary).toBe('#12b886'); // teal[6]
      expect(res.body.light.textPrimary).toBe('#111111');
      expect(res.body.dark.textPrimary).toBe('#eeeeee');
      // I colori titolo non esistevano in v2: adottano il default v7.
      expect(res.body.light.headingH1).toBe(DEFAULT_THEME_CONFIG.light.headingH1);
      expect(res.body.dark.headingH4).toBe(DEFAULT_THEME_CONFIG.dark.headingH4);
    });

    it('migrazione: riga v5 storica → restituita come v7 con colors.primary derivato da primaryColor/customPrimary e unità px', async () => {
      const legacyV5 = { ...legacyV5Fields(), primaryColor: 'orange' };
      findFirstMock.mockResolvedValue({ id: 1, key: THEME_SETTING_KEY, value: legacyV5 });
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.version).toBe(7);
      expect(res.body.colors.primary).toBe('#fd7e14'); // orange[6]
      expect(res.body.colors.secondary).toBe(DEFAULT_THEME_CONFIG.colors.secondary);
      expect(res.body.typography.fontSizeUnit).toBe('px');
      expect(res.body.shadowUnit).toBe('px');
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer()).get('/api/v1/app/settings/theme').expect(401);
    });
  });

  describe('PUT /app/settings/theme', () => {
    it('happy path: SuperAdmin salva il tema → upsert + audit log + echo', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin, 7);
      const payload: ThemeConfigDto = {
        ...validTheme,
        colors: { ...validTheme.colors, primary: '#be4bdb' },
        dark: { ...validTheme.dark, navbarBg: '#0a0b0c' },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(200);

      expect(res.body).toEqual(payload);
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ key: THEME_SETTING_KEY, createdBy: 7, updatedBy: 7 }),
      );
      expect(onConflictMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        7,
        'settings.theme.update',
        'app_settings',
        THEME_SETTING_KEY,
        JSON.stringify(payload),
        undefined,
        expect.anything(),
      );
    });

    it('errore: token colore non hex → 400 con messaggio di validazione', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = {
        ...validTheme,
        light: { ...validTheme.light, pageBg: 'red' },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('#rrggbb');
      expect(insertMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('errore: colore semantico non hex → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = { ...validTheme, colors: { ...validTheme.colors, primary: 'magenta' } };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('#rrggbb');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: proprietà extra nel blocco colors → 400 (forbidNonWhitelisted)', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = { ...validTheme, colors: { ...validTheme.colors, evil: '#000000' } };

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: navbarEdgeStyle fuori whitelist o navbarEdgeShadowIntensity fuori range → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const badStyle = { ...validTheme, navbarEdgeStyle: 'glow' };

      const resStyle = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(badStyle)
        .expect(400);
      expect(validationMessages(resStyle.body)).toContain('bordo navbar');

      const badIntensity = { ...validTheme, navbarEdgeShadowIntensity: 1.5 };
      const resIntensity = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(badIntensity)
        .expect(400);
      expect(validationMessages(resIntensity.body)).toContain('ombra navbar');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: versione v1, v2, v5 o v6 sul PUT → 400 (in scrittura è ammesso solo il contratto v7)', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);

      const resV1 = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ ...validTheme, version: 1 })
        .expect(400);
      expect(validationMessages(resV1.body)).toContain('Versione');

      const resV2 = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ ...validTheme, version: 2 })
        .expect(400);
      expect(validationMessages(resV2.body)).toContain('Versione');

      const resV5 = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ ...legacyV5Fields() })
        .expect(400);
      expect(validationMessages(resV5.body)).toContain('Versione');

      const resV6 = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ ...legacyV6Fields() })
        .expect(400);
      expect(validationMessages(resV6.body)).toContain('Versione');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: unità fuori whitelist su un campo dimensionale → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = { ...validTheme, spacingUnit: 'vh' };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Unità');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: fontSizeUnit mancante nel blocco typography → 400 (nessuna tolleranza sul campo assente in scrittura)', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const typography = { ...validTheme.typography } as Partial<ThemeConfigDto['typography']>;
      delete typography.fontSizeUnit;
      const payload = { ...validTheme, typography };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Unità');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: `%` come unità delle ombre → 400 (box-shadow non ammette percentuali)', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = { ...validTheme, shadowUnit: '%' };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('percentuali');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("errore: valore dimensionale valido in px ma fuori range per l'unità impostata → 400", async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      // 80 è il massimo consentito per spacing in px, ma sballato per rem (max 5).
      const payload = {
        ...validTheme,
        spacingUnit: 'rem',
        spacing: { ...validTheme.spacing, xl: 80 },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('dimensionale');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: colore titolo non hex → 400 con messaggio di validazione', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = {
        ...validTheme,
        light: { ...validTheme.light, headingH2: 'blue' },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('#rrggbb');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: blocco colors mancante → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = { ...validTheme } as Partial<ThemeConfigDto>;
      delete payload.colors;

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('colors');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: font fuori whitelist → 400 (nessuno stack libero raggiunge il tema)', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = {
        ...validTheme,
        typography: { ...validTheme.typography, fontFamily: 'Comic Sans MS, cursive' },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Font');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: numeri fuori range (scale, ombre) → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const scalePayload = { ...validTheme, scale: 3 };

      const resScale = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(scalePayload)
        .expect(400);
      expect(validationMessages(resScale.body)).toContain('scale');

      const shadowPayload = {
        ...validTheme,
        shadows: { ...validTheme.shadows, md: { y: 4, blur: 12, spread: -2, opacity: 5 } },
      };
      const resShadow = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(shadowPayload)
        .expect(400);
      expect(validationMessages(resShadow.body)).toContain('Opacità');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: variant componente fuori whitelist → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = {
        ...validTheme,
        components: {
          ...validTheme.components,
          button: { ...validTheme.components.button, variant: 'evil-variant' },
        },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Variant');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: campo extra nel payload → 400 (forbidNonWhitelisted)', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);
      const payload = {
        ...validTheme,
        light: { ...validTheme.light, evil: 'url(javascript:alert(1))' },
      };

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('RBAC: Admin (non SuperAdmin) → 403 e nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(validTheme)
        .expect(403);

      expect(res.body.message).toContain('Permessi insufficienti');
      expect(insertMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/app/settings/theme')
        .send(validTheme)
        .expect(401);
    });
  });

  describe('GET /app/settings/multilingual', () => {
    it('happy path: installazione mai personalizzata → default di fabbrica bootstrap (ogni ruolo)', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(DEFAULT_MULTILINGUAL_CONFIG);
    });

    it('happy path: registro salvato → restituisce il jsonb della riga multilingual.locales', async () => {
      const saved: MultilingualConfigDto = { active: ['it-IT', 'en-GB'], default: 'it-IT' };
      findFirstMock.mockResolvedValue({ id: 1, key: MULTILINGUAL_SETTING_KEY, value: saved });
      const auth = makeAuthFor(AppUserRoles.Manager);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(saved);
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer()).get('/api/v1/app/settings/multilingual').expect(401);
    });
  });

  describe('PUT /app/settings/multilingual', () => {
    it('happy path: Admin salva il registro Locale → upsert + audit log + echo', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin, 9);
      const payload: MultilingualConfigDto = {
        active: ['it-IT', 'en-GB', 'fr-FR'],
        default: 'it-IT',
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(200);

      expect(res.body).toEqual(payload);
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ key: MULTILINGUAL_SETTING_KEY, createdBy: 9, updatedBy: 9 }),
      );
      expect(onConflictMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        9,
        'settings.multilingual.update',
        'app_settings',
        MULTILINGUAL_SETTING_KEY,
        JSON.stringify(payload),
        undefined,
        expect.anything(),
      );
    });

    it('happy path: SuperAdmin (sopra la soglia Admin) può salvare comunque', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ active: ['it-IT'], default: 'it-IT' })
        .expect(200);
    });

    it('errore: il Locale di default non compare fra gli attivi → 400, nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ active: ['en-GB', 'fr-FR'], default: 'it-IT' })
        .expect(400);

      expect(res.body.message).toContain('Locale di default');
      expect(insertMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('errore: active vuoto → 400 (ArrayMinSize/ArrayNotEmpty)', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ active: [], default: 'it-IT' })
        .expect(400);

      expect(validationMessages(res.body)).toBeTruthy();
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: campo extra nel payload → 400 (forbidNonWhitelisted)', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ active: ['it-IT'], default: 'it-IT', evil: true })
        .expect(400);

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('RBAC: Manager (sotto Admin) → 403 e nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.Manager);

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send({ active: ['it-IT'], default: 'it-IT' })
        .expect(403);

      expect(res.body.message).toContain('Permessi insufficienti');
      expect(insertMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/app/settings/multilingual')
        .send({ active: ['it-IT'], default: 'it-IT' })
        .expect(401);
    });
  });

  describe('GET /app/settings/global-tokens', () => {
    it('happy path: installazione mai personalizzata → default di fabbrica (ogni ruolo)', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(DEFAULT_GLOBAL_TOKENS);
      expect(findFirstMock).toHaveBeenCalledTimes(1);
    });

    it('happy path: token salvati → restituisce il jsonb della riga global_tokens', async () => {
      const saved: GlobalTokensDto = {
        ...validGlobalTokens,
        palette: { ...validGlobalTokens.palette, primary: '#123456' },
      };
      findFirstMock.mockResolvedValue({ id: 1, key: GLOBAL_TOKENS_SETTING_KEY, value: saved });
      const auth = makeAuthFor(AppUserRoles.Manager);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual(saved);
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer()).get('/api/v1/app/settings/global-tokens').expect(401);
    });
  });

  describe('PUT /app/settings/global-tokens', () => {
    it('happy path: Admin salva i token → upsert + audit log + echo, e la GET successiva li riflette', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin, 11);
      const payload: GlobalTokensDto = {
        ...validGlobalTokens,
        palette: { ...validGlobalTokens.palette, accent: '#00ff00' },
        typography: { ...validGlobalTokens.typography, mainFont: 'serif' },
      };

      const putRes = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(200);

      expect(putRes.body).toEqual(payload);
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ key: GLOBAL_TOKENS_SETTING_KEY, createdBy: 11, updatedBy: 11 }),
      );
      expect(onConflictMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        11,
        'settings.globalTokens.update',
        'app_settings',
        GLOBAL_TOKENS_SETTING_KEY,
        JSON.stringify(payload),
        undefined,
        expect.anything(),
      );

      // Simula la riga ora persistita (l'insert è mockato: non scrive davvero) per verificare che la GET successiva rifletta il salvataggio.
      findFirstMock.mockResolvedValue({ id: 1, key: GLOBAL_TOKENS_SETTING_KEY, value: payload });
      const getRes = await request(app.getHttpServer())
        .get('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(getRes.body).toEqual(payload);
    });

    it('happy path: SuperAdmin (sopra la soglia Admin) può salvare comunque', async () => {
      const auth = makeAuthFor(AppUserRoles.SuperAdmin);

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(validGlobalTokens)
        .expect(200);
    });

    it('errore: colore di palette non hex → 400, nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload = {
        ...validGlobalTokens,
        palette: { ...validGlobalTokens.palette, primary: 'red' },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('#rrggbb');
      expect(insertMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('errore: mainFont fuori whitelist → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload = {
        ...validGlobalTokens,
        typography: { ...validGlobalTokens.typography, mainFont: 'Comic Sans MS, cursive' },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Font');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("errore: unità '%' su baseSize/baseUnit → 400 (non ammessa per font/spacing)", async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload = {
        ...validGlobalTokens,
        spacing: { baseUnit: { ...validGlobalTokens.spacing.baseUnit, unit: '%' } },
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Unità');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: versione non supportata → 400', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload = { ...validGlobalTokens, version: 2 };

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(validationMessages(res.body)).toContain('Versione');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: campo extra nel payload → 400 (forbidNonWhitelisted)', async () => {
      const auth = makeAuthFor(AppUserRoles.Admin);
      const payload = {
        ...validGlobalTokens,
        palette: { ...validGlobalTokens.palette, evil: '#000000' },
      };

      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(payload)
        .expect(400);

      expect(insertMock).not.toHaveBeenCalled();
    });

    it('RBAC: Manager (sotto Admin) → 403 e nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.Manager);

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(validGlobalTokens)
        .expect(403);

      expect(res.body.message).toContain('Permessi insufficienti');
      expect(insertMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('RBAC: User (sotto Admin) → 403 e nessuna scrittura', async () => {
      const auth = makeAuthFor(AppUserRoles.User);

      const res = await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .send(validGlobalTokens)
        .expect(403);

      expect(res.body.message).toContain('Permessi insufficienti');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/app/settings/global-tokens')
        .send(validGlobalTokens)
        .expect(401);
    });
  });
});
