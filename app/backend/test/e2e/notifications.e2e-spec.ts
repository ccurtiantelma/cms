import 'reflect-metadata';
import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { NextFunction, Request, Response } from 'express';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { AppGateway } from '../../src/realtime/app.gateway';
import { AuthMiddleware } from '../../src/auth/auth.middleware';
import { DbService } from '../../src/db/db.service';
import { RedisService } from '../../src/redis/redis.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';

/**
 * Test di integrazione per `NotificationsController` (bell/badge, ADR-12).
 * L'autenticazione passa dal VERO `AuthMiddleware` (JWT + cookie rtk + allowlist
 * Redis mockata). `DbService` e `AppGateway` sono mockati: nessuna connessione
 * reale a Postgres/Redis e nessun push Socket.io realmente emesso.
 */
describe('NotificationsController (integration)', () => {
  let app: INestApplication;
  let findManyMock: jest.Mock;
  let selectWhereMock: jest.Mock;
  let updateWhereMock: jest.Mock;
  let updateSetMock: jest.Mock;

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
      {
        expiresIn: '15m',
      },
    );
    activeSessions.add(`login:${token}`);
    const rtk = signCookieValue('e2e-refresh-token', AppConstants.cookieSecret);
    return { bearer: `Bearer ${token}`, cookie: `rtk=${encodeURIComponent(rtk)}` };
  }

  const storedRow = {
    id: 1,
    guid: 'a1b2c3d4e5f6a7b8',
    userId: 7,
    type: 'system.info',
    title: 'Benvenuto',
    message: 'Il tuo account è stato attivato.',
    link: null,
    isRead: false,
    readAt: null,
    isActive: true,
    createdAt: new Date('2026-07-23T10:00:00.000Z'),
    updatedAt: new Date('2026-07-23T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
  };

  beforeEach(async () => {
    activeSessions.clear();
    findManyMock = jest.fn().mockResolvedValue([storedRow]);
    selectWhereMock = jest.fn().mockResolvedValue([{ total: 1 }]);
    updateWhereMock = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
    updateSetMock = jest.fn().mockReturnValue({ where: updateWhereMock });

    const dbServiceMock = {
      db: {
        select: jest
          .fn()
          .mockReturnValue({ from: jest.fn().mockReturnValue({ where: selectWhereMock }) }),
        update: jest.fn().mockReturnValue({ set: updateSetMock }),
        query: { notificationEntity: { findMany: findManyMock } },
      },
    };

    const redisServiceMock = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(activeSessions.has(key) ? 'session-attiva' : null),
        ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        { provide: DbService, useValue: dbServiceMock },
        { provide: AppGateway, useValue: { emitToUser: jest.fn(), emit: jest.fn() } },
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

  describe('GET /app/notifications', () => {
    it('happy path: restituisce la lista paginata del chiamante', async () => {
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/notifications')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].guid).toBe(storedRow.guid);
      expect(res.body.totalItems).toBe(1);
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer()).get('/api/v1/app/notifications').expect(401);
    });
  });

  describe('GET /app/notifications/unread-count', () => {
    it('happy path: restituisce il conteggio non lette', async () => {
      selectWhereMock.mockResolvedValue([{ total: 3 }]);
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .get('/api/v1/app/notifications/unread-count')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual({ count: 3 });
    });
  });

  describe('PATCH /app/notifications/:guid/read', () => {
    it('happy path: segna come letta una notifica del chiamante', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ ...storedRow, isRead: true }]),
      });
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/app/notifications/${storedRow.guid}/read`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body.isRead).toBe(true);
    });

    it('ownership: guid di un altro utente → 404, non 403 (nessuna conferma di esistenza)', async () => {
      // Il chiamante (userId 99) non è il proprietario di storedRow (userId 7):
      // il WHERE lato service non trova righe, non un controllo separato che rivelerebbe l'esistenza.
      updateWhereMock.mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
      const auth = makeAuthFor(99);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/app/notifications/${storedRow.guid}/read`)
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(404);

      expect(res.body.message).toContain('non trovata');
    });

    it('errore: senza JWT → 401 dal middleware globale', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/app/notifications/${storedRow.guid}/read`)
        .expect(401);
    });
  });

  describe('PATCH /app/notifications/read-all', () => {
    it('happy path: segna tutte le notifiche del chiamante come lette', async () => {
      updateWhereMock.mockReturnValue({
        returning: jest.fn().mockResolvedValue([storedRow, storedRow]),
      });
      const auth = makeAuthFor(7);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/app/notifications/read-all')
        .set('Authorization', auth.bearer)
        .set('Cookie', auth.cookie)
        .expect(200);

      expect(res.body).toEqual({ updated: 2 });
    });
  });
});
