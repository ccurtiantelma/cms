import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { PageSeoDto } from './page-seo.dto';

/**
 * Creazione di una Pagina in `draft`. Lo slug, se assente, è generato dal
 * titolo (business-rules.md § Slug, regola 3); il `translationGroupId` è
 * sempre generato ex novo (S4) — F01 non espone la creazione di traduzioni.
 */
export class CreatePageDto {
  @ApiProperty({ description: 'Titolo della Pagina', example: 'Chi siamo' })
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Slug proposto (normalizzato server-side); se assente, generato dal titolo',
    example: 'chi-siamo',
  })
  @IsOptional()
  @IsString({ message: 'Lo slug deve essere una stringa.' })
  @MaxLength(255, { message: 'Lo slug non può superare i 255 caratteri.' })
  slug?: string;

  @ApiProperty({ description: 'Locale della Pagina', example: 'it-IT' })
  @IsString({ message: 'Il locale deve essere una stringa.' })
  @MaxLength(10, { message: 'Il locale non può superare i 10 caratteri.' })
  locale!: string;

  @ApiPropertyOptional({
    description: 'Guid della Pagina genitore; assente per una Pagina root',
    example: 'a1b2c3d4e5f6a7b8',
  })
  @IsOptional()
  @IsString({ message: 'parentGuid deve essere una stringa.' })
  @Length(16, 16, { message: 'parentGuid deve essere lungo 16 caratteri.' })
  parentGuid?: string;

  @ApiPropertyOptional({
    description: 'Albero di blocchi iniziale (default: albero vuoto)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'draftContent deve essere un oggetto.' })
  draftContent?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Metadati SEO/GEO iniziali' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PageSeoDto)
  draftSeo?: PageSeoDto;
}
