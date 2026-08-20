import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { fileEntity } from '../../db/schema';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage-driver.interface';
import { detectRasterMimeType } from './raster-mime-sniffer';

/** Blob letto e riconosciuto, pronto per la risposta HTTP. */
export interface PublicMediaBlob {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Lettura pubblica dei media editoriali (ADR-27). A differenza di
 * `FilesService.download` (superficie `app/`, JWT, qualunque file attivo),
 * questo service serve **solo** le righe con `entity = 'page-media'`
 * (ADR-27 § 2, opt-in esplicito) e verifica il `Content-Type` sui byte
 * reali (ADR-27 § 3) invece di fidarsi di `files.mimeType`, che è il valore
 * dichiarato dal client all'upload. Ogni esito diverso da "trovato e
 * riconosciuto come raster" produce lo stesso 404 uniforme (ADR-27 § 1):
 * `guid` inesistente, riga non `page-media`, soft-eliminata, blob assente
 * su disco, o byte che non corrispondono a nessuna firma raster — SVG
 * compreso, che la tabella chiusa di `detectRasterMimeType` non riconosce
 * mai.
 */
@Injectable()
export class PublicMediaService {
  /** Inietta l'accesso al DB e il driver di storage attivo (stesso di `FilesModule`, ADR-8). */
  constructor(
    private readonly db: DbService,
    @Inject(STORAGE_DRIVER) private readonly storageDriver: StorageDriver,
  ) {}

  /**
   * Recupera e riconosce il blob associato a `guid`, se editoriale, attivo,
   * e di formato raster ammesso.
   * @param guid Identificatore pubblico del file.
   */
  async serve(guid: string): Promise<PublicMediaBlob> {
    const row = await this.db.db.query.fileEntity.findFirst({
      where: and(
        eq(fileEntity.guid, guid),
        eq(fileEntity.entity, 'page-media'),
        eq(fileEntity.isActive, true),
      ),
    });
    if (!row) {
      throw new NotFoundException('Media non trovato.');
    }

    const buffer = await this.readBlob(row.storageKey);
    const mimeType = detectRasterMimeType(buffer);
    if (!mimeType) {
      throw new NotFoundException('Media non trovato.');
    }

    return { buffer, mimeType };
  }

  /** Legge l'intero blob dal driver di storage attivo. Un blob assente/illeggibile è un 404, mai un 5xx. */
  private async readBlob(storageKey: string): Promise<Buffer> {
    try {
      const stream = await this.storageDriver.download(storageKey);
      return await streamToBuffer(stream);
    } catch {
      throw new NotFoundException('Media non trovato.');
    }
  }
}

/** Colleziona un intero `ReadableStream` in un `Buffer` (nessuna dipendenza nuova, solo Node core). */
function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
