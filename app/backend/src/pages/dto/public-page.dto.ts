import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload della superficie pubblica di lettura (`GET public/pages`, F03/T2,
 * ADR-24 § 2). Contenuto della **Revisione pubblicata**, mai `draftContent`:
 * nessun campo amministrativo (`guid`, `id`, `status`, `version` di lock
 * ottimistico, `createdBy`/`updatedBy`) — la superficie pubblica non li
 * espone mai (constitution.md § Convenzioni API).
 */
export class PublicPageTranslationDto {
  @ApiProperty({ description: 'Locale della traduzione pubblicata', example: 'en-GB' })
  locale!: string;

  @ApiProperty({
    description:
      'Percorso pubblico canonico della traduzione, prefisso di lingua incluso quando non è la lingua di default (ADR-24 § 5)',
    example: '/en-GB/about-us',
  })
  path!: string;
}

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

  @ApiProperty({
    description:
      "Le **altre** traduzioni pubblicate dello stesso gruppo (PLAN-F05 T5): materia prima per gli `hreflang`, che questo endpoint non genera — il markup è di F07. La Pagina corrente non compare nell'elenco: il consumatore ha già il proprio `locale` e il percorso che ha richiesto, e includerla renderebbe l'array non vuoto per definizione, contraddicendo il criterio « vuoto se la Pagina non ha traduzioni pubblicate ». Vuoto quando il gruppo non ha altre Pagine `published`.",
    type: [PublicPageTranslationDto],
  })
  translations!: PublicPageTranslationDto[];
}
