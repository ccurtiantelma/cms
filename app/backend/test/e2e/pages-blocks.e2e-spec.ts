import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import { networkMocks } from './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { eq } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { pageEntity, userEntity } from '../../src/db/schema';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test e2e mirato (PLAN-F02-blocchi.md T7) su una regressione reale
 * introdotta e poi silenziosamente corretta durante T5: la pipeline di
 * SCRITTURA (`assertValidContentTreeShape`, `content-tree.ts`) richiede `v`
 * obbligatorio per nodo, ma le righe scritte da F01 (pre-F02) non lo hanno
 * mai avuto. Senza la proiezione di lettura (`toDtoWithContentIssues` →
 * `migrateContentForRead`, `pages.service.ts`), un client che legge una
 * Pagina pre-F02 e ne rimanda il body esatto in `PATCH` riceve `400
 * BLOCK_VERSION_REQUIRED` — contenuto pre-F02 reso immodificabile in
 * silenzio. Questo file verifica solo quello scenario, contro `GET`+`PATCH`
 * reali (stesso pattern/setup di `pages.e2e-spec.ts`).
 */
describe('PagesController (e2e) — round-trip lettura/scrittura di contenuto pre-F02', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await runMigrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  // ─── Helpers (stesso pattern di pages.e2e-spec.ts) ─────────────────────

  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  interface Auth {
    userId: number;
    bearer: string;
    cookie: string;
  }

  /** Inserisce un utente reale (FK `createdBy`/`updatedBy` obbligatorie) e restituisce credenziali JWT+cookie valide contro il vero `AuthMiddleware`. */
  async function seedAuth(role: AppUserRoles, emailSuffix: string): Promise<Auth> {
    const db = getTestDb();
    const [user] = await db
      .insert(userEntity)
      .values({
        name: 'E2E',
        surname: emailSuffix,
        email: `pages-blocks.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
        pwd: 'x', // login via password non testato qui: JWT simulato direttamente (vedi docstring)
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
    const redis = getTestRedisClient();
    await redis.set(`login:${token}`, 'sessione-e2e');

    const rtk = signCookieValue(`e2e-refresh-token-${user.id}`, AppConstants.cookieSecret);

    return { userId: user.id, bearer: `Bearer ${token}`, cookie: `rtk=${encodeURIComponent(rtk)}` };
  }

  function authedRequest(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    auth: Auth,
  ): request.Test {
    return (request(app.getHttpServer())[method](path) as request.Test)
      .set('Authorization', auth.bearer)
      .set('Cookie', auth.cookie);
  }

  /**
   * Inserisce direttamente su `pages` (bypassando la pipeline applicativa,
   * come fanno già i test di `pages.e2e-spec.ts`) una riga il cui
   * `draftContent` è un envelope valido MA con un nodo blocco privo del campo
   * `v` — esattamente la forma di una riga scritta da F01, prima che ADR-21
   * introducesse `v` per nodo. `richText` è un tipo realmente registrato
   * (`block-registry.ts`), quindi la pipeline di lettura/migrazione lo accetta.
   */
  async function seedPreF02Page(auth: Auth): Promise<{ guid: string; translationGroupId: string }> {
    const db = getTestDb();
    const guid = crypto.randomBytes(8).toString('hex');
    const translationGroupId = crypto.randomBytes(8).toString('hex');

    await db.insert(pageEntity).values({
      guid,
      title: 'Pagina pre-F02',
      slug: 'pagina-pre-f02',
      locale: 'it-IT',
      translationGroupId,
      status: 'draft',
      draftContent: {
        version: 1,
        blocks: [
          {
            id: 'b1',
            type: 'richText',
            props: { html: 'contenuto pre-F02' },
            children: [],
            // niente `v`: com'era ogni riga scritta da F01 (pre-F02).
          },
        ],
      },
      draftSeo: {},
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });

    return { guid, translationGroupId };
  }

  // ─── Regressione T5: round-trip GET → PATCH di contenuto pre-F02 ───────

  describe('Round-trip pre-F02: v assente in lettura, richiesto in scrittura — regressione T5', () => {
    it('GET proietta v su ogni nodo e il PATCH con lo stesso identico body riceve 200, non 400 BLOCK_VERSION_REQUIRED', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'preF02');
      const { guid } = await seedPreF02Page(manager);

      // La riga a database non ha mai `v` sul nodo: verifica diretta del setup.
      const db = getTestDb();
      const rowBeforeGet = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
      expect(rowBeforeGet).toBeDefined();
      const persistedBlocks = (rowBeforeGet!.draftContent as { blocks: Array<Record<string, unknown>> })
        .blocks;
      expect(persistedBlocks[0].v).toBeUndefined();

      // 1) GET: la proiezione di lettura riempie `v` per ogni nodo, senza
      // toccare la riga a database (verificato più sotto).
      const getRes = await authedRequest('get', `/api/v1/app/pages/${guid}`, manager).expect(200);
      const returnedBlocks = (getRes.body.draftContent as { blocks: Array<Record<string, unknown>> })
        .blocks;
      expect(returnedBlocks[0].v).toBe(1);
      expect(returnedBlocks[0].props).toEqual({ html: 'contenuto pre-F02' });

      const rowAfterGet = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
      expect(
        (rowAfterGet!.draftContent as { blocks: Array<Record<string, unknown>> }).blocks[0].v,
      ).toBeUndefined();

      // 2) PATCH con esattamente il body ricevuto dal GET: `UpdatePageDto` con
      // `whitelist:true`/`forbidNonWhitelisted:true` accetta solo i campi
      // propri (version/title/slug/parentGuid/draftContent/draftSeo) — si
      // sottraggono guid/locale/status/... restituiti dal GET ma non previsti
      // dal DTO, il contenuto (`draftContent`) e il lock (`version`) restano
      // bit-per-bit quelli ricevuti.
      const patchRes = await authedRequest('patch', `/api/v1/app/pages/${guid}`, manager)
        .send({
          version: getRes.body.version,
          draftContent: getRes.body.draftContent,
        })
        .expect(200);

      const patchedBlocks = (
        patchRes.body.draftContent as { blocks: Array<Record<string, unknown>> }
      ).blocks;
      expect(patchedBlocks[0].v).toBe(1);
      expect(patchedBlocks[0].props).toEqual({ html: 'contenuto pre-F02' });

      // Verifica a database, non solo sulla risposta HTTP: la scrittura reale
      // ha persistito `v` sul nodo (la pipeline di scrittura lo richiede).
      const rowAfterPatch = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
      const persistedAfterPatch = (
        rowAfterPatch!.draftContent as { blocks: Array<Record<string, unknown>> }
      ).blocks;
      expect(persistedAfterPatch[0].v).toBe(1);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
