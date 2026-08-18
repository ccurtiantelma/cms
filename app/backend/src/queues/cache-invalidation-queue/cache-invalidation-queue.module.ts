import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CacheInvalidationProcessor } from './cache-invalidation.processor';
import { CacheInvalidationQueueService } from './cache-invalidation.queue.service';

/**
 * Coda BullMQ dedicata al ricorso di un `DEL` di cache pubblica fallito
 * (ADR-23 § 6). Stesso pattern di `EmailQueueModule`
 * (`BullModule.registerQueue` + `@Processor`/`WorkerHost`): mai il percorso
 * primario di invalidazione, solo il suo ricorso.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'cache-invalidation-queue',
    }),
  ],
  providers: [CacheInvalidationProcessor, CacheInvalidationQueueService],
  exports: [CacheInvalidationQueueService],
})
export class CacheInvalidationQueueModule {}
