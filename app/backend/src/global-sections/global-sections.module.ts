import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BlocksModule } from '../blocks/blocks.module';
import { CacheInvalidationQueueModule } from '../queues/cache-invalidation-queue/cache-invalidation-queue.module';
import { GlobalSectionsController } from './global-sections.controller';
import { PublicGlobalSectionsController } from './public-global-sections.controller';
import { GlobalSectionsService } from './global-sections.service';
import { PublicGlobalSectionsCacheService } from './public-global-sections-cache.service';

/**
 * Modulo Sezioni Globali (F06, ADR-40): CRUD amministrativo (`Manager`+) e
 * superficie pubblica di sola lettura, due controller distinti sullo stesso
 * modulo — stessa separazione di `PagesModule` (constitution.md, Principle
 * 8). `BlocksModule` porta `BlockTreeValidatorService`/`BLOCK_REGISTRY_TOKEN`
 * in DI, riuso integrale della pipeline blocchi di ADR-21.
 * `CacheInvalidationQueueModule` porta il ricorso BullMQ di un `DEL`
 * fallito (ADR-23 § 6, riusato tale e quale, nessuna coda nuova).
 */
@Module({
  imports: [DbModule, BlocksModule, CacheInvalidationQueueModule],
  controllers: [GlobalSectionsController, PublicGlobalSectionsController],
  providers: [GlobalSectionsService, PublicGlobalSectionsCacheService],
})
export class GlobalSectionsModule {}
