import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Creazione di una traduzione da una Pagina sorgente (RFC-F05 § 3, M3). La
 * nuova riga eredita `translationGroupId` dalla sorgente — non è un campo di
 * questo DTO, è deciso dal service in base al `guid` in path.
 */
export class CreateTranslationDto {
  @ApiProperty({
    description: 'Locale della nuova traduzione (deve essere fra i Locale attivi)',
    example: 'en-GB',
  })
  @IsString({ message: 'Il locale deve essere una stringa.' })
  @MaxLength(10, { message: 'Il locale non può superare i 10 caratteri.' })
  locale!: string;

  @ApiPropertyOptional({
    description: 'Titolo della traduzione; se assente, copiato dalla Pagina sorgente',
    example: 'About us',
  })
  @IsOptional()
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title?: string;
}
