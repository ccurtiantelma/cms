import { Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { AppConstants } from '../../../src/common/app-constants';

const logger = new Logger('RedisTestHelper');

/** Indice del DB Redis logico riservato ai test (REDIS_URL=redis://host:port/1). */
const EXPECTED_TEST_DB_INDEX = 1;

/** Prefisso riservato alle chiavi create direttamente dalle fixture di test. */
const TEST_KEY_PREFIX = 'starter-kit:test:';

let client: IORedis | undefined;

/**
 * Verifica che il client sia connesso al DB Redis logico di test (#1), mai al
 * DB #0 usato in sviluppo — previene un FLUSHDB accidentale su dati non di test.
 */
function assertTestRedisDb(redis: IORedis): void {
  const dbIndex = redis.options.db ?? 0;
  if (dbIndex !== EXPECTED_TEST_DB_INDEX) {
    throw new Error(
      `redis-test.helper: REDIS_URL punta al DB Redis #${dbIndex}, atteso #${EXPECTED_TEST_DB_INDEX}. ` +
        `Imposta REDIS_URL=redis://<host>:<port>/${EXPECTED_TEST_DB_INDEX} prima di eseguire la suite e2e.`,
    );
  }
}

/** Restituisce (creandolo al primo utilizzo) il client ioredis condiviso verso il DB di test. */
export function getTestRedisClient(): IORedis {
  if (client) {
    return client;
  }

  client = new IORedis(AppConstants.redisUrl, { maxRetriesPerRequest: null });
  assertTestRedisDb(client);

  client.on('error', (err: unknown) => {
    logger.error('Redis test client error', err);
  });

  return client;
}

/**
 * Svuota interamente il DB Redis logico di test (FLUSHDB). Sicuro perché isolato
 * dal DB #0 di sviluppo tramite `assertTestRedisDb`. Da invocare in `afterEach`/`beforeEach`
 * per garantire che ogni test parta da uno stato Redis pulito.
 */
export async function flushTestRedis(): Promise<void> {
  const redis = getTestRedisClient();
  assertTestRedisDb(redis);
  logger.log(`FLUSHDB sul DB Redis di test #${EXPECTED_TEST_DB_INDEX}...`);
  await redis.flushdb();
}

/**
 * Cancellazione selettiva delle sole chiavi con prefisso `starter-kit:test:` (o quello
 * passato esplicitamente), utile quando un test deve ripulire solo le proprie
 * fixture senza toccare altre chiavi di sessione create nello stesso DB di test.
 */
export async function clearTestRedisKeys(prefix: string = TEST_KEY_PREFIX): Promise<void> {
  const redis = getTestRedisClient();
  assertTestRedisDb(redis);

  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

/** Chiude la connessione al client Redis di test. Da invocare in un `afterAll` globale. */
export async function closeTestRedisClient(): Promise<void> {
  await client?.quit();
  client = undefined;
}
