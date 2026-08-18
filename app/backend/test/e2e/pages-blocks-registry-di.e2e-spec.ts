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
import { BLOCK_REGISTRY_TOKEN, BlockRegistry } from '../../src/blocks/block-registry';
import { BlockDefinition } from '../../src/blocks/block-definition.types';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Test e2e mirato (PLAN-F02-blocchi.md T7, seam DI) sul punto di consumo del
 * registro blocchi in `PagesService`: prima di questo fix `pages.service.ts`
 * importava `DEFAULT_BLOCK_REGISTRY` come costante fissa, quindi nessun test
 * poteva far transitare un tipo da `v:1` a `v:2` lungo il percorso HTTP
 * reale — solo a livello unit, contro il motore di migrazione isolato
 * (`test/unit/blocks/migration/block-migration.engine.spec.ts`). Con
 * `BLOCK_REGISTRY_TOKEN` iniettato nel costruttore, questo test sovrascrive
 * il provider con un registro di test che ha un tipo fittizio a `v: 2` (un
 * gradino `oldTitle` → `title`, stesso schema del test unit) e verifica che
 * la migrazione avvenga davvero lungo `GET /app/pages/:guid`, con la riga a
 * database rimasta invariata (nessuna riscrittura in lettura).
 */
describe('PagesController (e2e) — registro blocchi iniettato via DI (PLAN-F02 T7)', () => {
  let app: INestApplication;

  /** Simula una prop rinominata `oldTitle` → `title`, stesso gradino del test unit del motore di migrazione. */
  function stepV1ToV2(props: Record<string, unknown>): Record<string, unknown> {
    const legacyTitle = props.oldTitle;
    const title =
      typeof legacyTitle === 'string' && legacyTitle.length > 0 ? legacyTitle : 'Senza titolo';
    const rest = { ...props };
    delete rest.oldTitle;
    return { ...rest, title };
  }

  const fakeCardV2: BlockDefinition = {
    type: 'fakeCard',
    v: 2,
    props: {
      title: { kind: 'plainText', required: true, maxLength: 200 },
    },
    children: { allow: [] },
    migrations: [stepV1ToV2],
    enabled: true,
  };

  const testRegistry: BlockRegistry = {
    definitions: new Map([['fakeCard', fakeCardV2]]),
    rootAllowed: ['fakeCard'],
  };

  beforeAll(async () => {
    await runMigrations();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BLOCK_REGISTRY_TOKEN)
      .useValue(testRegistry)
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
  });

  afterAll(async () => {
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  // ─── Helpers (stesso pattern di pages-blocks.e2e-spec.ts) ──────────────

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
        email: `pages-blocks-registry-di.e2e.${emailSuffix}.${Date.now()}.${Math.random()}@cms.test`,
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
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    auth: Auth,
  ): request.Test {
    return (request(app.getHttpServer())[method](path) as request.Test)
      .set('Authorization', auth.bearer)
      .set('Cookie', auth.cookie);
  }

  /**
   * Inserisce direttamente su `pages` (bypassando la pipeline applicativa,
   * come `seedPreF02Page` in `pages-blocks.e2e-spec.ts`) un albero con un
   * nodo `fakeCard` a `v: 1` (implicito, campo assente) e la sua prop
   * legacy `oldTitle` — la forma che il gradino di migrazione del registro
   * di test deve riscrivere in `title`.
   */
  async function seedV1FakeCardPage(auth: Auth): Promise<{ guid: string }> {
    const db = getTestDb();
    const guid = crypto.randomBytes(8).toString('hex');
    const translationGroupId = crypto.randomBytes(8).toString('hex');

    await db.insert(pageEntity).values({
      guid,
      title: 'Pagina con fakeCard v1',
      slug: 'pagina-fakecard-v1',
      locale: 'it-IT',
      translationGroupId,
      status: 'draft',
      draftContent: {
        version: 1,
        blocks: [
          {
            id: 'b1',
            type: 'fakeCard',
            props: { oldTitle: 'Ciao' },
            children: [],
            // niente `v`: trattato come v1 dal motore di migrazione.
          },
        ],
      },
      draftSeo: {},
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });

    return { guid };
  }

  it('GET migra un nodo fakeCard v1→v2 lungo il percorso HTTP reale, con il registro iniettato via DI, senza toccare la riga a database', async () => {
    const manager = await seedAuth(AppUserRoles.Manager, 'fakeCardV1');
    const { guid } = await seedV1FakeCardPage(manager);

    const db = getTestDb();
    const rowBefore = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
    const persistedBlocksBefore = (
      rowBefore!.draftContent as { blocks: Array<Record<string, unknown>> }
    ).blocks;
    expect(persistedBlocksBefore[0].v).toBeUndefined();
    expect(persistedBlocksBefore[0].props).toEqual({ oldTitle: 'Ciao' });

    const getRes = await authedRequest('get', `/api/v1/app/pages/${guid}`, manager).expect(200);
    const returnedBlocks = (getRes.body.draftContent as { blocks: Array<Record<string, unknown>> })
      .blocks;

    // Prova che la migrazione ha usato il registro di test iniettato via DI
    // (v corrente = 2, gradino oldTitle→title), non `DEFAULT_BLOCK_REGISTRY`:
    // quest'ultimo non conosce affatto `fakeCard`, quindi produrrebbe
    // BLOCK_TYPE_UNKNOWN invece di una migrazione riuscita.
    expect(getRes.body.contentIssues).toEqual([]);
    expect(returnedBlocks[0].type).toBe('fakeCard');
    expect(returnedBlocks[0].v).toBe(2);
    expect(returnedBlocks[0].props).toEqual({ title: 'Ciao' });

    // La riga a database resta esattamente quella scritta in seed: la
    // proiezione di lettura non riscrive mai (stesso invariante di
    // `pages-blocks.e2e-spec.ts`).
    const rowAfter = await db.query.pageEntity.findFirst({ where: eq(pageEntity.guid, guid) });
    const persistedBlocksAfter = (
      rowAfter!.draftContent as { blocks: Array<Record<string, unknown>> }
    ).blocks;
    expect(persistedBlocksAfter[0].v).toBeUndefined();
    expect(persistedBlocksAfter[0].props).toEqual({ oldTitle: 'Ciao' });
  });

  it('sanity: il mock nodemailer non riceve mai chiamate da nessun flusso di questa suite', () => {
    expect(networkMocks.nodemailer.sendMail).not.toHaveBeenCalled();
  });
});
