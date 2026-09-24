import { Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import * as path from 'path';
import { AppConstants } from '../../common/app-constants';
import { StorageDriver } from './storage-driver.interface';

/**
 * Driver di storage su filesystem locale (ADR-8) — usato in sviluppo
 * (`STORAGE_DRIVER=local`), zero dipendenze esterne. I blob vivono sotto
 * `AppConstants.storageLocalPath` in una struttura piatta: `key` è sempre una
 * stringa random generata server-side da `FilesService` (mai derivata da
 * input utente), quindi non serve una difesa aggiuntiva da path traversal.
 */
@Injectable()
export class LocalDiskDriver implements StorageDriver {
  private readonly logger = new Logger(LocalDiskDriver.name);
  private readonly rootDir = path.resolve(process.cwd(), AppConstants.storageLocalPath);

  /** Scrive il blob su disco, creando la cartella di storage se non esiste ancora. */
  async upload(key: string, buffer: Buffer): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(path.join(this.rootDir, key), buffer);
    this.logger.log(`File salvato su disco locale (key=${key}).`);
  }

  /** Apre uno stream di lettura sul blob salvato sotto `key`. */
  async download(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(path.join(this.rootDir, key));
  }

  /** Rimuove il blob salvato sotto `key` dal disco locale. Idempotente: se il file è già assente (ENOENT) non lancia (ADR-11). */
  async delete(key: string): Promise<void> {
    try {
      await unlink(path.join(this.rootDir, key));
      this.logger.log(`File rimosso da disco locale (key=${key}).`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
