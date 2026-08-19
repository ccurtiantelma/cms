import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload di `GET api/v1/preview/pages/:token` (ADR-25 § 3, T3). Contenuto
 * della **bozza corrente** (`draftContent`/`draftSeo`), mai la Revisione
 * pubblicata — a differenza di {@link PublicPageDto}, che serve solo
 * `published`. Nessun campo amministrativo (`guid`, `id`, `status`,
 * `version` di lock ottimistico, `createdBy`/`updatedBy`): la prova di
 * accesso è il token stesso, non un ruolo, ma la superficie resta di sola
 * lettura e non espone lo stato interno della riga.
 */
export class PagePreviewContentDto {
  @ApiProperty({
    description: 'Titolo della Pagina, snapshot della bozza corrente',
    example: 'Chi siamo (bozza)',
  })
  title!: string;

  @ApiProperty({
    description: "Slug dell'ultimo segmento del percorso, snapshot della bozza corrente",
    example: 'chi-siamo',
  })
  slug!: string;

  @ApiProperty({ description: 'Locale della Pagina', example: 'it-IT' })
  locale!: string;

  @ApiProperty({
    description:
      'Albero di blocchi della bozza corrente, già migrato alla forma corrente ({version, blocks})',
    type: 'object',
    additionalProperties: true,
  })
  content!: Record<string, unknown>;

  @ApiProperty({
    description: 'Metadati SEO/GEO della bozza corrente',
    type: 'object',
    additionalProperties: true,
  })
  seo!: Record<string, unknown>;
}
