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
import { pageEntity, pageRevisionEntity, userEntity } from '../../src/db/schema';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * F12-03 / ADR-18 — flusso editoriale completo delle Pagine (draft -> review
 * -> published) e matrice di permessi RBAC (ownership per riga) su
 * `POST :guid/status` e `DELETE :guid`, contro Postgres/Redis REALI.
 *
 * Complementare a `pages.e2e-spec.ts` § "RBAC — un User non pubblica mai" e
 * § "Macchina a stati": quella suite copre le singole transizioni negate a
 * un `User` in isolamento; questa copre la narrazione end-to-end con più
 * ruoli sulla STESSA pagina (User -> Manager) con verifica dei side-effect a
 * database (Revisione inserita, `publishedRevisionId` aggiornato) e la
 * `DELETE` RBAC, non coperta altrove come scenario di autorizzazione negata
 * (le occorrenze esistenti di `DELETE :guid` in altre suite sono tutte setup
 * con `Admin`, mai un tentativo respinto — verificato con grep prima di
 * scrivere questo file).
 *
 * Mock solo per i servizi esterni veri (SMTP, via `network-mocks.setup.ts`);
 * niente mock su Postgres/Redis.
 */
describe('PagesController — Workflow editoriale + RBAC ownership (e2e, DB/Redis reali)', () => {
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

  // ─── Helpers (stesso pattern di pages-diff-restore.e2e-spec.ts) ────────

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
        email: `pages-workflow.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
    method: 'get' | 'post' | 'patch' | 'delete' | 'put',
    path: string,
    auth: Auth,
  ): request.Test {
    return (request(app.getHttpServer())[method](path) as request.Test)
      .set('Authorization', auth.bearer)
      .set('Cookie', auth.cookie);
  }

  /**
   * Albero minimo valido, generico e innocuo: una `section` con dentro una
   * `heading` (`level`/`text`, entrambi obbligatori — SPEC-F02-blocchi.md §
   * 3.3). `text` è `plainText`.
   */
  function contentTreeV1(headingText = 'Titolo v1'): Record<string, unknown> {
    return {
      version: 1,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            { id: 'heading-1', type: 'heading', v: 1, props: { level: 'h2', text: headingText }, children: [] },
          ],
        },
      ],
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
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: overrides.locale ?? 'it-IT',
        draftContent: overrides.draftContent ?? contentTreeV1(),
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

  // ─── Scenario 1+2+3: draft -> review (User) -> published negato (User) -> published concesso (Manager) ─

  describe('Flusso editoriale completo: User porta la propria bozza in review, non può pubblicarla, un Manager sì', () => {
    it('1) un User crea una pagina (draft) e la porta a review con successo (200, status=review)', async () => {
      const author = await seedAuth(AppUserRoles.User, 'flow1author');
      const page = await createDraftPage(author, { title: 'Pagina workflow — User' });
      expect(page.status).toBe('draft');

      const toReview = await changeStatus(author, page.guid, 'review');

      expect(toReview.status).toBe(200);
      expect(toReview.body.status).toBe('review');
    });

    it('2) lo stesso User (proprietario) tenta review -> published direttamente: 403, nessun effetto a database', async () => {
      const author = await seedAuth(AppUserRoles.User, 'flow2author');
      const page = await createDraftPage(author, { title: 'Pagina workflow — User review->published' });

      const toReview = await changeStatus(author, page.guid, 'review').expect(200);
      expect(toReview.body.status).toBe('review');

      const forbidden = await changeStatus(author, page.guid, 'published');
      expect(forbidden.status).toBe(403);

      // Nessun effetto collaterale del tentativo respinto: la riga resta in "review".
      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.status).toBe('review');
      expect(dbPage!.publishedRevisionId).toBeNull();
    });

    it('3) un Manager esegue review -> published sulla stessa pagina: 200, nuova page_revisions e publishedRevisionId coerente', async () => {
      const author = await seedAuth(AppUserRoles.User, 'flow3author');
      const manager = await seedAuth(AppUserRoles.Manager, 'flow3manager');
      const page = await createDraftPage(author, {
        title: 'Pagina workflow — Manager pubblica',
        draftContent: contentTreeV1('Titolo pubblicato'),
      });

      await changeStatus(author, page.guid, 'review').expect(200);

      const published = await changeStatus(manager, page.guid, 'published');
      expect(published.status).toBe(200);
      expect(published.body.status).toBe('published');

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.status).toBe('published');
      expect(dbPage!.publishedRevisionId).not.toBeNull();

      const revisions = await db.query.pageRevisionEntity.findMany({
        where: eq(pageRevisionEntity.pageId, dbPage!.id),
      });
      expect(revisions).toHaveLength(1);
      expect(revisions[0].revisionNumber).toBe(1);
      expect(revisions[0].id).toBe(dbPage!.publishedRevisionId);
      expect(revisions[0].content).toMatchObject({
        blocks: [
          expect.objectContaining({
            id: 'section-1',
            children: [
              expect.objectContaining({
                id: 'heading-1',
                props: { level: 'h2', text: 'Titolo pubblicato' },
              }),
            ],
          }),
        ],
      });
      // Autore della Revisione (append-only, `createdBy`): chi ha eseguito la
      // pubblicazione (il Manager), non l'autore originale della bozza —
      // coerente con `publishTransactionally` che scrive `authInfo.userId`
      // del chiamante corrente.
      expect(revisions[0].createdBy).toBe(manager.userId);
    });
  });

  // ─── Scenario 4: DELETE RBAC — un User non-owner non elimina la pagina di un altro autore ─

  describe('DELETE :guid — ownership/RBAC (ADR-18 § D3, soglia Admin, 403 anche sulla riga altrui)', () => {
    it('4) un User NON-owner (né Admin) tenta la DELETE sulla pagina di un altro autore: 403, nessun soft-delete', async () => {
      const owner = await seedAuth(AppUserRoles.User, 'del1owner');
      const otherUser = await seedAuth(AppUserRoles.User, 'del1other');
      const page = await createDraftPage(owner, { title: 'Pagina di un altro autore' });

      const res = await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, otherUser);

      expect(res.status).toBe(403);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.isActive).toBe(true); // nessun soft-delete dal tentativo respinto
    });

    it('variante: un Admin elimina (soft-delete) la pagina di un altro autore: 204, isActive=false', async () => {
      const owner = await seedAuth(AppUserRoles.User, 'del2owner');
      const admin = await seedAuth(AppUserRoles.Admin, 'del2admin');
      const page = await createDraftPage(owner, { title: 'Pagina da eliminare (Admin)' });

      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.isActive).toBe(false);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
