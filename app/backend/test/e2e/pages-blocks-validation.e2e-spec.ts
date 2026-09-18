import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import { networkMocks } from './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { json } from 'express';
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
 * Test e2e di integrazione della pipeline blocchi (PLAN-F02-blocchi.md T7,
 * SPEC-F02-blocchi.md § 1/§ 3/§ 4) contro Postgres/Redis REALI, stesso
 * pattern/setup di `pages.e2e-spec.ts`: albero respinto per intero su un nodo
 * invalido (mai un salvataggio parziale), alt-text obbligatorio su `image`,
 * limiti di profondità/numero di nodi, ed esposizione in lettura di un nodo
 * con `v` dal futuro (§ 4.3), senza mai riscrivere la riga a database.
 */
describe('PagesController (e2e) — validazione albero blocchi (PLAN-F02 T7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await runMigrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api/v1');
    // Stesso limite di `main.ts` (`app.use('/api/v1/app', json({ limit: '1mb' }))`):
    // questo bootstrap e2e non passa da `main.ts`, quindi userebbe altrimenti
    // il limite di default di Express (100kb) — insufficiente per un albero a
    // MAX_NODES=1500 (ADR-82 § "Decisione" punto 5, ~140 KB in JSON).
    app.use('/api/v1/app', json({ limit: '1mb' }));
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
        email: `pages-blocks-validation.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  function safeContentTree(text = 'Testo lecito'): Record<string, unknown> {
    return {
      version: 1,
      blocks: [{ id: 'b1', type: 'heading', v: 1, props: { level: 'h2', text }, children: [] }],
    };
  }

  async function createDraftPage(
    auth: Auth,
    overrides: Partial<{ title: string; slug: string; draftContent: Record<string, unknown> }> = {},
  ): Promise<{ guid: string; version: number; draftContent: Record<string, unknown> }> {
    const res = await authedRequest('post', '/api/v1/app/pages', auth)
      .send({
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: 'it-IT',
        draftContent: overrides.draftContent ?? safeContentTree(),
      })
      .expect(201);
    return res.body;
  }

  // ─── 1. Albero respinto per intero (business-rules § Blocchi regola 4) ─

  describe("Un nodo invalido respinge l'intero albero, mai un salvataggio parziale", () => {
    it('PATCH con un nodo valido + un nodo con type sconosciuto riceve 400 e NON scrive nulla a database', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'reject1');
      const page = await createDraftPage(manager, {
        title: 'Pagina da non toccare',
        draftContent: safeContentTree('Contenuto originale'),
      });

      const db = getTestDb();
      const rowBefore = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const draftContentBefore = JSON.stringify(rowBefore!.draftContent);

      const invalidTree = {
        version: 1,
        blocks: [
          {
            id: 'ok',
            type: 'heading',
            v: 1,
            props: { level: 'h2', text: 'Nodo valido' },
            children: [],
          },
          { id: 'bad', type: 'nonEsiste', v: 1, props: {}, children: [] },
        ],
      };

      const res = await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager).send({
        version: page.version,
        draftContent: invalidTree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BLOCK_TYPE_UNKNOWN');
      expect(res.body.details).toMatchObject({ path: 'blocks[1]', type: 'nonEsiste' });

      // Verifica a database, non solo sulla risposta: nessuna scrittura parziale,
      // né del nodo "ok" né di null/mutazioni della riga.
      const rowAfter = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      expect(JSON.stringify(rowAfter!.draftContent)).toBe(draftContentBefore);
      expect(rowAfter!.version).toBe(rowBefore!.version);
    });

    it("un nodo con prop non dichiarata respinge l'intero POST, nessuna Pagina viene creata", async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'reject2');
      const db = getTestDb();
      const countBefore = await db.query.pageEntity.findMany({});

      const invalidTree = {
        version: 1,
        // `container` (non `section`: `section` v1 è ormai riscritta a
        // `container` v2 dalla migrazione di identità di ADR-82 **prima**
        // della validazione, che non copia mai una chiave sconosciuta come
        // `colonna` — il veicolo per questo test deve essere già alla
        // versione corrente per non passare da quella riscrittura).
        blocks: [{ id: 'c', type: 'container', v: 2, props: { colonna: 2 }, children: [] }],
      };

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina che non deve esistere',
        locale: 'it-IT',
        draftContent: invalidTree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BLOCK_PROP_NOT_DECLARED');

      const countAfter = await db.query.pageEntity.findMany({});
      expect(countAfter.length).toBe(countBefore.length);
    });
  });

  // ─── 2. alt-text obbligatorio su image (NFR § Accessibilità) ───────────

  describe('image.alt obbligatorio', () => {
    it('alt assente: 400 BLOCK_PROP_INVALID reason "required"', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'alt1');
      const tree = {
        version: 1,
        blocks: [
          { id: 'img', type: 'image', v: 1, props: { mediaRef: '0123456789abcdef' }, children: [] },
        ],
      };

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina con immagine senza alt',
        locale: 'it-IT',
        draftContent: tree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BLOCK_PROP_INVALID');
      expect(res.body.details).toMatchObject({
        path: 'blocks[0].props.alt',
        prop: 'alt',
        reason: 'required',
      });
    });

    it('alt vuoto/whitespace: 400 BLOCK_PROP_INVALID reason "empty"', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'alt2');
      const tree = {
        version: 1,
        blocks: [
          {
            id: 'img',
            type: 'image',
            v: 1,
            props: { mediaRef: '0123456789abcdef', alt: '   ' },
            children: [],
          },
        ],
      };

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina con alt vuoto',
        locale: 'it-IT',
        draftContent: tree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BLOCK_PROP_INVALID');
      expect(res.body.details).toMatchObject({ path: 'blocks[0].props.alt', reason: 'empty' });
    });
  });

  // ─── 3. Limiti di profondità e numero di nodi (SPEC-F02 § 1.1/§ 1.2) ──

  describe("Limiti dell'envelope — profondità e numero massimo di nodi", () => {
    it('profondità 9 (> MAX_DEPTH=8, ADR-82): 400 CONTENT_TREE_TOO_DEEP col path del primo nodo oltre il limite', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'depth1');

      // `heading` è foglia (children.allow: []): usiamo nodi generici (non
      // validati dal registro a questo stadio, che gira PRIMA della
      // consultazione del registro) solo per costruire la profondità.
      function nestedNode(depth: number): Record<string, unknown> {
        if (depth === 0) {
          return {
            id: 'leaf',
            type: 'heading',
            v: 1,
            props: { level: 'h2', text: 'foglia' },
            children: [],
          };
        }
        return {
          id: `n${depth}`,
          type: 'container',
          v: 1,
          props: {},
          children: [nestedNode(depth - 1)],
        };
      }

      const tree = { version: 1, blocks: [nestedNode(8)] }; // profondità 9 (radice=1)

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina troppo profonda',
        locale: 'it-IT',
        draftContent: tree,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CONTENT_TREE_TOO_DEEP');
      expect(res.body.details).toMatchObject({ depth: 9, max: 8 });
    });

    it('1501 nodi (> MAX_NODES=1500, ADR-82): 400 CONTENT_TREE_TOO_MANY_NODES', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'nodes1');

      // `v: 2` (versione corrente di `heading`) con solo `level`/`text`: evita
      // il costo di migrazione (ogni prop v2 opzionale — `color`/`typography`/
      // `margin`/`hideOn` — resta assente), così il payload misura solo il
      // limite di conteggio nodi (MAX_NODES), non quello di byte
      // (MAX_PAYLOAD_BYTES, deliberatamente invariato da ADR-82 § "Decisione"
      // punto 5: un albero di nodi v1 migrati "arricchiti" a v2 può pesare
      // sensibilmente di più di quanto la formula storica "500 nodi × ~1 KiB"
      // prevedesse — non è la stessa cosa che questo test verifica).
      const blocks = Array.from({ length: 1501 }, (_unused, index) => ({
        id: `n${index}`,
        type: 'heading',
        v: 2,
        props: { level: 'h2', text: `Nodo ${index}` },
        children: [],
      }));

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina con troppi nodi',
        locale: 'it-IT',
        draftContent: { version: 1, blocks },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CONTENT_TREE_TOO_MANY_NODES');
      expect(res.body.details).toMatchObject({ count: 1501, max: 1500 });
    });

    it('1500 nodi (= MAX_NODES, ADR-82): accettato', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'nodes2');

      // Stesso motivo del test "1501 nodi" sopra: `v: 2` con solo `level`/`text`
      // per non far dipendere questo test dal limite di byte (invariato).
      const blocks = Array.from({ length: 1500 }, (_unused, index) => ({
        id: `n${index}`,
        type: 'heading',
        v: 2,
        props: { level: 'h2', text: `Nodo ${index}` },
        children: [],
      }));

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Pagina al limite esatto',
        locale: 'it-IT',
        draftContent: { version: 1, blocks },
      });

      expect(res.status).toBe(201);
    });
  });

  // ─── 4. v superiore al corrente in lettura (ADR-21 § 1, SPEC-F02 § 4.3) ─

  describe('Lettura di un nodo con "v" superiore al corrente del registro — mai un\'eccezione, mai una riscrittura', () => {
    it('GET risponde 200 con contentIssues popolato (BLOCK_VERSION_UNSUPPORTED), il nodo torna come persistito, e la riga a database non cambia', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'futurev1');
      const db = getTestDb();
      const guid = crypto.randomBytes(8).toString('hex');
      const translationGroupId = crypto.randomBytes(8).toString('hex');

      // `richText` è a v:2 nel registro di produzione (ADR-81, round R1
      // "parità Elementor Pro"): v:3 è quindi "dal futuro" (ADR-21 § 1 —
      // conseguenza normale di un rollback di backend dopo un incremento di
      // v, non un caso teorico).
      await db.insert(pageEntity).values({
        guid,
        title: 'Pagina con nodo dal futuro',
        slug: 'pagina-nodo-dal-futuro',
        locale: 'it-IT',
        translationGroupId,
        status: 'draft',
        draftContent: {
          version: 1,
          blocks: [
            {
              id: 'b1',
              type: 'richText',
              v: 3,
              props: { html: 'contenuto dal futuro' },
              children: [],
            },
          ],
        },
        draftSeo: {},
        createdBy: manager.userId,
        updatedBy: manager.userId,
      });

      const rowBefore = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });

      const res = await authedRequest('get', `/api/v1/app/pages/${guid}`, manager).expect(200);

      expect(res.body.contentIssues).toHaveLength(1);
      expect(res.body.contentIssues[0]).toMatchObject({
        path: 'blocks[0]',
        code: 'BLOCK_VERSION_UNSUPPORTED',
        details: { path: 'blocks[0]', type: 'richText', v: 3, current: 2 },
      });
      // Il nodo torna come persistito: props non toccate, v non declassata.
      expect(res.body.draftContent.blocks[0]).toMatchObject({
        v: 3,
        props: { html: 'contenuto dal futuro' },
      });

      const rowAfter = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
      expect(JSON.stringify(rowAfter!.draftContent)).toBe(JSON.stringify(rowBefore!.draftContent));
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
