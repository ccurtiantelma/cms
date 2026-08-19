import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import { networkMocks } from './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { userEntity } from '../../src/db/schema';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test di integrazione dei due endpoint nuovi di ADR-25/T2-T3 (F04-bis, T6):
 * `POST api/v1/app/pages/:guid/preview-token` (emissione, superficie admin,
 * ownership per riga) e `GET api/v1/preview/pages/:token` (lettura, terzo
 * prefisso, anonima per costruzione). Stesso pattern di `pages.e2e-spec.ts`:
 * `AppModule` completo contro Postgres/Redis REALI, nessun repository/service
 * mockato, JWT firmato con la stessa chiave dell'app, sessione realmente
 * scritta su Redis, cookie `rtk` firmato con lo stesso algoritmo di
 * `cookie-parser` — passa dal vero `AuthMiddleware`, non lo bypassa.
 *
 * **Enfasi del task**: il blocco "2. 404 uniforme" è la priorità assoluta —
 * token scaduto, token con firma alterata, pagina inesistente e pagina
 * soft-eliminata devono produrre lo STESSO `404`, mai `401`/`403` (ADR-25 § 3).
 */
describe('PreviewPagesController + PagesController.issuePreviewToken (e2e, DB/Redis reali)', () => {
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
        email: `pages-preview.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  /** Albero minimo valido, generico e innocuo (SPEC-F02-blocchi.md § 3.3). */
  function safeContentTree(text = 'Testo di bozza'): Record<string, unknown> {
    return {
      version: 1,
      blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] }],
    };
  }

  /** Crea una Pagina in draft come `auth` e ritorna il DTO risposta (guid/version inclusi). */
  async function createDraftPage(
    auth: Auth,
    overrides: Partial<{
      title: string;
      slug: string;
      locale: string;
      draftContent: Record<string, unknown>;
    }> = {},
  ): Promise<{ guid: string; version: number; status: string; [k: string]: unknown }> {
    const res = await authedRequest('post', '/api/v1/app/pages', auth)
      .send({
        title: overrides.title ?? 'Pagina di test anteprima',
        slug: overrides.slug,
        locale: overrides.locale ?? 'it-IT',
        draftContent: overrides.draftContent ?? safeContentTree(),
      })
      .expect(201);
    return res.body;
  }

  function issuePreviewToken(auth: Auth, guid: string): request.Test {
    return authedRequest('post', `/api/v1/app/pages/${guid}/preview-token`, auth);
  }

  function readPreview(token: string): request.Test {
    return request(app.getHttpServer()).get(`/api/v1/preview/pages/${encodeURIComponent(token)}`);
  }

  /** Firma un JWT di anteprima "a mano", con lo stesso segreto/claim reali — utile per manipolare exp/purpose senza passare dall'endpoint di emissione. */
  function signPreviewToken(
    payload: Partial<{ pageGuid: string; purpose: string }>,
    options: { expiresIn: StringValue } = { expiresIn: '15m' },
  ): string {
    return jwt.sign(
      { pageGuid: payload.pageGuid, purpose: payload.purpose ?? 'page-preview' },
      AppConstants.pagePreviewTokenSecret,
      { expiresIn: options.expiresIn },
    );
  }

  // ─── 1. Happy path + RBAC/ownership sull'emissione ─────────────────────

  describe('POST .../preview-token — happy path, 1 errore, 1 RBAC', () => {
    it('happy path: autore genera il token della propria bozza (200, token + expiresAt a ~15 minuti)', async () => {
      const author = await seedAuth(AppUserRoles.User, 'issue-happy');
      const page = await createDraftPage(author, { title: 'Bozza propria' });

      const res = await issuePreviewToken(author, page.guid).expect(200);

      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBeGreaterThan(10);
      const expiresAt = new Date(res.body.expiresAt as string).getTime();
      const deltaMs = expiresAt - Date.now();
      // Tolleranza ampia (10s-16min) per non rendere il test fragile su un
      // orologio di CI lento, ma sufficiente a escludere scadenze assurde (es. 1h).
      expect(deltaMs).toBeGreaterThan(10_000);
      expect(deltaMs).toBeLessThanOrEqual(16 * 60 * 1000);
    });

    it('errore: guid inesistente risponde 404 (mai un token per una pagina che non esiste)', async () => {
      const author = await seedAuth(AppUserRoles.User, 'issue-404');

      const res = await issuePreviewToken(author, 'ffffffffffffffff');

      expect(res.status).toBe(404);
    });

    it("RBAC/ownership: un autore non genera l'anteprima della bozza di un altro autore (403, nessun token emesso)", async () => {
      const owner = await seedAuth(AppUserRoles.User, 'issue-owner');
      const other = await seedAuth(AppUserRoles.User, 'issue-other');
      const page = await createDraftPage(owner, { title: 'Bozza altrui' });

      const res = await issuePreviewToken(other, page.guid);

      expect(res.status).toBe(403);
      expect(res.body.token).toBeUndefined();
    });

    it('RBAC di stato: un autore non genera l\'anteprima della propria pagina se non è più "draft" (403)', async () => {
      const author = await seedAuth(AppUserRoles.User, 'issue-state-author');
      const page = await createDraftPage(author, { title: 'Bozza poi in review' });
      // Unica transizione ammessa a un User sulla propria riga (pages.state-machine.ts).
      await authedRequest('post', `/api/v1/app/pages/${page.guid}/status`, author)
        .send({ status: 'review' })
        .expect(200);

      const res = await issuePreviewToken(author, page.guid);

      expect(res.status).toBe(403);
    });
  });

  // ─── 2. 404 uniforme sulla lettura — priorità assoluta di T6 ───────────

  describe('GET preview/pages/:token — 404 uniforme, mai 401/403 (ADR-25 § 3, PRIORITÀ ASSOLUTA)', () => {
    it('token scaduto: 404 (mai 401)', async () => {
      const author = await seedAuth(AppUserRoles.User, 'read-expired');
      const page = await createDraftPage(author, { title: 'Bozza per token scaduto' });
      const expiredToken = signPreviewToken({ pageGuid: page.guid }, { expiresIn: '-1s' });

      const res = await readPreview(expiredToken);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('token con firma alterata: 404 (mai 401)', async () => {
      const author = await seedAuth(AppUserRoles.User, 'read-tampered');
      const page = await createDraftPage(author, { title: 'Bozza per firma alterata' });
      const issued = await issuePreviewToken(author, page.guid).expect(200);
      const validToken = issued.body.token as string;
      const tamperedToken = `${validToken.slice(0, -4)}${validToken.slice(-4) === 'aaaa' ? 'bbbb' : 'aaaa'}`;

      const res = await readPreview(tamperedToken);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('pagina inesistente (token altrimenti valido, pageGuid a caso): 404 (mai 401)', async () => {
      const nonexistentPageToken = signPreviewToken({ pageGuid: 'ffffffffffffffff' });

      const res = await readPreview(nonexistentPageToken);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('pagina soft-eliminata (token valido emesso PRIMA della cancellazione): 404 (mai 401)', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'read-deleted');
      const page = await createDraftPage(admin, { title: 'Bozza poi eliminata' });
      const issued = await issuePreviewToken(admin, page.guid).expect(200);
      const token = issued.body.token as string;

      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);

      const res = await readPreview(token);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('i quattro motivi di rifiuto producono lo STESSO status (404) e possibilmente lo stesso body', async () => {
      const author = await seedAuth(AppUserRoles.User, 'uniform-body');
      const page = await createDraftPage(author, { title: 'Bozza per uniformità' });
      const issued = await issuePreviewToken(author, page.guid).expect(200);
      const validToken = issued.body.token as string;

      const expiredRes = await readPreview(
        signPreviewToken({ pageGuid: page.guid }, { expiresIn: '-1s' }),
      );
      const tamperedRes = await readPreview(
        `${validToken.slice(0, -4)}${validToken.slice(-4) === 'aaaa' ? 'bbbb' : 'aaaa'}`,
      );
      const nonexistentRes = await readPreview(signPreviewToken({ pageGuid: 'ffffffffffffffff' }));

      // Soft delete richiede Admin+: l'autore User non può eliminare la propria pagina.
      const admin = await seedAuth(AppUserRoles.Admin, 'uniform-body-admin');
      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);
      const softDeletedRes = await readPreview(validToken);

      const statuses = [
        expiredRes.status,
        tamperedRes.status,
        nonexistentRes.status,
        softDeletedRes.status,
      ];
      expect(statuses).toEqual([404, 404, 404, 404]);

      const strip = (body: Record<string, unknown>): Record<string, unknown> => {
        const { timestamp, path, ...rest } = body;
        void timestamp;
        void path;
        return rest;
      };
      expect(strip(expiredRes.body)).toEqual(strip(tamperedRes.body));
      expect(strip(tamperedRes.body)).toEqual(strip(nonexistentRes.body));
      expect(strip(nonexistentRes.body)).toEqual(strip(softDeletedRes.body));
    });
  });

  // ─── 3. Happy path lettura + lettura live (non snapshot) ────────────────

  describe('GET preview/pages/:token — happy path e lettura live del draft corrente', () => {
    it('happy path: token valido -> 200 con il contenuto della bozza corrente', async () => {
      const author = await seedAuth(AppUserRoles.User, 'read-happy');
      const page = await createDraftPage(author, {
        title: 'Bozza visibile in anteprima',
        slug: 'bozza-anteprima-happy',
        draftContent: safeContentTree('Contenuto iniziale'),
      });
      const issued = await issuePreviewToken(author, page.guid).expect(200);

      const res = await readPreview(issued.body.token as string);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Bozza visibile in anteprima');
      expect(res.body.slug).toBe('bozza-anteprima-happy');
      expect(JSON.stringify(res.body.content)).toMatch(/Contenuto iniziale/);
    });

    it(
      "draft modificato dopo l'emissione del token resta leggibile fino a scadenza: la lettura è " +
        "SEMPRE quella corrente (live), non uno snapshot al momento dell'emissione",
      async () => {
        const author = await seedAuth(AppUserRoles.User, 'read-live');
        const page = await createDraftPage(author, {
          title: 'Titolo iniziale',
          draftContent: safeContentTree('Contenuto prima della modifica'),
        });
        const issued = await issuePreviewToken(author, page.guid).expect(200);
        const token = issued.body.token as string;

        // La bozza cambia DOPO l'emissione del token, con lo stesso token già in mano.
        await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, author)
          .send({
            version: page.version,
            title: 'Titolo aggiornato dopo il token',
            draftContent: safeContentTree('Contenuto dopo la modifica'),
          })
          .expect(200);

        const res = await readPreview(token);

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Titolo aggiornato dopo il token');
        expect(JSON.stringify(res.body.content)).toMatch(/Contenuto dopo la modifica/);
        expect(JSON.stringify(res.body.content)).not.toMatch(/Contenuto prima della modifica/);
      },
    );

    it('nessuna cache: due letture consecutive riflettono comunque il draft più recente', async () => {
      const author = await seedAuth(AppUserRoles.User, 'read-nocache');
      const page = await createDraftPage(author, {
        title: 'Bozza senza cache',
        draftContent: safeContentTree('Versione A'),
      });
      const issued = await issuePreviewToken(author, page.guid).expect(200);
      const token = issued.body.token as string;

      const firstRead = await readPreview(token).expect(200);
      expect(JSON.stringify(firstRead.body.content)).toMatch(/Versione A/);

      await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, author)
        .send({ version: page.version, draftContent: safeContentTree('Versione B') })
        .expect(200);

      const secondRead = await readPreview(token).expect(200);
      expect(JSON.stringify(secondRead.body.content)).toMatch(/Versione B/);
      expect(JSON.stringify(secondRead.body.content)).not.toMatch(/Versione A/);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
