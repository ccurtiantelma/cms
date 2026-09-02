import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppConstants } from '../common/app-constants';

/** Una riga del manifest: stato dell'ultima esportazione riuscita di una Pagina in una lingua. */
export interface ManifestEntry {
  pageId: string;
  locale: string;
  path: string;
  contentHash: string;
  exportedAt: string;
}

/**
 * Stato derivato e rigenerabile della compilazione statica (RFC-44,
 * Decisione 2): mai una tabella Postgres, mai `app_settings`. Se il file va
 * perso si ricostruisce con un full-site rebuild — la verità resta
 * `page_revisions`/`pages.publishedRevisionId`.
 */
export interface StaticExportManifest {
  version: 1;
  updatedAt: string;
  pages: Record<string, ManifestEntry>;
}

/**
 * Lettura/scrittura atomica di `manifest.json` nella directory statica
 * (`AppConstants.staticExportPath`). Ogni scrittura passa da un file
 * temporaneo + `rename` (atomico sullo stesso filesystem): mai un file
 * troncato a metà se il processo muore durante la scrittura.
 */
@Injectable()
export class ManifestService {
  private readonly logger = new Logger(ManifestService.name);

  /**
   * Serializza le mutazioni concorrenti sullo stesso file **all'interno di
   * questo processo** (più job del processor possono sovrapporsi): una
   * catena di promise, non un lock. Più istanze/worker separati su file
   * diverso richiederebbero un lock distribuito — fuori scope (RFC-44,
   * Decisione 8: solo `LocalFolderDeployer`, singola istanza).
   */
  private writeQueue: Promise<unknown> = Promise.resolve();

  private get manifestPath(): string {
    return join(AppConstants.staticExportPath, 'manifest.json');
  }

  private buildKey(locale: string, path: string): string {
    return `${locale}:${path}`;
  }

  private emptyManifest(): StaticExportManifest {
    return { version: 1, updatedAt: new Date().toISOString(), pages: {} };
  }

  /** Legge il manifest corrente, o un manifest vuoto se il file non esiste ancora. */
  async read(): Promise<StaticExportManifest> {
    try {
      const raw = await readFile(this.manifestPath, 'utf-8');
      return JSON.parse(raw) as StaticExportManifest;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.emptyManifest();
      }
      this.logger.error(`Manifest illeggibile, considerato vuoto: ${(err as Error).message}`);
      return this.emptyManifest();
    }
  }

  /** Registra/aggiorna l'esito di un export riuscito per `locale`+`path`. */
  async upsertEntry(entry: ManifestEntry): Promise<void> {
    await this.mutate((manifest) => {
      manifest.pages[this.buildKey(entry.locale, entry.path)] = entry;
    });
  }

  /** Rimuove la riga di `locale`+`path` (tombstone). No-op se non presente. */
  async removeEntry(locale: string, path: string): Promise<void> {
    await this.mutate((manifest) => {
      delete manifest.pages[this.buildKey(locale, path)];
    });
  }

  private async mutate(mutator: (manifest: StaticExportManifest) => void): Promise<void> {
    const task = this.writeQueue.then(async () => {
      const manifest = await this.read();
      mutator(manifest);
      manifest.updatedAt = new Date().toISOString();
      await this.writeAtomic(manifest);
    });
    // La catena prosegue anche se questo task fallisce: un job fallito non
    // deve bloccare per sempre le mutazioni successive.
    this.writeQueue = task.catch(() => undefined);
    await task;
  }

  private async writeAtomic(manifest: StaticExportManifest): Promise<void> {
    await mkdir(dirname(this.manifestPath), { recursive: true });
    const tmpPath = `${this.manifestPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
    await rename(tmpPath, this.manifestPath);
  }
}
