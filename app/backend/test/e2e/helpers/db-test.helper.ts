import { Logger } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as path from 'path';
import * as schema from '../../../src/db/schema';
import { AppConstants } from '../../../src/common/app-constants';

const logger = new Logger('DbTestHelper');

/** Unico nome DB ammesso per gli helper e2e — evita di truncare per errore un DB di sviluppo/produzione. */
const EXPECTED_TEST_DATABASE = 'cms_db_test';

const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../../src/db/migrations');

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

/**
 * Verifica che `DATABASE_URL` punti esplicitamente al database `cms_db_test`.
 * Blocca l'esecuzione se punta a un database diverso (es. `cms_db` di sviluppo).
 */
function assertTestDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (databaseName !== EXPECTED_TEST_DATABASE) {
    throw new Error(
      `db-test.helper: DATABASE_URL punta al database "${databaseName}", atteso "${EXPECTED_TEST_DATABASE}". ` +
        'Imposta DATABASE_URL su un database di test dedicato prima di eseguire la suite e2e.',
    );
  }
}

/** Restituisce (creandola al primo utilizzo) la connessione Drizzle condivisa verso `cms_db_test`. */
export function getTestDb(): NodePgDatabase<typeof schema> {
  if (db) {
    return db;
  }

  const databaseUrl = AppConstants.databaseUrl;
  assertTestDatabase(databaseUrl);

  pool = new Pool({ connectionString: databaseUrl });
  db = drizzle(pool, { schema });
  return db;
}

/**
 * Applica tutte le migrazioni Drizzle su `cms_db_test`. Idempotente: le
 * migrazioni già applicate vengono saltate (tracking in schema `drizzle`, non `public`).
 * Da invocare tipicamente in un `beforeAll` globale della suite e2e.
 */
export async function runMigrations(): Promise<void> {
  const database = getTestDb();
  logger.log(`Esecuzione migrazioni Drizzle su "${EXPECTED_TEST_DATABASE}"...`);
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
  logger.log('Migrazioni completate.');
}

/**
 * Svuota tutte le tabelle applicative dello schema `public` (TRUNCATE ... RESTART
 * IDENTITY CASCADE), preservando struttura e tabella di tracking delle migrazioni
 * (vive nello schema `drizzle`, non `public`, quindi non viene mai toccata).
 * Da invocare in `afterEach`/`beforeEach` per isolare i test tra loro.
 */
export async function truncateAllTables(): Promise<void> {
  const database = getTestDb();

  const { rows } = await database.execute<{ tablename: string }>(sql`
    select tablename
    from pg_tables
    where schemaname = 'public'
  `);

  if (rows.length === 0) {
    return;
  }

  const tableList = rows.map((row) => `"${row.tablename}"`).join(', ');
  await database.execute(sql.raw(`truncate table ${tableList} restart identity cascade`));
}

/** Chiude il pool di connessioni al database di test. Da invocare in un `afterAll` globale. */
export async function closeTestDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}
