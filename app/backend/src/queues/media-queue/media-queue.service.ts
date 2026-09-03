import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MediaTransformDto } from '../../files/dto/media-transform.dto';

/** Payload di un job della coda `media-queue`: il file sorgente e la trasformazione richiesta (ADR-49). */
export interface MediaTransformJobData {
  fileGuid: string;
  transform: MediaTransformDto;
}

/**
 * Accodamento delle richieste di trasformazione immagine (ADR-49 § Decisione:
 * generazione sempre asincrona, mai nel path di una richiesta HTTP). Il
 * lavoro pesante (decodifica/ricampionamento/riconversione con `sharp`) vive
 * interamente in `MediaProcessor`, mai qui.
 */
@Injectable()
export class MediaQueueService {
  private readonly logger = new Logger(MediaQueueService.name);

  /** Inietta la coda BullMQ `media-queue`. */
  constructor(@InjectQueue('media-queue') private readonly queue: Queue<MediaTransformJobData>) {}

  /**
   * Accoda la generazione di una variante per `fileGuid` secondo `transform`.
   * @returns L'id del job BullMQ appena creato, da restituire al chiamante per
   * consentire un eventuale tracking dello stato di avanzamento.
   */
  async enqueueTransform(fileGuid: string, transform: MediaTransformDto): Promise<string> {
    const job = await this.queue.add(
      'transform',
      { fileGuid, transform },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.log(`Trasformazione media accodata (fileGuid=${fileGuid}, jobId=${job.id}).`);
    // BullMQ garantisce un `id` per un job appena creato senza `jobId` custom esplicito.
    return job.id as string;
  }
}
