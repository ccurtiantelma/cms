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
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test di integrazione di `PagesService.create()` sulla risoluzione di
 * `CreatePageDto.templateSlug` nel registro dei Page Blueprints
 * (`src/pages/blueprints/page-blueprints.registry.ts`, RFC-43), contro
 * Postgres/Redis REALI — stesso pattern di `pages.e2e-spec.ts`.
 */
describe('PagesController — creazione da Template (e2e, DB/Redis reali)', () => {
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
        email: `pages.blueprints.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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

  interface BlockNodeLike {
    id: string;
    type: string;
    v?: number;
    props: Record<string, unknown>;
    children: BlockNodeLike[];
  }

  /** Raccoglie ricorsivamente tutti gli `id` dell'albero blocchi, per la verifica di univocità (business-rules.md § Blocchi). */
  function collectBlockIds(blocks: BlockNodeLike[]): string[] {
    return blocks.flatMap((block) => [block.id, ...collectBlockIds(block.children ?? [])]);
  }

  /** Raccoglie ricorsivamente tutte le coppie `(type, propsKeys)` dell'albero, per confrontare la struttura con il blueprint sorgente a prescindere dagli `id` (rigenerati ad ogni clonazione). */
  function collectShape(blocks: BlockNodeLike[]): Array<{ type: string; childCount: number }> {
    return blocks.flatMap((block) => [
      { type: block.type, childCount: (block.children ?? []).length },
      ...collectShape(block.children ?? []),
    ]);
  }

  // ─── a) Creazione con template 'landing-page' ──────────────────────────

  describe("Creazione con templateSlug 'landing-page'", () => {
    it("201: draftContent riflette l'albero del blueprint e tutti i blocchi hanno GUID univoci", async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'bp-landing1');

      const res = await authedRequest('post', '/api/v1/app/pages', manager)
        .send({ title: 'Landing di test', locale: 'it-IT', templateSlug: 'landing-page' })
        .expect(201);

      const blocks = res.body.draftContent.blocks as BlockNodeLike[];

      // Struttura: hero-section (heading, richText, button) + two-columns-section (2x richText),
      // stessa forma di `landingPageBlueprintBlocks` nel registro.
      expect(collectShape(blocks)).toEqual([
        { type: 'section', childCount: 3 },
        { type: 'heading', childCount: 0 },
        { type: 'richText', childCount: 0 },
        { type: 'button', childCount: 0 },
        { type: 'section', childCount: 2 },
        { type: 'richText', childCount: 0 },
        { type: 'richText', childCount: 0 },
      ]);

      // Tutti gli id sono GUID rigenerati (16 hex, mai i placeholder statici del registro) e univoci.
      const ids = collectBlockIds(blocks);
      expect(ids).toHaveLength(new Set(ids).size);
      for (const id of ids) {
        expect(id).toMatch(/^[0-9a-f]{16}$/);
      }
      expect(ids).not.toContain('hero-section');
      expect(ids).not.toContain('hero-heading');
    });
  });

  // ─── b) Creazione con template 'service-page' ──────────────────────────

  describe("Creazione con templateSlug 'service-page'", () => {
    it("201: l'albero dei blocchi riflette la struttura del blueprint (heading, image, richText)", async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'bp-service1');

      const res = await authedRequest('post', '/api/v1/app/pages', manager)
        .send({ title: 'Servizio di test', locale: 'it-IT', templateSlug: 'service-page' })
        .expect(201);

      const blocks = res.body.draftContent.blocks as BlockNodeLike[];

      expect(collectShape(blocks)).toEqual([
        { type: 'section', childCount: 3 },
        { type: 'heading', childCount: 0 },
        { type: 'image', childCount: 0 },
        { type: 'richText', childCount: 0 },
      ]);

      const heading = blocks[0].children.find((b) => b.type === 'heading')!;
      expect(heading.props.text).toBe('Nome del servizio');
      const image = blocks[0].children.find((b) => b.type === 'image')!;
      expect(image.props.alt).toBe('Immagine di copertina del servizio');

      const ids = collectBlockIds(blocks);
      expect(ids).toHaveLength(new Set(ids).size);
    });
  });

  // ─── c) templateSlug inesistente ───────────────────────────────────────

  describe('Creazione con templateSlug inesistente', () => {
    it("400 PAGE_TEMPLATE_UNKNOWN per 'invalid-template', nessuna Pagina creata", async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'bp-invalid1');

      const res = await authedRequest('post', '/api/v1/app/pages', manager)
        .send({
          title: 'Pagina da template inesistente',
          locale: 'it-IT',
          templateSlug: 'invalid-template',
        })
        .expect(400);

      expect(res.body.code).toBe('PAGE_TEMPLATE_UNKNOWN');
      expect(res.body.details).toEqual({ templateSlug: 'invalid-template' });

      const db = getTestDb();
      const list = await authedRequest('get', '/api/v1/app/pages?p=1&i=50', manager).expect(200);
      expect(list.body.items).toEqual([]);
      void db;
    });
  });

  // ─── d) Creazione senza templateSlug ───────────────────────────────────

  describe('Creazione senza templateSlug', () => {
    it("201: nessun errore, draftContent risultante è l'albero vuoto di default (nessun draftContent fornito)", async () => {
      // NOTA (Test Engineer, comportamento osservato non corretto): l'assenza di
      // `templateSlug` NON risolve il blueprint `empty` dal registro
      // (`page-blueprints.registry.ts`, che avrebbe un blocco `section-root`) —
      // `PagesService.create()` (pages.service.ts riga 194-196) usa
      // `dto.draftContent ?? { version: ENVELOPE_VERSION, blocks: [] }` come
      // fallback quando `templateSlug` è assente, ignorando il registro dei
      // blueprint. Il test verifica quindi il comportamento REALE del sistema
      // (albero con `blocks: []`), non quanto descritto nell'istruzione operativa
      // del task ("fallback trasparente al blueprint 'empty'"): la discrepanza va
      // segnalata, non corretta qui (CLAUDE.md, Test Engineer: "bug trovati si
      // segnalano, non si correggono").
      const manager = await seedAuth(AppUserRoles.Manager, 'bp-default1');

      const res = await authedRequest('post', '/api/v1/app/pages', manager)
        .send({ title: 'Pagina senza template', locale: 'it-IT' })
        .expect(201);

      expect(res.body.draftContent.blocks).toEqual([]);
    });

    it('draftContent esplicito viene comunque rispettato quando templateSlug è assente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'bp-default2');

      const res = await authedRequest('post', '/api/v1/app/pages', manager)
        .send({
          title: 'Pagina con contenuto esplicito',
          locale: 'it-IT',
          draftContent: {
            version: 1,
            blocks: [
              {
                id: 'b1',
                type: 'heading',
                v: 1,
                props: { level: 'h2', text: 'Ciao' },
                children: [],
              },
            ],
          },
        })
        .expect(201);

      expect(res.body.draftContent.blocks).toHaveLength(1);
      expect(res.body.draftContent.blocks[0].props.text).toBe('Ciao');
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
