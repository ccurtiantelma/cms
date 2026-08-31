import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import IORedis from 'ioredis';
import * as Joi from 'joi';
import * as path from 'path';
import { AppConstants } from './common/app-constants';
import { DbModule } from './db/db.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { AnalyticsIngestionMiddleware } from './analytics/analytics-ingestion.middleware';
import { RedisModule } from './redis/redis.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { FilesModule } from './files/files.module';
import { FilesCleanupQueueModule } from './queues/files-cleanup-queue/files-cleanup-queue.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsModule } from './metrics/metrics.module';
import { PagesModule } from './pages/pages.module';
import { PreviewPagesModule } from './preview-pages/preview-pages.module';
import { GlobalSectionsModule } from './global-sections/global-sections.module';
import { SiteTemplatesModule } from './site-templates/site-templates.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../.env'),
        '.env',
      ],
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        SECURITY_KEY: Joi.string().required(),
        // Segreto dedicato del JWT di anteprima di una bozza (ADR-25 § 1),
        // volutamente distinto da SECURITY_KEY (access/refresh).
        PAGE_PREVIEW_TOKEN_SECRET: Joi.string().required(),
        // Rotazione giornaliera del salt di anonimizzazione visitatore
        // (AppConstants.analyticsSaltSecret, GDPR/zero-cookie).
        ANALYTICS_SALT_SECRET: Joi.string().default('change_me_analytics_salt'),
        COOKIE_SECRET: Joi.string().default('change_me_cookie_secret'),
        COOKIE_DOMAIN: Joi.string().default('localhost'),
        // Allineato ad AppConstants.jwtExpiration (fix: entrambi i default devono coincidere).
        JWT_EXPIRATION: Joi.string().default('15m'),
        RTK_EXPIRATION: Joi.number().default(604800),
        PORT: Joi.number().default(53000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'staging', 'test')
          .default('development'),
        FRONTEND_URL: Joi.string().default('http://localhost:55173'),
        // Origine del sito pubblico SSR (ADR-22, app/public-site, F03/T5): CORS deve
        // ammetterla insieme a FRONTEND_URL, mai un wildcard (main.ts).
        PUBLIC_SITE_URL: Joi.string().default('http://localhost:55000'),
        // Lingua di default per la risoluzione pubblica degli slug (ADR-24 § 5/§ 7):
        // assunzione dichiarata in attesa di F05/app_settings, non una regola approvata.
        DEFAULT_LOCALE: Joi.string().default('it-IT'),
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().default(51025),
        SMTP_USER: Joi.string().allow('').optional(),
        SMTP_PASS: Joi.string().allow('').optional(),
        SMTP_FROM: Joi.string().optional(),
        SUPERADMIN_EMAIL: Joi.string().allow('').optional(),
        SUPERADMIN_PASSWORD: Joi.string().allow('').optional(),
        LOG_LEVEL: Joi.string().default('info'),
        LOG_DIR: Joi.string().default('logs'),
        LOG_MAX_PER_SEC: Joi.number().default(100),
        STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
        STORAGE_LOCAL_PATH: Joi.string().default('storage'),
        STORAGE_S3_ENDPOINT: Joi.string().allow('').optional(),
        STORAGE_S3_REGION: Joi.string().default('us-east-1'),
        STORAGE_S3_BUCKET: Joi.string().allow('').optional(),
        STORAGE_S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
        STORAGE_S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
        STORAGE_MAX_FILE_SIZE_MB: Joi.number().default(20),
        FILES_CLEANUP_ENABLED: Joi.boolean().default(false),
        FILES_CLEANUP_GRACE_DAYS: Joi.number().default(30),
        FILES_CLEANUP_CRON_PATTERN: Joi.string().default('0 3 * * *'),
        FILES_CLEANUP_BATCH_SIZE: Joi.number().default(500),
        // Pattern cron del repeatable job di rollup analytics (sempre attivo),
        // mirror di FILES_CLEANUP_CRON_PATTERN.
        ANALYTICS_ROLLUP_CRON_PATTERN: Joi.string().default('*/5 * * * *'),
        SENTRY_ENABLED: Joi.boolean().default(false),
        SENTRY_DSN: Joi.string().allow('').optional(),
        SENTRY_ENVIRONMENT: Joi.string().optional(),
        SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0),
        METRICS_ENABLED: Joi.boolean().default(false),
      }),
    }),
    // Rate limiting su /auth/*. Limite di default per le rotte auth senza @Throttle
    // dedicato; le rotte esposte a brute-force (login, mfa-verify, reset-password,
    // ecc.) sovrascrivono questo default in auth.controller.ts.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'auth', ttl: 60_000, limit: 20 },
        // Throttler dedicato alla superficie pubblica (F03/T2, CLAUDE.md §
        // Security "endpoint pubblici: rate limiting proprio"). 300/60s è un
        // default ragionevole dichiarato in attesa di
        // SPEC-F03-superficie-pubblica.md (non ancora scritta, PLAN-F03 T1
        // residuo) — non un valore derivato da un documento approvato.
        { name: 'public', ttl: 60_000, limit: 300 },
      ],
    }),
    // Connessione Redis condivisa da tutte le code BullMQ (coda email in
    // src/queues/email-queue/). `maxRetriesPerRequest: null` è la
    // configurazione raccomandata da BullMQ per le connessioni worker/coda.
    BullModule.forRoot({
      connection: new IORedis(AppConstants.redisUrl, { maxRetriesPerRequest: null }),
    }),
    DbModule,
    CommonModule,
    RedisModule,
    AuthModule,
    AdminModule,
    SettingsModule,
    HealthModule,
    FilesModule,
    FilesCleanupQueueModule,
    SchedulerModule,
    // RealtimeModule (Socket.io, ADR-12) montato per servire il push del bell/badge
    // di NotificationsModule — prima non importato di default, vedi ADR-12 §Contesto.
    RealtimeModule,
    NotificationsModule,
    // MetricsModule (ADR-15) montato solo se METRICS_ENABLED=true: opt-in esplicito,
    // nessun endpoint/interceptor registrato per i progetti che non lo abilitano.
    ...(AppConstants.metricsEnabled ? [MetricsModule] : []),
    PagesModule,
    PreviewPagesModule,
    GlobalSectionsModule,
    SiteTemplatesModule,
    AnalyticsModule,
    // TODO: aggiungere qui i moduli applicativi del CMS man mano che vengono creati.
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  /**
   * Applica `AuthMiddleware` globalmente, escludendo SOLO gli endpoint pubblici
   * di `/auth` (senza JWT). Tutti gli altri endpoint /auth/* (me, mfa-setup,
   * mfa-enable, mfa-disable, request-activation, logout, impersonate, ecc.)
   * richiedono `req.authInfo` popolato dal middleware.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        // Superficie pubblica di lettura (F03/T2, constitution.md § Convenzioni
        // API): anonima per costruzione, mai dietro `AuthMiddleware`.
        { path: 'public/*path', method: RequestMethod.ALL },
        // Superficie di anteprima di una bozza (ADR-25 § 3): anonima per
        // costruzione, il token stesso è la prova di accesso — non un JWT
        // di sessione, quindi mai dietro `AuthMiddleware`.
        { path: 'preview/*path', method: RequestMethod.ALL },
        // `/metrics` (ADR-15) NON va escluso qui: essendo montato fuori dal
        // prefisso globale `api/v1` (vedi main.ts), questo `.exclude()` finirebbe
        // per confrontarsi con `api/v1/metrics` (mai servito) e non con il path
        // reale — verificato manualmente (401 anche con l'entry qui). Il bypass
        // per lo scraper Prometheus è quindi esplicito in `AuthMiddleware.use()`.
        { path: 'auth/login', method: RequestMethod.ALL },
        { path: 'auth/mfa-verify', method: RequestMethod.ALL },
        { path: 'auth/refresh', method: RequestMethod.ALL },
        { path: 'auth/activate', method: RequestMethod.ALL },
        { path: 'auth/forgot-password', method: RequestMethod.ALL },
        { path: 'auth/reset-password', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });

    // Ingestion analytics privacy-first: middleware separato (non sostituisce
    // AuthMiddleware, che sopra esclude comunque `public/*path`), montato solo
    // sulle GET pubbliche. Non blocca mai la risposta (vedi JSDoc della classe).
    consumer
      .apply(AnalyticsIngestionMiddleware)
      .forRoutes({ path: 'public/*path', method: RequestMethod.GET });
  }
}
