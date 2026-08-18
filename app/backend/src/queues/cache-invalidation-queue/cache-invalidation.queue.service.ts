import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** Payload di un job della coda `cache-invalidation-queue`: le chiavi già calcolate dal chiamante. */
export interface CacheInvalidationJobData {
  keys: string[];
}

/**
 * Ricorso di un `DEL` di cache pubblica fallito con Redis raggiungibile
 * (ADR-23 § 6). Mai il percorso primario: `PublicPageCacheService` tenta
 * sempre prima il `DEL` sincrono post-commit; questa coda entra in gioco
 * solo su quel fallimento, con le chiavi già note (mai un nuovo calcolo, mai
 * `SCAN`). Stesso pattern di `EmailQueueService`.
 */
@Injectable()
export class CacheInvalidationQueueService {
  private readonly logger = new Logger(CacheInvalidationQueueService.name);

  /** Inietta la coda BullMQ `cache-invalidation-queue`. */
  constructor(
    @InjectQueue('cache-invalidation-queue')
    private readonly queue: Queue<CacheInvalidationJobData>,
  ) {}

  /**
   * Accoda un retry di invalidazione. Se anche l'accodamento fallisce (stesso
   * Redis del `DEL` appena fallito), il chiamante logga a `error` e si affida
   * solo all'audit già scritto (ADR-23 § 6) — non rilancia mai verso l'alto,
   * un guasto di cache non deve mai risalire a un errore HTTP.
   */
  async enqueueInvalidation(keys: string[]): Promise<void> {
    await this.queue.add(
      'invalidate',
      { keys },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.log(`Retry di invalidazione cache accodato per ${keys.length} chiave/i.`);
  }
}
