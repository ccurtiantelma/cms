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
import {
  AppUserRoles,
  SiteTemplateType,
  DisplayConditionType,
  DisplayConditionTarget,
} from '../../src/common/enums';
import { siteTemplateEntity, userEntity } from '../../src/db/schema';
import { ENVELOPE_VERSION } from '../../src/blocks/migration/envelope-migration.engine';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test e2e di integrazione di `app/site-templates`/`public/site-templates/resolve`
 * (RFC-40 Opzione B, ADR-64). `SiteTemplatesModule` non dipende da `ExportService`
 * (verificato leggendo `site-templates.module.ts`: importa solo `DbModule` e
 * `BlocksModule`, nessuno dei due tocca la coda `static-export`) — a differenza
 * di `global-sections.e2e-spec.ts`, qui nessun `.overrideProvider(ExportService)`
 * è necessario, stesso pattern di `pages-workflow.e2e-spec.ts` (moduli che non
 * dipendono dalla coda export non la mockano).
 */
describe('SiteTemplatesController / PublicSiteTemplatesController (e2e) — RFC-40 Opzione B / ADR-64', () => {
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

  // ─── Helpers (stesso pattern di global-sections.e2e-spec.ts) ───────────

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
        email: `site-templates.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  /** Content ordinario minimale: un `heading` valido. */
  function headingContent(text: string): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [{ id: 'h1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] }],
    };
  }

  /** Content con un blocco `richText` il cui `html` porta un payload XSS noto. */
  function maliciousContent(html: string): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [{ id: 'rt1', type: 'richText', v: 1, props: { html }, children: [] }],
    };
  }

  async function createTemplate(
    auth: Auth,
    overrides: Partial<{
      title: string;
      type: SiteTemplateType;
      contentTree: Record<string, unknown>;
      isPublished: boolean;
      language: string;
      priority: number;
      displayConditions: unknown[];
    }> = {},
  ): Promise<{ guid: string; version: number }> {
    const res = await authedRequest('post', '/api/v1/app/site-templates', auth)
      .send({
        title: overrides.title ?? 'Template E2E',
        type: overrides.type ?? SiteTemplateType.SinglePage,
        contentTree: overrides.contentTree ?? headingContent('Contenuto'),
        isPublished: overrides.isPublished,
        language: overrides.language,
        priority: overrides.priority,
        displayConditions: overrides.displayConditions,
      })
      .expect(201);
    return { guid: res.body.guid as string, version: res.body.version as number };
  }

  // ─── POST /app/site-templates — happy path ──────────────────────────────

  it('POST con contentTree valido crea il Template (201)', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'create-ok');

    const res = await authedRequest('post', '/api/v1/app/site-templates', manager)
      .send({
        title: 'Template risultati ricerca',
        type: SiteTemplateType.SearchResults,
        contentTree: headingContent('Risultati'),
      })
      .expect(201);

    expect(res.body).toHaveProperty('guid');
    expect(res.body.type).toBe(SiteTemplateType.SearchResults);
    expect(res.body.version).toBe(1);
  });

  // ─── POST — validazione albero blocchi ──────────────────────────────────

  it('POST con type di blocco sconosciuto nel contentTree è respinto per intero (400) col path del nodo colpevole', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'create-unknown-type');

    const res = await authedRequest('post', '/api/v1/app/site-templates', manager)
      .send({
        title: 'Template con blocco sconosciuto',
        type: SiteTemplateType.SinglePage,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [{ id: 'x1', type: 'nonEsiste', v: 1, props: {}, children: [] }],
        },
      })
      .expect(400);

    expect(res.body.code).toBe('BLOCK_TYPE_UNKNOWN');
    expect(res.body.details).toMatchObject({ path: 'blocks[0]' });
  });

  it('POST con annidamento non ammesso (heading dentro heading) è respinto per intero (400) col path del nodo colpevole', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'create-nesting');

    const res = await authedRequest('post', '/api/v1/app/site-templates', manager)
      .send({
        title: 'Template con annidamento vietato',
        type: SiteTemplateType.SinglePage,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [
            {
              id: 'h1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: 'Padre' },
              children: [
                {
                  id: 'h2',
                  type: 'heading',
                  v: 1,
                  props: { level: 'h3', text: 'Figlio' },
                  children: [],
                },
              ],
            },
          ],
        },
      })
      .expect(400);

    expect(res.body.code).toBe('BLOCK_NESTING_NOT_ALLOWED');
    expect(res.body.details).toMatchObject({ path: 'blocks[0].children[0]' });
  });

  it('POST con props malformate (heading senza "level" obbligatoria) è respinto per intero (400)', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'create-malformed-props');

    const res = await authedRequest('post', '/api/v1/app/site-templates', manager)
      .send({
        title: 'Template con props malformate',
        type: SiteTemplateType.SinglePage,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [
            { id: 'h1', type: 'heading', v: 1, props: { text: 'Manca level' }, children: [] },
          ],
        },
      })
      .expect(400);

    expect(res.body.code).toBe('BLOCK_PROP_INVALID');
    expect(res.body.details).toMatchObject({ path: 'blocks[0].props.level', reason: 'required' });
  });

  // ─── POST — sanitizzazione XSS a database ───────────────────────────────

  it('un payload XSS noto (script/onerror/javascript:) è neutralizzato nel jsonb persistito, mai solo nella risposta HTTP', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'xss');
    const malicious =
      '<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">click</a>';

    const res = await authedRequest('post', '/api/v1/app/site-templates', manager)
      .send({
        title: 'Template con XSS',
        type: SiteTemplateType.SinglePage,
        contentTree: maliciousContent(malicious),
      })
      .expect(201);

    const db = getTestDb();
    const dbRow = await db.query.siteTemplateEntity.findFirst({
      where: eq(siteTemplateEntity.guid, res.body.guid as string),
    });
    const persisted = JSON.stringify(dbRow!.contentTree);

    expect(persisted).not.toMatch(/<script/i);
    expect(persisted).not.toMatch(/onerror\s*=/i);
    expect(persisted).not.toMatch(/javascript:/i);
    expect(persisted).not.toMatch(/<img/i);
  });

  // ─── RBAC ────────────────────────────────────────────────────────────────

  it('POST senza token è 401 (JWT middleware globale su app/*)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app/site-templates')
      .send({
        title: 'Senza token',
        type: SiteTemplateType.SinglePage,
        contentTree: headingContent('x'),
      })
      .expect(401);
  });

  it('POST con ruolo User (30, sotto la soglia Manager) è 403: nessun Template creato', async () => {
    const author = await seedAuth(AppUserRoles.User, 'rbac-forbidden');

    await authedRequest('post', '/api/v1/app/site-templates', author)
      .send({
        title: 'Tentativo non autorizzato',
        type: SiteTemplateType.SinglePage,
        contentTree: headingContent('x'),
      })
      .expect(403);
  });

  it('un ruolo Manager+ (es. Admin) può creare/gestire Template di tema', async () => {
    const admin = await seedAuth(AppUserRoles.Admin, 'rbac-admin-ok');

    await authedRequest('post', '/api/v1/app/site-templates', admin)
      .send({
        title: 'Creato da Admin',
        type: SiteTemplateType.SinglePage,
        contentTree: headingContent('x'),
      })
      .expect(201);
  });

  // ─── GET :guid — 404 ─────────────────────────────────────────────────────

  it('GET di un guid inesistente è 404', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'not-found');

    await authedRequest('get', '/api/v1/app/site-templates/0000000000000000', manager).expect(404);
  });

  it('GET di un Template soft-eliminato è 404 (non più raggiungibile da findOne/findAll)', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'soft-delete-unreachable');
    const { guid } = await createTemplate(manager, { title: 'Da eliminare' });

    await authedRequest('delete', `/api/v1/app/site-templates/${guid}`, manager).expect(204);

    await authedRequest('get', `/api/v1/app/site-templates/${guid}`, manager).expect(404);

    const list = await authedRequest('get', '/api/v1/app/site-templates', manager).expect(200);
    const guids = (list.body.items as Array<{ guid: string }>).map((t) => t.guid);
    expect(guids).not.toContain(guid);
  });

  // ─── findAll — filtri e paginazione ──────────────────────────────────────

  it('GET filtra per type/language/isPublished e cerca per titolo (q)', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'filters');
    await createTemplate(manager, {
      title: 'Ricerca prodotti',
      type: SiteTemplateType.SearchResults,
      language: 'IT',
      isPublished: true,
    });
    await createTemplate(manager, {
      title: 'Pagina singola',
      type: SiteTemplateType.SinglePage,
      language: 'EN',
      isPublished: false,
    });

    const byType = await authedRequest(
      'get',
      `/api/v1/app/site-templates?type=${SiteTemplateType.SearchResults}`,
      manager,
    ).expect(200);
    expect(byType.body.items).toHaveLength(1);
    expect(byType.body.items[0].title).toBe('Ricerca prodotti');

    const byLanguage = await authedRequest(
      'get',
      '/api/v1/app/site-templates?language=EN',
      manager,
    ).expect(200);
    expect(byLanguage.body.items).toHaveLength(1);
    expect(byLanguage.body.items[0].title).toBe('Pagina singola');

    const byPublished = await authedRequest(
      'get',
      '/api/v1/app/site-templates?isPublished=true',
      manager,
    ).expect(200);
    expect(byPublished.body.items).toHaveLength(1);
    expect(byPublished.body.items[0].title).toBe('Ricerca prodotti');

    const byQuery = await authedRequest(
      'get',
      '/api/v1/app/site-templates?q=singola',
      manager,
    ).expect(200);
    expect(byQuery.body.items).toHaveLength(1);
    expect(byQuery.body.items[0].title).toBe('Pagina singola');
  });

  // ─── Concorrenza — 409 senza perdita della prima modifica ──────────────

  it('due PATCH concorrenti sulla stessa bozza: il secondo (version obsoleta) riceve 409, la modifica del primo resta persistita', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'conflict');
    const { guid, version } = await createTemplate(manager, { title: 'Template concorrenza' });

    const firstPatch = await authedRequest('patch', `/api/v1/app/site-templates/${guid}`, manager)
      .send({ version, title: 'Vince il primo' })
      .expect(200);
    expect(firstPatch.body.version).toBe(version + 1);

    const secondPatch = await authedRequest('patch', `/api/v1/app/site-templates/${guid}`, manager)
      .send({ version, title: 'Perso: mai persistito' })
      .expect(409);
    expect(secondPatch.body.code).toBe('SITE_TEMPLATE_VERSION_CONFLICT');

    const readBack = await authedRequest(
      'get',
      `/api/v1/app/site-templates/${guid}`,
      manager,
    ).expect(200);
    expect(readBack.body.title).toBe('Vince il primo');
  });

  // ─── PATCH — validazione ────────────────────────────────────────────────

  it('PATCH con contentTree malformato è respinto (400), nessuna modifica persistita', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'patch-malformed');
    const { guid, version } = await createTemplate(manager, { title: 'Template originale' });

    await authedRequest('patch', `/api/v1/app/site-templates/${guid}`, manager)
      .send({
        version,
        contentTree: {
          version: ENVELOPE_VERSION,
          blocks: [{ id: 'x1', type: 'nonEsiste', v: 1, props: {}, children: [] }],
        },
      })
      .expect(400);

    const readBack = await authedRequest(
      'get',
      `/api/v1/app/site-templates/${guid}`,
      manager,
    ).expect(200);
    expect(readBack.body.title).toBe('Template originale');
    expect(readBack.body.version).toBe(version);
  });

  // ─── DELETE — RBAC ───────────────────────────────────────────────────────

  it('DELETE con ruolo User è 403, il Template resta attivo', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'delete-setup');
    const { guid } = await createTemplate(manager, { title: 'Template protetto' });
    const author = await seedAuth(AppUserRoles.User, 'delete-rbac');

    await authedRequest('delete', `/api/v1/app/site-templates/${guid}`, author).expect(403);

    await authedRequest('get', `/api/v1/app/site-templates/${guid}`, manager).expect(200);
  });

  // ─── Superficie pubblica — POST public/site-templates/resolve ──────────

  it('la superficie pubblica risolve senza alcun token/cookie (anonima)', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'public-anon');
    await createTemplate(manager, {
      title: 'Template pubblicato',
      type: SiteTemplateType.SinglePage,
      isPublished: true,
      language: 'IT',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/site-templates/resolve')
      .send({ path: '/qualsiasi-rotta', type: SiteTemplateType.SinglePage, lang: 'IT' })
      .expect(200);

    expect(res.body).toHaveProperty('guid');
    expect(res.body.isPublished).toBe(true);
  });

  it('la superficie pubblica risponde 404 (mai 403) quando nessun Template è applicabile alla rotta richiesta', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/public/site-templates/resolve')
      .send({ path: '/nessun-template', type: SiteTemplateType.SinglePage, lang: 'IT' })
      .expect(404);
  });

  it('una bozza non pubblicata (isPublished=false) non è mai risolta dalla superficie pubblica: 404, mai raggiungibile', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'public-unpublished');
    await createTemplate(manager, {
      title: 'Bozza non pubblicata',
      type: SiteTemplateType.SinglePage,
      isPublished: false,
      language: 'IT',
    });

    await request(app.getHttpServer())
      .post('/api/v1/public/site-templates/resolve')
      .send({ path: '/qualsiasi', type: SiteTemplateType.SinglePage, lang: 'IT' })
      .expect(404);
  });

  it('la superficie pubblica applica le displayConditions (exclude vince su include) e risponde 404 se il path è escluso', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'public-exclude');
    await createTemplate(manager, {
      title: 'Template con esclusione',
      type: SiteTemplateType.SinglePage,
      isPublished: true,
      language: 'IT',
      displayConditions: [
        { type: DisplayConditionType.Include, target: DisplayConditionTarget.EntireSite },
        {
          type: DisplayConditionType.Exclude,
          target: DisplayConditionTarget.SpecificPage,
          value: '/escluso',
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/api/v1/public/site-templates/resolve')
      .send({ path: '/escluso', type: SiteTemplateType.SinglePage, lang: 'IT' })
      .expect(404);

    // `@HttpCode(HttpStatus.OK)` in `PublicSiteTemplatesController.resolve`: 200, non il
    // default 201 di una POST — stesso contratto già verificato nel test "la superficie
    // pubblica risolve senza alcun token/cookie (anonima)".
    await request(app.getHttpServer())
      .post('/api/v1/public/site-templates/resolve')
      .send({ path: '/altra-rotta', type: SiteTemplateType.SinglePage, lang: 'IT' })
      .expect(200);
  });

  it('type "single_post"/"archive" (fuori da RESOLVABLE_SITE_TEMPLATE_TYPES) sono sempre 404 sulla superficie pubblica, anche con Template pubblicati di quel type', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'public-non-resolvable');
    await createTemplate(manager, {
      title: 'Template single_post, senza semantica di risoluzione',
      type: SiteTemplateType.SinglePost,
      isPublished: true,
      language: 'IT',
    });

    await request(app.getHttpServer())
      .post('/api/v1/public/site-templates/resolve')
      .send({ path: '/qualsiasi', type: SiteTemplateType.SinglePost, lang: 'IT' })
      .expect(404);
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
