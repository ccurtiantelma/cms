import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppConstants } from '../../common/app-constants';

/**
 * Registra il repeatable job di cleanup blob orfani (ADR-11) all'avvio del
 * modulo. Pattern BullMQ "repeatable job": la ricorrenza è persistita su Redis
 * (non in-process come `@nestjs/schedule`), quindi sopravvive a restart e
 * viene eseguita una volta sola anche con più repliche dell'app (BullMQ
 * garantisce un solo worker per occorrenza).
 *
 * `jobId` fisso rende `queue.add` con `repeat` idempotente tra restart: se il
 * pattern cron in config non è cambiato, non viene creato un duplicato. Se
 * invece è cambiato, il vecchio repeatable job viene rimosso esplicitamente
 * (altrimenti resterebbe schedulato per sempre, essendo indipendente dal
 * deploy dell'app).
 */
@Injectable()
export class FilesCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(FilesCleanupScheduler.name);

  /** Inietta la coda BullMQ `files-cleanup-queue`. */
  constructor(@InjectQueue('files-cleanup-queue') private readonly queue: Queue) {}

  /** Allinea il repeatable job su Redis al pattern cron corrente, se il modulo è abilitato. */
  async onModuleInit(): Promise<void> {
    if (!AppConstants.filesCleanupEnabled) {
      this.logger.log('Cleanup blob orfani disabilitato (FILES_CLEANUP_ENABLED=false).');
      return;
    }

    const pattern = AppConstants.filesCleanupCronPattern;
    const existing = await this.queue.getRepeatableJobs();
    const stale = existing.filter((job) => job.pattern !== pattern);
    for (const job of stale) {
      await this.queue.removeRepeatableByKey(job.key);
      this.logger.log(`Rimosso repeatable job obsoleto (pattern precedente="${job.pattern}").`);
    }

    const alreadyScheduled = existing.some((job) => job.pattern === pattern);
    if (!alreadyScheduled) {
      await this.queue.add(
        'purge-orphan-blobs',
        {},
        { repeat: { pattern }, jobId: 'files-cleanup-repeatable' },
      );
      this.logger.log(`Repeatable job registrato (pattern="${pattern}").`);
    }
  }
}
