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
import { Client } from 'pg';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { mapPgError } from '../../src/common/db-error.mapper';
import { pageEntity, pageRevisionEntity, userEntity } from '../../src/db/schema';
import { PagesService } from '../../src/pages/pages.service';
import { ChangeStatusDto } from '../../src/pages/dto/change-status.dto';
import { PageDto } from '../../src/pages/dto/page.dto';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test di integrazione di `PagesController`/`PagesService`/`pages.state-machine.ts`
 * (F01/T6) contro Postgres/Redis REALI (`AppModule` completo, nessun repository/
 * service mockato — stesso pattern di `sanity-isolation.e2e-spec.ts`). Mock solo
 * per i servizi esterni veri (SMTP, via `network-mocks.setup.ts`); niente mock su
 * Postgres, in linea con il precedente T3 (bug di transform Jest mascherato da una
 * suite e2e che girava solo contro mock).
 *
 * Autenticazione "simulata" ma realistica: JWT firmato con la stessa chiave
 * dell'app, sessione realmente scritta su Redis (`login:<token>`), cookie `rtk`
 * firmato con lo stesso algoritmo di `cookie-parser` — passa dal vero
 * `AuthMiddleware`, non lo bypassa (stesso pattern di `files.e2e-spec.ts`).
 */
describe('PagesController (e2e, DB/Redis reali)', () => {
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

  // ─── Helpers ────────────────────────────────────────────────────────────

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
        email: `pages.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
   * Albero minimo valido con un blocco `richText` (kind `richText`, profilo
   * `basic`) la cui prop `html` porta un payload palesemente ostile — usato
   * dai test di sanitizzazione XSS (SPEC-F02-blocchi.md § 2/§ 3.4). `v: 1` è
   * obbligatorio in scrittura (ADR-21 § 1).
   */
  function contentTreeWithMalicious(html: string): Record<string, unknown> {
    return {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'richText',
          v: 1,
          props: { html },
          children: [],
        },
      ],
    };
  }

  /**
   * Albero minimo valido, generico e innocuo, usato ovunque il contenuto non
   * sia l'oggetto del test: un blocco `heading` (`level`/`text`, entrambi
   * obbligatori — SPEC-F02-blocchi.md § 3.3). `text` è `plainText`: nessuna
   * trasformazione HTML, la prop sopravvive verbatim (a parte i caratteri di
   * controllo, assenti in questi valori).
   */
  function safeContentTree(text = 'Testo lecito'): Record<string, unknown> {
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
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: overrides.locale ?? 'it-IT',
        draftContent: overrides.draftContent ?? safeContentTree(),
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

  /** Registra il registro Locale attivi (RFC-F05 § 1) come farebbe un Admin da UI. */
  async function setActiveLocales(admin: Auth, active: string[], defaultLocale: string): Promise<void> {
    await authedRequest('put', '/api/v1/app/settings/multilingual', admin)
      .send({ active, default: defaultLocale })
      .expect(200);
  }

  // ─── 1. Macchina a stati: transizioni non ammesse ──────────────────────

  describe('Macchina a stati — transizioni non ammesse', () => {
    it('draft -> archived: 400 PAGE_STATUS_TRANSITION_NOT_ALLOWED (non in mappa da "draft")', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'mgr1');
      const page = await createDraftPage(manager);

      const res = await changeStatus(manager, page.guid, 'archived');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAGE_STATUS_TRANSITION_NOT_ALLOWED');
      // AllExceptionsFilter preserva i campi extra dell'eccezione in `details`
      // (Error Handling Policy, CLAUDE.md): la transizione rifiutata è quindi
      // verificabile in modo strutturato, non solo nel testo del `message`.
      expect(res.body.message).toContain('draft -> archived');
      expect(res.body.details).toEqual({ transition: 'draft->archived' });
    });

    it('review -> archived: 400 PAGE_STATUS_TRANSITION_NOT_ALLOWED', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'mgr2');
      const page = await createDraftPage(manager);
      await changeStatus(manager, page.guid, 'review').expect(200);

      const res = await changeStatus(manager, page.guid, 'archived');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAGE_STATUS_TRANSITION_NOT_ALLOWED');
      // AllExceptionsFilter preserva i campi extra dell'eccezione in `details`
      // (Error Handling Policy, CLAUDE.md): la transizione rifiutata è quindi
      // verificabile in modo strutturato, non solo nel testo del `message`.
      expect(res.body.message).toContain('review -> archived');
      expect(res.body.details).toEqual({ transition: 'review->archived' });
    });

    it('scheduled -> review: 400 PAGE_STATUS_TRANSITION_NOT_ALLOWED', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'mgr3');
      const page = await createDraftPage(manager);
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await changeStatus(manager, page.guid, 'scheduled', future).expect(200);

      const res = await changeStatus(manager, page.guid, 'review');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAGE_STATUS_TRANSITION_NOT_ALLOWED');
      // AllExceptionsFilter preserva i campi extra dell'eccezione in `details`
      // (Error Handling Policy, CLAUDE.md): la transizione rifiutata è quindi
      // verificabile in modo strutturato, non solo nel testo del `message`.
      expect(res.body.message).toContain('scheduled -> review');
      expect(res.body.details).toEqual({ transition: 'scheduled->review' });
    });

    it('published -> scheduled: 400 PAGE_STATUS_TRANSITION_NOT_ALLOWED', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'mgr4');
      const page = await createDraftPage(manager);
      await changeStatus(manager, page.guid, 'published').expect(200);

      const res = await changeStatus(manager, page.guid, 'scheduled');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAGE_STATUS_TRANSITION_NOT_ALLOWED');
      // AllExceptionsFilter preserva i campi extra dell'eccezione in `details`
      // (Error Handling Policy, CLAUDE.md): la transizione rifiutata è quindi
      // verificabile in modo strutturato, non solo nel testo del `message`.
      expect(res.body.message).toContain('published -> scheduled');
      expect(res.body.details).toEqual({ transition: 'published->scheduled' });
    });

    it('archived -> scheduled: 400 PAGE_STATUS_TRANSITION_NOT_ALLOWED', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'mgr5');
      const page = await createDraftPage(manager);
      await changeStatus(manager, page.guid, 'published').expect(200);
      await changeStatus(manager, page.guid, 'archived').expect(200);

      const res = await changeStatus(manager, page.guid, 'scheduled');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAGE_STATUS_TRANSITION_NOT_ALLOWED');
      // AllExceptionsFilter preserva i campi extra dell'eccezione in `details`
      // (Error Handling Policy, CLAUDE.md): la transizione rifiutata è quindi
      // verificabile in modo strutturato, non solo nel testo del `message`.
      expect(res.body.message).toContain('archived -> scheduled');
      expect(res.body.details).toEqual({ transition: 'archived->scheduled' });
    });

    it('stato sconosciuto nel payload: 400 (class-validator, mai raggiunge la state machine)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'mgr6');
      const page = await createDraftPage(manager);

      const res = await changeStatus(manager, page.guid, 'deleted-forever');

      expect(res.status).toBe(400);
    });
  });

  // ─── 1bis. Ripubblicazione esplicita (published -> published) ──────────

  describe('Macchina a stati — ripubblicazione esplicita (published -> published, business-rules.md § Regola 1)', () => {
    it('una pagina già "published" con bozza modificata torna "published" con status invariato durante tutta l\'operazione, nuova Revisione creata e publishedRevisionId aggiornato', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'republish1');
      const page = await createDraftPage(manager, {
        title: 'Pagina da ripubblicare',
        draftContent: safeContentTree('Contenuto v1'),
      });

      const firstPublish = await changeStatus(manager, page.guid, 'published').expect(200);
      expect(firstPublish.body.status).toBe('published');

      const db = getTestDb();
      const afterFirstPublish = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const firstRevisionId = afterFirstPublish!.publishedRevisionId;
      expect(afterFirstPublish!.status).toBe('published');
      expect(firstRevisionId).not.toBeNull();

      // Modifica la bozza di una pagina già pubblicata: `update()` non tocca
      // mai `status` (verificato leggendo `pages.service.ts`), quindi la riga
      // resta "published" anche con `draftContent` divergente da quanto
      // pubblicato — esattamente la prima parte della Regola 1.
      const patchRes = await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager)
        .send({ version: firstPublish.body.version, draftContent: safeContentTree('Contenuto v2') })
        .expect(200);
      expect(patchRes.body.status).toBe('published');

      const afterDraftEdit = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      expect(afterDraftEdit!.status).toBe('published'); // mai regredito a "draft"

      // Ripubblicazione esplicita: published -> published, ora ammessa dalla mappa.
      const republish = await changeStatus(manager, page.guid, 'published');
      expect(republish.status).toBe(200);
      expect(republish.body.status).toBe('published');

      const afterRepublish = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      expect(afterRepublish!.status).toBe('published'); // mai uscito da "published"
      expect(afterRepublish!.publishedRevisionId).not.toBe(firstRevisionId);

      const revisions = await db.query.pageRevisionEntity.findMany({
        where: eq(pageRevisionEntity.pageId, afterRepublish!.id),
      });
      expect(revisions).toHaveLength(2);
      const revisionNumbers = revisions.map((r) => r.revisionNumber).sort();
      expect(revisionNumbers).toEqual([1, 2]);

      const newRevision = revisions.find((r) => r.id === afterRepublish!.publishedRevisionId);
      expect(newRevision).toBeDefined();
      expect(newRevision!.revisionNumber).toBe(2);
      expect((newRevision!.content as { blocks: Array<{ props: { text: string } }> }).blocks[0].props.text).toBe(
        'Contenuto v2',
      );
    });

    it('un User non elevato riceve 403 anche su published -> published (nessuna eccezione alla soglia di elevazione)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'republish2mgr');
      const user = await seedAuth(AppUserRoles.User, 'republish2user');
      const page = await createDraftPage(manager, { title: 'Pagina published, User prova a ripubblicare' });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const res = await changeStatus(user, page.guid, 'published');

      expect(res.status).toBe(403);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.status).toBe('published'); // invariato, nessun effetto collaterale del tentativo respinto
    });
  });

  // ─── 2. Concorrenza: due pubblicazioni parallele ───────────────────────

  describe('Concorrenza — due pubblicazioni parallele sulla stessa pagina', () => {
    it('la seconda riceve 409 PAGE_VERSION_CONFLICT, una sola Revisione persiste, nessun revisionNumber duplicato', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'race1');
      const page = await createDraftPage(manager, { title: 'Pagina in gara' });
      expect(page.version).toBe(1);

      // Race reale contro il DB, invocata direttamente sulla stessa istanza
      // `PagesService` iniettata nell'app (stesso metodo di produzione chiamato
      // dal controller, nessuna logica duplicata), sincronizzata con un lock di
      // riga Postgres reale tenuto da una sessione esterna — non un mock, non
      // un varco applicativo inventato.
      //
      // Motivo: `changeStatus` fa prima una SELECT non lockata
      // (`loadActiveByGuidWithParent`) e solo poi, dentro `publishTransactionally`,
      // la UPDATE con lock ottimistico (`WHERE version = :version`). Senza
      // sincronizzazione esterna, il jitter tra le due chiamate (anche dirette,
      // anche con `Promise.all`) fa occasionalmente completare la PRIMA
      // pubblicazione per intero (SELECT+UPDATE+commit) prima che la SELECT della
      // seconda parta: in quel caso la seconda vede `status` già `published` e
      // riceve `400 PAGE_STATUS_TRANSITION_NOT_ALLOWED` — comportamento comunque
      // corretto (nessuna doppia pubblicazione), ma un esito diverso da quello
      // richiesto da questo test (409 di lock ottimistico sullo STESSO `version`
      // di partenza), verificato empiricamente come non deterministico su questa
      // macchina (~30% delle esecuzioni).
      //
      // Per rendere il test deterministico si tiene, da una sessione Postgres
      // indipendente, un `SELECT ... FOR UPDATE` sulla riga della pagina PRIMA di
      // avviare le due pubblicazioni: la loro SELECT iniziale (non lockata) legge
      // comunque `version=1`, ma la loro UPDATE con lock ottimistico si blocca
      // realmente in coda sul lock di riga Postgres. Rilasciando il lock esterno,
      // Postgres sblocca le due UPDATE in sequenza: la prima trova `version=1` e
      // riesce, la seconda rivaluta la `WHERE` sulla riga ormai a `version=2` e
      // aggiorna zero righe — esattamente il conflitto ottimistico richiesto.
      const lockClient = new Client({ connectionString: AppConstants.databaseUrl });
      await lockClient.connect();
      await lockClient.query('BEGIN');
      await lockClient.query('SELECT id FROM pages WHERE guid = $1 FOR UPDATE', [page.guid]);

      const pagesService = app.get(PagesService);
      const authInfo = {
        userId: manager.userId,
        role: AppUserRoles.Manager,
        name: 'E2E',
        scopeId: null,
      };
      const changeStatusDto = { status: 'published' } as ChangeStatusDto;

      const outcomesPromise = Promise.allSettled([
        pagesService.changeStatus(page.guid, changeStatusDto, authInfo),
        pagesService.changeStatus(page.guid, changeStatusDto, authInfo),
      ]);

      // Lascia il tempo a entrambe le chiamate di superare la SELECT iniziale e
      // bloccarsi sulla UPDATE lockata dalla sessione esterna, poi rilascia il lock.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await lockClient.query('COMMIT');
      await lockClient.end();

      const outcomes = await outcomesPromise;

      const successes = outcomes.filter(
        (o): o is PromiseFulfilledResult<PageDto> => o.status === 'fulfilled',
      );
      const conflicts = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      const conflictError = conflicts[0].reason as {
        getStatus?: () => number;
        getResponse?: () => unknown;
      };
      expect(conflictError.getStatus?.()).toBe(409);
      expect(conflictError.getResponse?.()).toMatchObject({ code: 'PAGE_VERSION_CONFLICT' });

      // Nessuna revisione orfana: esattamente una riga in page_revisions per questa pagina.
      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage).toBeDefined();

      const revisions = await db.query.pageRevisionEntity.findMany({
        where: eq(pageRevisionEntity.pageId, dbPage!.id),
      });
      expect(revisions).toHaveLength(1);

      // Nessun revisionNumber duplicato (verifica esplicita richiesta, oltre al conteggio).
      const numbers = revisions.map((r) => r.revisionNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(numbers).toEqual([1]);

      // La pubblicazione riuscita non ha perso dati: la pagina è realmente `published`
      // e punta alla revisione appena creata.
      expect(dbPage!.status).toBe('published');
      expect(dbPage!.publishedRevisionId).toBe(revisions[0].id);
    });
  });

  // ─── 3. Violazione reale del vincolo page_revisions_page_number_uq ─────

  describe('Violazione reale del vincolo univoco page_revisions_page_number_uq', () => {
    it(
      'documenta perché il flusso applicativo reale non è racabile per una doppia scrittura ' +
        'con lo stesso revisionNumber (vedi commento) e dimostra che, se il vincolo Postgres scatta ' +
        'davvero, mapPgError lo mappa in 409 REVISION_NUMBER_CONFLICT, mai 500',
      async () => {
        // TENTATIVO FATTO E PERCHÉ NON PRODUCE UNA VIOLAZIONE REALE VIA HTTP:
        // `publishTransactionally` (pages.service.ts) esegue PRIMA `UPDATE pages
        // ... WHERE id=:id AND version=:version` dentro la transazione: quella
        // UPDATE acquisisce il lock di riga su `pages` e SOLO DOPO (nella stessa
        // transazione, con l'`SELECT max(revisionNumber)` eseguita dopo il lock)
        // calcola il prossimo `revisionNumber`. Il test "Concorrenza" qui sopra
        // dimostra che con due pubblicazioni HTTP concorrenti sulla stessa pagina
        // la seconda riceve SEMPRE 409 PAGE_VERSION_CONFLICT su quella UPDATE,
        // PRIMA di raggiungere l'INSERT su `page_revisions`: il lock ottimistico
        // serializza esattamente la sezione critica che calcola `revisionNumber`,
        // per costruzione (commento nel service, righe 330-337). Riprodurre la
        // violazione del vincolo dal flusso applicativo richiederebbe un
        // breakpoint dentro la stessa transazione Nest già aperta, tra la SELECT
        // max e l'INSERT — non riproducibile da un test black-box via HTTP senza
        // instrumentare il codice di produzione, cosa che il Test Engineer non fa
        // (CLAUDE.md: "non modifica mai la logica applicativa").
        //
        // Questo test dimostra quindi, senza inventare un varco applicativo
        // inesistente:
        // 1) una violazione REALE (non simulata) del vincolo Postgres
        //    `page_revisions_page_number_uq`, ottenuta con due INSERT diretti
        //    concorrenti sulla stessa (pageId, revisionNumber) — nessun mock;
        // 2) che `mapPgError`, la funzione di produzione reale importata da
        //    `db-error.mapper.ts` (non ridefinita né mockata), mappa quell'errore
        //    reale in `ConflictException` 409 con `code: 'REVISION_NUMBER_CONFLICT'`,
        //    mai un 500.
        const manager = await seedAuth(AppUserRoles.Manager, 'race-unique');
        const page = await createDraftPage(manager, { title: 'Pagina per vincolo revisioni' });

        const db = getTestDb();
        const dbPage = await db.query.pageEntity.findFirst({
          where: eq(pageEntity.guid, page.guid),
        });
        expect(dbPage).toBeDefined();

        const insertOne = () =>
          db.insert(pageRevisionEntity).values({
            pageId: dbPage!.id,
            revisionNumber: 1,
            title: 'snap',
            slug: 'snap',
            content: { version: 1, blocks: [] },
            seo: {},
            createdBy: manager.userId,
          });

        const outcomes = await Promise.allSettled([insertOne(), insertOne()]);
        const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
        const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

        // Prova che il vincolo Postgres è realmente scattato: una riga sola persiste.
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const realPgError = rejected[0].reason;

        // `mapPgError` rilancia sempre (mai un return normale): la sua
        // conversione va osservata via try/catch, non via valore di ritorno.
        let mapped: unknown;
        try {
          mapPgError(realPgError);
        } catch (err) {
          mapped = err;
        }

        expect(mapped).toBeDefined();
        const mappedAny = mapped as { getStatus?: () => number; getResponse?: () => unknown };
        expect(typeof mappedAny.getStatus).toBe('function');
        expect(mappedAny.getStatus!()).toBe(409);
        expect(mappedAny.getResponse!()).toMatchObject({ code: 'REVISION_NUMBER_CONFLICT' });

        const revisions = await db.query.pageRevisionEntity.findMany({
          where: eq(pageRevisionEntity.pageId, dbPage!.id),
        });
        expect(revisions).toHaveLength(1);
      },
    );
  });

  // ─── 4. Immutabilità delle Revisioni ────────────────────────────────────

  describe('Immutabilità delle Revisioni', () => {
    it('non esiste alcuna route PATCH/PUT su una Revisione (404: nessun handler registrato)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'immut1');
      const page = await createDraftPage(manager, { title: 'Pagina da pubblicare' });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const revisionsRes = await authedRequest(
        'get',
        `/api/v1/app/pages/${page.guid}/revisions`,
        manager,
      ).expect(200);
      const revisionGuid = revisionsRes.body.items[0].guid as string;

      // Nessun handler @Patch/@Put su `:guid/revisions/:revisionGuid` in pages.controller.ts
      // (verificato leggendo il controller: gli unici verbi esposti sono GET (list/detail)
      // e POST .../restore, che scrive una NUOVA bozza — mai la revisione). Nest risponde
      // 404 perché la route non esiste per quel verbo, non un 405 applicativo dedicato.
      await authedRequest(
        'patch',
        `/api/v1/app/pages/${page.guid}/revisions/${revisionGuid}`,
        manager,
      )
        .send({ title: 'tentativo di modifica' })
        .expect(404);

      // Il contenuto della Revisione resta bit-per-bit invariato dopo il tentativo.
      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      const revisionBefore = await db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.pageId, dbPage!.id),
      });
      expect(revisionBefore!.title).toBe('Pagina da pubblicare');
    });

    it('il restore scrive una NUOVA bozza su pages, mai la riga di page_revisions', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'immut2');
      const page = await createDraftPage(manager, {
        title: 'Titolo originale',
        draftContent: safeContentTree('Contenuto v1'),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const db = getTestDb();
      const dbPageAfterPublish = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const revisionBeforeRestore = await db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.pageId, dbPageAfterPublish!.id),
      });
      const revisionSnapshotBefore = JSON.stringify(revisionBeforeRestore);

      // Ripubblica una bozza diversa (draft ammesso da published -> draft), poi ripristina
      // la revisione originale: la Revisione non deve mai cambiare, solo la bozza di `pages`.
      await changeStatus(manager, page.guid, 'draft').expect(200);

      const restoreRes = await authedRequest(
        'post',
        `/api/v1/app/pages/${page.guid}/revisions/${revisionBeforeRestore!.guid}/restore`,
        manager,
      ).expect(200);

      expect(restoreRes.body.draftContent).toMatchObject({
        blocks: [
          expect.objectContaining({ props: expect.objectContaining({ text: 'Contenuto v1' }) }),
        ],
      });

      const revisionAfterRestore = await db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.pageId, dbPageAfterPublish!.id),
      });
      expect(JSON.stringify(revisionAfterRestore)).toBe(revisionSnapshotBefore);

      // Ancora una sola Revisione: il restore non ne crea una nuova.
      const allRevisions = await db.query.pageRevisionEntity.findMany({
        where: eq(pageRevisionEntity.pageId, dbPageAfterPublish!.id),
      });
      expect(allRevisions).toHaveLength(1);
    });
  });

  // ─── 5. Slug duplicato vs version conflict: code distinti ──────────────

  describe('409 con code distinti — slug duplicato vs version conflict', () => {
    it('slug duplicato: 409 PAGE_SLUG_DUPLICATE, diverso da PAGE_VERSION_CONFLICT', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'slug1');
      await createDraftPage(admin, { title: 'Prima pagina', slug: 'stesso-slug' });

      const res = await authedRequest('post', '/api/v1/app/pages', admin).send({
        title: 'Seconda pagina',
        slug: 'stesso-slug',
        locale: 'it-IT',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAGE_SLUG_DUPLICATE');
      expect(res.body.code).not.toBe('PAGE_VERSION_CONFLICT');
    });

    it('version obsoleta: 409 PAGE_VERSION_CONFLICT, diverso da PAGE_SLUG_DUPLICATE', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'slug2');
      const page = await createDraftPage(admin, { title: 'Pagina versionata' });

      const res = await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, admin).send({
        version: page.version + 999, // volutamente sbagliata
        title: 'Titolo aggiornato',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAGE_VERSION_CONFLICT');
      expect(res.body.code).not.toBe('PAGE_SLUG_DUPLICATE');
    });
  });

  // ─── 6. Sanitizzazione XSS a database + testo semplice verbatim ────────

  describe('Sanitizzazione XSS — verifica diretta a database', () => {
    it('script/onerror/javascript: neutralizzati nel jsonb persistito, mai solo nella risposta HTTP', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'xss1');
      const malicious =
        '<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">click</a>';

      const page = await createDraftPage(admin, {
        title: 'Pagina con XSS',
        draftContent: contentTreeWithMalicious(malicious),
      });

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      const persisted = JSON.stringify(dbPage!.draftContent);

      expect(persisted).not.toMatch(/<script/i);
      expect(persisted).not.toMatch(/onerror\s*=/i);
      expect(persisted).not.toMatch(/javascript:/i);
      expect(persisted).not.toMatch(/<img/i); // img non è in allowedTags
    });

    it('lo stesso payload sopravvive neutralizzato anche nella Revisione dopo la pubblicazione', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'xss2');
      const malicious = '<a href="javascript:alert(1)" onclick="alert(2)">link</a>';

      const page = await createDraftPage(manager, {
        title: 'Pagina XSS pubblicata',
        draftContent: contentTreeWithMalicious(malicious),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      const revision = await db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.pageId, dbPage!.id),
      });
      const persisted = JSON.stringify(revision!.content);

      expect(persisted).not.toMatch(/javascript:/i);
      expect(persisted).not.toMatch(/onclick\s*=/i);
    });

    // Comportamento opposto e complementare al precedente, sulla stessa
    // pipeline: `plainText` non passa MAI da `sanitize-html` e non subisce
    // escaping alla persistenza (ADR-21 § 4) — chiude il limite noto di F01
    // (`"5 < 10"` → `"5 &lt; 10"`). Verificato su `button.label`, l'unica
    // prop `plainText` dei cinque tipi che non porta anche un vincolo di
    // non-vuoto (a differenza di `image.alt`), per isolare solo il
    // comportamento di escaping.
    it('plainText: "5 < 10" sopravvive intatto a database, nessun escaping alla persistenza (ADR-21 § 4)', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'plaintext1');
      const page = await createDraftPage(admin, {
        title: 'Pagina con testo semplice',
        draftContent: {
          version: 1,
          blocks: [
            {
              id: 'b1',
              type: 'button',
              v: 1,
              props: { label: '5 < 10', href: 'https://esempio.it/pagina' },
              children: [],
            },
          ],
        },
      });

      // Verifica sulla risposta HTTP...
      expect(page.draftContent).toMatchObject({
        blocks: [expect.objectContaining({ props: expect.objectContaining({ label: '5 < 10' }) })],
      });

      // ...e a database, non solo sulla risposta (stesso principio dei test XSS sopra).
      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      const persistedBlocks = (
        dbPage!.draftContent as { blocks: Array<{ props: Record<string, unknown> }> }
      ).blocks;
      expect(persistedBlocks[0].props.label).toBe('5 < 10');
      expect(JSON.stringify(dbPage!.draftContent)).not.toMatch(/&lt;/);
    });
  });

  // ─── 7. RBAC — un User non raggiunge mai "published" ───────────────────

  describe('RBAC — un User non pubblica mai, nemmeno sulla propria pagina', () => {
    it('draft -> published direttamente: 403 per un User sulla propria pagina', async () => {
      const user = await seedAuth(AppUserRoles.User, 'rbac1');
      const page = await createDraftPage(user, { title: 'Pagina di un User' });

      const res = await changeStatus(user, page.guid, 'published');

      expect(res.status).toBe(403);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.status).toBe('draft');
    });

    it('nessuna sequenza di transizioni ammesse a un User porta a "published": draft -> review si ferma lì', async () => {
      const user = await seedAuth(AppUserRoles.User, 'rbac2');
      const page = await createDraftPage(user, { title: 'Pagina di un User (review)' });

      // L'unica transizione che uno User può eseguire sulla propria riga è verso "review"
      // (statusTransitionRequiresElevation === false SOLO per "review").
      const toReview = await changeStatus(user, page.guid, 'review');
      expect(toReview.status).toBe(200);
      expect(toReview.body.status).toBe('review');

      // Da "review", ogni transizione (draft/scheduled/published) richiede elevazione:
      // uno User viene respinto su tutte, "published" incluso.
      const toPublished = await changeStatus(user, page.guid, 'published');
      expect(toPublished.status).toBe(403);

      const toScheduled = await changeStatus(
        user,
        page.guid,
        'scheduled',
        new Date(Date.now() + 3600_000).toISOString(),
      );
      expect(toScheduled.status).toBe(403);

      const toDraft = await changeStatus(user, page.guid, 'draft');
      expect(toDraft.status).toBe(403);

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage!.status).toBe('review');
      expect(dbPage!.status).not.toBe('published');
    });
  });

  // ─── T6 — Regressione: restoreRevision ripassa dal sanitizzatore corrente ─

  describe('restoreRevision — regressione: ripassa dal sanitizzatore corrente prima di scrivere la bozza', () => {
    it('il contenuto ripristinato risulta ri-sanitizzato, non una copia bit-per-bit dello snapshot', async () => {
      // `sanitize-html` è idempotente sull'allowlist F01 corrente (verificato:
      // ri-sanitizzare una stringa già sanitizzata con le STESSE opzioni dà lo
      // stesso risultato, niente doppio escaping) — quindi pubblicare/ripristinare
      // contenuto "pulito" non basta a dimostrare che il sanitizzatore sia stato
      // invocato di nuovo: il prima e il dopo sarebbero identici comunque.
      //
      // Per isolare il fix (T6, `restoreRevision`: ripassa `revision.content` dal
      // sanitizzatore corrente prima di scriverlo in `draftContent`) si inserisce
      // DIRETTAMENTE su `page_revisions` una riga con markup pericoloso mai
      // passato dal sanitizzatore applicativo — legittimo banco di prova per una
      // Revisione "storica" (scritta prima che la sanitizzazione fosse rinforzata),
      // scenario esplicitamente citato nel commento del service, senza però dover
      // toccare l'allowlist in vigore. Se il bug fosse ancora presente, `restore`
      // copierebbe lo snapshot as-is e il markup pericoloso sopravviverebbe nella
      // bozza; con la correzione, non sopravvive.
      const manager = await seedAuth(AppUserRoles.Manager, 'restore-sanitize');
      const page = await createDraftPage(manager, { title: 'Pagina con revisione storica' });

      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      expect(dbPage).toBeDefined();

      // Nodo senza `v`: rappresenta una Revisione "storica" scritta prima di
      // ADR-21 (v per nodo assente in lettura ⇒ trattato come 1). `richText`
      // è il tipo reale la cui prop `html` è sanitizzata come rich text.
      const dangerousContent = {
        version: 1,
        blocks: [
          {
            id: 'b1',
            type: 'richText',
            props: { html: '<script>alert(1)</script><a href="javascript:alert(2)">link</a>' },
            children: [],
          },
        ],
      };

      const [legacyRevision] = await db
        .insert(pageRevisionEntity)
        .values({
          pageId: dbPage!.id,
          revisionNumber: 1,
          title: dbPage!.title,
          slug: dbPage!.slug,
          content: dangerousContent,
          seo: {},
          createdBy: manager.userId,
        })
        .returning();

      const restoreRes = await authedRequest(
        'post',
        `/api/v1/app/pages/${page.guid}/revisions/${legacyRevision.guid}/restore`,
        manager,
      ).expect(200);

      const restoredJson = JSON.stringify(restoreRes.body.draftContent);
      expect(restoredJson).not.toMatch(/<script/i);
      expect(restoredJson).not.toMatch(/javascript:/i);

      // Verifica a database, non solo sulla risposta HTTP.
      const dbPageAfterRestore = await db.query.pageEntity.findFirst({
        where: eq(pageEntity.guid, page.guid),
      });
      const persistedJson = JSON.stringify(dbPageAfterRestore!.draftContent);
      expect(persistedJson).not.toMatch(/<script/i);
      expect(persistedJson).not.toMatch(/javascript:/i);

      // La Revisione "storica" inserita direttamente resta immutata (immutabilità, punto 4).
      const legacyAfter = await db.query.pageRevisionEntity.findFirst({
        where: eq(pageRevisionEntity.guid, legacyRevision.guid),
      });
      expect(JSON.stringify(legacyAfter!.content)).toMatch(/<script/i);
    });
  });

  // ─── Traduzioni: POST /app/pages/:guid/translations (RFC-F05 § 3) ─────

  describe('POST /app/pages/:guid/translations (RFC-F05 § 3)', () => {
    it('happy path: crea una traduzione nello stesso translationGroupId, in draft, con contenuto copiato dalla sorgente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'transl1');
      const admin1 = await seedAuth(AppUserRoles.Admin, 'transl1admin');
      await setActiveLocales(admin1, ['it-IT', 'en-GB'], 'it-IT');
      const source = await createDraftPage(manager, {
        title: 'Chi siamo',
        slug: 'chi-siamo',
        locale: 'it-IT',
        draftContent: safeContentTree('Testo originale italiano'),
      });

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      expect(res.body.guid).not.toBe(source.guid);
      expect(res.body.translationGroupId).toBe(source.translationGroupId);
      expect(res.body.locale).toBe('en-GB');
      expect(res.body.status).toBe('draft');
      expect(res.body.slug).toBe('chi-siamo');
      expect(res.body.title).toBe('Chi siamo');
      expect(res.body.parentGuid).toBeNull();
      // Struttura/testi copiati dalla sorgente, ma l'`id` del nodo è rigenerato
      // (previene collisioni d'identità fra le due righe DB, F05-02).
      const sourceBlocks = (source.draftContent as { blocks: { id: string }[] }).blocks;
      const translatedBlocks = (res.body.draftContent as { blocks: { id: string }[] }).blocks;
      expect(translatedBlocks).toHaveLength(sourceBlocks.length);
      expect(translatedBlocks[0].id).not.toBe(sourceBlocks[0].id);
      expect(translatedBlocks.map((b) => ({ ...b, id: undefined }))).toEqual(
        sourceBlocks.map((b) => ({ ...b, id: undefined })),
      );

      const db = getTestDb();
      const rows = await db.query.pageEntity.findMany({
        where: eq(pageEntity.translationGroupId, source.translationGroupId as string),
      });
      expect(rows).toHaveLength(2);
    });

    it('title fornito nel body sovrascrive quello ereditato dalla sorgente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'transl2');
      const admin2 = await seedAuth(AppUserRoles.Admin, 'transl2admin');
      await setActiveLocales(admin2, ['it-IT', 'en-GB'], 'it-IT');
      const source = await createDraftPage(manager, {
        title: 'Chi siamo',
        slug: 'chi-siamo-2',
        locale: 'it-IT',
      });

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB', title: 'About us' })
        .expect(201);

      expect(res.body.title).toBe('About us');
    });

    it('parentId non è mai copiato: la traduzione nasce sempre root, anche se la sorgente ha un genitore', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'transl3');
      const admin3 = await seedAuth(AppUserRoles.Admin, 'transl3admin');
      await setActiveLocales(admin3, ['it-IT', 'en-GB'], 'it-IT');
      const parent = await createDraftPage(manager, { title: 'Genitore', slug: 'genitore' });
      const source = await createDraftPage(manager, {
        title: 'Figlia',
        slug: 'figlia',
        locale: 'it-IT',
      });
      await authedRequest('patch', `/api/v1/app/pages/${source.guid}`, manager)
        .send({ parentGuid: parent.guid, version: source.version })
        .expect(200);

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      expect(res.body.parentGuid).toBeNull();
    });

    it('404: pagina sorgente inesistente', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'transl4');
      const admin4 = await seedAuth(AppUserRoles.Admin, 'transl4admin');
      await setActiveLocales(admin4, ['it-IT', 'en-GB'], 'it-IT');

      await authedRequest('post', '/api/v1/app/pages/0000000000000000/translations', manager)
        .send({ locale: 'en-GB' })
        .expect(404);
    });

    it('404: pagina sorgente soft-eliminata', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'transl5');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');
      const source = await createDraftPage(admin, { title: 'Da eliminare', slug: 'da-eliminare' });
      await authedRequest('delete', `/api/v1/app/pages/${source.guid}`, admin).expect(204);

      await authedRequest('post', `/api/v1/app/pages/${source.guid}/translations`, admin)
        .send({ locale: 'en-GB' })
        .expect(404);
    });

    it('400: locale richiesto non fra i Locale attivi', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'transl6');
      const admin6 = await seedAuth(AppUserRoles.Admin, 'transl6admin');
      await setActiveLocales(admin6, ['it-IT', 'en-GB'], 'it-IT');
      const source = await createDraftPage(manager, { title: 'Pagina', slug: 'pagina-locale' });

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'de-DE' })
        .expect(400);

      expect(res.body.message).toContain('Locale attivi');
    });

    it('409 PAGE_TRANSLATION_LOCALE_DUPLICATE: il gruppo ha già una riga in quel locale', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'transl7');
      const admin7 = await seedAuth(AppUserRoles.Admin, 'transl7admin');
      await setActiveLocales(admin7, ['it-IT', 'en-GB'], 'it-IT');
      const source = await createDraftPage(manager, { title: 'Pagina', slug: 'pagina-dup' });
      const firstTranslation = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(201);

      // Cambia lo slug della prima traduzione: altrimenti il secondo tentativo
      // (che copia lo slug invariato dalla sorgente) violerebbe ANCHE
      // `pages_slug_locale_root_uq` insieme al vincolo qui sotto oggetto del
      // test, e Postgres potrebbe segnalare l'uno o l'altro indistintamente —
      // isolato così, l'unico vincolo ancora violabile è quello di gruppo.
      await authedRequest('patch', `/api/v1/app/pages/${firstTranslation.body.guid}`, manager)
        .send({ slug: 'pagina-dup-en', version: firstTranslation.body.version })
        .expect(200);

      const res = await authedRequest(
        'post',
        `/api/v1/app/pages/${source.guid}/translations`,
        manager,
      )
        .send({ locale: 'en-GB' })
        .expect(409);

      expect(res.body.code).toBe('PAGE_TRANSLATION_LOCALE_DUPLICATE');
    });

    it('nessuna ownership sulla creazione: un User diverso dall\'autore della sorgente può comunque creare la traduzione', async () => {
      const author = await seedAuth(AppUserRoles.User, 'transl8a');
      const admin = await seedAuth(AppUserRoles.Admin, 'transl8b');
      await setActiveLocales(admin, ['it-IT', 'en-GB'], 'it-IT');
      const source = await createDraftPage(author, { title: 'Pagina altrui', slug: 'pagina-altrui' });

      const other = await seedAuth(AppUserRoles.User, 'transl8c');
      await authedRequest('post', `/api/v1/app/pages/${source.guid}/translations`, other)
        .send({ locale: 'en-GB' })
        .expect(201);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
