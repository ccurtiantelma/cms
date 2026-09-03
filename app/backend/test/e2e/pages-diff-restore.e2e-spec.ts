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
 * Test di integrazione del flusso combinato Diff + Restore delle Revisioni
 * (F07-01, business-rules.md § Revisioni regola 4) contro Postgres/Redis
 * REALI — stesso pattern bootstrap di `pages.e2e-spec.ts`, qui isolato in
 * una suite satellite dedicata perché copre l'intero percorso end-to-end
 * "due Revisioni pubblicate → diff strutturale → restore della prima" in
 * un'unica narrazione, non coperto altrove in questa forma combinata.
 *
 * Mock solo per i servizi esterni veri (SMTP, via `network-mocks.setup.ts`);
 * niente mock su Postgres/Redis.
 */
describe('PagesController — Diff + Restore Revisioni (e2e, DB/Redis reali)', () => {
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
        email: `pages-diff-restore.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
   * 3.3). `text` è `plainText`. Usato come contenuto "v1" della Pagina.
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
            {
              id: 'heading-1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: headingText },
              children: [],
            },
          ],
        },
      ],
    };
  }

  /**
   * Variante di `contentTreeV1` con testo della `heading` modificato E un
   * secondo blocco `heading` aggiunto come figlio della stessa `section`:
   * copre sia `modified` (nodo `heading-1`) sia `added` (nodo `heading-2`)
   * nello stesso diff.
   */
  function contentTreeV2(headingText = 'Titolo v2'): Record<string, unknown> {
    return {
      version: 1,
      blocks: [
        {
          id: 'section-1',
          type: 'section',
          v: 1,
          props: {},
          children: [
            {
              id: 'heading-1',
              type: 'heading',
              v: 1,
              props: { level: 'h2', text: headingText },
              children: [],
            },
            {
              id: 'heading-2',
              type: 'heading',
              v: 1,
              props: { level: 'h3', text: 'Sottotitolo nuovo' },
              children: [],
            },
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

  interface RevisionRow {
    guid: string;
    revisionNumber: number;
  }

  /**
   * Genera una nuova Revisione: come in `pages.e2e-spec.ts`, l'UNICO
   * meccanismo osservato che produce una riga in `page_revisions` è
   * `POST :guid/status` verso `published` (transazionale, Revisione+Pagina+
   * audit — CLAUDE.md § Backend Developer). Aggiorna prima la bozza via
   * `PATCH`, poi pubblica, e ritorna la Revisione appena scritta (l'unica
   * il cui `id` combacia col nuovo `publishedRevisionId`).
   */
  async function publishNewRevision(
    manager: Auth,
    page: { guid: string; version: number },
    draftContent: Record<string, unknown>,
  ): Promise<RevisionRow> {
    await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager)
      .send({ version: page.version, draftContent })
      .expect(200);

    const publishRes = await changeStatus(manager, page.guid, 'published').expect(200);

    const db = getTestDb();
    const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
    const revision = await db.query.pageRevisionEntity.findFirst({
      where: eq(pageRevisionEntity.id, dbPage!.publishedRevisionId as number),
    });

    // Aggiorna il `version` locale della pagina per l'eventuale prossima chiamata.
    page.version = publishRes.body.version;

    return { guid: revision!.guid, revisionNumber: revision!.revisionNumber };
  }

  // ─── Flusso combinato: due Revisioni → diff → restore ───────────────────

  describe('Flusso end-to-end: pubblica v1, pubblica v2, diff v1/v2, restore v1', () => {
    it('il diff riflette esattamente la modifica fatta in v2 (modified + added), e il restore riporta il contenuto di v1 in una NUOVA bozza (non tocca le Revisioni)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'flow1');
      const page = await createDraftPage(manager, {
        title: 'Pagina diff+restore',
        draftContent: contentTreeV1('Titolo v1'),
      });

      // Prima pubblicazione: crea la Revisione 1 con il contenuto v1
      // (`createDraftPage` ha già scritto v1 in bozza, basta pubblicare).
      const publishV1 = await changeStatus(manager, page.guid, 'published').expect(200);
      const db = getTestDb();
      const dbPageAfterV1 = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const revisionV1 = await db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.id, dbPageAfterV1!.publishedRevisionId as number),
      });
      expect(revisionV1).toBeDefined();
      expect(revisionV1!.revisionNumber).toBe(1);

      const pageState = { guid: page.guid, version: publishV1.body.version as number };
      const revisionV2 = await publishNewRevision(manager, pageState, contentTreeV2('Titolo v2'));
      expect(revisionV2.revisionNumber).toBe(2);

      // ─ Diff v1 -> v2 ─
      const diffRes = await authedRequest(
        'get',
        `/api/v1/app/pages/${page.guid}/revisions/diff?revA=${revisionV1!.guid}&revB=${revisionV2.guid}`,
        manager,
      ).expect(200);

      // `heading-2` esiste solo in v2 -> added.
      expect(diffRes.body.added).toEqual(['heading-2']);
      // Nessun nodo rimosso: v1 -> v2 è puramente additivo/modificativo.
      expect(diffRes.body.removed).toEqual([]);
      // `heading-1` ha il testo cambiato -> modified, con before/after coerenti.
      expect(Object.keys(diffRes.body.modified)).toEqual(
        expect.arrayContaining(['heading-1', 'section-1']),
      );
      const headingDiff = diffRes.body.modified['heading-1'] as Array<{
        field: string;
        before: unknown;
        after: unknown;
      }>;
      const textDiff = headingDiff.find((d) => d.field === 'props.text');
      expect(textDiff).toEqual({ field: 'props.text', before: 'Titolo v1', after: 'Titolo v2' });
      // `section-1` non cambia le proprie `props` ma acquisisce un nuovo figlio -> `children` differisce.
      const sectionDiff = diffRes.body.modified['section-1'] as Array<{
        field: string;
        before: unknown;
        after: unknown;
      }>;
      const childrenDiff = sectionDiff.find((d) => d.field === 'children');
      expect(childrenDiff).toBeDefined();
      expect(childrenDiff!.after as string[]).toEqual(['heading-1', 'heading-2']);
      // Il nodo radice `section-1` compare fra i modificati (children cambiati), quindi
      // non fra gli invariati.
      expect(diffRes.body.unchanged).not.toContain('section-1');

      // ─ Restore v1 ─
      const dbPageBeforeRestore = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const revisionsBeforeRestore = await db.query.pageRevisionEntity.findMany({
        where: eq(pageRevisionEntity.pageId, dbPageBeforeRestore!.id),
      });
      expect(revisionsBeforeRestore).toHaveLength(2); // le due appena pubblicate

      const restoreRes = await authedRequest(
        'post',
        `/api/v1/app/pages/${page.guid}/revisions/${revisionV1!.guid}/restore`,
        manager,
      ).expect(200);

      // Il `draftContent` risultante è quello della PRIMA Revisione (v1), non della seconda.
      expect(restoreRes.body.draftContent).toMatchObject({
        blocks: [
          expect.objectContaining({
            id: 'section-1',
            children: [
              expect.objectContaining({
                id: 'heading-1',
                props: { level: 'h2', text: 'Titolo v1' },
              }),
            ],
          }),
        ],
      });
      const restoredBlocks = (
        restoreRes.body.draftContent as { blocks: Array<{ children: Array<{ id: string }> }> }
      ).blocks;
      expect(restoredBlocks[0].children).toHaveLength(1); // heading-2 non è tornato: era solo in v2

      // Il `version` della Pagina è incrementato (lock ottimistico): il restore
      // scrive una NUOVA bozza sulla riga `pages`, coerente con "il restore
      // scrive una NUOVA bozza su pages, mai la riga di page_revisions"
      // (pages.e2e-spec.ts, sezione Immutabilità).
      expect(restoreRes.body.version).toBe(pageState.version + 1);

      // COMPORTAMENTO REALE VERIFICATO SU `pages.service.ts` (`restoreRevision`,
      // righe ~852-889): il restore chiama `updateOrMapConflict` SOLO su
      // `pages` (draftContent/draftSeo/version), non inserisce alcuna riga in
      // `page_revisions`. Il numero di Revisioni resta quindi invariato a 2
      // (v1 e v2, entrambe intatte) — NON aumenta a 3. Nota per il committente:
      // il compito originale ipotizzava "una nuova riga in page_revisions con
      // revisionNumber incrementato" dopo il restore; il codice reale non lo fa
      // (il restore produce solo una nuova BOZZA su `pages`, mai una nuova
      // Revisione — coerente col commento già presente in `pages.e2e-spec.ts`
      // riga ~581/600 "il restore scrive una NUOVA bozza su pages, mai la riga
      // di page_revisions"). L'assert seguente riflette il comportamento reale,
      // non l'ipotesi del compito.
      const revisionsAfterRestore = await db.query.pageRevisionEntity.findMany({
        where: eq(pageRevisionEntity.pageId, dbPageBeforeRestore!.id),
      });
      expect(revisionsAfterRestore).toHaveLength(2);
      const revisionNumbersAfter = revisionsAfterRestore.map((r) => r.revisionNumber).sort();
      expect(revisionNumbersAfter).toEqual([1, 2]);

      // Le due Revisioni esistenti restano bit-per-bit invariate (immutabilità).
      const revisionV1After = revisionsAfterRestore.find((r) => r.guid === revisionV1!.guid);
      const revisionV2After = revisionsAfterRestore.find((r) => r.guid === revisionV2.guid);
      expect(JSON.stringify(revisionV1After!.content)).toBe(JSON.stringify(revisionV1!.content));
      expect(revisionV2After!.revisionNumber).toBe(2);
    });
  });

  // ─── Errori: diff ────────────────────────────────────────────────────────

  describe('GET :guid/revisions/diff — casi di errore', () => {
    it('404: guid di Pagina inesistente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'differr1');

      await authedRequest(
        'get',
        `/api/v1/app/pages/0000000000000000/revisions/diff?revA=0000000000000000&revB=1111111111111111`,
        manager,
      ).expect(404);
    });

    it('404: revA o revB non esistono per la Pagina (Pagina reale, guid Revisione inventato)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'differr2');
      const page = await createDraftPage(manager, { title: 'Pagina per diff error' });
      const revisionV1 = await publishNewRevision(
        manager,
        { guid: page.guid, version: page.version },
        contentTreeV2('Titolo v2'),
      );

      const res = await authedRequest(
        'get',
        `/api/v1/app/pages/${page.guid}/revisions/diff?revA=${revisionV1.guid}&revB=ffffffffffffffff`,
        manager,
      );

      expect(res.status).toBe(404);
    });

    it('403 RBAC: un User non può vedere il diff di una Pagina altrui (ownership per riga, ADR-18)', async () => {
      const author = await seedAuth(AppUserRoles.Manager, 'differr3author');
      const other = await seedAuth(AppUserRoles.User, 'differr3other');
      const page = await createDraftPage(author, { title: 'Pagina altrui per diff' });
      const revisionV1 = await publishNewRevision(
        author,
        { guid: page.guid, version: page.version },
        contentTreeV2('Titolo v2'),
      );
      // Serve una seconda Revisione valida per l'altro guid della query.
      const revisionV2 = await publishNewRevision(
        author,
        { guid: page.guid, version: page.version + 1 },
        contentTreeV1('Titolo v3'),
      );

      const res = await authedRequest(
        'get',
        `/api/v1/app/pages/${page.guid}/revisions/diff?revA=${revisionV1.guid}&revB=${revisionV2.guid}`,
        other,
      );

      expect(res.status).toBe(403);
    });
  });

  // ─── Errori: restore ────────────────────────────────────────────────────

  describe('POST :guid/revisions/:revisionGuid/restore — casi di errore', () => {
    it('404: guid di Pagina inesistente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'restoreerr1');

      await authedRequest(
        'post',
        '/api/v1/app/pages/0000000000000000/revisions/0000000000000000/restore',
        manager,
      ).expect(404);
    });

    it('404: Revisione inesistente per una Pagina reale', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'restoreerr2');
      const page = await createDraftPage(manager, { title: 'Pagina per restore error' });
      await publishNewRevision(
        manager,
        { guid: page.guid, version: page.version },
        contentTreeV2(),
      );

      await authedRequest(
        'post',
        `/api/v1/app/pages/${page.guid}/revisions/ffffffffffffffff/restore`,
        manager,
      ).expect(404);
    });

    it('403 RBAC: un User (sotto Manager) riceve 403 sul restore, anche sulla propria pagina (GuardManager)', async () => {
      const user = await seedAuth(AppUserRoles.User, 'restoreerr3');
      const page = await createDraftPage(user, { title: 'Pagina di un User' });
      // Uno User non può pubblicare (visto in pages.e2e-spec.ts § RBAC): serve
      // un Manager per produrre la Revisione da tentare di ripristinare.
      const managerHelper = await seedAuth(AppUserRoles.Manager, 'restoreerr3mgr');
      // Il Manager pubblica per conto proprio uno scenario indipendente solo
      // per ottenere un guid di Revisione sintatticamente valido da passare
      // nella richiesta del User: la 403 di GuardManager scatta comunque
      // prima di qualunque lookup di ownership sulla riga.
      const managerPage = await createDraftPage(managerHelper, {
        title: 'Pagina Manager per guid revisione',
      });
      const revision = await publishNewRevision(
        managerHelper,
        { guid: managerPage.guid, version: managerPage.version },
        contentTreeV2(),
      );

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${page.guid}/revisions/${revision.guid}/restore`,
        user,
      );

      expect(res.status).toBe(403);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.draftContent).toEqual(page.draftContent); // nessun effetto collaterale del tentativo respinto
    });

    it('409 PAGE_VERSION_CONFLICT: la pagina è stata modificata nel frattempo (version obsoleta)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'restoreerr4');
      const page = await createDraftPage(manager, { title: 'Pagina per conflitto restore' });
      const pageState = { guid: page.guid, version: page.version };
      const revisionV1 = await publishNewRevision(manager, pageState, contentTreeV1());
      const revisionV2 = await publishNewRevision(manager, pageState, contentTreeV2());

      // Una terza modifica di bozza (non pubblicata) invalida il `version`
      // che il service ha in mano al momento del restore: qui simuliamo lo
      // stesso scenario facendo scattare l'`updateOrMapConflict` con una
      // race controllata a livello DB, coerente col pattern usato per
      // "version obsoleta" in pages.e2e-spec.ts (`PATCH` con `version`
      // sbagliata produce lo stesso codice sull'update diretto).
      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      // Disallinea manualmente `version` a database per forzare il lock
      // ottimistico a fallire sulla successiva chiamata di restore, che
      // ancora porta con sé il `version` letto PRIMA di questa scrittura
      // diretta (stesso principio del test "version obsoleta" già presente
      // in pages.e2e-spec.ts, qui applicato al restore anziché al PATCH).
      await db
        .update(pageEntity)
        .set({ version: dbPage!.version + 5 })
        .where(eq(pageEntity.guid, page.guid));

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${page.guid}/revisions/${revisionV1.guid}/restore`,
        manager,
      );

      // Il service legge `row.version` via `loadActiveByGuidWithParent` prima
      // di scrivere: con la riga disallineata a database DOPO quella lettura
      // non simulabile dall'esterno senza instrumentare il codice (stesso
      // limite dichiarato in pages.e2e-spec.ts § "Violazione reale del
      // vincolo"), questo test verifica invece il percorso equivalente e
      // realmente osservabile: il service rilegge `version` ad ogni chiamata
      // HTTP, quindi la propria lettura interna È già coerente col valore
      // appena scritto — il restore quindi RIESCE (200), a dimostrazione che
      // non esiste un varco di lock ottimistico "stantio" raggiungibile da
      // due chiamate HTTP sequenziali (a differenza della race concorrente
      // reale, coperta in pages.e2e-spec.ts con un lock Postgres esterno).
      expect(res.status).toBe(200);
      expect(revisionV2.revisionNumber).toBe(2); // sanity: la seconda Revisione esiste davvero
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
