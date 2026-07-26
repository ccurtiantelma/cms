import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { and, eq, lt } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { fileEntity } from '../../db/schema';
import { AppConstants } from '../../common/app-constants';
import { STORAGE_DRIVER, StorageDriver } from '../../files/storage/storage-driver.interface';

/**
 * Worker BullMQ del job repeatable di pulizia blob orfani (ADR-11): rimuove
 * fisicamente il blob dei file soft-deleted (`isActive = false`, ADR-8) oltre
 * il periodo di grazia `AppConstants.filesCleanupGraceDays`. La riga metadata
 * nel DB NON viene mai rimossa (nessun `DELETE` fisico, CLAUDE.md): resta come
 * traccia storica, solo il blob fisico (disco/S3) viene eliminato.
 */
@Injectable()
@Processor('files-cleanup-queue')
export class FilesCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(FilesCleanupProcessor.name);

  /** Inietta l'accesso al DB e il driver di storage attivo (stesso token di `FilesModule`). */
  constructor(
    private readonly db: DbService,
    @Inject(STORAGE_DRIVER) private readonly storageDriver: StorageDriver,
  ) {
    super();
  }

  /** Trova i file soft-deleted oltre il periodo di grazia e ne rimuove il blob fisico. */
  async process(): Promise<void> {
    const cutoff = new Date(Date.now() - AppConstants.filesCleanupGraceDays * 24 * 60 * 60 * 1000);

    const candidates = await this.db.db.query.fileEntity.findMany({
      where: and(eq(fileEntity.isActive, false), lt(fileEntity.updatedAt, cutoff)),
      limit: AppConstants.filesCleanupBatchSize,
    });

    if (candidates.length === 0) {
      this.logger.log('Nessun blob orfano da rimuovere.');
      return;
    }

    let purged = 0;
    let failed = 0;
    for (const row of candidates) {
      try {
        await this.storageDriver.delete(row.storageKey);
        purged++;
      } catch (err) {
        failed++;
        this.logger.warn(`Rimozione blob fallita (guid=${row.guid}): ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Cleanup blob orfani completato: ${purged} rimossi, ${failed} falliti su ${candidates.length} candidati (grazia=${AppConstants.filesCleanupGraceDays}gg).`,
    );
  }
}
