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
import { desc, eq } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { auditLogEntity, pageEntity, pageRevisionEntity, userEntity } from '../../src/db/schema';
import {
  BLOCK_REGISTRY_TOKEN,
  BlockRegistry,
  DEFAULT_BLOCK_REGISTRY,
  computeBlockRegistryToken,
} from '../../src/blocks/block-registry';
import { BlockDefinition } from '../../src/blocks/block-definition.types';
import { RedisService } from '../../src/redis/redis.service';
import { CacheInvalidationQueueService } from '../../src/queues/cache-invalidation-queue/cache-invalidation.queue.service';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test di integrazione di caching/invalidazione della superficie pubblica
 * delle Pagine (F03/T3/T4, ADR-23) contro Postgres/Redis REALI. Isolato da
 * `public-pages.e2e-spec.ts` (risoluzione/routing) perché ogni scenario qui
 * dipende esplicitamente dallo stato di Redis fra una richiesta e l'altra.
 *
 * Mock solo per i servizi esterni veri (SMTP). Il fallimento del comando
 * `DEL` (scenario 9) e l'irraggiungibilità di Redis (scenario 10) sono
 * simulati con `jest.spyOn` mirato sui metodi di `RedisService` — mai
 * toccando codice applicativo, mai un mock generico di tutto Redis.
 */
describe('Superficie pubblica delle Pagine — cache e invalidazione (e2e, DB/Redis reali)', () => {
  let app: INestApplication;

  const defaultRegistryToken = computeBlockRegistryToken(DEFAULT_BLOCK_REGISTRY);
  const locale = AppConstants.defaultLocale;

  beforeAll(async () => {
    await runMigrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Il rate limit della superficie pubblica è oggetto di
      // `public-pages.e2e-spec.ts` (scenario dedicato); qui i test emettono
      // molte richieste `GET public/pages` sulla stessa rotta/IP nella stessa
      // finestra e il throttler entrerebbe in gioco solo come rumore
      // (429 inatteso su una richiesta che non sta testando il rate limit).
      // Override di sola infrastruttura di test — nessun codice applicativo
      // toccato, il guard reale resta quello verificato nell'altro file.
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
    jest.restoreAllMocks();
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
        email: `public-pages-cache.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
    overrides: Partial<{
      title: string;
      slug: string;
      locale: string;
      parentGuid: string;
      draftContent: Record<string, unknown>;
    }> = {},
  ): Promise<{ guid: string; version: number; status: string; [k: string]: unknown }> {
    const res = await authedRequest('post', '/api/v1/app/pages', auth)
      .send({
        title: overrides.title ?? 'Pagina di test',
        slug: overrides.slug,
        locale: overrides.locale ?? 'it-IT',
        parentGuid: overrides.parentGuid,
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

  function publicGet(path: string): request.Test {
    return request(app.getHttpServer()).get(
      `/api/v1/public/pages?path=${encodeURIComponent(path)}`,
    );
  }

  /** Chiave di cache attesa, replicando `PublicPageCacheService.buildKey` (ADR-23 § 1) col token di produzione. */
  function publicCacheKey(path: string, token: string = defaultRegistryToken): string {
    return `public:${token}:page:${locale}:${path}`;
  }

  // ─── 5. Cache HIT: la mutazione a database non si riflette finché non invalida ─

  describe('Cache HIT: contenuto servito resta quello cacheato finché non scatta un evento di invalidazione', () => {
    it('mutare la Revisione pubblicata a database non altera la risposta pubblica finché la cache è calda', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'hit1');
      const page = await createDraftPage(manager, {
        title: 'Pagina cache hit',
        slug: 'prova-cache-hit',
        draftContent: safeContentTree('Contenuto originale'),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const firstRes = await publicGet('/prova-cache-hit');
      expect(firstRes.status).toBe(200);
      expect(JSON.stringify(firstRes.body.content)).toMatch(/Contenuto originale/);

      // Mutazione diretta della Revisione (immutabile per contratto applicativo,
      // qui solo per dimostrare che la lettura pubblica non tocca più il
      // database finché la cache è calda): senza flush di Redis fra le due
      // richieste.
      const db = getTestDb();
      const dbPage = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, page.guid) });
      await db
        .update(pageRevisionEntity)
        .set({ title: 'Titolo mutato a database' })
        .where(eq(pageRevisionEntity.pageId, dbPage!.id));

      const secondRes = await publicGet('/prova-cache-hit');
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.title).not.toBe('Titolo mutato a database');
      expect(JSON.stringify(secondRes.body.content)).toMatch(/Contenuto originale/);

      // Un evento di invalidazione (spubblicazione) purga la chiave: la
      // Pagina depubblicata non è più raggiungibile, prova che la cache non
      // sopravvive all'evento (anche se qui non si osserva più il contenuto
      // mutato, perché la pagina depubblicata risponde 404 per costruzione).
      await changeStatus(manager, page.guid, 'draft').expect(200);
      const thirdRes = await publicGet('/prova-cache-hit');
      expect(thirdRes.status).toBe(404);
    });
  });

  // ─── 6. Invalidazione sui sei eventi (ADR-23 § 4) ───────────────────────

  describe('Invalidazione della chiave di cache sui sei eventi (ADR-23 § 4)', () => {
    it("pubblicazione/ripubblicazione: il contenuto cacheato riflette sempre l'ultima Revisione pubblicata", async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'evt-publish');
      const page = await createDraftPage(manager, {
        title: 'Pagina A',
        slug: 'prova-ripubblicazione',
        draftContent: safeContentTree('Versione 1'),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const firstRes = await publicGet('/prova-ripubblicazione');
      expect(JSON.stringify(firstRes.body.content)).toMatch(/Versione 1/);

      // Torna a bozza, modifica il contenuto, ripubblica: la ripubblicazione
      // deve invalidare la chiave scritta dalla prima lettura. `version` letta
      // dalla risposta di ogni passo (mai un numero fisso): ogni transizione
      // e ogni PATCH incrementano il lock ottimistico.
      const afterDraft = await changeStatus(manager, page.guid, 'draft').expect(200);
      await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager)
        .send({ version: afterDraft.body.version, draftContent: safeContentTree('Versione 2') })
        .expect(200);
      await changeStatus(manager, page.guid, 'published').expect(200);

      const secondRes = await publicGet('/prova-ripubblicazione');
      expect(secondRes.status).toBe(200);
      expect(JSON.stringify(secondRes.body.content)).toMatch(/Versione 2/);
      expect(JSON.stringify(secondRes.body.content)).not.toMatch(/Versione 1/);
    });

    it('spubblicazione (published -> draft): la chiave viene cancellata, la pagina torna 404', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'evt-unpublish');
      const page = await createDraftPage(manager, {
        title: 'Pagina B',
        slug: 'prova-spubblicazione',
      });
      await changeStatus(manager, page.guid, 'published').expect(200);
      await publicGet('/prova-spubblicazione').expect(200);

      const key = publicCacheKey('/prova-spubblicazione');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(1);

      await changeStatus(manager, page.guid, 'draft').expect(200);

      expect(await redis.exists(key)).toBe(0);
      await publicGet('/prova-spubblicazione').expect(404);
    });

    it('archiviazione: la chiave viene cancellata, la pagina torna 404 (mai servita stantia dalla cache)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'evt-archive');
      const page = await createDraftPage(manager, {
        title: 'Pagina C',
        slug: 'prova-archiviazione',
      });
      await changeStatus(manager, page.guid, 'published').expect(200);
      await publicGet('/prova-archiviazione').expect(200);

      const key = publicCacheKey('/prova-archiviazione');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(1);

      await changeStatus(manager, page.guid, 'archived').expect(200);

      expect(await redis.exists(key)).toBe(0);
      await publicGet('/prova-archiviazione').expect(404);
    });

    it('cambio slug: la vecchia chiave viene cancellata, il vecchio percorso torna 404 subito', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'evt-slug');
      const page = await createDraftPage(manager, {
        title: 'Pagina D',
        slug: 'slug-vecchio',
      });
      await changeStatus(manager, page.guid, 'published').expect(200);
      await publicGet('/slug-vecchio').expect(200);

      const oldKey = publicCacheKey('/slug-vecchio');
      const redis = getTestRedisClient();
      expect(await redis.exists(oldKey)).toBe(1);

      await authedRequest('patch', `/api/v1/app/pages/${page.guid}`, manager)
        .send({ version: page.version + 1, slug: 'slug-nuovo' })
        .expect(200);

      expect(await redis.exists(oldKey)).toBe(0);
      await publicGet('/slug-vecchio').expect(404);
      await publicGet('/slug-nuovo').expect(200);
    });

    it('reparenting (cambio parentGuid): la vecchia chiave del sottoalbero viene cancellata', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'evt-reparent');
      const parent = await createDraftPage(manager, { title: 'Genitore', slug: 'genitore' });
      await changeStatus(manager, parent.guid, 'published').expect(200);

      const child = await createDraftPage(manager, {
        title: 'Figlio',
        slug: 'figlio',
        parentGuid: parent.guid,
      });
      await changeStatus(manager, child.guid, 'published').expect(200);

      await publicGet('/genitore/figlio').expect(200);

      const oldKey = publicCacheKey('/genitore/figlio');
      const redis = getTestRedisClient();
      expect(await redis.exists(oldKey)).toBe(1);

      // Reparenting: il figlio si sposta in radice (parentGuid: null).
      await authedRequest('patch', `/api/v1/app/pages/${child.guid}`, manager)
        .send({ version: child.version + 1, parentGuid: null })
        .expect(200);

      expect(await redis.exists(oldKey)).toBe(0);
      await publicGet('/genitore/figlio').expect(404);
      await publicGet('/figlio').expect(200);
    });

    it('soft delete: la chiave viene cancellata, la pagina torna 404', async () => {
      const admin = await seedAuth(AppUserRoles.Admin, 'evt-delete');
      const page = await createDraftPage(admin, {
        title: 'Pagina E',
        slug: 'prova-soft-delete',
      });
      await changeStatus(admin, page.guid, 'published').expect(200);
      await publicGet('/prova-soft-delete').expect(200);

      const key = publicCacheKey('/prova-soft-delete');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(1);

      await authedRequest('delete', `/api/v1/app/pages/${page.guid}`, admin).expect(204);

      expect(await redis.exists(key)).toBe(0);
      await publicGet('/prova-soft-delete').expect(404);
    });
  });

  // ─── 7. Nessuna TTL sulle chiavi pubbliche (ADR-23 § 3) ─────────────────

  describe('Nessuna TTL sulle chiavi pubbliche (ADR-23 § 3)', () => {
    it('la chiave scritta in cache non ha scadenza (PTTL = -1)', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'nottl1');
      const page = await createDraftPage(manager, {
        title: 'Pagina senza TTL',
        slug: 'prova-no-ttl',
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      await publicGet('/prova-no-ttl').expect(200);

      const key = publicCacheKey('/prova-no-ttl');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(1);
      expect(await redis.pttl(key)).toBe(-1);
    });
  });

  // ─── 8. Nessun negative caching (ADR-23 § 8) ────────────────────────────

  describe('Nessun negative caching: un 404 pubblico non lascia traccia in cache', () => {
    it('una richiesta a un percorso inesistente non scrive alcuna chiave', async () => {
      await publicGet('/percorso-che-non-esiste').expect(404);

      const key = publicCacheKey('/percorso-che-non-esiste');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(0);
    });

    it('una Pagina non pubblicata (404) non scrive alcuna chiave, nemmeno dopo ripetute richieste', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'neg2');
      await createDraftPage(manager, { title: 'Mai pubblicata', slug: 'prova-mai-pubblicata' });

      await publicGet('/prova-mai-pubblicata').expect(404);
      await publicGet('/prova-mai-pubblicata').expect(404);

      const key = publicCacheKey('/prova-mai-pubblicata');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(0);
    });
  });

  // ─── 9. DEL fallito con Redis raggiungibile (ADR-23 § 6) ────────────────

  describe('DEL fallito con Redis raggiungibile: 200 + job BullMQ + audit, nessuna Revisione extra', () => {
    it(
      'la pubblicazione risponde comunque 200, accoda un job di retry, scrive un audit con le chiavi, ' +
        "e crea esattamente una Revisione (come un'operazione riuscita di controllo, non una in più)",
      async () => {
        const manager = await seedAuth(AppUserRoles.Manager, 'delfail1');
        const db = getTestDb();

        // Pagina di controllo: pubblicazione con DEL regolare (nessuno spy),
        // baseline di riferimento — un'operazione riuscita crea esattamente
        // una Revisione.
        const controlPage = await createDraftPage(manager, {
          title: 'Pagina di controllo',
          slug: 'prova-del-controllo',
          draftContent: safeContentTree('Contenuto di controllo'),
        });
        await changeStatus(manager, controlPage.guid, 'published').expect(200);
        const dbControlPage = await db.query.pageEntity.findFirst({
          where: eq(pageEntity.guid, controlPage.guid),
        });
        const controlRevisions = await db.query.pageRevisionEntity.findMany({
          where: eq(pageRevisionEntity.pageId, dbControlPage!.id),
        });
        expect(controlRevisions).toHaveLength(1);

        // Pagina sotto test: un'unica pubblicazione (un solo evento di
        // invalidazione atteso), con il DEL di QUELLA pubblicazione fatto
        // fallire — nessun'altra transizione di stato in mezzo che
        // consumerebbe lo spy `mockRejectedValueOnce` prima del momento
        // voluto.
        const page = await createDraftPage(manager, {
          title: 'Pagina DEL fallito',
          slug: 'prova-del-fallito',
          draftContent: safeContentTree('Prima pubblicazione'),
        });

        // Spy mirato SOLO sul comando DEL del client Redis reale (non su
        // `isReady`, non su tutta la connessione): simula "Redis raggiungibile,
        // ma il comando fallisce" (ADR-23 § 6, secondo esito, distinto da
        // "Redis irraggiungibile"). `delMany` è l'unico metodo aggiunto a
        // `RedisService` per l'invalidazione (ADR-23 § 5): interromperlo qui
        // isola esattamente il comando DEL, senza toccare codice applicativo.
        const delManySpy = jest
          .spyOn(RedisService.prototype, 'delMany')
          .mockRejectedValueOnce(new Error('DEL fallito (simulato dal test)'));

        // Spy sull'accodamento del retry (non un mock: passthrough sull'
        // implementazione reale) — cattura le chiavi passate nel momento
        // esatto della chiamata, senza dipendere da un successivo polling
        // della coda: il job accodato ha `removeOnComplete: true` e un worker
        // reale (`CacheInvalidationProcessor`) montato nello stesso `AppModule`
        // potrebbe già averlo completato e rimosso prima che il test lo legga.
        const enqueueSpy = jest.spyOn(
          CacheInvalidationQueueService.prototype,
          'enqueueInvalidation',
        );

        const publishRes = await authedRequest(
          'post',
          `/api/v1/app/pages/${page.guid}/status`,
          manager,
        ).send({ status: 'published' });

        // La risposta HTTP resta 200: un guasto di cache non deve mai risalire
        // come errore al chiamante (ADR-23 § 6).
        expect(publishRes.status).toBe(200);
        // Almeno una chiamata (quella fatta fallire dallo spy). Il worker
        // BullMQ reale (`CacheInvalidationProcessor`, montato nello stesso
        // `AppModule`) può ritentare `delMany` quasi subito per il job appena
        // accodato: quel secondo tentativo non è mockato (solo
        // `mockRejectedValueOnce`) e tipicamente riesce — non è quindi
        // garantito un conteggio esatto, solo che il fallimento sia avvenuto.
        expect(delManySpy.mock.calls.length).toBeGreaterThanOrEqual(1);

        // Esattamente una Revisione (come l'operazione di controllo riuscita
        // sopra, non una in più): la creazione della Revisione, dentro la
        // transazione Postgres, non è influenzata dal fallimento del DEL, che
        // avviene DOPO il commit.
        const dbPage = await db.query.pageEntity.findFirst({
          where: eq(pageEntity.guid, page.guid),
        });
        const revisions = await db.query.pageRevisionEntity.findMany({
          where: eq(pageRevisionEntity.pageId, dbPage!.id),
        });
        expect(revisions).toHaveLength(1);
        expect(revisions).toHaveLength(controlRevisions.length);

        // Job BullMQ di retry accodato con le chiavi note (ADR-23 § 6).
        expect(enqueueSpy).toHaveBeenCalledTimes(1);
        const enqueuedKeys = enqueueSpy.mock.calls[0][0];
        expect(Array.isArray(enqueuedKeys)).toBe(true);
        expect(enqueuedKeys.length).toBeGreaterThan(0);
        expect(enqueuedKeys[0]).toContain('public:');
        expect(enqueuedKeys[0]).toContain('/prova-del-fallito');

        // Audit log con l'elenco delle chiavi (ADR-23 § 6): il ripristino
        // manuale non deve richiedere di indovinarle.
        const auditRows = await db.query.auditLogEntity.findMany({
          where: eq(auditLogEntity.action, 'public-page-cache.del-failed'),
          orderBy: desc(auditLogEntity.id),
        });
        expect(auditRows.length).toBeGreaterThan(0);
        const lastAudit = auditRows[0];
        expect(lastAudit.details).toBeDefined();
        const parsedDetails = JSON.parse(lastAudit.details!) as { keys: string[] };
        expect(Array.isArray(parsedDetails.keys)).toBe(true);
        expect(parsedDetails.keys).toEqual(enqueuedKeys);
      },
    );
  });

  // ─── 10. Redis irraggiungibile: fallback sul database ──────────────────

  describe('Redis irraggiungibile: la lettura pubblica cade sul database (ADR-23 § 7)', () => {
    it('con Redis "non pronto" la risposta pubblica resta 200 (mai 5xx), letta dal database', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'redisdown1');
      const page = await createDraftPage(manager, {
        title: 'Pagina con Redis giù',
        slug: 'prova-redis-giu',
        draftContent: safeContentTree('Servito dal database'),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      // Simula "Redis irraggiungibile" (distinto da "DEL fallisce"): la
      // connessione resta quella reale, solo `isReady()` viene forzato a
      // `false` per la durata del test, così sia la lettura sia la scrittura
      // di cache si comportano come se Redis non rispondesse (ADR-23 § 7).
      const isReadySpy = jest.spyOn(RedisService.prototype, 'isReady').mockReturnValue(false);

      const res = await publicGet('/prova-redis-giu');

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body.content)).toMatch(/Servito dal database/);

      isReadySpy.mockRestore();

      // Nessuna chiave scritta durante l'irraggiungibilità simulata.
      const key = publicCacheKey('/prova-redis-giu');
      const redis = getTestRedisClient();
      expect(await redis.exists(key)).toBe(0);
    });
  });

  // ─── 11. Token del registro nel prefisso: nessuna collisione fra registri ─

  describe('Token del registro dei blocchi nel prefisso della chiave (ADR-23 § 2): nessuna collisione', () => {
    it('due registri diversi producono due chiavi indipendenti, senza sovrascriversi a vicenda', async () => {
      // Registro alternativo: tutti i tipi di produzione PIÙ un tipo fittizio
      // in più, che non altera la validazione del contenuto usato dal test
      // (un solo blocco `heading`) ma cambia il token calcolato da
      // `computeBlockRegistryToken` (hash di type/v/lunghezza-migrazioni di
      // OGNI definizione nel registro, ADR-23 § 2).
      const fakeExtraBlock: BlockDefinition = {
        type: 'fakeExtra',
        v: 1,
        props: {},
        children: { allow: [] },
        migrations: [],
        enabled: true,
      };
      const altRegistry: BlockRegistry = {
        definitions: new Map([
          ...DEFAULT_BLOCK_REGISTRY.definitions,
          ['fakeExtra', fakeExtraBlock],
        ]),
        rootAllowed: [...DEFAULT_BLOCK_REGISTRY.rootAllowed],
      };
      const altToken = computeBlockRegistryToken(altRegistry);
      expect(altToken).not.toBe(defaultRegistryToken);

      const altModuleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(BLOCK_REGISTRY_TOKEN)
        .useValue(altRegistry)
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true })
        .compile();
      const altApp = altModuleRef.createNestApplication();
      altApp.setGlobalPrefix('api/v1');
      altApp.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      altApp.useGlobalFilters(new AllExceptionsFilter());
      altApp.use(cookieParser(AppConstants.cookieSecret));
      await altApp.init();

      try {
        const manager = await seedAuth(AppUserRoles.Manager, 'regtoken1');
        const page = await createDraftPage(manager, {
          title: 'Pagina multi-registro',
          slug: 'prova-multi-registro',
          draftContent: safeContentTree('Contenuto condiviso'),
        });
        await changeStatus(manager, page.guid, 'published').expect(200);

        // Lettura via app "di produzione" (token A): popola la chiave col token di default.
        await publicGet('/prova-multi-registro').expect(200);

        // Lettura via app col registro alternativo (token B): stesso database,
        // stesso Redis, chiave DIVERSA per costruzione.
        const altRes = await request(altApp.getHttpServer()).get(
          '/api/v1/public/pages?path=/prova-multi-registro',
        );
        expect(altRes.status).toBe(200);

        const redis = getTestRedisClient();
        const keyA = publicCacheKey('/prova-multi-registro', defaultRegistryToken);
        const keyB = publicCacheKey('/prova-multi-registro', altToken);
        expect(keyA).not.toBe(keyB);
        expect(await redis.exists(keyA)).toBe(1);
        expect(await redis.exists(keyB)).toBe(1);

        // L'invalidazione dell'app "di produzione" (es. archiviazione) tocca
        // SOLO la chiave del proprio token: le chiavi del prefisso alternativo
        // restano orfane (ADR-23 § 2, "a queste dimensioni trascurabili") —
        // comportamento dichiarato, non un bug.
        await changeStatus(manager, page.guid, 'archived').expect(200);
        expect(await redis.exists(keyA)).toBe(0);
        expect(await redis.exists(keyB)).toBe(1);
      } finally {
        await altApp.close();
      }
    });
  });

  // ─── 13. Home raggiungibile da "/" e "/home", invalidazione congiunta ──

  describe('Home raggiungibile sia da "/" sia da "/home" (ADR-24 § 7), invalidazione congiunta (ADR-23 § 4)', () => {
    it('entrambe le chiavi vengono popolate e invalidate insieme quando la home cambia', async () => {
      const manager = await seedAuth(AppUserRoles.Manager, 'home1');
      const page = await createDraftPage(manager, {
        title: 'Home del sito',
        slug: 'home',
        draftContent: safeContentTree('Contenuto home v1'),
      });
      await changeStatus(manager, page.guid, 'published').expect(200);

      const rootRes = await publicGet('/');
      const homeRes = await publicGet('/home');
      expect(rootRes.status).toBe(200);
      expect(homeRes.status).toBe(200);
      expect(rootRes.body.content).toEqual(homeRes.body.content);

      const redis = getTestRedisClient();
      const rootKey = publicCacheKey('/');
      const homeKey = publicCacheKey('/home');
      expect(await redis.exists(rootKey)).toBe(1);
      expect(await redis.exists(homeKey)).toBe(1);

      // Un evento di invalidazione sulla home (archiviazione) deve cancellare
      // ENTRAMBE le chiavi, non solo quella del segmento esplicito.
      await changeStatus(manager, page.guid, 'archived').expect(200);

      expect(await redis.exists(rootKey)).toBe(0);
      expect(await redis.exists(homeKey)).toBe(0);
      await publicGet('/').expect(404);
      await publicGet('/home').expect(404);
    });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
