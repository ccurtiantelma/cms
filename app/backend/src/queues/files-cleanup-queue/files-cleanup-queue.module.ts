import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesModule } from '../../files/files.module';
import { FilesCleanupProcessor } from './files-cleanup.processor';
import { FilesCleanupScheduler } from './files-cleanup.scheduler';

/**
 * Coda BullMQ dedicata al repeatable job di pulizia blob orfani (ADR-11).
 * Segue lo stesso pattern di `src/queues/email-queue/`
 * (`BullModule.registerQueue` + `@Processor`/`WorkerHost`), con l'aggiunta di
 * `FilesCleanupScheduler` che registra la ricorrenza su Redis all'avvio.
 * Importa `FilesModule` per riusare la stessa istanza di `STORAGE_DRIVER`
 * (nessun driver di storage duplicato).
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'files-cleanup-queue',
    }),
    FilesModule,
  ],
  providers: [FilesCleanupProcessor, FilesCleanupScheduler],
})
export class FilesCleanupQueueModule {}
