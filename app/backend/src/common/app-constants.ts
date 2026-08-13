import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Unico punto del codice autorizzato a leggere `process.env` (CLAUDE.md,
 * "Divieti assoluti": vietato `process.env` diretto altrove — usare `AppConstants`).
 * Risolve i possibili percorsi di un file `.env` relativo alla cwd o alla
 * posizione compilata di questo modulo (utile quando l'app gira da `dist/`).
 */
function resolveEnvCandidates(fileName: string): string[] {
  return Array.from(
    new Set([
      path.resolve(process.cwd(), fileName),
      path.resolve(__dirname, '..', '..', fileName),
      path.resolve(__dirname, '..', '..', '..', fileName),
    ]),
  );
}

function loadExistingEnvFile(fileName: string): void {
  for (const candidate of resolveEnvCandidates(fileName)) {
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
    }
  }
}

function loadEnvFiles(): void {
  const nodeEnv = process.env.NODE_ENV?.trim();
  if (nodeEnv === 'test') {
    loadExistingEnvFile('.env.test');
  }
  // Carica prima il file locale/di sviluppo, poi il default `.env`. Con la
  // semantica di default di dotenv le variabili già impostate non vengono sovrascritte.
  loadExistingEnvFile('.env');
  dotenv.config();
}

loadEnvFiles();

/** Rimuove eventuali apici (singoli o doppi) attorno al valore di una env var. */
function trimQuotes(val?: string): string | undefined {
  if (!val) return undefined;
  return val.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

/** Converte una env var porta in numero valido, con fallback se assente o fuori range. */
function parsePort(defaultPort: number, val?: string): number {
  const n = Number(trimQuotes(val));
  if (isNaN(n) || n < 0 || n >= 65536) {
    return defaultPort;
  }
  return n;
}

function str(name: string, fallback = ''): string {
  return trimQuotes(process.env[name]) ?? fallback;
}

function num(name: string, fallback: number): number {
  const n = Number(trimQuotes(process.env[name]));
  return isNaN(n) ? fallback : n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = trimQuotes(process.env[name]);
  if (v === undefined || v === '') return fallback;
  return v.toLowerCase() === 'true';
}

/**
 * Costanti applicative derivate dalle variabili d'ambiente, con default
 * difensivi e normalizzazione (trim apici, parsing porte/numeri robusto).
 * Vedi `.env.example` nella root del repo per l'elenco completo e i default.
 */
export class AppConstants {
  static readonly timezone = 'Europe/Rome';
  static readonly nodeEnv = str('NODE_ENV', 'development');
  static readonly isProduction = AppConstants.nodeEnv === 'production';
  static readonly port = parsePort(3000, process.env.PORT);

  static readonly databaseUrl = str('DATABASE_URL');
  static readonly redisUrl = str('REDIS_URL');

  static readonly securityKey = str('SECURITY_KEY');
  static readonly cookieSecret = str('COOKIE_SECRET') || AppConstants.securityKey;
  static readonly cookieDomain = str('COOKIE_DOMAIN', 'localhost');

  /** Durata access token JWT (es. `15m`, `1h`). Allineata allo schema Joi in `app.module.ts`. */
  static readonly jwtExpiration = str('JWT_EXPIRATION', '15m');
  /** TTL del cookie/refresh token opaco `rtk`, in secondi (default 7 giorni). */
  static readonly rtkExpiration = num('RTK_EXPIRATION', 604800);

  static readonly frontendUrl = str('FRONTEND_URL', 'http://localhost:5173');

  static readonly smtpHost = str('SMTP_HOST', 'localhost');
  static readonly smtpPort = parsePort(1025, process.env.SMTP_PORT);
  static readonly smtpUser = str('SMTP_USER');
  static readonly smtpPass = str('SMTP_PASS');
  static readonly smtpFrom = str('SMTP_FROM', 'no-reply@cms.local');

  static readonly superAdminEmail = str('SUPERADMIN_EMAIL');
  static readonly superAdminPassword = str('SUPERADMIN_PASSWORD');

  static readonly logLevel = str('LOG_LEVEL', AppConstants.isProduction ? 'info' : 'debug');
  static readonly logDir = str('LOG_DIR', 'logs');
  /** Numero massimo di righe di log identiche per secondo prima del rate-limit (WinstonLoggerService). */
  static readonly logMaxPerSec = num('LOG_MAX_PER_SEC', 100);

  /** Driver di storage documenti (ADR-8): 'local' in sviluppo, 's3' in produzione. */
  static readonly storageDriver = str('STORAGE_DRIVER', 'local');
  /** Cartella locale dei blob quando `storageDriver === 'local'` (relativa alla cwd del processo). */
  static readonly storageLocalPath = str('STORAGE_LOCAL_PATH', 'storage');
  /** Endpoint S3-compatibile (MinIO/altro provider): vuoto = AWS S3 reale. */
  static readonly storageS3Endpoint = str('STORAGE_S3_ENDPOINT');
  static readonly storageS3Region = str('STORAGE_S3_REGION', 'us-east-1');
  static readonly storageS3Bucket = str('STORAGE_S3_BUCKET');
  static readonly storageS3AccessKeyId = str('STORAGE_S3_ACCESS_KEY_ID');
  static readonly storageS3SecretAccessKey = str('STORAGE_S3_SECRET_ACCESS_KEY');
  /** Dimensione massima di un singolo file caricato, in MB (guardrail anti-abuso, non una business rule di dominio). */
  static readonly storageMaxFileSizeMb = num('STORAGE_MAX_FILE_SIZE_MB', 20);

  /**
   * Job repeatable BullMQ (ADR-11) che rimuove fisicamente i blob dei file
   * soft-deleted (ADR-8) oltre il periodo di grazia. Disabilitato di default:
   * opt-in esplicito perché è un'azione distruttiva e irreversibile sul blob
   * fisico (i metadata DB restano comunque, mai un vero DELETE).
   */
  static readonly filesCleanupEnabled = bool('FILES_CLEANUP_ENABLED', false);
  /** Giorni di grazia dopo il soft-delete prima che il blob fisico venga rimosso. */
  static readonly filesCleanupGraceDays = num('FILES_CLEANUP_GRACE_DAYS', 30);
  /** Espressione cron (formato BullMQ/`cron-parser`) della ricorrenza del job di cleanup. */
  static readonly filesCleanupCronPattern = str('FILES_CLEANUP_CRON_PATTERN', '0 3 * * *');
  /** Numero massimo di blob rimossi per singola esecuzione del job (guardrail, non business rule). */
  static readonly filesCleanupBatchSize = num('FILES_CLEANUP_BATCH_SIZE', 500);

  /**
   * Osservabilità opzionale (ADR-15), entrambe disattivate di default (opt-in
   * esplicito del progetto verticale — "non appesantire progetti piccoli").
   */
  /** Invio errori 5xx a Sentry (backend). Disattivato di default: nessuna chiamata `Sentry.init` se `false`. */
  static readonly sentryEnabled = bool('SENTRY_ENABLED', false);
  /** DSN del progetto Sentry (o di un'istanza GlitchTip self-hosted, protocollo compatibile). */
  static readonly sentryDsn = str('SENTRY_DSN');
  /** Tag "environment" inviato con ogni evento Sentry. */
  static readonly sentryEnvironment = str('SENTRY_ENVIRONMENT', AppConstants.nodeEnv);
  /** Percentuale di transazioni tracciate per il performance tracing (0 = solo error capture, nessun tracing). */
  static readonly sentryTracesSampleRate = num('SENTRY_TRACES_SAMPLE_RATE', 0);
  /** Espone `GET /metrics` (formato Prometheus, `prom-client`). Disattivato di default: nessun endpoint registrato se `false`. */
  static readonly metricsEnabled = bool('METRICS_ENABLED', false);
}
