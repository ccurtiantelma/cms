/**
 * Setup globale e2e — valorizza `process.env` con le variabili richieste da
 * `AppConstants` PRIMA che qualunque test file importi `AppModule`.
 *
 * Deve stare in `setupFiles` (mai `setupFilesAfterEnv`): `AppConstants` legge
 * `process.env` a module-load-time tramite `dotenv.config()`, che NON
 * sovrascrive variabili già impostate — se questo file girasse dopo il primo
 * import di `AppConstants`/`AppModule`, i valori di test arriverebbero troppo
 * tardi e verrebbe usato il `.env` di sviluppo (rischio: truncate/flushdb su
 * `app_db` invece che su `app_db_test`, bloccato comunque dalle guardie in
 * `db-test.helper.ts` / `redis-test.helper.ts`, ma da evitare a monte).
 *
 * `DATABASE_URL` punta a `app_db_test` e `REDIS_URL` al DB Redis logico #1,
 * come richiesto dalle guardie `assertTestDatabase` / `assertTestRedisDb`.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/app_db_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
process.env.SECURITY_KEY =
  process.env.SECURITY_KEY || 'e2e_test_security_key_min_32_characters_long';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'e2e_test_cookie_secret';
process.env.COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || 'localhost';
process.env.JWT_EXPIRATION = process.env.JWT_EXPIRATION || '15m';
process.env.RTK_EXPIRATION = process.env.RTK_EXPIRATION || '604800';
process.env.PORT = process.env.PORT || '3001';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '1025';
process.env.SMTP_FROM = process.env.SMTP_FROM || 'e2e@starter-kit.test';
process.env.SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin.e2e@starter-kit.test';
process.env.SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'E2eSuperAdmin#2026';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.LOG_DIR = process.env.LOG_DIR || 'logs-e2e';
process.env.LOG_MAX_PER_SEC = process.env.LOG_MAX_PER_SEC || '1000';
