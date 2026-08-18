import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload della superficie pubblica di lettura (`GET public/pages`, F03/T2,
 * ADR-24 § 2). Contenuto della **Revisione pubblicata**, mai `draftContent`:
 * nessun campo amministrativo (`guid`, `id`, `status`, `version` di lock
 * ottimistico, `createdBy`/`updatedBy`) — la superficie pubblica non li
 * espone mai (constitution.md § Convenzioni API).
 */
export class PublicPageDto {
  @ApiProperty({
    description: 'Titolo della Pagina, snapshot della Revisione pubblicata',
    example: 'Chi siamo',
  })
  title!: string;

  @ApiProperty({
    description: "Slug dell'ultimo segmento del percorso, snapshot della Revisione pubblicata",
    example: 'chi-siamo',
  })
  slug!: string;

  @ApiProperty({ description: 'Locale della Pagina risolta', example: 'it-IT' })
  locale!: string;

  @ApiProperty({
    description:
      'Albero di blocchi della Revisione pubblicata, già migrato alla forma corrente ({version, blocks})',
    type: 'object',
    additionalProperties: true,
  })
  content!: Record<string, unknown>;

  @ApiProperty({
    description: 'Metadati SEO/GEO della Revisione pubblicata',
    type: 'object',
    additionalProperties: true,
  })
  seo!: Record<string, unknown>;
}
