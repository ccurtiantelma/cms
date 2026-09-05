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
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { userEntity } from '../../src/db/schema';
import { ExportService } from '../../src/export/export.service';
import { ENVELOPE_VERSION } from '../../src/blocks/migration/envelope-migration.engine';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test e2e di integrazione di `app/global-sections`/`public/global-sections`
 * (ADR-55, fix invalidazione + `globalRef`). `ExportService` è sovrascritto
 * con un mock Jest (stesso pattern di `pages-blocks-registry-di.e2e-spec.ts`,
 * `.overrideProvider(...).useValue(...)`): la coda BullMQ `static-export` è
 * un confine esterno da mockare (Testing Policy), non un comportamento da
 * esercitare end-to-end qui — il suo processor ha copertura propria.
 *
 * **Nota di dominio verificata a codice (non assunta)**: `globalRef` non è
 * mai un contenuto ammesso per una Sezione Globale — `runWriteContentPipeline`
 * imposta sempre `insideGlobalSection: true` per questo servizio, mai
 * condizionalmente (ADR-55, "Cicli chiusi per contratto"). Il caso di
 * successo con `globalRef` (contesto senza `insideGlobalSection`) è quindi
 * quello di una Pagina, coperto a livello di validator unit test — non da
 * questa suite, che verifica invece che lo stesso nodo sia **sempre
 * respinto** quando il content appartiene a una Sezione Globale.
 */
describe('GlobalSectionsController / PublicGlobalSectionsController (e2e) — ADR-55', () => {
  let app: INestApplication;
  let exportServiceMock: { enqueueFullSiteExport: jest.Mock };

  beforeAll(async () => {
    await runMigrations();

    exportServiceMock = { enqueueFullSiteExport: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ExportService)
      .useValue(exportServiceMock)
      .compile();

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
    exportServiceMock.enqueueFullSiteExport.mockClear();
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
        email: `global-sections.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  /** Content ordinario minimale (nessun `globalRef`): un `heading` valido. */
  function ordinaryContent(text: string): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [
        { id: 'h1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] },
      ],
    };
  }

  /** Content con un nodo `globalRef` (guid di forma valida) — sempre vietato dentro una Sezione Globale (ADR-55). */
  function globalRefContent(): Record<string, unknown> {
    return {
      version: ENVELOPE_VERSION,
      blocks: [
        {
          id: 'gr1',
          type: 'globalRef',
          v: 1,
          props: { globalSectionGuid: '0123456789abcdef' },
          children: [],
        },
      ],
    };
  }

  // ─── POST /app/global-sections — happy path + export accodato ──────────

  it('POST con content ordinario (nessun globalRef) crea la Sezione Globale (201) e accoda sempre il full-site export, anche con layoutSlot di default "none"', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'create-ok');

    const res = await authedRequest('post', '/api/v1/app/global-sections', manager)
      .send({ title: 'Blocco promo E2E', content: ordinaryContent('Promo') })
      .expect(201);

    expect(res.body).toHaveProperty('guid');
    expect(res.body.layoutSlot).toBe('none');
    expect(exportServiceMock.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
  });

  // ─── POST /app/global-sections — globalRef sempre respinto ─────────────

  it('POST con un nodo globalRef nel content è respinto per intero (400, BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION): nessuna Sezione creata, nessun export accodato', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'create-globalref-rejected');

    const res = await authedRequest('post', '/api/v1/app/global-sections', manager)
      .send({ title: 'Sezione con ciclo vietato', content: globalRefContent() })
      .expect(400);

    expect(res.body.code).toBe('BLOCK_TYPE_NOT_ALLOWED_IN_GLOBAL_SECTION');
    expect(exportServiceMock.enqueueFullSiteExport).not.toHaveBeenCalled();
  });

  // ─── RBAC ────────────────────────────────────────────────────────────────

  it('POST senza token è 401 (JWT middleware globale su app/*)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app/global-sections')
      .send({ title: 'Senza token', content: ordinaryContent('x') })
      .expect(401);
  });

  it('POST con ruolo User (30, sotto la soglia Manager) è 403: nessuna Sezione Globale creata da un autore', async () => {
    const author = await seedAuth(AppUserRoles.User, 'rbac-forbidden');

    await authedRequest('post', '/api/v1/app/global-sections', author)
      .send({ title: 'Tentativo non autorizzato', content: ordinaryContent('x') })
      .expect(403);

    expect(exportServiceMock.enqueueFullSiteExport).not.toHaveBeenCalled();
  });

  // ─── 404 ─────────────────────────────────────────────────────────────────

  it('GET di un guid inesistente è 404', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'not-found');

    await authedRequest('get', '/api/v1/app/global-sections/0000000000000000', manager).expect(404);
  });

  // ─── Concorrenza — 409 senza perdita della prima modifica ──────────────

  it('due PATCH concorrenti sulla stessa Sezione: il secondo (version obsoleta) riceve 409, la modifica del primo resta persistita (nessuna perdita, nessun overwrite silenzioso)', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'conflict');

    const created = await authedRequest('post', '/api/v1/app/global-sections', manager)
      .send({ title: 'Sezione concorrenza', content: ordinaryContent('Prima') })
      .expect(201);
    const { guid, version } = created.body as { guid: string; version: number };

    const firstPatch = await authedRequest('patch', `/api/v1/app/global-sections/${guid}`, manager)
      .send({ version, content: ordinaryContent('Vince il primo') })
      .expect(200);
    expect(firstPatch.body.version).toBe(version + 1);

    // Stessa `version` di partenza (obsoleta dopo il primo PATCH): simula un secondo
    // editor che aveva caricato la Sezione prima dell'aggiornamento del primo.
    const secondPatch = await authedRequest(
      'patch',
      `/api/v1/app/global-sections/${guid}`,
      manager,
    )
      .send({ version, content: ordinaryContent('Perso: mai persistito') })
      .expect(409);
    expect(secondPatch.body.code).toBe('GLOBAL_SECTION_VERSION_CONFLICT');

    const readBack = await authedRequest(
      'get',
      `/api/v1/app/global-sections/${guid}`,
      manager,
    ).expect(200);
    const persistedBlocks = (
      readBack.body.content as { blocks: Array<{ props: { text?: string } }> }
    ).blocks;
    expect(persistedBlocks[0].props.text).toBe('Vince il primo');
  });

  // ─── Superficie pubblica — nessuna regressione ─────────────────────────

  it('GET public/global-sections/active risponde 200 senza JWT, legge dal DB (nessuna cache, ADR-55)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/global-sections/active')
      .expect(200);

    expect(res.body).toHaveProperty('header');
    expect(res.body).toHaveProperty('footer');
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
