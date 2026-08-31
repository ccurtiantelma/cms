import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BlocksModule } from '../blocks/blocks.module';
import { SiteTemplatesController } from './site-templates.controller';
import { PublicSiteTemplatesController } from './public-site-templates.controller';
import { SiteTemplatesService } from './site-templates.service';
import { TemplateResolverService } from './template-resolver.service';

/**
 * Modulo Template di tema (RFC-40 Opzione B): CRUD amministrativo
 * (`Manager`+) e superficie pubblica di sola lettura per il consumer SSR,
 * due controller distinti sullo stesso modulo — stessa separazione di
 * `PagesModule`/`GlobalSectionsModule` (constitution.md, Principle 8).
 * `BlocksModule` porta `BlockTreeValidatorService`/`BLOCK_REGISTRY_TOKEN` in
 * DI, riuso integrale della pipeline blocchi di ADR-21.
 */
@Module({
  imports: [DbModule, BlocksModule],
  controllers: [SiteTemplatesController, PublicSiteTemplatesController],
  providers: [SiteTemplatesService, TemplateResolverService],
})
export class SiteTemplatesModule {}
