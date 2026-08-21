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
 * Test e2e mirato (PLAN-F04c-editor-maturo.md T8, § Falle evitate 2 "il responsive scritto
 * a metà") contro Postgres/Redis REALI, stesso pattern/setup di
 * `pages-blocks-validation.e2e-spec.ts`.
 *
 * Il rischio presidiato qui non è "il salvataggio non dà errore" (già coperto a livello di
 * unit test del validatore, `block-tree-validator.service.spec.ts`): è che un valore
 * responsive completo — tutti e tre i breakpoint valorizzati — **sopravviva intatto** al
 * giro POST → GET → PATCH → GET reale, senza che nessun breakpoint venga perso o troncato
 * lungo la pipeline (sanitizzazione, proiezione di lettura, persistenza `jsonb`).
 */
describe('PagesController (e2e) — round-trip di props di stile responsive (ADR-29, PLAN-F04c T8)', () => {
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

  // ─── Helpers (stesso pattern di pages-blocks-validation.e2e-spec.ts) ───

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

  async function seedAuth(role: AppUserRoles, emailSuffix: string): Promise<Auth> {
    const db = getTestDb();
    const [user] = await db
      .insert(userEntity)
      .values({
        name: 'E2E',
        surname: emailSuffix,
        email: `pages-blocks-responsive.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  /** Envelope responsive con i tre breakpoint tutti valorizzati con token diversi fra loro. */
  const RESPONSIVE_ENVELOPE = { default: 'md', tablet: 'sm', mobile: 'none' };

  it('un valore responsive completo (default+tablet+mobile) sopravvive intatto a POST → GET → PATCH → GET, e a database', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'roundtrip');

    // 1) POST: creo una Pagina con una section i cui quattro breakpoint di
    // `styleSpaceBefore`/`stylePadding` sono tutti valorizzati.
    const createRes = await authedRequest('post', '/api/v1/app/pages', manager)
      .send({
        title: 'Pagina round-trip responsive',
        slug: 'pagina-round-trip-responsive',
        locale: 'it-IT',
        draftContent: {
          version: 1,
          blocks: [
            {
              id: 'sec-1',
              type: 'section',
              v: 1,
              props: {
                styleSpaceBefore: RESPONSIVE_ENVELOPE,
                stylePadding: { default: 'sm', tablet: 'md' }, // "mobile" opzionale: assente di proposito
              },
              children: [
                {
                  id: 'head-1',
                  type: 'heading',
                  v: 1,
                  props: {
                    level: 'h2',
                    text: 'Titolo',
                    styleFontWeight: { default: 'bold', tablet: 'medium', mobile: 'regular' },
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      })
      .expect(201);

    const guid = createRes.body.guid as string;
    expect(createRes.body.draftContent.blocks[0].props.styleSpaceBefore).toEqual(
      RESPONSIVE_ENVELOPE,
    );
    expect(createRes.body.draftContent.blocks[0].children[0].props.styleFontWeight).toEqual({
      default: 'bold',
      tablet: 'medium',
      mobile: 'regular',
    });

    // 2) GET: rilettura via API, nessun breakpoint perso né troncato.
    const getRes = await authedRequest('get', `/api/v1/app/pages/${guid}`, manager).expect(200);
    const readBlocks = getRes.body.draftContent.blocks as Array<Record<string, unknown>>;
    expect((readBlocks[0].props as Record<string, unknown>).styleSpaceBefore).toEqual(
      RESPONSIVE_ENVELOPE,
    );
    expect((readBlocks[0].props as Record<string, unknown>).stylePadding).toEqual({
      default: 'sm',
      tablet: 'md',
    });

    // 3) PATCH: rimando esattamente il body ricevuto dal GET (stesso pattern di
    // `pages-blocks.e2e-spec.ts`) e verifico che il giro non abbia alterato nulla.
    const patchRes = await authedRequest('patch', `/api/v1/app/pages/${guid}`, manager)
      .send({ version: getRes.body.version, draftContent: getRes.body.draftContent })
      .expect(200);

    const patchedBlocks = patchRes.body.draftContent.blocks as Array<Record<string, unknown>>;
    expect((patchedBlocks[0].props as Record<string, unknown>).styleSpaceBefore).toEqual(
      RESPONSIVE_ENVELOPE,
    );

    // 4) Nuova GET: identico anche dopo un secondo giro di lettura.
    const finalGetRes = await authedRequest('get', `/api/v1/app/pages/${guid}`, manager).expect(
      200,
    );
    const finalBlocks = finalGetRes.body.draftContent.blocks as Array<Record<string, unknown>>;
    expect((finalBlocks[0].props as Record<string, unknown>).styleSpaceBefore).toEqual(
      RESPONSIVE_ENVELOPE,
    );
    expect(
      (
        (finalBlocks[0].children as Array<Record<string, unknown>>)[0].props as Record<
          string,
          unknown
        >
      ).styleFontWeight,
    ).toEqual({ default: 'bold', tablet: 'medium', mobile: 'regular' });

    // 5) Verifica diretta a database, non solo sulla risposta HTTP: il `jsonb`
    // persistito porta i tre breakpoint intatti, non solo ciò che l'API restituisce.
    const db = getTestDb();
    const row = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
    const persistedBlocks = (
      row!.draftContent as { blocks: Array<Record<string, unknown>> }
    ).blocks;
    expect((persistedBlocks[0].props as Record<string, unknown>).styleSpaceBefore).toEqual(
      RESPONSIVE_ENVELOPE,
    );
  });

  it('un contenuto già salvato senza alcuna prop di stile resta valido (retro-compatibilità, ADR-29 § 5): PATCH con lo stesso body riceve 200', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'noStyle');

    const createRes = await authedRequest('post', '/api/v1/app/pages', manager)
      .send({
        title: 'Pagina senza props di stile',
        slug: 'pagina-senza-props-di-stile',
        locale: 'it-IT',
        draftContent: {
          version: 1,
          blocks: [
            { id: 'head-1', type: 'heading', v: 1, props: { level: 'h2', text: 'Titolo' }, children: [] },
          ],
        },
      })
      .expect(201);
    const guid = createRes.body.guid as string;

    const getRes = await authedRequest('get', `/api/v1/app/pages/${guid}`, manager).expect(200);

    await authedRequest('patch', `/api/v1/app/pages/${guid}`, manager)
      .send({ version: getRes.body.version, draftContent: getRes.body.draftContent })
      .expect(200);
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
