import 'reflect-metadata';

// Deve essere importato PRIMA di `AppModule`: `network-mocks.setup.ts` chiama
// `jest.mock('nodemailer', ...)` a livello di modulo (vedi sanity-isolation.e2e-spec.ts).
import './setup/network-mocks.setup';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { closeTestDb, runMigrations } from './helpers/db-test.helper';
import { closeTestRedisClient } from './helpers/redis-test.helper';

/**
 * Test di integrazione per `GET /health` (Terminus, ADR-7). Usa l'`AppModule`
 * reale contro Postgres/Redis di test (nessun mock sugli indicatori): verifica
 * che il check risponda `200`/`up` con connettività reale, e che l'endpoint sia
 * davvero raggiungibile SENZA JWT (readiness probe/uptime monitoring esterno,
 * mai autenticato — vedi esclusione in `AppModule.configure()`).
 */
describe('HealthController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await runMigrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  describe('GET /health', () => {
    it('happy path: DB/Redis/BullMQ reali raggiungibili → 200, tutti gli indicatori "up"', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
      expect(res.body.info.redis.status).toBe('up');
      expect(res.body.info.bullmq.status).toBe('up');
    });

    it('non richiede autenticazione: nessun header Authorization/cookie rtk → comunque 200, non 401', async () => {
      // Verifica di regressione mirata: `/health` deve restare escluso da
      // `AuthMiddleware` (readiness probe di orchestratori/monitoring esterni,
      // che non hanno un JWT applicativo) — vedi anche il bug analogo trovato
      // e corretto su `/metrics` nello stesso audit (ADR-15).
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);
    });
  });
});
