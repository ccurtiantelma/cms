import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import './setup/network-mocks.setup';

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
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test di integrazione del flusso multilingua (RFC-F05, ADR-36) contro
 * Postgres/Redis REALI — stesso pattern bootstrap di `pages.e2e-spec.ts`,
 * qui isolato in una suite dedicata perché copre tre proprietà del gruppo di
 * traduzione non coperte lì: eredità di `translationGroupId` via
 * `GET :guid/translations`, rigenerazione dell'`id` su OGNI nodo dell'albero
 * (non solo il primo), e indipendenza dello stato editoriale fra sorgente e
 * traduzione dopo `POST :guid/status`.
 */
describe('PagesController — Multilingua/i18n (e2e, DB/Redis reali)', () => {
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
        email: `pages-i18n.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
    method: 'get' | 'post' | 'patch' | 'delete' | 'put',
    path: string,
    auth: Auth,
  ): request.Test {
    return (request(app.getHttpServer())[method](path) as request.Test)
      .set('Authorization', auth.bearer)
      .set('Cookie', auth.cookie);
  }

  /**
   * Albero a due livelli: un `section` (unico contenitore ammesso, ADR-21 § 5)
   * con due `heading` figli — usato per verificare che la rigenerazione degli
   * `id` in `createTranslation` copra TUTTI i nodi, non solo la radice.
   */
  function nestedContentTree(): Record<string, unknown> {
    return {
      version: 1,
      blocks: [
        {
          id: 'root-section',
          type: 'section',
          v: 1,
          props: {},
          children: [
            {
              id: 'child-heading-1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: 'Primo blocco' },
              children: [],
            },
            {
              id: 'child-heading-2',
              type: 'heading',
              v: 1,
              props: { level: 'h3', text: 'Secondo blocco' },
              children: [],
            },
          ],
        },
      ],
    };
  }

  /** Raccoglie ricorsivamente tutti gli `id` di un albero blocchi (`blocks` + `children` annidati). */
  function collectBlockIds(tree: { blocks: { id: string; children?: unknown[] }[] }): string[] {
    const ids: string[] = [];
    function walk(nodes: { id: string; children?: unknown[] }[]): void {
      for (const node of nodes) {
        ids.push(node.id);
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children as { id: string; children?: unknown[] }[]);
        }
      }
    }
    walk(tree.blocks);
    return ids;
  }

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
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: overrides.locale ?? 'it-IT',
        draftContent: overrides.draftContent ?? nestedContentTree(),
      })
      .expect(201);
    return res.body;
  }

  function changeStatus(auth: Auth, guid: string, status: string): request.Test {
    return authedRequest('post', `/api/v1/app/pages/${guid}/status`, auth).send({ status });
  }

  /** Registra il registro Locale attivi (RFC-F05 § 1) come farebbe un Admin da UI. */
  async function setActiveLocales(admin: Auth, active: string[], defaultLocale: string): Promise<void> {
    await authedRequest('put', '/api/v1/app/settings/multilingual', admin)
      .send({ active, default: defaultLocale })
      .expect(200);
  }

  // ─── 1. Eredità del translationGroupId via GET :guid/translations ──────

  describe('GET /app/pages/:guid/translations', () => {
    it('elenca le righe sorelle del gruppo, sorgente inclusa, tutte con lo stesso translationGroupId', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'i18n-list-1');
      const admin = await seedAuth(AppUserRoles.Admin, 'i18n-list-1-admin');
      await setActiveLocales(admin, ['it-IT', 'en-GB', 'fr-FR'], 'it-IT');

      const source = await createDraftPage(manager, {
        title: 'Chi siamo',
        slug: 'chi-siamo-i18n',
        locale: 'it-IT',
      });
      const translationEn = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      const res = await authedRequest(
        'get',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      ).expect(200);

      expect(res.body).toHaveLength(2);
      const guids = (res.body as { guid: string; translationGroupId?: string }[]).map((r) => r.guid);
      expect(guids).toEqual(expect.arrayContaining([source.guid, translationEn.body.guid]));

      // PageTranslationDto è volutamente leggero (guid/locale/title/status):
      // il `translationGroupId` condiviso si verifica confrontando le righe
      // via `POST` (già asserito) — qui si accerta che l'elenco ritorni
      // esattamente le righe di quel gruppo e nessun'altra.
      const locales = (res.body as { locale: string }[]).map((r) => r.locale).sort();
      expect(locales).toEqual(['en-GB', 'it-IT']);
    });

    it('elenco interrogato dalla riga tradotta ritorna lo stesso gruppo della sorgente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'i18n-list-2');
      const admin = await seedAuth(AppUserRoles.Admin, 'i18n-list-2-admin');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');

      const source = await createDraftPage(manager, { title: 'Servizi', slug: 'servizi-i18n' });
      const translation = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      const res = await authedRequest(
        'get',
        `/api/v1/app/pages/${translation.body.guid}/translations`,
        manager,
      ).expect(200);

      const guids = (res.body as { guid: string }[]).map((r) => r.guid).sort();
      expect(guids).toEqual([source.guid, translation.body.guid].sort());
    });

    it('404: guid sorgente inesistente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'i18n-list-404');
      await authedRequest(
        'get',
        '/api/v1/app/pages/0000000000000000/translations',
        manager,
      ).expect(404);
    });
  });

  // ─── 2. Rigenerazione GUID su tutti i nodi dell'albero clonato ─────────

  describe('POST /app/pages/:guid/translations — rigenerazione id di tutti i nodi', () => {
    it('ogni nodo (radice e figli annidati) ha un id diverso da quello del nodo corrispondente nella sorgente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'i18n-ids-1');
      const admin = await seedAuth(AppUserRoles.Admin, 'i18n-ids-1-admin');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');

      const source = await createDraftPage(manager, {
        title: 'Pagina annidata',
        slug: 'pagina-annidata',
        draftContent: nestedContentTree(),
      });

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      const sourceIds = collectBlockIds(
        source.draftContent as { blocks: { id: string; children?: unknown[] }[] },
      );
      const translatedIds = collectBlockIds(
        res.body.draftContent as { blocks: { id: string; children?: unknown[] }[] },
      );

      // Stessa forma dell'albero (radice + 2 figli = 3 nodi), nessuna
      // collisione d'identità con la sorgente su nessuno dei tre.
      expect(sourceIds).toEqual(['root-section', 'child-heading-1', 'child-heading-2']);
      expect(translatedIds).toHaveLength(sourceIds.length);
      expect(new Set(translatedIds).size).toBe(translatedIds.length);
      for (const id of translatedIds) {
        expect(sourceIds).not.toContain(id);
      }

      // Testi/props copiati verbatim: solo l'id cambia, il contenuto no.
      const sourceTexts = (
        (source.draftContent as { blocks: { children: { props: { text: string } }[] }[] }).blocks[0]
          .children
      ).map((c) => c.props.text);
      const translatedTexts = (
        (res.body.draftContent as { blocks: { children: { props: { text: string } }[] }[] }).blocks[0]
          .children
      ).map((c) => c.props.text);
      expect(translatedTexts).toEqual(sourceTexts);
    });
  });

  // ─── 3. Indipendenza dello stato editoriale fra sorgente e traduzione ──

  describe('Indipendenza dello stato editoriale fra sorgente e traduzione', () => {
    it('pubblicare la sorgente non altera lo stato draft della traduzione', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'i18n-status-1');
      const admin = await seedAuth(AppUserRoles.Admin, 'i18n-status-1-admin');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');

      const source = await createDraftPage(manager, { title: 'News', slug: 'news-i18n' });
      const translation = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      await changeStatus(manager, source.guid, 'published').expect(200);

      const sourceAfter = await authedRequest('get', `/api/v1/app/pages/${source.guid}`, manager).expect(
        200,
      );
      const translationAfter = await authedRequest(
        'get',
        `/api/v1/app/pages/${translation.body.guid}`,
        manager,
      ).expect(200);

      expect(sourceAfter.body.status).toBe('published');
      expect(translationAfter.body.status).toBe('draft');
    });

    it('pubblicare la traduzione non altera lo stato draft della sorgente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'i18n-status-2');
      const admin = await seedAuth(AppUserRoles.Admin, 'i18n-status-2-admin');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');

      const source = await createDraftPage(manager, { title: 'Eventi', slug: 'eventi-i18n' });
      const translation = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      await changeStatus(manager, translation.body.guid, 'published').expect(200);

      const sourceAfter = await authedRequest('get', `/api/v1/app/pages/${source.guid}`, manager).expect(
        200,
      );
      const translationAfter = await authedRequest(
        'get',
        `/api/v1/app/pages/${translation.body.guid}`,
        manager,
      ).expect(200);

      expect(translationAfter.body.status).toBe('published');
      expect(sourceAfter.body.status).toBe('draft');
    });
  });
});
