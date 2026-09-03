import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * Aggiornamento del focal point editoriale di un asset immagine (ADR-49 § M4):
 * percentuale 0-100 del soggetto, usata da `MediaProcessor` come centro del
 * ritaglio quando una trasformazione non fornisce un crop esplicito.
 */
export class UpdateFocalPointDto {
  @ApiProperty({
    description:
      'Percentuale orizzontale (0-100) del soggetto, usata come centro del ritaglio quando non è fornito un crop esplicito. Default: centro immagine.',
    minimum: 0,
    maximum: 100,
    example: 50,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  focalX!: number;

  @ApiProperty({
    description: 'Percentuale verticale (0-100) del soggetto, stessa semantica di focalX.',
    minimum: 0,
    maximum: 100,
    example: 50,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  focalY!: number;
}
