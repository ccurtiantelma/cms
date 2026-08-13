import 'reflect-metadata';

// Deve essere importato PRIMA di `AppModule`: `network-mocks.setup.ts` chiama
// `jest.mock('nodemailer', ...)` a livello di modulo. Se l'ordine si
// invertisse, l'AppModule reale finirebbe per instanziare un transporter SMTP
// reale durante il bootstrap.
import { networkMocks } from './setup/network-mocks.setup';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { Utils } from '../../src/common/utils';
import { AppUserRoles } from '../../src/common/enums';
import { userEntity } from '../../src/db/schema';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Spec di sanity dell'ambiente e2e isolato. Non copre casistiche di business:
 * verifica solo che l'app NestJS reale (AppModule completo) si avvii contro
 * Postgres/Redis di test, che le migrazioni Drizzle vengano applicate, che
 * l'isolamento tra i test (truncate + flushdb) funzioni, e che un endpoint
 * pubblico reale (`POST /auth/login`) risponda con i codici HTTP attesi
 * contro dati realmente persistiti (nessun repository/service mockato).
 *
 * Richiede `DATABASE_URL` puntato a `cms_db_test` e `REDIS_URL` al DB Redis
 * logico #1 — vedi guardie in `db-test.helper.ts` / `redis-test.helper.ts`,
 * che bloccano l'esecuzione (invece di eseguire truncate/flushdb) se le
 * variabili d'ambiente puntano a un database di sviluppo.
 */
describe('Sanity e2e — isolamento ambiente (AppModule reale)', () => {
  let app: INestApplication;

  const EMAIL = 'sanity.e2e@cms.test';
  const PASSWORD = 'Password123!Sanity';

  beforeAll(async () => {
    await runMigrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Wiring identico a `src/main.ts`, ridotto alle parti rilevanti per la
    // sanity (nessun helmet/Swagger: non impattano i codici HTTP verificati qui).
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));

    await app.init();
  });

  beforeEach(async () => {
    // Truncate controllato: ogni test parte da Postgres/Redis vuoti, evitando
    // dipendenze nell'ordine di esecuzione tra i test di questo file.
    await truncateAllTables();
    await flushTestRedis();
  });

  afterAll(async () => {
    // `app` può restare `undefined` se `beforeAll` fallisce prima di
    // raggiungere `app.init()` (es. guardia `assertTestDatabase` in
    // `runMigrations()`): senza questo controllo, l'errore reale verrebbe
    // mascherato da un `TypeError` sul teardown.
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  /** Inserisce direttamente su Postgres (bypass HTTP) un utente attivo con password bcrypt valida. */
  async function seedUtenteAttivo(): Promise<void> {
    const db = getTestDb();
    await db.insert(userEntity).values({
      name: 'Sanity',
      surname: 'E2E',
      email: EMAIL,
      pwd: await Utils.hashPassword(PASSWORD),
      role: AppUserRoles.User,
      isActive: true,
      pwdSet: true,
      isMfaEnabled: false,
    });
  }

  describe('POST /auth/login', () => {
    it('happy path: credenziali corrette → 201, sessione persistita su Redis reale', async () => {
      await seedUtenteAttivo();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(201); // NestJS: status default per @Post() senza @HttpCode

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeUndefined(); // spostato in cookie httpOnly, mai nel body
      expect(res.body.user).toMatchObject({ email: EMAIL, role: AppUserRoles.User });
      expect(res.headers['set-cookie']?.[0]).toMatch(/^rtk=/);

      // Verifica di integrazione reale (non mockata): la sessione deve esistere
      // realmente su Redis, non solo nella risposta HTTP.
      const redis = getTestRedisClient();
      const sessionExists = await redis.exists(`login:${res.body.accessToken}`);
      expect(sessionExists).toBe(1);

      // Il login non deve toccare i mock di rete (email): nessuna notifica viene inviata in questo flusso.
      expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
    });

    it('errore: password errata → 401, nessuna sessione creata', async () => {
      await seedUtenteAttivo();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'password-sbagliata' })
        .expect(401);

      expect(res.body.message).toBe('Credenziali errate.');

      const redis = getTestRedisClient();
      expect(await redis.dbsize()).toBe(0);
    });

    it('errore: payload con campo non whitelisted → 400 (ValidationPipe globale)', async () => {
      await seedUtenteAttivo();

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: PASSWORD, isAdmin: true })
        .expect(400);
    });
  });

  it("isolamento tra test: nessun residuo dell'utente seedato nel test precedente", async () => {
    const db = getTestDb();
    const utenti = await db.query.userEntity.findMany();
    expect(utenti).toHaveLength(0);

    const redis = getTestRedisClient();
    expect(await redis.dbsize()).toBe(0);
  });
});
