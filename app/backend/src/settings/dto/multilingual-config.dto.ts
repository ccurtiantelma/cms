import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';

/**
 * DTO del registro Locale attivi (RFC-F05 § 1, M1). Riusa `app_settings`
 * (chiave `multilingual.locales`) invece di una tabella dedicata: nessuna
 * regola di dominio referenzia un Locale con una FK. `active` accetta codici
 * liberi (BCP-47 come oggi, es. `it-IT`) — nessuna whitelist ISO statica,
 * coerente con `pages.locale` che resta una stringa libera.
 */
export class MultilingualConfigDto {
  @ApiProperty({
    description: 'Codici Locale attivi (BCP-47 libero, es. "it-IT")',
    type: [String],
    example: ['it-IT', 'en-GB'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  active: string[];

  /** Deve comparire in `active` — verificato nel service, non qui (cross-field). */
  @ApiProperty({
    description: 'Locale di default (senza prefisso nelle URL pubbliche, ADR-24 § 5)',
    example: 'it-IT',
  })
  @IsString()
  @MinLength(1)
  default: string;
}
