import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Insieme finito e nominato di preset (ADR-49 § Decisione, M6): mai un crop
 * continuo arbitrario a runtime. Rapporti proposti come punto di partenza,
 * rivedibili in sede F07/F08 senza richiedere una nuova ADR (ADR-49 §
 * Conseguenze), a patto di restare dentro questo insieme.
 */
export enum MediaTransformPreset {
  Thumbnail = 'thumbnail',
  Card = 'card',
  Hero = 'hero',
  Og = 'og',
}

/**
 * Richiesta di trasformazione di un asset immagine (ADR-49): un crop
 * esplicito (`cropX/Y/W/H`) oppure un `preset`, mai entrambi assenti — la
 * validazione di questo vincolo vive in `MediaProcessor`, non qui (dipende
 * dalle dimensioni reali dell'immagine sorgente, non note al DTO).
 */
export class MediaTransformDto {
  @ApiPropertyOptional({ description: "Coordinata X (px) dell'angolo del ritaglio", minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cropX?: number;

  @ApiPropertyOptional({ description: "Coordinata Y (px) dell'angolo del ritaglio", minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cropY?: number;

  @ApiPropertyOptional({ description: 'Larghezza (px) del ritaglio', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cropW?: number;

  @ApiPropertyOptional({ description: 'Altezza (px) del ritaglio', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cropH?: number;

  @ApiPropertyOptional({
    description:
      'Percentuale orizzontale (0-100) del soggetto, usata come centro del ritaglio quando non è fornito un crop esplicito. Default: centro immagine.',
    minimum: 0,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  focalX?: number = 50;

  @ApiPropertyOptional({
    description: 'Percentuale verticale (0-100) del soggetto, stessa semantica di focalX.',
    minimum: 0,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  focalY?: number = 50;

  @ApiPropertyOptional({
    description:
      'Preset nominato di destinazione (ADR-49 § M6). Ignorato se è fornito un crop esplicito.',
    enum: MediaTransformPreset,
  })
  @IsOptional()
  @IsEnum(MediaTransformPreset)
  preset?: MediaTransformPreset;
}
