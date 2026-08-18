import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { RedisService } from '../../redis/redis.service';
import type { CacheInvalidationJobData } from './cache-invalidation.queue.service';

/**
 * Worker che ritenta il `DEL` delle chiavi di cache pubblica non cancellate
 * dal percorso sincrono (ADR-23 § 6). Un fallimento qui rilancia per far
 * scattare retry/backoff di BullMQ: se anche i tentativi si esauriscono, il
 * job resta `failed` e l'unico ripristino resta l'audit scritto al momento
 * dell'accodamento (elenco chiavi), come dichiarato dall'ADR.
 */
@Injectable()
@Processor('cache-invalidation-queue')
export class CacheInvalidationProcessor extends WorkerHost {
  private readonly logger = new Logger(CacheInvalidationProcessor.name);

  /** Inietta il client Redis condiviso usato per ritentare il `DEL`. */
  constructor(private readonly redisService: RedisService) {
    super();
  }

  /** Processa un job della coda `cache-invalidation-queue` ritentando il `DEL` delle chiavi indicate. */
  async process(job: Job<CacheInvalidationJobData>): Promise<void> {
    const { keys } = job.data || ({} as CacheInvalidationJobData);
    if (!keys || keys.length === 0) {
      this.logger.warn(`Job ${job.id} senza chiavi, skip.`);
      return;
    }

    try {
      await this.redisService.delMany(keys);
    } catch (err) {
      throw new Error(
        `Retry invalidazione cache fallito per ${keys.length} chiave/i: ${(err as Error).message}`,
      );
    }
  }
}
