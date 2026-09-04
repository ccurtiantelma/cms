import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from '../db/db.module';
import { FilesModule } from '../files/files.module';
import { ExportService } from './export.service';
import { ExportProcessor } from './export.processor';
import { ManifestService } from './manifest.service';
import { STATIC_SITE_DEPLOYER } from './deploy/static-site-deployer.interface';
import { LocalFolderDeployer } from './deploy/local-folder.deployer';

/**
 * Modulo dell'export statico (RFC-44): coda BullMQ `static-export`, il suo
 * produttore (`ExportService`, chiamato da `PagesService` sui punti di
 * transizione di stato) e il suo processor (`ExportProcessor`, chiamata HTTP
 * interna a `app/public-site` + scrittura via `StaticSiteDeployer` + manifest).
 * Stesso pattern di `CacheInvalidationQueueModule`. `DbModule` serve solo al
 * processor, per l'enumerazione delle Pagine pubblicate del full-site
 * rebuild (Decisione 3/4). `FilesModule` serve al processor per la
 * risoluzione/copia dei media referenziati (Decisione 6, `PublicMediaService`).
 * `STATIC_SITE_DEPLOYER` ha oggi un'unica implementazione attiva
 * (`LocalFolderDeployer`, Decisione 8): nessuno switch su `AppConstants`
 * come per `STORAGE_DRIVER`, perché `S3Deployer`/`CloudflarePagesDeployer`
 * non esistono finché non c'è un'ADR dedicata.
 */
@Module({
  imports: [
    DbModule,
    FilesModule,
    BullModule.registerQueue({
      name: 'static-export',
    }),
  ],
  providers: [
    ExportService,
    ExportProcessor,
    ManifestService,
    { provide: STATIC_SITE_DEPLOYER, useClass: LocalFolderDeployer },
  ],
  exports: [ExportService],
})
export class ExportModule {}
