import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BlocksModule } from '../blocks/blocks.module';
import { CacheInvalidationQueueModule } from '../queues/cache-invalidation-queue/cache-invalidation-queue.module';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';
import { PublicPagesController } from './public-pages.controller';
import { PublicPagesService } from './public-pages.service';
import { PublicPageCacheService } from './public-page-cache.service';

/**
 * Modulo Pagine (F01/F02/F03): CRUD amministrativo, slug, gerarchia, lock
 * ottimistico, ownership per riga, macchina a stati, revisioni, la
 * pipeline di innesto dei blocchi (F02/T5: forma envelope → migrazione →
 * validazione registro → sanitizzazione per kind → persistenza), e la
 * superficie pubblica di sola lettura (F03/T2, `PublicPagesController`/
 * `PublicPagesService`, ADR-24) — due controller distinti sullo stesso
 * modulo, mai lo stesso controller (constitution.md, Principle 8: lettura
 * pubblica e scrittura autenticata sono due superfici separate).
 * `BlocksModule` porta `BlockTreeValidatorService`/`BLOCK_REGISTRY_TOKEN` in
 * DI. `AuditLogService`/`TreeSanitizerService`/`BlockPropSanitizerService`
 * vengono da `CommonModule` (globale, nessun import esplicito necessario).
 * `PublicPageCacheService` (F03/T3, ADR-23) è condiviso fra le due
 * superfici: letto/scritto da `PublicPagesService` sul percorso di lettura,
 * invalidato da `PagesService` sui percorsi di scrittura che cambiano
 * contenuto pubblico. `CacheInvalidationQueueModule` porta il ricorso
 * BullMQ di un `DEL` fallito (ADR-23 § 6).
 */
@Module({
  imports: [DbModule, BlocksModule, CacheInvalidationQueueModule],
  controllers: [PagesController, PublicPagesController],
  providers: [PagesService, PublicPagesService, PublicPageCacheService],
})
export class PagesModule {}
