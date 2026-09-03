import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { fileEntity } from '../../db/schema';
import { AppConstants } from '../../common/app-constants';
import { Utils } from '../../common/utils';
import { STORAGE_DRIVER, StorageDriver } from '../../files/storage/storage-driver.interface';
import { MediaTransformPreset } from '../../files/dto/media-transform.dto';
import type { MediaTransformJobData } from './media-queue.service';

/**
 * Dimensioni assolute (px) per ciascun preset nominato (ADR-49 § M6). I
 * rapporti sono la decisione approvata (thumbnail 1:1, card 16:9, hero
 * ~21:9, og 1.91:1); i valori pixel concreti sono una scelta implementativa
 * di questo worker, rivedibile senza nuova ADR finché resta all'interno
 * dell'insieme di preset già nominato (ADR-49 § Conseguenze).
 */
const PRESET_DIMENSIONS: Record<MediaTransformPreset, { width: number; height: number }> = {
  [MediaTransformPreset.Thumbnail]: { width: 400, height: 400 },
  [MediaTransformPreset.Card]: { width: 800, height: 450 },
  [MediaTransformPreset.Hero]: { width: 1600, height: 762 },
  [MediaTransformPreset.Og]: { width: 1200, height: 628 },
};

interface SharpMetadata {
  width?: number;
  height?: number;
}

interface SharpPipeline {
  metadata(): Promise<SharpMetadata>;
  extract(region: { left: number; top: number; width: number; height: number }): SharpPipeline;
  resize(width: number, height: number): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}

/**
 * Il pacchetto `sharp` pubblica dichiarazioni di tipo in stile ESM
 * (`export default`, `dist/index.d.mts`) che la risoluzione moduli di questo
 * progetto preferisce, ma a runtime Node carica sempre il build CJS
 * (`dist/index.cjs`, `module.exports = Sharp`, nessuna proprietà `.default`):
 * un `import sharp from 'sharp'` compilerebbe correttamente ma leggerebbe
 * `.default` da un oggetto che a runtime non lo espone. `require` diretto
 * bypassa l'emit del default-import ESM di TypeScript; la vera superficie
 * `sharp` è ampia, qui è ritipizzata al solo sottoinsieme usato da questo
 * worker (`any` isolato a questa singola riga, mai propagato oltre).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (input: Buffer) => SharpPipeline = require('sharp');

/**
 * Worker BullMQ della pipeline di trasformazione media (ADR-49): mai
 * eseguito nel path di una richiesta HTTP pubblica. Ispeziona il sorgente
 * con `sharp`, applica `.extract()` su un crop esplicito oppure un
 * ricampionamento centrato sul focal point per un preset nominato, riconverte
 * sempre in `webp` (quality 80) e persiste il risultato come **riga nuova**
 * in `files` (`parentFileId` verso l'originale) — l'originale non viene mai
 * riscritto (non distruttività, ADR-49 § M8).
 */
@Injectable()
@Processor('media-queue')
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  /** Inietta l'accesso al DB e il driver di storage attivo (stesso contratto di `FilesModule`). */
  constructor(
    private readonly db: DbService,
    @Inject(STORAGE_DRIVER) private readonly storageDriver: StorageDriver,
  ) {
    super();
  }

  /** Processa un job della coda `media-queue`: genera e persiste una variante del file sorgente. */
  async process(job: Job<MediaTransformJobData>): Promise<void> {
    const { fileGuid, transform } = job.data;

    const sourceRow = await this.db.db.query.fileEntity.findFirst({
      where: and(eq(fileEntity.guid, fileGuid), eq(fileEntity.isActive, true)),
    });
    if (!sourceRow) {
      throw new Error(`File sorgente non trovato o non attivo (guid=${fileGuid}).`);
    }

    const sourceBuffer = await this.readBlob(sourceRow.storageKey);
    const metadata = await sharp(sourceBuffer).metadata();
    const sourceWidth = metadata.width;
    const sourceHeight = metadata.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error(
        `Impossibile leggere le dimensioni dell'immagine sorgente (guid=${fileGuid}).`,
      );
    }

    const hasCrop =
      transform.cropX !== undefined ||
      transform.cropY !== undefined ||
      transform.cropW !== undefined ||
      transform.cropH !== undefined;

    let pipeline: SharpPipeline;
    if (hasCrop) {
      pipeline = sharp(sourceBuffer).extract(
        this.resolveExplicitCropBox(transform, sourceWidth, sourceHeight),
      );
    } else {
      if (!transform.preset) {
        throw new BadRequestException(
          'Serve un crop esplicito (cropX/Y/W/H) o un preset per generare una variante.',
        );
      }
      const target = PRESET_DIMENSIONS[transform.preset];
      const focalX = transform.focalX ?? sourceRow.focalX;
      const focalY = transform.focalY ?? sourceRow.focalY;
      const box = this.computeFocalCropBox(
        sourceWidth,
        sourceHeight,
        target.width / target.height,
        focalX,
        focalY,
      );
      pipeline = sharp(sourceBuffer).extract(box).resize(target.width, target.height);
    }

    const outputBuffer = await pipeline.webp({ quality: 80 }).toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();

    const storageKey = Utils.randomString(40);
    await this.storageDriver.upload(storageKey, outputBuffer, 'image/webp');

    const variantLabel = transform.preset ?? 'crop';
    const derivedName = `${variantLabel}-${sourceRow.originalName.replace(/\.[^./]+$/, '')}.webp`;

    const [derivedRow] = await this.db.db
      .insert(fileEntity)
      .values({
        guid: Utils.randomString(16),
        originalName: derivedName,
        mimeType: 'image/webp',
        sizeBytes: outputBuffer.length,
        storageDriver: AppConstants.storageDriver,
        storageKey,
        checksumSha256: createHash('sha256').update(outputBuffer).digest('hex'),
        entity: sourceRow.entity,
        entityId: sourceRow.entityId,
        parentFileId: sourceRow.id,
      })
      .returning();

    this.logger.log(
      `Variante media generata (parentGuid=${fileGuid}, guid=${derivedRow.guid}, ` +
        `${outputMetadata.width}x${outputMetadata.height}, preset=${transform.preset ?? 'n/d'}).`,
    );
  }

  /**
   * Valida e converte il crop esplicito richiesto in un box `sharp.extract`.
   * Rigetta con `BadRequestException` (errore gestito, mai un crop silenzioso
   * fuori bounds) se una delle quattro coordinate manca o eccede le dimensioni
   * reali dell'immagine sorgente (ADR-49 § Decisione).
   */
  private resolveExplicitCropBox(
    transform: MediaTransformJobData['transform'],
    sourceWidth: number,
    sourceHeight: number,
  ): { left: number; top: number; width: number; height: number } {
    const { cropX, cropY, cropW, cropH } = transform;
    if (cropX === undefined || cropY === undefined || cropW === undefined || cropH === undefined) {
      throw new BadRequestException(
        'Crop parziale: cropX/cropY/cropW/cropH vanno forniti tutti insieme.',
      );
    }
    if (cropX + cropW > sourceWidth || cropY + cropH > sourceHeight) {
      throw new BadRequestException(
        `Crop fuori dai limiti dell'immagine sorgente (${sourceWidth}x${sourceHeight}): ` +
          `richiesto (${cropX},${cropY},${cropW}x${cropH}).`,
      );
    }
    return {
      left: Math.round(cropX),
      top: Math.round(cropY),
      width: Math.round(cropW),
      height: Math.round(cropH),
    };
  }

  /**
   * Calcola il box di ritaglio più grande possibile nel rapporto `targetRatio`
   * centrato sul focal point (percentuale 0-100 di `sourceWidth`/`sourceHeight`),
   * clampato dentro i bordi dell'immagine sorgente (ADR-49 § Decisione: "resize
   * centrato sul focal point").
   */
  private computeFocalCropBox(
    sourceWidth: number,
    sourceHeight: number,
    targetRatio: number,
    focalX: number,
    focalY: number,
  ): { left: number; top: number; width: number; height: number } {
    const sourceRatio = sourceWidth / sourceHeight;
    const cropWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
    const cropHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;

    const centerX = (focalX / 100) * sourceWidth;
    const centerY = (focalY / 100) * sourceHeight;
    const left = Math.min(Math.max(centerX - cropWidth / 2, 0), sourceWidth - cropWidth);
    const top = Math.min(Math.max(centerY - cropHeight / 2, 0), sourceHeight - cropHeight);

    return {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    };
  }

  /** Legge l'intero blob sorgente dal driver di storage attivo. */
  private async readBlob(storageKey: string): Promise<Buffer> {
    const stream = await this.storageDriver.download(storageKey);
    return streamToBuffer(stream);
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
