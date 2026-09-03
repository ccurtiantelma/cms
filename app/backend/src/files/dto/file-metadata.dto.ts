import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Metadata pubblica di un file caricato (mai `storageKey`/`checksumSha256`,
 * dettagli interni del driver di storage — vedi ADR-8).
 */
export class FileMetadataDto {
  @ApiProperty({
    description: 'Identificatore pubblico del file, usato nelle URL',
    example: 'a1b2c3d4e5f6a7b8',
  })
  guid!: string;

  @ApiProperty({
    description: 'Nome file originale (solo display)',
    example: 'fattura-2026-001.pdf',
  })
  originalName!: string;

  @ApiProperty({ description: 'MIME type dichiarato dal client', example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ description: 'Dimensione del file in byte', example: 348213 })
  sizeBytes!: number;

  @ApiPropertyOptional({
    description: 'Nome tabella/dominio a cui il file è associato, se presente',
    example: 'invoice',
    nullable: true,
  })
  entity?: string | null;

  @ApiPropertyOptional({
    description: "Id/guid dell'entità di dominio associata, se presente",
    example: 'a1b2c3d4e5f6a7b8',
    nullable: true,
  })
  entityId?: string | null;

  @ApiPropertyOptional({
    description:
      'Larghezza in pixel, letta dagli header raster all\'upload. `null` per i non-raster e per le righe caricate prima che questo campo esistesse (RFC-F09 § 3, colonna non ancora in schema — sempre `null` finché N2 non è firmata).',
    example: null,
    nullable: true,
  })
  width!: number | null;

  @ApiPropertyOptional({
    description:
      'Altezza in pixel, stessa provenienza e stesse condizioni di `width` (RFC-F09 § 3).',
    example: null,
    nullable: true,
  })
  height!: number | null;

  @ApiPropertyOptional({
    description:
      "URL pubblico derivato server-side (`api/v1/public/media/:guid`), valorizzato solo se `entity` è `page-media` (ADR-27 § 2/§ 6). `null` altrimenti — non implica che il blob sia effettivamente servibile: la verifica del formato raster reale avviene in lettura su quella rotta (ADR-27 § 3, § 4).",
    example: 'api/v1/public/media/a1b2c3d4e5f6a7b8',
    nullable: true,
  })
  url!: string | null;

  @ApiProperty({
    description:
      'Percentuale orizzontale (0-100) del soggetto, usata come centro del ritaglio quando una trasformazione non fornisce un crop esplicito. Default: centro immagine.',
    example: 50,
    minimum: 0,
    maximum: 100,
  })
  focalX!: number;

  @ApiProperty({
    description: 'Percentuale verticale (0-100) del soggetto, stessa semantica di focalX.',
    example: 50,
    minimum: 0,
    maximum: 100,
  })
  focalY!: number;

  @ApiProperty({ description: 'Data di caricamento', example: '2026-07-23T10:00:00.000Z' })
  createdAt!: Date;
}
