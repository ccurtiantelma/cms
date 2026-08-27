import { Injectable, Inject, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AuditLogService } from '../common/audit-log.service';
import {
  BLOCK_REGISTRY_TOKEN,
  BlockRegistry,
  computeBlockRegistryToken,
} from '../blocks/block-registry';
import { CacheInvalidationQueueService } from '../queues/cache-invalidation-queue/cache-invalidation.queue.service';
import { PublicActiveGlobalSectionsDto } from './dto/public-active-global-sections.dto';

/**
 * Cache pubblica delle Sezioni Globali attive (F06, ADR-40 — stesso schema
 * di `PublicPageCacheService`, ADR-23, ridotto a **una sola chiave**: gli
 * slot pubblici consumati da SSR sono sempre e solo `header`/`footer`,
 * indipendentemente da quante Sezioni Globali esistano in stato `none`.
 */
@Injectable()
export class PublicGlobalSectionsCacheService {
  private readonly logger = new Logger(PublicGlobalSectionsCacheService.name);
  private readonly registryToken: string;

  constructor(
    private readonly redis: RedisService,
    private readonly auditLogService: AuditLogService,
    private readonly cacheInvalidationQueue: CacheInvalidationQueueService,
    @Inject(BLOCK_REGISTRY_TOKEN) blockRegistry: BlockRegistry,
  ) {
    this.registryToken = computeBlockRegistryToken(blockRegistry);
  }

  private buildKey(): string {
    return `public:${this.registryToken}:global-sections:active`;
  }

  /** `null` su cache miss **o** su qualunque errore Redis: la lettura pubblica cade sempre sul database (ADR-23 § 7). */
  async getCached(): Promise<PublicActiveGlobalSectionsDto | null> {
    if (!this.redis.isReady()) return null;
    try {
      return await this.redis.getJson<PublicActiveGlobalSectionsDto>(this.buildKey());
    } catch (err) {
      this.logger.warn(
        `Lettura cache sezioni globali fallita, si cade sul database: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Nessuna TTL (ADR-23 § 3). Un errore Redis qui è solo loggato, mai bloccante. */
  async setCached(dto: PublicActiveGlobalSectionsDto): Promise<void> {
    if (!this.redis.isReady()) return;
    try {
      await this.redis.set(this.buildKey(), dto);
    } catch (err) {
      this.logger.warn(
        `Scrittura cache sezioni globali fallita (non bloccante): ${(err as Error).message}`,
      );
    }
  }

  /** `DEL` post-commit, da chiamare dopo ogni scrittura che tocca `layoutSlot`/`content`/`isActive`. */
  async invalidate(actingUserId: number): Promise<void> {
    const key = this.buildKey();
    if (!this.redis.isReady()) {
      this.logger.error(`Redis irraggiungibile: invalidazione cache sezioni globali saltata (${key}).`);
      return;
    }
    try {
      await this.redis.delMany([key]);
    } catch (err) {
      this.logger.error(
        `DEL cache sezioni globali fallito, accodo retry: ${(err as Error).message}`,
      );
      await this.auditLogService.log(
        actingUserId,
        'global-sections-cache.del-failed',
        'global_sections_cache',
        undefined,
        { keys: [key] },
      );
      try {
        await this.cacheInvalidationQueue.enqueueInvalidation([key]);
      } catch (queueErr) {
        this.logger.error(
          `Accodamento del retry di invalidazione fallito (stesso Redis): ${(queueErr as Error).message}. Chiave: ${key}`,
        );
      }
    }
  }
}
