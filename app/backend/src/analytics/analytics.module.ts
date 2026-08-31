import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsIngestionMiddleware } from './analytics-ingestion.middleware';
import { AnalyticsRollupQueueModule } from '../queues/analytics-rollup-queue/analytics-rollup-queue.module';

/**
 * Analytics interno privacy-first (GDPR, zero cookie), sostituisce l'ex
 * sistema di aggregato SSR con secret. `AnalyticsIngestionMiddleware` è
 * dichiarato provider di questo modulo (non esportato: `AppModule` lo referenzia
 * per classe in `consumer.apply()`, Nest lo risolve dal grafo dei moduli
 * importati — stesso meccanismo di `AuthMiddleware`/`AuthModule`). Importa
 * `AnalyticsRollupQueueModule` per il repeatable job BullMQ che ricalcola
 * `analytics_daily_rollups`. Nessun bisogno di `PagesModule`:
 * `canonicalizePublicPath` è una pura funzione di `pages/public-path.util.ts`,
 * non un provider.
 */
@Module({
  imports: [AnalyticsRollupQueueModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsIngestionMiddleware],
  exports: [AnalyticsService, AnalyticsIngestionMiddleware],
})
export class AnalyticsModule {}
