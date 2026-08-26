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
 * Test di integrazione della superficie pubblica di lettura delle Pagine
 * (`GET api/v1/public/pages`, F03/T2/T4, ADR-24) contro Postgres/Redis REALI
 * (`AppModule` completo, nessun mock su DB/Redis — stesso pattern di
 * `pages.e2e-spec.ts`). Copre: 404 uniforme (bozza/archiviata/soft-deleted/
 * riga incoerente), contenuto servito dalla Revisione (mai `draftContent`),
 * canonicalizzazione 308, rate limit proprio. Gli scenari di cache/
 * invalidazione (ADR-23) vivono in `public-pages-cache.e2e-spec.ts`, isolati
 * per non far dipendere questi test dal comportamento della cache.
 *
 * Mock solo per i servizi esterni veri (SMTP, via `network-mocks.setup.ts`).
 */
describe('PublicPagesController (e2e, DB/Redis reali)', () => {
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

  async function seedAuth(role: AppUserRoles, emailSuffix: string): Promise<Auth> {
    const db = getTestDb();
    const [user] = await db
      .insert(userEntity)
      .values({
        name: 'E2E',
        surname: emailSuffix,
        email: `public-pages.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  /** Albero minimo valido con un blocco `heading` (`level`/`text` plainText obbligatori). */
  function safeContentTree(text = 'Testo lecito'): Record<string, unknown> {
    return {
      version: 1,
      blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] }],
    };
  }

  async function createDraftPage(
    auth: Auth,
    overrides: Partial<{
      title: string;
      slug: string;
      locale: string;
      parentGuid: string;
      draftContent: Record<string, unknown>;
    }> = {},
  ): Promise<{ guid: string; version: number; status: string; [k: string]: unknown }> {
    const res = await authedRequest('post', '/api/v1/app/pages', auth)
      .send({
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: overrides.locale ?? 'it-IT',
        parentGuid: overrides.parentGuid,
        draftContent: overrides.draftContent ?? safeContentTree(),
      })
      .expect(201);
    return res.body;
  }

  function changeStatus(
    auth: Auth,
    guid: string,
    status: string,
    scheduledAt?: string,
  ): request.Test {
    return authedRequest('post', `/api/v1/app/pages/${guid}/status`, auth).send({
      status,
      ...(scheduledAt ? { scheduledAt } : {}),
    });
  }

  /** Registra il registro Locale attivi (RFC-F05 § 1) come farebbe un Admin da UI. */
  async function setActiveLocales(admin: Auth, active: string[], defaultLocale: string): Promise<void> {
    await request(app.getHttpServer())
      .put('/api/v1/app/settings/multilingual')
      .set('Authorization', admin.bearer)
      .set('Cookie', admin.cookie)
      .send({ active, default: defaultLocale })
      .expect(200);
  }

  /** `GET public/pages?path=...`, senza header di auth: la superficie è anonima per costruzione. */
  function publicGet(path: string): request.Test {
    return request(app.getHttpServer()).get(
      `/api/v1/public/pages?path=${encodeURIComponent(path)}`,
    );
  }

  // ─── 1. 404 uniforme: bozza, archiviata, soft-deleted ──────────────────

  describe('404 uniforme (mai 403): bozza, archiviata, soft-deleted', () => {
    it('una Pagina in draft non è mai raggiungibile: 404', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'draft404');
      await createDraftPage(manager, { title: 'Bozza mai pubblicata', slug: 'prova-draft' });

      const res = await publicGet('/prova-draft');

      expect(res.status).toBe(404);
    });

    it('una Pagina archiviata non è mai raggiungibile: 404', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'arch404');
      const page = await createDraftPage(manager, {
        title: 'Pagina archiviata',
        slug: 'prova-archiviata',
      });
      await changeStatus(manager, page.guid, 'published').expect(200);
      await changeStatus(manager, page.guid, 'archived').expect(200);

      const res = await publicGet('/prova-archiviata');

      expect(res.status).toBe(404);
    });

    it('una Pagina soft-deleted non è mai raggiungibile: 404', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'del404');
      const page = await createDraftPage(admin, {
        title: 'Pagina da eliminare',
        slug: 'prova-eliminata',
      });
      await changeStatus(admin, page.guid, 'published').expect(200);
      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);

      const res = await publicGet('/prova-eliminata');

      expect(res.status).toBe(404);
    });

    it(
      'i tre motivi di rifiuto (draft, archiviata, soft-deleted) producono ESATTAMENTE lo stesso ' +
        'body (statusCode/message/code): nessun modo per un chiamante esterno di distinguere il motivo',
      async () => {
        // Stessa richiesta ripetuta (`path=/prova`, sempre lo stesso slug) in tre
        // stati isolati (truncate fra i sub-passi via pagine distinte ma stesso
        // slug non è possibile nello stesso `beforeEach` — quindi si confrontano
        // i corpi normalizzati, escludendo `timestamp` (per costruzione diverso
        // a ogni richiesta) e `path` (riflette la query string della richiesta,
        // identica in questo caso: tutte e tre le richieste usano lo stesso
        // `path=/prova`, quindi anche questo campo resta di fatto invariato).
        const manager = await seedAuth(AppUserRoles.Manager, 'uniform404');

        const draftPage = await createDraftPage(manager, { title: 'Bozza', slug: 'prova' });
        const draftRes = await publicGet('/prova');

        await truncateAllTables();
        await flushTestRedis();
        const manager2 = await seedAuth(AppUserRoles.Manager, 'uniform404b');
        const archivedPage = await createDraftPage(manager2, {
          title: 'Archiviata',
          slug: 'prova',
        });
        await changeStatus(manager2, archivedPage.guid, 'published').expect(200);
        await changeStatus(manager2, archivedPage.guid, 'archived').expect(200);
        const archivedRes = await publicGet('/prova');

        await truncateAllTables();
        await flushTestRedis();
        const admin3 = await seedAuth(AppUserRoles.Admin, 'uniform404c');
        const deletedPage = await createDraftPage(admin3, { title: 'Eliminata', slug: 'prova' });
        await changeStatus(admin3, deletedPage.guid, 'published').expect(200);
        await authedRequest('delete', `/api/v1/app/pages/${deletedPage.guid}`, admin3).expect(204);
        const deletedRes = await publicGet('/prova');

        expect(draftPage.guid).toBeDefined();

        const strip = (body: Record<string, unknown>): Record<string, unknown> => {
          const { timestamp, path, ...rest } = body;
          void timestamp;
          void path;
          return rest;
        };

        expect(draftRes.status).toBe(404);
        expect(archivedRes.status).toBe(404);
        expect(deletedRes.status).toBe(404);
        expect(strip(draftRes.body)).toEqual(strip(archivedRes.body));
        expect(strip(archivedRes.body)).toEqual(strip(deletedRes.body));
        // Nessun `code`/`message` che riveli il motivo (ADR-24 § 3): niente
        // "DRAFT"/"ARCHIVED"/"DELETED" nel body.
        const bodyText = JSON.stringify(strip(draftRes.body)).toLowerCase();
        expect(bodyText).not.toMatch(/draft|archiv|delet/);
      },
    );
  });

  // ─── 2. Riga incoerente: published senza publishedRevisionId ───────────

  describe('Riga incoerente: status="published" ma publishedRevisionId nullo', () => {
    it('404, mai un fallback su draftContent (ADR-24 § 2)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'incoherent1');
      const page = await createDraftPage(manager, {
        title: 'Pagina incoerente',
        slug: 'prova-incoerente',
        draftContent: safeContentTree('Contenuto di bozza, non deve mai uscire'),
      });

      // Stato non raggiungibile dal flusso applicativo (publishTransactionally
      // scrive `status` e `publishedRevisionId` nella stessa transazione):
      // verificato leggendo lo schema (`publishedRevisionId` nullable per
      // necessità del ciclo di FK, pages.service.ts riga ~254-263) — quindi è
      // una riga raggiungibile solo con una scrittura diretta a database, non
      // un'invenzione del test. Simula un guasto di scrittura fuori
      // transazione o un dato corrotto da migrazione.
      const db = getTestDb();
      await db
        .update(pageEntity)
        .set({ status: 'published', publishedRevisionId: null })
        .where(eq(pageEntity.guid, page.guid));

      const res = await publicGet('/prova-incoerente');

      expect(res.status).toBe(404);
      // Il corpo della bozza non deve mai comparire nella risposta pubblica.
      expect(JSON.stringify(res.body)).not.toMatch(/Contenuto di bozza/);
    });
  });

  // ─── 3. Contenuto servito: Revisione pubblicata, mai draftContent ──────

  describe('Contenuto servito è quello della Revisione pubblicata, non la bozza corrente', () => {
    it('mutare draftContent a database dopo la pubblicazione non altera la risposta pubblica', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'revcontent1');
      const page = await createDraftPage(manager, {
        title: 'Pagina pubblicata',
        slug: 'prova-revisione',
        draftContent: safeContentTree('Testo pubblicato originale'),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage).toBeDefined();

      // Mutazione diretta della bozza a database (non passa dalla pipeline
      // applicativa): il pubblico deve continuare a vedere la Revisione.
      await db
        .update(pageEntity)
        .set({ draftContent: safeContentTree('Testo di bozza mutato, non deve uscire') })
        .where(eq(pageEntity.guid, page.guid));

      // Nessuna cache coinvolta in questo controllo: prima lettura pubblica
      // dopo la mutazione, con Redis pulito, così il valore viene ricalcolato
      // dal database (Revisione), non riletto da uno stato cache precedente.
      await flushTestRedis();

      const res = await publicGet('/prova-revisione');

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.content)).toMatch(/Testo pubblicato originale/);
      expect(JSON.stringify(res.body.content)).not.toMatch(/Testo di bozza mutato/);
    });
  });

  // ─── 4. Canonicalizzazione: 308 verso la forma canonica ────────────────

  describe('Canonicalizzazione del percorso pubblico (ADR-24 § 4)', () => {
    it('maiuscole nel path: 308 verso la forma minuscola, nessuna lettura dal database', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'canon1');
      await createDraftPage(manager, { title: 'Pagina canonica', slug: 'prova-canonica' });

      const res = await publicGet('/Prova-Canonica');

      expect(res.status).toBe(308);
      expect(res.headers.location).toBe('/api/v1/public/pages?path=/prova-canonica');
    });

    it('slash finale: 308 verso la forma senza slash finale', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'canon2');
      await createDraftPage(manager, { title: 'Pagina canonica 2', slug: 'prova-canonica-2' });

      const res = await publicGet('/prova-canonica-2/');

      expect(res.status).toBe(308);
      expect(res.headers.location).toBe('/api/v1/public/pages?path=/prova-canonica-2');
    });

    it('maiuscole + slash finale insieme: 308 verso la forma canonica completa', async () => {
      const res = await publicGet('/Prova-Canonica-3/');

      expect(res.status).toBe(308);
      expect(res.headers.location).toBe('/api/v1/public/pages?path=/prova-canonica-3');
    });
  });

  // ─── 4b. Risoluzione pubblica locale-prefissata (RFC-F05 § 4) ───────────

  describe('Risoluzione pubblica locale-prefissata (RFC-F05 § 4)', () => {
    it('un Locale attivo non di default con prefisso risolve alla Pagina pubblicata in quel Locale', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'locpref1');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');
      const page = await createDraftPage(admin, {
        title: 'About us',
        slug: 'about-us',
        locale: 'en-GB',
      });
      await changeStatus(admin, page.guid, 'published').expect(200);

      const res = await publicGet('/en-gb/about-us');

      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('en-GB');
      expect(res.body.slug).toBe('about-us');
    });

    it('fallback SEMPRE 404, mai automatico alla lingua di default quando la traduzione non esiste in quel Locale', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'locpref2');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');
      // Pubblicata SOLO in it-IT, mai in en-GB — stesso slug.
      const page = await createDraftPage(admin, {
        title: 'Chi siamo',
        slug: 'chi-siamo-fallback',
        locale: 'it-IT',
      });
      await changeStatus(admin, page.guid, 'published').expect(200);

      const res = await publicGet('/en-gb/chi-siamo-fallback');

      expect(res.status).toBe(404);
    });

    it('primo segmento non corrisponde a nessun Locale attivo → non è un prefisso, entra come primo slug in lingua di default', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'locpref3');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');
      // Una Pagina IT il cui slug root coincide col nome di un Locale NON attivo ("fr-fr").
      const page = await createDraftPage(admin, {
        title: 'Slug come locale non attivo',
        slug: 'fr-fr',
        locale: 'it-IT',
      });
      await changeStatus(admin, page.guid, 'published').expect(200);

      const res = await publicGet('/fr-fr');

      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('it-IT');
    });

    it('lingua di default: percorso senza prefisso invariato, anche con più Locale attivi', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'locpref4');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');
      const page = await createDraftPage(admin, {
        title: 'Pagina default',
        slug: 'pagina-default',
        locale: 'it-IT',
      });
      await changeStatus(admin, page.guid, 'published').expect(200);

      const res = await publicGet('/pagina-default');

      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('it-IT');
    });

    it('la canonicalizzazione si applica anche al percorso con prefisso di lingua (maiuscole + slash finale)', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'locpref5');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');

      const res = await publicGet('/EN-GB/About-Us/');

      expect(res.status).toBe(308);
      expect(res.headers.location).toBe('/api/v1/public/pages?path=/en-gb/about-us');
    });
  });

  // ─── 5. Rate limit sulla superficie pubblica ────────────────────────────

  describe('Rate limit sulla superficie pubblica (throttler "public", 300/60s, app.module.ts)', () => {
    it('oltre soglia risponde 429', async () => {
      // `path` assente: 400 immediato in `PublicPagesController.getPage`
      // (BadRequestException), ma il `ThrottlerGuard` conta la richiesta
      // PRIMA che l'handler la respinga (il guard è a livello di rotta) —
      // stesso comportamento del rate limit su `/auth/*` già in produzione.
      // Nessuna scrittura a database per nessuna delle richieste: la suite
      // resta veloce anche a 305 chiamate. Soglia 300/60s condivisa con le
      // richieste già emesse dagli altri test di questo file sulla stessa
      // rotta/IP nella stessa finestra: non si assume quindi che le prime
      // 300 di QUESTO blocco siano tutte 400, solo che il 429 compaia prima
      // che le richieste finiscano (soglia realmente applicata).
      const attempts = 305;
      const results: number[] = [];
      for (let i = 0; i < attempts; i++) {
        const res = await request(app.getHttpServer()).get('/api/v1/public/pages');
        results.push(res.status);
      }

      expect(results.every((s) => s === 400 || s === 429)).toBe(true);
      expect(results.filter((s) => s === 429).length).toBeGreaterThan(0);
    }, 60_000);
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
