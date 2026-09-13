import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import { networkMocks } from './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { userEntity } from '../../src/db/schema';
import { ExportService } from '../../src/export/export.service';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Eventi di export statico delle Pagine (ADR-67) contro Postgres/Redis reali.
 * Sostituisce la suite di cache/invalidazione di ADR-23: con ADR-53 la
 * freschezza del sito pubblico non dipende da chiavi Redis ma dai job
 * `static-export`, quindi ogni scrittura che cambia contenuto pubblico deve
 * accodare l'export o il tombstone giusto, con il percorso giusto.
 *
 * `ExportService` è sovrascritto con un mock (stesso pattern di
 * `global-sections.e2e-spec.ts`): la coda è un confine da mockare, il suo
 * processor ha copertura propria. Throttler disattivato: queste richieste non
 * verificano il rate limit (coperto in `public-pages.e2e-spec.ts`).
 */
describe('Superficie pubblica delle Pagine — eventi di export statico (e2e, ADR-67)', () => {
  let app: INestApplication;
  let exportServiceMock: {
    enqueuePageExport: jest.Mock;
    enqueuePageTombstone: jest.Mock;
    enqueueFullSiteExport: jest.Mock;
  };

  beforeAll(async () => {
    await runMigrations();

    exportServiceMock = {
      enqueuePageExport: jest.fn().mockResolvedValue(undefined),
      enqueuePageTombstone: jest.fn().mockResolvedValue(undefined),
      enqueueFullSiteExport: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ExportService)
      .useValue(exportServiceMock)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
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
    Object.values(exportServiceMock).forEach((mock) => mock.mockClear());
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
        email: `public-pages-export.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    auth: Auth,
  ): request.Test {
    return (request(app.getHttpServer())[method](path) as request.Test)
      .set('Authorization', auth.bearer)
      .set('Cookie', auth.cookie);
  }

  function safeContentTree(text = 'Testo lecito'): Record<string, unknown> {
    return {
      version: 1,
      blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] }],
    };
  }

  async function createDraftPage(
    auth: Auth,
    overrides: Partial<{ title: string; slug: string; parentGuid: string }> = {},
  ): Promise<{ guid: string; version: number; [k: string]: unknown }> {
    const res = await authedRequest('post', '/api/v1/app/pages', auth)
      .send({
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: 'it-IT',
        parentGuid: overrides.parentGuid,
        draftContent: safeContentTree(),
      })
      .expect(201);
    return res.body;
  }

  function changeStatus(auth: Auth, guid: string, status: string): request.Test {
    return authedRequest('post', `/api/v1/app/pages/${guid}/status`, auth).send({ status });
  }

  function publicGet(path: string): request.Test {
    return request(app.getHttpServer()).get(
      `/api/v1/public/pages?path=${encodeURIComponent(path)}`,
    );
  }

  // ─── Transizioni di stato ───────────────────────────────────────────────

  describe('Transizioni di stato: export o tombstone della sola Pagina', () => {
    it("pubblicazione: accoda l'export sul percorso della Pagina", async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'publish');
      const page = await createDraftPage(manager, { slug: 'prova-pubblicazione' });

      await changeStatus(manager, page.guid, 'published').expect(200);

      expect(exportServiceMock.enqueuePageExport).toHaveBeenCalledWith(
        page.guid,
        'it-IT',
        '/prova-pubblicazione',
      );
      expect(exportServiceMock.enqueuePageTombstone).not.toHaveBeenCalled();
    });

    it('spubblicazione (published -> draft): accoda il tombstone, la pagina torna 404', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'unpublish');
      const page = await createDraftPage(manager, { slug: 'prova-spubblicazione' });
      await changeStatus(manager, page.guid, 'published').expect(200);

      await changeStatus(manager, page.guid, 'draft').expect(200);

      expect(exportServiceMock.enqueuePageTombstone).toHaveBeenCalledWith(
        page.guid,
        'it-IT',
        '/prova-spubblicazione',
      );
      await publicGet('/prova-spubblicazione').expect(404);
    });

    it('archiviazione: accoda il tombstone, la pagina torna 404 (mai servita stantia)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'archive');
      const page = await createDraftPage(manager, { slug: 'prova-archiviazione' });
      await changeStatus(manager, page.guid, 'published').expect(200);

      await changeStatus(manager, page.guid, 'archived').expect(200);

      expect(exportServiceMock.enqueuePageTombstone).toHaveBeenCalledWith(
        page.guid,
        'it-IT',
        '/prova-archiviazione',
      );
      await publicGet('/prova-archiviazione').expect(404);
    });

    it("ripubblicazione: la lettura pubblica riflette subito l'ultima Revisione, senza cache", async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'republish');
      const page = await createDraftPage(manager, { slug: 'prova-ripubblicazione' });
      await changeStatus(manager, page.guid, 'published').expect(200);
      await publicGet('/prova-ripubblicazione').expect(200);

      const afterDraft = await changeStatus(manager, page.guid, 'draft').expect(200);
      await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager)
        .send({ version: afterDraft.body.version, draftContent: safeContentTree('Versione 2') })
        .expect(200);
      await changeStatus(manager, page.guid, 'published').expect(200);

      const res = await publicGet('/prova-ripubblicazione').expect(200);
      expect(JSON.stringify(res.body.content)).toMatch(/Versione 2/);
      expect(exportServiceMock.enqueuePageExport).toHaveBeenCalledTimes(2);
    });

    it('una Pagina mai pubblicata che cambia stato non accoda alcun tombstone', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'never-published');
      const page = await createDraftPage(manager, { slug: 'mai-pubblicata' });

      await changeStatus(manager, page.guid, 'review').expect(200);
      await changeStatus(manager, page.guid, 'draft').expect(200);

      expect(exportServiceMock.enqueuePageTombstone).not.toHaveBeenCalled();
    });
  });

  // ─── Percorsi che cambiano ───────────────────────────────────────────────

  describe('Cambio di percorso e soft delete: tombstone dei vecchi file più rebuild', () => {
    it('cambio slug: tombstone del vecchio percorso e rebuild completo; il vecchio percorso torna 404', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'slug');
      const page = await createDraftPage(manager, { slug: 'slug-vecchio' });
      const published = await changeStatus(manager, page.guid, 'published').expect(200);

      await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager)
        .send({ version: published.body.version, slug: 'slug-nuovo' })
        .expect(200);

      expect(exportServiceMock.enqueuePageTombstone).toHaveBeenCalledWith(
        page.guid,
        'it-IT',
        '/slug-vecchio',
      );
      expect(exportServiceMock.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
      await publicGet('/slug-vecchio').expect(404);
      await publicGet('/slug-nuovo').expect(200);
    });

    it('reparenting: tombstone di ogni discendente pubblicato al vecchio percorso', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'reparent');
      const parent = await createDraftPage(manager, { title: 'Genitore', slug: 'genitore' });
      await changeStatus(manager, parent.guid, 'published').expect(200);
      const child = await createDraftPage(manager, {
        title: 'Figlio',
        slug: 'figlio',
        parentGuid: parent.guid,
      });
      await changeStatus(manager, child.guid, 'published').expect(200);
      const grandchild = await createDraftPage(manager, {
        title: 'Nipote',
        slug: 'nipote',
        parentGuid: child.guid,
      });
      const grandchildPublished = await changeStatus(manager, grandchild.guid, 'published').expect(
        200,
      );
      expect(grandchildPublished.body.guid).toBe(grandchild.guid);

      const childRow = await authedRequest(
        'get',
        `/api/v1/app/pages/${child.guid}`,
        manager,
      ).expect(200);
      await authedRequest('patch', `/api/v1/app/pages/${child.guid}`, manager)
        .send({ version: childRow.body.version, parentGuid: null })
        .expect(200);

      expect(exportServiceMock.enqueuePageTombstone).toHaveBeenCalledWith(
        child.guid,
        'it-IT',
        '/genitore/figlio',
      );
      expect(exportServiceMock.enqueuePageTombstone).toHaveBeenCalledWith(
        grandchild.guid,
        'it-IT',
        '/genitore/figlio/nipote',
      );
      expect(exportServiceMock.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
      await publicGet('/figlio/nipote').expect(200);
    });

    it('soft delete di una Pagina pubblicata: tombstone e rebuild, la pagina torna 404', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'delete');
      const page = await createDraftPage(admin, { slug: 'prova-soft-delete' });
      await changeStatus(admin, page.guid, 'published').expect(200);

      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);

      expect(exportServiceMock.enqueuePageTombstone).toHaveBeenCalledWith(
        page.guid,
        'it-IT',
        '/prova-soft-delete',
      );
      expect(exportServiceMock.enqueueFullSiteExport).toHaveBeenCalledTimes(1);
      await publicGet('/prova-soft-delete').expect(404);
    });

    it('soft delete o cambio slug di una bozza: nessun job, nessun file esisteva', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'draft-delete');
      const page = await createDraftPage(admin, { slug: 'bozza' });
      await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, admin)
        .send({ version: page.version, slug: 'bozza-rinominata' })
        .expect(200);

      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);

      expect(exportServiceMock.enqueuePageTombstone).not.toHaveBeenCalled();
      expect(exportServiceMock.enqueueFullSiteExport).not.toHaveBeenCalled();
    });
  });

  // ─── Traduzioni ──────────────────────────────────────────────────────────

  describe('Traduzioni: il file delle traduzioni pubblicate va riscritto (hreflang)', () => {
    it('pubblicare una traduzione riesporta la traduzione sorella già pubblicata', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'i18n');
      await authedRequest('put', '/api/v1/app/settings/multilingual', admin)
        .send({ active: ['it-IT', 'en-GB'], default: 'it-IT' })
        .expect(200);
      const source = await createDraftPage(admin, { slug: 'chi-siamo' });
      await changeStatus(admin, source.guid, 'published').expect(200);
      const translation = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        admin,
      )
        .send({ locale: 'en-GB' })
        .expect(201);
      exportServiceMock.enqueuePageExport.mockClear();

      await changeStatus(admin, translation.body.guid, 'published').expect(200);

      expect(exportServiceMock.enqueuePageExport).toHaveBeenCalledWith(
        translation.body.guid,
        'en-GB',
        `/${translation.body.slug}`,
      );
      expect(exportServiceMock.enqueuePageExport).toHaveBeenCalledWith(
        source.guid,
        'it-IT',
        '/chi-siamo',
      );
    });
  });

  // ─── Conformità di ADR-53 ───────────────────────────────────────────────

  describe('Nessuna chiave Redis pubblica (ADR-53 § Conformità)', () => {
    it('una lettura pubblica riuscita non scrive alcuna chiave `public:*`', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'no-redis');
      const page = await createDraftPage(manager, { slug: 'senza-cache' });
      await changeStatus(manager, page.guid, 'published').expect(200);

      await publicGet('/senza-cache').expect(200);
      await publicGet('/senza-cache').expect(200);

      const redis = getTestRedisClient();
      expect(await redis.keys('public:*')).toEqual([]);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
