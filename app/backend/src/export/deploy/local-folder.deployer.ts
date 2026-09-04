import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { AppConstants } from '../../common/app-constants';
import { StaticSiteDeployer } from './static-site-deployer.interface';

/**
 * Adapter di deployment su cartella locale (RFC-44, Decisione 8) — unica
 * implementazione attiva di `StaticSiteDeployer`, scrive sotto
 * `AppConstants.staticExportPath`, servita da Nginx via bind mount (stesso
 * pattern già in uso per `LocalDiskDriver`, ADR-8). Ogni scrittura passa da
 * un file temporaneo + `rename` (atomico sullo stesso filesystem): mai un
 * file troncato a metà se il processo muore durante la scrittura.
 */
@Injectable()
export class LocalFolderDeployer implements StaticSiteDeployer {
  private readonly logger = new Logger(LocalFolderDeployer.name);
  private readonly rootDir = AppConstants.staticExportPath;

  /** Scrive `content` sotto la radice configurata, creando le sottodirectory necessarie e sovrascrivendo in modo sicuro un file già esistente (file temporaneo + `rename` atomico). */
  async write(relativePath: string, content: Buffer | string): Promise<void> {
    const filePath = this.resolveWithinRoot(relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmpPath, content);
    await rename(tmpPath, filePath);
    this.logger.log(`File statico scritto (relativePath=${relativePath}).`);
  }

  /** Idempotente: `rm(..., {force:true})` non lancia se il file non era mai stato scritto. */
  async remove(relativePath: string): Promise<void> {
    const filePath = this.resolveWithinRoot(relativePath);
    await rm(filePath, { force: true });
    this.logger.log(`File statico rimosso (relativePath=${relativePath}).`);
  }

  /**
   * `relativePath` origina sempre da segmenti server-side (locale,
   * `canonicalizePublicPath`, `guid` a 16 esadecimali) — mai da input
   * utente non validato — ma il confine fra chiamante e adapter è la
   * frontiera giusta per rifiutare una traversal, non un dettaglio da
   * fidarsi a monte.
   */
  private resolveWithinRoot(relativePath: string): string {
    const rootResolved = resolve(this.rootDir);
    const targetResolved = resolve(this.rootDir, relativePath);
    if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + sep)) {
      throw new Error(`Percorso relativo fuori dalla directory statica: ${relativePath}`);
    }
    return join(this.rootDir, relativePath);
  }
}
