import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { NextFunction, Request, Response } from 'express';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { DbService } from '../../src/db/db.service';
import { RedisService } from '../../src/redis/redis.service';
import { AuditLogService } from '../../src/common/audit-log.service';
import { EmailQueueService } from '../../src/queues/email-queue/email.queue.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { Utils } from '../../src/common/utils';
import { AppUserRoles } from '../../src/common/enums';

/**
 * Test di integrazione per `AuthController` (login, logout, request-activation
 * RBAC). `DbService`, `RedisService`, `AuditLogService` ed `EmailQueueService`
 * sono mockati: nessuna connessione reale a Postgres/Redis, nessuna email
 * accodata su BullMQ. Per la sanity con infrastruttura reale vedi
 * `sanity-isolation.e2e-spec.ts`.
 */
describe('AuthController (integration)', () => {
  let app: INestApplication;
  let findFirstMock: jest.Mock;
  let redisSetMock: jest.Mock;
  let redisGetMock: jest.Mock;
  let redisDelMock: jest.Mock;
  let auditLogMock: jest.Mock;

  const EMAIL = 'mario.rossi@cms.test';
  const PASSWORD = 'Password123!Test';

  const baseUser = {
    id: 1,
    guid: 'abcd1234abcd1234',
    name: 'Mario',
    surname: 'Rossi',
    email: EMAIL,
    role: AppUserRoles.User,
    scopeId: null,
    isActive: true,
    pwdSet: true,
    isMfaEnabled: false,
    totpSecret: null,
  };

  beforeEach(async () => {
    findFirstMock = jest.fn();
    redisSetMock = jest.fn().mockResolvedValue(undefined);
    redisGetMock = jest.fn().mockResolvedValue(null);
    redisDelMock = jest.fn().mockResolvedValue(undefined);
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ name: 'auth', ttl: 60_000, limit: 20 }] }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: DbService,
          useValue: {
            db: {
              query: { userEntity: { findFirst: findFirstMock } },
              update: jest.fn().mockReturnValue({
                set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
              }),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: redisSetMock,
            get: redisGetMock,
            getJson: redisGetMock,
            del: redisDelMock,
            sadd: jest.fn().mockResolvedValue(undefined),
            smembers: jest.fn().mockResolvedValue([]),
            srem: jest.fn().mockResolvedValue(undefined),
            expire: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: AuditLogService, useValue: { log: auditLogMock } },
        {
          provide: EmailQueueService,
          useValue: { enqueueEmail: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('happy path: login con credenziali corrette', async () => {
      findFirstMock.mockResolvedValue({ ...baseUser, pwd: await Utils.hashPassword(PASSWORD) });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(201); // NestJS: status default per @Post() senza @HttpCode

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeUndefined(); // spostato in cookie httpOnly, mai nel body
      expect(res.body.user).toMatchObject({ id: baseUser.id, email: EMAIL, role: baseUser.role });
      const rtkCookie = res.headers['set-cookie']?.[0] as string;
      expect(rtkCookie).toMatch(/^rtk=/);
      // ADR-14: sameSite esplicito su ogni set del cookie rtk; secure solo in produzione
      // (qui NODE_ENV=test, vedi setup/env.setup.ts) quindi assente dall'header.
      expect(rtkCookie).toMatch(/SameSite=Lax/i);
      expect(rtkCookie).not.toMatch(/Secure/i);
      expect(rtkCookie).toMatch(/HttpOnly/i);
      expect(redisSetMock).toHaveBeenCalledWith(
        expect.stringContaining('login:'),
        expect.objectContaining({ id: baseUser.id }),
        expect.any(Number),
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        baseUser.id,
        'login',
        undefined,
        undefined,
        { metodo: 'password' },
        undefined,
        expect.any(String),
      );
    });

    it('errore: credenziali errate → 401', async () => {
      findFirstMock.mockResolvedValue({
        ...baseUser,
        pwd: await Utils.hashPassword('altra-password-diversa'),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(401);

      expect(res.body.message).toBe('Credenziali errate.');
      expect(redisSetMock).not.toHaveBeenCalled();
    });

    it('errore: account disabilitato → 401', async () => {
      findFirstMock.mockResolvedValue({
        ...baseUser,
        pwd: await Utils.hashPassword(PASSWORD),
        isActive: false,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(401);

      expect(res.body.message).toBe('Account disabilitato.');
      expect(redisSetMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    it('happy path: logout invalida la sessione', async () => {
      const token = 'jwt-fittizio-di-test';

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(201); // NestJS: status default per @Post() senza @HttpCode

      expect(res.body).toEqual({ success: true });
      // ADR-14: clearCookie usa le stesse opzioni sameSite/secure del set, per
      // compatibilità con i browser che le richiedono per l'invalidazione corretta.
      const clearedCookie = res.headers['set-cookie']?.[0] as string;
      expect(clearedCookie).toMatch(/^rtk=;/);
      expect(clearedCookie).toMatch(/SameSite=Lax/i);
      expect(redisDelMock).toHaveBeenCalledWith(`login:${token}`);
      expect(auditLogMock).toHaveBeenCalledWith(
        null,
        'logout',
        undefined,
        undefined,
        undefined,
        undefined,
        expect.any(String),
      );
    });
  });

  describe('GET/DELETE /auth/sessions', () => {
    // A differenza degli altri blocchi, qui `req.authInfo` va popolato manualmente:
    // in questo TestingModule ridotto `AuthMiddleware` non gira (vedi commento nel
    // blocco RBAC sotto), e questi due endpoint — come `auth/me` — dipendono da
    // `req.authInfo` senza un guard RBAC dedicato (qualunque utente autenticato
    // gestisce solo le proprie sessioni).
    let sessionsApp: INestApplication;
    let sessionsRedisGetJsonMock: jest.Mock;
    let sessionsRedisSmembersMock: jest.Mock;
    let sessionsRedisSremMock: jest.Mock;
    let sessionsRedisDelMock: jest.Mock;
    let sessionsAuditLogMock: jest.Mock;

    const sessionAuthInfo = { userId: 1, role: AppUserRoles.User, name: 'Mario', scopeId: null };

    beforeEach(async () => {
      sessionsRedisGetJsonMock = jest.fn().mockResolvedValue(null);
      sessionsRedisSmembersMock = jest.fn().mockResolvedValue([]);
      sessionsRedisSremMock = jest.fn().mockResolvedValue(undefined);
      sessionsRedisDelMock = jest.fn().mockResolvedValue(undefined);
      sessionsAuditLogMock = jest.fn().mockResolvedValue(undefined);

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({ throttlers: [{ name: 'auth', ttl: 60_000, limit: 20 }] }),
        ],
        controllers: [AuthController],
        providers: [
          AuthService,
          {
            provide: DbService,
            useValue: { db: { query: { userEntity: { findFirst: jest.fn() } } } },
          },
          {
            provide: RedisService,
            useValue: {
              set: jest.fn().mockResolvedValue(undefined),
              get: jest.fn().mockResolvedValue(null),
              getJson: sessionsRedisGetJsonMock,
              del: sessionsRedisDelMock,
              smembers: sessionsRedisSmembersMock,
              srem: sessionsRedisSremMock,
              sadd: jest.fn().mockResolvedValue(undefined),
              expire: jest.fn().mockResolvedValue(undefined),
            },
          },
          { provide: AuditLogService, useValue: { log: sessionsAuditLogMock } },
          {
            provide: EmailQueueService,
            useValue: { enqueueEmail: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile();

      sessionsApp = moduleRef.createNestApplication();
      sessionsApp.setGlobalPrefix('api/v1');
      sessionsApp.useGlobalFilters(new AllExceptionsFilter());
      sessionsApp.use((req: Request, _res: Response, next: NextFunction) => {
        req.authInfo = sessionAuthInfo;
        next();
      });
      await sessionsApp.init();
    });

    afterEach(async () => {
      await sessionsApp.close();
    });

    it('GET happy path: elenca le sessioni marcando quella corrente', async () => {
      sessionsRedisSmembersMock.mockResolvedValue(['sess-1']);
      sessionsRedisGetJsonMock.mockImplementation((key: string) => {
        if (key === 'login:token-corrente') return Promise.resolve({ id: 1, sessionId: 'sess-1' });
        if (key === 'session:sess-1') {
          return Promise.resolve({
            userId: 1,
            ip: '10.0.0.1',
            userAgent: 'jest-agent',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastUsedAt: '2026-01-01T00:00:00.000Z',
            refreshToken: 'rtk-1',
            accessToken: 'token-corrente',
          });
        }
        return Promise.resolve(null);
      });

      const res = await request(sessionsApp.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', 'Bearer token-corrente')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ sessionId: 'sess-1', current: true, ip: '10.0.0.1' });
    });

    it('DELETE happy path: revoca una sessione propria', async () => {
      sessionsRedisGetJsonMock.mockResolvedValue({
        userId: 1,
        ip: '10.0.0.1',
        userAgent: 'jest-agent',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-01T00:00:00.000Z',
        refreshToken: 'rtk-1',
        accessToken: 'token-1',
      });

      const res = await request(sessionsApp.getHttpServer())
        .delete('/api/v1/auth/sessions/sess-1')
        .set('Authorization', 'Bearer token-corrente')
        .expect(200);

      expect(res.body).toEqual({ success: true });
      expect(sessionsRedisDelMock).toHaveBeenCalledWith('session:sess-1');
      expect(sessionsAuditLogMock).toHaveBeenCalledWith(
        1,
        'session.revoke',
        undefined,
        undefined,
        undefined,
        undefined,
        expect.any(String),
      );
    });

    it("errore RBAC/IDOR: sessione di un altro utente → 404, nessuna rivelazione dell'esistenza", async () => {
      sessionsRedisGetJsonMock.mockResolvedValue({
        userId: 999,
        ip: null,
        userAgent: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-01T00:00:00.000Z',
        refreshToken: 'rtk-altrui',
        accessToken: 'token-altrui',
      });

      const res = await request(sessionsApp.getHttpServer())
        .delete('/api/v1/auth/sessions/sess-altrui')
        .set('Authorization', 'Bearer token-corrente')
        .expect(404);

      expect(res.body.message).toBe('Sessione non trovata.');
    });
  });

  describe('POST /auth/request-activation (RBAC)', () => {
    it('ruolo non autorizzato: nessun authInfo (richiesta non autenticata da AuthMiddleware) → 403', async () => {
      // In questo TestingModule ridotto (solo AuthController) `AuthMiddleware` non è
      // applicato: `req.authInfo` resta undefined, esattamente come per una richiesta
      // priva di sessione valida che raggiungesse comunque un endpoint GuardAdmin.
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/request-activation')
        .send({ email: EMAIL })
        .expect(403);

      expect(res.body.message).toContain('Permessi insufficienti');
    });
  });
});
