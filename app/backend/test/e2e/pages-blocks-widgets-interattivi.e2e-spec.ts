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
 * Test di integrazione T7 (PLAN-widget-interattivi-enterprise.md) per i sette
 * nuovi tipi del registro introdotti da ADR-57 (`accordion`/`accordionItem`,
 * `tabs`/`tabPanel`, `carousel`/`carouselSlide`, `modalTrigger`). L'endpoint
 * di salvataggio (`POST`/`PATCH app/pages`) resta invariato nel contratto —
 * `draftContent` è un `Record<string, unknown>` opaco al DTO (vedi
 * `create-page.dto.ts`) — quindi non introduce alcuna forma nuova di
 * richiesta/risposta: questa suite copre solo il comportamento del
 * registro/validator dietro l'endpoint già esistente, stesso pattern di
 * `pages-blocks-validation.e2e-spec.ts` (AppModule completo, Postgres/Redis
 * reali, JWT+cookie firmato simulati contro il vero `AuthMiddleware`).
 */
describe('PagesController (e2e) — widget interattivi enterprise ADR-57 (PLAN-widget-interattivi-enterprise.md T7)', () => {
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

  // ─── Helpers (stesso pattern di pages-blocks-validation.e2e-spec.ts) ────

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
        email: `pages-widgets.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  interface BlockNode {
    id: string;
    type: string;
    v: number;
    props: Record<string, unknown>;
    children: BlockNode[];
  }

  function headingNode(id: string, text = 'Testo di prova'): BlockNode {
    return { id, type: 'heading', v: 1, props: { level: 'h2', text }, children: [] };
  }

  function richTextNode(id: string, html = '<p>Contenuto</p>'): BlockNode {
    return { id, type: 'richText', v: 1, props: { html }, children: [] };
  }

  function imageNode(id: string, alt = 'Immagine descrittiva'): BlockNode {
    return { id, type: 'image', v: 1, props: { mediaRef: '0123456789abcdef', alt }, children: [] };
  }

  function accordionItemNode(id: string, title: string, children: BlockNode[]): BlockNode {
    return { id, type: 'accordionItem', v: 1, props: { title }, children };
  }

  function tabPanelNode(id: string, label: string, children: BlockNode[]): BlockNode {
    return { id, type: 'tabPanel', v: 1, props: { label }, children };
  }

  function carouselSlideNode(id: string, children: BlockNode[]): BlockNode {
    return { id, type: 'carouselSlide', v: 1, props: {}, children };
  }

  /**
   * Albero valido con i sette tipi di ADR-57 correttamente annidati: un
   * `accordion` con due `accordionItem`, un `tabs` con due `tabPanel`, un
   * `carousel` con due `carouselSlide`, un `modalTrigger` con contenuto —
   * tutti e quattro i contenitori alla radice (ammessi da `ROOT_ALLOWED`,
   * ADR-57 § 3).
   */
  function widgetsTree(): { version: number; blocks: BlockNode[] } {
    return {
      version: 1,
      blocks: [
        {
          id: 'acc',
          type: 'accordion',
          v: 1,
          props: { exclusive: true },
          children: [
            accordionItemNode('acc-item-1', 'Domanda 1', [headingNode('acc-h1', 'Risposta 1')]),
            accordionItemNode('acc-item-2', 'Domanda 2', [headingNode('acc-h2', 'Risposta 2')]),
          ],
        },
        {
          id: 'tabsw',
          type: 'tabs',
          v: 1,
          props: {},
          children: [
            tabPanelNode('tab-panel-1', 'Scheda 1', [headingNode('tab-h1', 'Contenuto scheda 1')]),
            tabPanelNode('tab-panel-2', 'Scheda 2', [headingNode('tab-h2', 'Contenuto scheda 2')]),
          ],
        },
        {
          id: 'car',
          type: 'carousel',
          v: 1,
          props: { autoplay: false, transition: 'manual-scroll' },
          children: [
            carouselSlideNode('car-slide-1', [imageNode('car-img-1', 'Slide 1')]),
            carouselSlideNode('car-slide-2', [imageNode('car-img-2', 'Slide 2')]),
          ],
        },
        {
          id: 'modal',
          type: 'modalTrigger',
          v: 1,
          props: { triggerLabel: 'Apri modale', animation: 'fade' },
          children: [richTextNode('modal-rt', '<p>Contenuto del modale</p>')],
        },
      ],
    };
  }

  async function createDraftPage(
    auth: Auth,
    overrides: Partial<{
      title: string;
      slug: string;
      draftContent: Record<string, unknown>;
    }> = {},
  ): Promise<{ guid: string; version: number; draftContent: Record<string, unknown> }> {
    const res = await authedRequest('post', '/api/v1/app/pages', auth)
      .send({
        title: overrides.title ?? 'Pagina con widget interattivi',
        slug: overrides.slug,
        locale: 'it-IT',
        draftContent: overrides.draftContent ?? widgetsTree(),
      })
      .expect(201);
    return res.body;
  }

  // ─── 1. Happy path — i sette tipi correttamente annidati ───────────────

  describe('Happy path — accordion/tabs/carousel/modalTrigger annidati correttamente', () => {
    it('POST con i sette tipi (2 accordionItem, 2 tabPanel, 2 carouselSlide, modalTrigger con contenuto) viene salvato con successo', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'happy1');

      const res = await authedRequest('post', '/api/v1/app/pages', manager).send({
        title: 'Pagina con tutti i widget interattivi',
        locale: 'it-IT',
        draftContent: widgetsTree(),
      });

      expect(res.status).toBe(201);
      expect(res.body.contentIssues).toEqual([]);

      // Verifica diretta a database: l'albero persistito contiene tutti e
      // sette i tipi, non solo la risposta HTTP.
      const db = getTestDb();
      const row = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, res.body.guid),
      });
      const persisted = JSON.stringify(row!.draftContent);
      for (const type of [
        'accordion',
        'accordionItem',
        'tabs',
        'tabPanel',
        'carousel',
        'carouselSlide',
        'modalTrigger',
      ]) {
        expect(persisted).toMatch(new RegExp(`"type":"${type}"`));
      }
    });

    it('PATCH sulla propria bozza con lo stesso albero aggiorna correttamente (nessuna regressione sul lock ottimistico)', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'happy2');
      const page = await createDraftPage(admin, { title: 'Bozza iniziale' });

      const res = await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, admin).send({
        version: page.version,
        draftContent: widgetsTree(),
      });

      expect(res.status).toBe(200);
      expect(res.body.contentIssues).toEqual([]);
      expect(res.body.version).toBe(page.version + 1);
    });
  });

  // ─── 2. Errore — nesting non ammesso, 400 con path del nodo colpevole ──

  describe('Nesting non ammesso — 400 BLOCK_NESTING_NOT_ALLOWED con details.path del nodo colpevole', () => {
    it("un accordionItem alla radice dell'albero (mai in ROOT_ALLOWED, ADR-57 § Decisione punto 2) è respinto per intero, nessuna Pagina creata", async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'errroot1');
      const db = getTestDb();
      const countBefore = await db.query.pageEntity.findMany({});

      const invalidTree = {
        version: 1,
        blocks: [headingNode('ok', 'Nodo valido'), accordionItemNode('bad', 'Voce orfana', [])],
      };

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina che non deve esistere (accordionItem in radice)',
        locale: 'it-IT',
        draftContent: invalidTree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BLOCK_NESTING_NOT_ALLOWED');
      expect(res.body.details).toMatchObject({
        path: 'blocks[1]',
        type: 'accordionItem',
        parentType: null,
      });

      const countAfter = await db.query.pageEntity.findMany({});
      expect(countAfter.length).toBe(countBefore.length);
    });

    it('un tabPanel annidato dentro un accordion (mismatch fra coppie contenitore/voce) è respinto, nessuna scrittura parziale a database', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'errmismatch1');
      const page = await createDraftPage(manager, {
        title: 'Pagina da non alterare',
        draftContent: widgetsTree(),
      });

      const db = getTestDb();
      const rowBefore = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const draftContentBefore = JSON.stringify(rowBefore!.draftContent);

      const mismatchedTree = {
        version: 1,
        blocks: [
          {
            id: 'acc-bad',
            type: 'accordion',
            v: 1,
            props: {},
            children: [tabPanelNode('panel-in-accordion', 'Scheda intrusa', [])],
          },
        ],
      };

      const res = await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager).send({
        version: page.version,
        draftContent: mismatchedTree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BLOCK_NESTING_NOT_ALLOWED');
      expect(res.body.details).toMatchObject({
        path: 'blocks[0].children[0]',
        type: 'tabPanel',
        parentType: 'accordion',
        allowed: ['accordionItem'],
      });

      // Nessuna scrittura parziale: né il contenuto né la version cambiano.
      const rowAfter = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      expect(JSON.stringify(rowAfter!.draftContent)).toBe(draftContentBefore);
      expect(rowAfter!.version).toBe(rowBefore!.version);
    });
  });

  // ─── 3. RBAC — ownership per riga, nessuna regressione (ADR-18) ────────

  describe('RBAC — un autore non modifica la bozza di un altro autore (ownership per riga, ADR-18)', () => {
    it('un User che tenta di aggiornare la bozza altrui con i sette tipi riceve 403, nessuna modifica persistita', async () => {
      const owner = await seedAuth(AppUserRoles.User, 'rbacowner1');
      const other = await seedAuth(AppUserRoles.User, 'rbacother1');
      const page = await createDraftPage(owner, { title: 'Bozza altrui con widget' });

      const db = getTestDb();
      const rowBefore = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });

      const res = await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, other).send({
        version: page.version,
        title: 'Titolo modificato da un estraneo',
        draftContent: widgetsTree(),
      });

      expect(res.status).toBe(403);

      // Nessuna modifica del primo autore va persa: riga intatta.
      const rowAfter = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      expect(rowAfter!.title).toBe(rowBefore!.title);
      expect(rowAfter!.version).toBe(rowBefore!.version);
      expect(JSON.stringify(rowAfter!.draftContent)).toBe(JSON.stringify(rowBefore!.draftContent));
    });
  });

  // ─── 4. plainText verbatim — nessun escaping alla persistenza ──────────

  describe('plainText dei sette tipi ("title"/"label"/"triggerLabel") sopravvive verbatim a database (ADR-21 § 4, nessun escaping alla persistenza)', () => {
    it('caratteri "<"/">" in accordionItem.title, tabPanel.label e modalTrigger.triggerLabel non vengono alterati/escapati', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'plaintext-widgets1');

      const tree = {
        version: 1,
        blocks: [
          {
            id: 'acc',
            type: 'accordion',
            v: 1,
            props: {},
            children: [accordionItemNode('item1', '5 < 10 e 10 > 5', [headingNode('h1')])],
          },
          {
            id: 'tabsw',
            type: 'tabs',
            v: 1,
            props: {},
            children: [tabPanelNode('panel1', '<b>Scheda</b> 1 < 2', [headingNode('h2')])],
          },
          {
            id: 'modal',
            type: 'modalTrigger',
            v: 1,
            props: { triggerLabel: 'Apri <se> vuoi > tardi' },
            children: [richTextNode('rt1')],
          },
        ],
      };

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina con plainText contenente < e >',
        locale: 'it-IT',
        draftContent: tree,
      });

      expect(res.status).toBe(201);

      // Verifica sulla risposta HTTP...
      expect(res.body.draftContent.blocks[0].children[0].props.title).toBe('5 < 10 e 10 > 5');
      expect(res.body.draftContent.blocks[1].children[0].props.label).toBe('<b>Scheda</b> 1 < 2');
      expect(res.body.draftContent.blocks[2].props.triggerLabel).toBe('Apri <se> vuoi > tardi');

      // ...e a database, non solo sulla risposta (stesso principio dei test
      // XSS/plainText già esistenti in pages.e2e-spec.ts).
      const db = getTestDb();
      const row = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, res.body.guid),
      });
      const persisted = row!.draftContent as {
        blocks: Array<{
          props: Record<string, unknown>;
          children: Array<{ props: Record<string, unknown> }>;
        }>;
      };

      expect(persisted.blocks[0].children[0].props.title).toBe('5 < 10 e 10 > 5');
      expect(persisted.blocks[1].children[0].props.label).toBe('<b>Scheda</b> 1 < 2');
      expect(persisted.blocks[2].props.triggerLabel).toBe('Apri <se> vuoi > tardi');
      // Nessun escaping HTML introdotto dalla persistenza.
      expect(JSON.stringify(row!.draftContent)).not.toMatch(/&lt;|&gt;/);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
