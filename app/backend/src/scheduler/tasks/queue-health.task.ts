import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/**
 * Esempio di cron dichiarativo `@nestjs/schedule` (ADR-11): logga i contatori
 * delle code BullMQ registrate, a solo scopo di osservabilità. Pattern
 * volutamente semplice, da copiare per altri job notturni "single-instance
 * safe" (nessun side-effect, nessuna necessità di deduplica tra repliche).
 *
 * Diverso dal pattern BullMQ "repeatable job" (`src/queues/files-cleanup-queue/`):
 * un `@Cron` gira in-process su OGNI replica dell'app (non c'è deduplica), va
 * bene solo per task idempotenti o senza effetti collaterali distribuiti. Per
 * job che devono eseguire una volta sola su un cluster multi-replica e
 * sopravvivere a restart, usare sempre un repeatable job BullMQ.
 */
@Injectable()
export class QueueHealthTask {
  private readonly logger = new Logger(QueueHealthTask.name);

  /** Inietta le code BullMQ di cui loggare i contatori (riusa la connessione condivisa di `BullModule.forRoot()`). */
  constructor(
    @InjectQueue('email-queue') private readonly emailQueue: Queue,
    @InjectQueue('files-cleanup-queue') private readonly filesCleanupQueue: Queue,
  ) {}

  /** Logga waiting/active/failed/delayed per ogni coda registrata, ogni ora. */
  @Cron(CronExpression.EVERY_HOUR)
  async logQueueMetrics(): Promise<void> {
    for (const queue of [this.emailQueue, this.filesCleanupQueue]) {
      const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
      this.logger.log(`Coda "${queue.name}": ${JSON.stringify(counts)}`);
    }
  }
}
