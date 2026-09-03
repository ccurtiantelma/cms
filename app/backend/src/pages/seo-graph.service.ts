import { Injectable } from '@nestjs/common';
import { BlockNode } from './content-tree';
import { PageFaqEntryDto, PageSeoDto } from './dto/page-seo.dto';

const SCHEMA_CONTEXT = 'https://schema.org';

/**
 * Genera i dati strutturati Schema.org (JSON-LD) e i fallback OpenGraph a
 * publish-time (ADR-48), invocato da `PagesService.publishTransactionally()`.
 * Produce solo dati — mai markup `<script>`/`<meta>` (ADR-48 § Decisione,
 * constitution.md Principle 7): l'assemblaggio HTML resta responsabilità del
 * renderer in `app/public-site`.
 */
@Injectable()
export class SeoGraphService {
  /**
   * Arricchisce `existingSeo` con `structuredData` generato e i fallback OG.
   * Il generato non sovrascrive mai una chiave già presente nell'estensione
   * manuale di `structuredData` (merge non distruttivo, ADR-48). La FAQ è
   * letta da `existingSeo.faq` (business-rules.md § GEO), non da
   * `contentTree`: non esiste un tipo di blocco FAQ nel registro (ADR-21) —
   * `contentTree` resta nella firma per un futuro criterio di `@type`
   * (ADR-48 § Conseguenze), oggi fisso a `WebPage`.
   */
  generateSeoMetadata(
    pageTitle: string,
    contentTree: BlockNode[],
    existingSeo: PageSeoDto,
  ): PageSeoDto {
    void contentTree;

    const webPageEntity: Record<string, unknown> = {
      '@type': 'WebPage',
      name: existingSeo.metaTitle || pageTitle,
    };
    if (existingSeo.metaDescription) {
      webPageEntity.description = existingSeo.metaDescription;
    }

    const faqEntries = existingSeo.faq ?? [];
    const generated: Record<string, unknown> =
      faqEntries.length > 0
        ? {
            '@context': SCHEMA_CONTEXT,
            '@graph': [webPageEntity, this.buildFaqPageEntity(faqEntries)],
          }
        : {
            '@context': SCHEMA_CONTEXT,
            ...webPageEntity,
          };

    const structuredData: Record<string, unknown> = {
      ...generated,
      ...(existingSeo.structuredData ?? {}),
    };

    const ogTitle = existingSeo.ogTitle || existingSeo.metaTitle || pageTitle;
    const ogDescription = existingSeo.ogDescription || existingSeo.metaDescription;

    return {
      ...existingSeo,
      structuredData,
      ogTitle,
      ...(ogDescription ? { ogDescription } : {}),
    };
  }

  private buildFaqPageEntity(entries: PageFaqEntryDto[]): Record<string, unknown> {
    return {
      '@type': 'FAQPage',
      mainEntity: entries.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: entry.answer,
        },
      })),
    };
  }
}
