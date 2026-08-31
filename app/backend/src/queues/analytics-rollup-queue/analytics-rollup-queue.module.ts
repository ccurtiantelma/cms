import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsRollupProcessor } from './analytics-rollup.processor';
import { AnalyticsRollupScheduler } from './analytics-rollup.scheduler';

/**
 * Coda BullMQ dedicata al repeatable job di rollup analytics
 * (`analytics_daily_rollups`, aggregato da `analytics_events`). Stesso
 * pattern di `src/queues/files-cleanup-queue/` (`BullModule.registerQueue` +
 * `@Processor`/`WorkerHost` + scheduler che registra la ricorrenza su Redis
 * all'avvio). `DbService` è globale (`DbModule`), nessun import esplicito.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'analytics-rollup-queue' })],
  providers: [AnalyticsRollupProcessor, AnalyticsRollupScheduler],
})
export class AnalyticsRollupQueueModule {}
