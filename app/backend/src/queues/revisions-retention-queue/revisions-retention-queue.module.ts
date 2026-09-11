import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../../settings/settings.module';
import { RevisionsRetentionProcessor } from './revisions-retention.processor';
import { RevisionsRetentionScheduler } from './revisions-retention.scheduler';

/**
 * Coda BullMQ della potatura delle Revisioni (ADR-61). Stesso pattern di
 * `files-cleanup-queue`: `BullModule.registerQueue` + `@Processor`/`WorkerHost`
 * più uno scheduler che registra la ricorrenza su Redis all'avvio.
 * Importa `SettingsModule` per leggere la policy dalla stessa sorgente che
 * l'Admin scrive (`app_settings`), mai da una copia in config.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'revisions-retention-queue',
    }),
    SettingsModule,
  ],
  providers: [RevisionsRetentionProcessor, RevisionsRetentionScheduler],
})
export class RevisionsRetentionQueueModule {}
