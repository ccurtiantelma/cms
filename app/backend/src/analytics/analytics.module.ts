import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRollupQueueModule } from '../queues/analytics-rollup-queue/analytics-rollup-queue.module';
import { EdgeLogIngestionQueueModule } from '../queues/edge-log-ingestion-queue/edge-log-ingestion-queue.module';

/**
 * Analytics interno privacy-first (GDPR, zero cookie). Le visite arrivano dai
 * log di `nginx-static` (`EdgeLogIngestionQueueModule`, ADR-68) e sono
 * aggregate in `analytics_daily_rollups` da `AnalyticsRollupQueueModule`; il
 * controller legge KPI e serie per la dashboard.
 */
@Module({
  imports: [AnalyticsRollupQueueModule, EdgeLogIngestionQueueModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
