import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BlocksModule } from '../blocks/blocks.module';
import { ExportModule } from '../export/export.module';
import { GlobalSectionsController } from './global-sections.controller';
import { PublicGlobalSectionsController } from './public-global-sections.controller';
import { GlobalSectionsService } from './global-sections.service';

/**
 * Modulo Sezioni Globali (F06, ADR-40, fix ADR-55): CRUD amministrativo
 * (`Manager`+) e superficie pubblica di sola lettura, due controller
 * distinti sullo stesso modulo — stessa separazione di `PagesModule`
 * (constitution.md, Principle 8). `BlocksModule` porta
 * `BlockTreeValidatorService`/`BLOCK_REGISTRY_TOKEN` in DI, riuso integrale
 * della pipeline blocchi di ADR-21. `ExportModule` porta `ExportService`
 * (`enqueueFullSiteExport`), che sostituisce integralmente la cache Redis
 * pubblica orfana (ADR-53, ADR-55): nessuna dipendenza da
 * `CacheInvalidationQueueModule` resta in questo modulo, il suo unico
 * consumer locale (`PublicGlobalSectionsCacheService`) è stato eliminato.
 */
@Module({
  imports: [DbModule, BlocksModule, ExportModule],
  controllers: [GlobalSectionsController, PublicGlobalSectionsController],
  providers: [GlobalSectionsService],
})
export class GlobalSectionsModule {}
