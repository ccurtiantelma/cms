import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Rappresentazione pubblica (superficie amministrativa) di una Pagina, bozza
 * inclusa. Mai `id` numerico, mai `createdBy`/`updatedBy` (CLAUDE.md: id solo
 * `guid`/`slug` nelle URL; l'ownership è applicata server-side, non esposta).
 */
export class PageDto {
  @ApiProperty({
    description: 'Identificatore pubblico della Pagina, usato nelle URL admin',
    example: 'a1b2c3d4e5f6a7b8',
  })
  guid!: string;

  @ApiProperty({ description: 'Titolo della Pagina', example: 'Chi siamo' })
  title!: string;

  @ApiProperty({
    description: 'Slug, unico per locale + genitore fra le righe attive',
    example: 'chi-siamo',
  })
  slug!: string;

  @ApiProperty({ description: 'Locale della Pagina', example: 'it-IT' })
  locale!: string;

  @ApiPropertyOptional({
    description: 'Guid della Pagina genitore, null per una Pagina root',
    nullable: true,
  })
  parentGuid!: string | null;

  @ApiProperty({
    description: 'Chiave opaca del gruppo di traduzione',
    example: 'f6a7b8a1b2c3d4e5',
  })
  translationGroupId!: string;

  @ApiProperty({ description: 'Stato del ciclo di vita', example: 'draft' })
  status!: string;

  @ApiPropertyOptional({ description: 'Data di pubblicazione, se pubblicata', nullable: true })
  publishedAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Data di pubblicazione programmata, se impostata',
    nullable: true,
  })
  scheduledAt!: Date | null;

  @ApiProperty({
    description: 'Albero di blocchi della bozza corrente',
    type: 'object',
    additionalProperties: true,
  })
  draftContent!: Record<string, unknown>;

  @ApiProperty({
    description: 'Metadati SEO/GEO della bozza corrente',
    type: 'object',
    additionalProperties: true,
  })
  draftSeo!: Record<string, unknown>;

  @ApiProperty({
    description: 'Contatore di lock ottimistico, da inviare in ogni PATCH',
    example: 3,
  })
  version!: number;

  @ApiProperty({ description: 'Data di creazione' })
  createdAt!: Date;

  @ApiProperty({ description: 'Data di ultimo aggiornamento della bozza' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description:
      'Nodi dell\'albero blocchi che falliscono migrazione o validazione in lettura (mai un\'eccezione: il nodo resta esposto come persistito). Assente solo dove non calcolato per costo (liste); array vuoto quando l\'albero è integro.',
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
  contentIssues?: Array<{ path: string; code: string; details: unknown }>;
}
