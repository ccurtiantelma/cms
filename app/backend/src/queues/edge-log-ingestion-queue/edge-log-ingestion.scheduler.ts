import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppConstants } from '../../common/app-constants';

/**
 * Registra all'avvio il job repeatable che legge i log delle visite (ADR-68).
 * Stesso schema di `AnalyticsRollupScheduler`: ricorrenza persistita su Redis,
 * un solo esecutore anche con più repliche, `jobId` fisso idempotente fra i
 * riavvii, pattern obsoleto rimosso. Sempre attivo: senza directory dei log il
 * giro non fa nulla.
 */
@Injectable()
export class EdgeLogIngestionScheduler implements OnModuleInit {
  private readonly logger = new Logger(EdgeLogIngestionScheduler.name);

  /** Inietta la coda BullMQ `edge-log-ingestion-queue`. */
  constructor(@InjectQueue('edge-log-ingestion-queue') private readonly queue: Queue) {}

  /** Allinea il repeatable job su Redis al pattern cron corrente. */
  async onModuleInit(): Promise<void> {
    const pattern = AppConstants.edgeLogIngestionCronPattern;
    const existing = await this.queue.getRepeatableJobs();
    const stale = existing.filter((job) => job.pattern !== pattern);
    for (const job of stale) {
      await this.queue.removeRepeatableByKey(job.key);
      this.logger.log(`Rimosso repeatable job obsoleto (pattern precedente="${job.pattern}").`);
    }

    const alreadyScheduled = existing.some((job) => job.pattern === pattern);
    if (!alreadyScheduled) {
      await this.queue.add(
        'ingest-edge-logs',
        {},
        { repeat: { pattern }, jobId: 'edge-log-ingestion-repeatable' },
      );
      this.logger.log(`Repeatable job registrato (pattern="${pattern}").`);
    }
  }
}
