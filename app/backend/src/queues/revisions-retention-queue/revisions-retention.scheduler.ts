import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppConstants } from '../../common/app-constants';

/**
 * Registra il repeatable job della potatura delle Revisioni (ADR-61) all'avvio
 * del modulo. Stesso pattern di `FilesCleanupScheduler`: ricorrenza persistita
 * su Redis, quindi sopravvive ai restart ed è eseguita una sola volta anche con
 * più repliche dell'app. `@Cron` non è ammesso per un job con side-effect
 * (`CLAUDE.md` § Backend Developer).
 */
@Injectable()
export class RevisionsRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(RevisionsRetentionScheduler.name);

  /** Inietta la coda BullMQ `revisions-retention-queue`. */
  constructor(@InjectQueue('revisions-retention-queue') private readonly queue: Queue) {}

  /** Allinea il repeatable job su Redis al pattern cron corrente, se abilitato. */
  async onModuleInit(): Promise<void> {
    if (!AppConstants.revisionsRetentionEnabled) {
      this.logger.log(
        'Potatura Revisioni disabilitata (REVISIONS_RETENTION_ENABLED=false): nessun job registrato.',
      );
      return;
    }

    const pattern = AppConstants.revisionsRetentionCronPattern;
    const existing = await this.queue.getRepeatableJobs();
    const stale = existing.filter((job) => job.pattern !== pattern);
    for (const job of stale) {
      await this.queue.removeRepeatableByKey(job.key);
      this.logger.log(`Rimosso repeatable job obsoleto (pattern precedente="${job.pattern}").`);
    }

    const alreadyScheduled = existing.some((job) => job.pattern === pattern);
    if (!alreadyScheduled) {
      await this.queue.add(
        'prune-revisions',
        {},
        { repeat: { pattern }, jobId: 'revisions-retention-repeatable' },
      );
      this.logger.log(`Repeatable job registrato (pattern="${pattern}").`);
    }
  }
}
