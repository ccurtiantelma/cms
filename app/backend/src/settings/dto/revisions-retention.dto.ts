import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/**
 * DTO della politica di retention delle Revisioni (ADR-61,
 * `business-rules.md` § Revisioni e cronologia regole 6-8). Riusa
 * `app_settings` (chiave `revisions.retentionCount`) come il registro Locale
 * di RFC-F05: nessuna tabella dedicata per una singola scalare.
 */
export class RevisionsRetentionDto {
  @ApiProperty({
    description:
      'Numero di Revisioni conservate per Pagina oltre quelle non potabili. `0` disattiva la potatura: la conservazione illimitata è una configurazione ammessa, non un caso eccezionale (ADR-61 § 3).',
    example: 20,
    minimum: 0,
    maximum: 1000,
  })
  @IsInt()
  @Min(0)
  @Max(1000)
  retentionCount: number;
}
