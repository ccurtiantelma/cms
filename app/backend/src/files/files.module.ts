import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AppConstants } from '../common/app-constants';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PublicMediaController } from './public-media/public-media.controller';
import { PublicMediaService } from './public-media/public-media.service';
import { STORAGE_DRIVER } from './storage/storage-driver.interface';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { S3CompatibleDriver } from './storage/s3-compatible.driver';
import { MediaQueueModule } from '../queues/media-queue/media-queue.module';

/**
 * Modulo core di storage documenti (ADR-8). Sceglie il driver concreto
 * (`LocalDiskDriver` o `S3CompatibleDriver`) in base a
 * `AppConstants.storageDriver`, iniettato dietro il token `STORAGE_DRIVER` —
 * `FilesService` non conosce mai quale dei due è attivo. Ospita anche la
 * superficie pubblica dei media (`PublicMediaController`/`Service`, ADR-27):
 * stesso driver, nessun secondo meccanismo di lettura. Importa
 * `MediaQueueModule` (ADR-49) per accodare le richieste di trasformazione
 * immagine da `FilesService` — vedi `media-queue.module.ts` sul perché quel
 * modulo non importa `FilesModule` a sua volta.
 */
@Module({
  imports: [DbModule, MediaQueueModule],
  controllers: [FilesController, PublicMediaController],
  providers: [
    FilesService,
    PublicMediaService,
    {
      provide: STORAGE_DRIVER,
      useFactory: () =>
        AppConstants.storageDriver === 's3' ? new S3CompatibleDriver() : new LocalDiskDriver(),
    },
  ],
  // STORAGE_DRIVER esportato per il job di cleanup blob orfani (ADR-11,
  // src/queues/files-cleanup-queue/), che riusa la stessa istanza di driver
  // invece di istanziarne una propria. PublicMediaService esportato per
  // `ExportProcessor` (RFC-44 Decisione 6): riusa la stessa risoluzione
  // GUID -> blob raster di ADR-27 invece di duplicarla.
  exports: [STORAGE_DRIVER, PublicMediaService],
})
export class FilesModule {}
