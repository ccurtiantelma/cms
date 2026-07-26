import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AppConstants } from '../common/app-constants';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { STORAGE_DRIVER } from './storage/storage-driver.interface';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { S3CompatibleDriver } from './storage/s3-compatible.driver';

/**
 * Modulo core di storage documenti (ADR-8). Sceglie il driver concreto
 * (`LocalDiskDriver` o `S3CompatibleDriver`) in base a
 * `AppConstants.storageDriver`, iniettato dietro il token `STORAGE_DRIVER` —
 * `FilesService` non conosce mai quale dei due è attivo.
 */
@Module({
  imports: [DbModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: STORAGE_DRIVER,
      useFactory: () =>
        AppConstants.storageDriver === 's3' ? new S3CompatibleDriver() : new LocalDiskDriver(),
    },
  ],
  // STORAGE_DRIVER esportato per il job di cleanup blob orfani (ADR-11,
  // src/queues/files-cleanup-queue/), che riusa la stessa istanza di driver
  // invece di istanziarne una propria.
  exports: [STORAGE_DRIVER],
})
export class FilesModule {}
