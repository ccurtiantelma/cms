import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EdgeLogIngestionProcessor } from './edge-log-ingestion.processor';
import { EdgeLogIngestionScheduler } from './edge-log-ingestion.scheduler';
import { EdgeLogIngestionService } from './edge-log-ingestion.service';

/**
 * Coda del contatore delle visite sul sito statico (ADR-68): legge i log di
 * `nginx-static` e scrive `analytics_events`, che `analytics-rollup-queue`
 * aggrega come prima. `DbService` e `RedisService` sono globali.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'edge-log-ingestion-queue' })],
  providers: [EdgeLogIngestionService, EdgeLogIngestionProcessor, EdgeLogIngestionScheduler],
})
export class EdgeLogIngestionQueueModule {}
