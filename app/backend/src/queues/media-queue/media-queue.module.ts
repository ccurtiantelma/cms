import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConstants } from '../../common/app-constants';
import { STORAGE_DRIVER } from '../../files/storage/storage-driver.interface';
import { LocalDiskDriver } from '../../files/storage/local-disk.driver';
import { S3CompatibleDriver } from '../../files/storage/s3-compatible.driver';
import { MediaProcessor } from './media.processor';
import { MediaQueueService } from './media-queue.service';

/**
 * Coda BullMQ della pipeline di trasformazione media (ADR-49). `FilesModule`
 * importa questo modulo per accodare le richieste (`FilesService` →
 * `MediaQueueService`); `MediaProcessor` ha simmetricamente bisogno dello
 * stesso `STORAGE_DRIVER` di `FilesModule`. Importare `FilesModule` qui
 * creerebbe un ciclo (`FilesModule` → `MediaQueueModule` → `FilesModule`):
 * il provider `STORAGE_DRIVER` è quindi replicato con la stessa factory
 * stateless di `files.module.ts` (i due driver non hanno stato condiviso,
 * solo `AppConstants`), invece di introdurre un `forwardRef`.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media-queue',
    }),
  ],
  providers: [
    MediaProcessor,
    MediaQueueService,
    {
      provide: STORAGE_DRIVER,
      useFactory: () =>
        AppConstants.storageDriver === 's3' ? new S3CompatibleDriver() : new LocalDiskDriver(),
    },
  ],
  exports: [MediaQueueService],
})
export class MediaQueueModule {}
