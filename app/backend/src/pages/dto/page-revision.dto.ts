import { ApiProperty } from '@nestjs/swagger';

/**
 * Voce di elenco di una Revisione (`GET /app/pages/:guid/revisions`). Mai
 * `id`/`pageId` numerici: solo `guid` (CLAUDE.md, "id solo guid/slug nelle
 * URL"). Nessun `content`/`seo`: lo snapshot completo è nel dettaglio.
 */
export class PageRevisionSummaryDto {
  @ApiProperty({
    description: 'Identificatore pubblico della Revisione',
    example: 'b1a2c3d4e5f6a7b8',
  })
  guid!: string;

  @ApiProperty({ description: 'Progressivo della Revisione per questa Pagina', example: 3 })
  revisionNumber!: number;

  @ApiProperty({ description: 'Titolo al momento dello snapshot', example: 'Chi siamo' })
  title!: string;

  @ApiProperty({ description: 'Slug al momento dello snapshot', example: 'chi-siamo' })
  slug!: string;

  @ApiProperty({ description: 'Data di creazione della Revisione (= data di pubblicazione)' })
  createdAt!: Date;

  @ApiProperty({
    description:
      'Nome e cognome di chi ha pubblicato questa Revisione (business-rules.md § Revisioni, regola 1)',
    example: 'Maria Rossi',
  })
  authorName!: string;
}

/**
 * Dettaglio completo di una Revisione (`GET /app/pages/:guid/revisions/:revisionGuid`):
 * lo snapshot immutabile integrale (S1), mai modificabile da questo o da
 * alcun altro endpoint (ADR-19).
 */
export class PageRevisionDetailDto extends PageRevisionSummaryDto {
  @ApiProperty({
    description: 'Albero di blocchi al momento della pubblicazione (snapshot immutabile)',
    type: 'object',
    additionalProperties: true,
  })
  content!: Record<string, unknown>;

  @ApiProperty({
    description: 'Metadati SEO/GEO al momento della pubblicazione (snapshot immutabile)',
    type: 'object',
    additionalProperties: true,
  })
  seo!: Record<string, unknown>;

  @ApiProperty({
    description:
      'Nodi dell\'albero blocchi che falliscono migrazione o validazione in lettura (mai un\'eccezione: il nodo resta esposto come persistito, mai migrato a metà). Array vuoto quando l\'albero è integro (SPEC-F02-blocchi.md § 4.3).',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        code: { type: 'string' },
        details: { type: 'object', additionalProperties: true },
      },
    },
  })
  contentIssues!: Array<{ path: string; code: string; details: unknown }>;
}
