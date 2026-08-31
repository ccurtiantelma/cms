import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppConstants } from '../../common/app-constants';

/**
 * Registra il repeatable job di rollup analytics all'avvio del modulo.
 * Pattern BullMQ "repeatable job" (CLAUDE.md, "job con side-effect come
 * repeatable job, mai `@Cron`"): la ricorrenza è persistita su Redis, non
 * in-process, quindi sopravvive a restart e viene eseguita una volta sola
 * anche con più repliche dell'app. A differenza di
 * `FilesCleanupScheduler` questo job è **sempre attivo** (nessun flag
 * enabled/disabled): ricalcolare un rollup non è un'azione distruttiva.
 *
 * `jobId` fisso rende `queue.add` con `repeat` idempotente tra restart: se il
 * pattern cron in config non è cambiato, non viene creato un duplicato. Se
 * invece è cambiato, il vecchio repeatable job viene rimosso esplicitamente.
 */
@Injectable()
export class AnalyticsRollupScheduler implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsRollupScheduler.name);

  /** Inietta la coda BullMQ `analytics-rollup-queue`. */
  constructor(@InjectQueue('analytics-rollup-queue') private readonly queue: Queue) {}

  /** Allinea il repeatable job su Redis al pattern cron corrente. */
  async onModuleInit(): Promise<void> {
    const pattern = AppConstants.analyticsRollupCronPattern;
    const existing = await this.queue.getRepeatableJobs();
    const stale = existing.filter((job) => job.pattern !== pattern);
    for (const job of stale) {
      await this.queue.removeRepeatableByKey(job.key);
      this.logger.log(`Rimosso repeatable job obsoleto (pattern precedente="${job.pattern}").`);
    }

    const alreadyScheduled = existing.some((job) => job.pattern === pattern);
    if (!alreadyScheduled) {
      await this.queue.add(
        'recompute-rollups',
        {},
        { repeat: { pattern }, jobId: 'analytics-rollup-repeatable' },
      );
      this.logger.log(`Repeatable job registrato (pattern="${pattern}").`);
    }
  }
}
