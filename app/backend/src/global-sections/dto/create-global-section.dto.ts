import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { GlobalSectionLayoutSlot } from '../../common/enums';

/**
 * Creazione di una Sezione Globale (F06, ADR-40). Lo slug, se assente, è
 * generato dal titolo (stessa convenzione delle Pagine, `slug.util.ts`).
 * `layoutSlot` di default è `none`: una Sezione nasce non innestata.
 */
export class CreateGlobalSectionDto {
  @ApiProperty({ description: 'Titolo della Sezione Globale', example: 'Header principale' })
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Slug admin proposto (normalizzato server-side); se assente, generato dal titolo',
    example: 'header-principale',
  })
  @IsOptional()
  @IsString({ message: 'Lo slug deve essere una stringa.' })
  @MaxLength(255, { message: 'Lo slug non può superare i 255 caratteri.' })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Slot di layout pubblico (default "none")',
    enum: GlobalSectionLayoutSlot,
    example: GlobalSectionLayoutSlot.Header,
  })
  @IsOptional()
  @IsEnum(GlobalSectionLayoutSlot, { message: 'layoutSlot non valido.' })
  layoutSlot?: GlobalSectionLayoutSlot;

  @ApiPropertyOptional({
    description: 'Rende l\'header sticky sul viewport quando lo slot è `header`.',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isSticky deve essere un booleano.' })
  isSticky?: boolean;

  @ApiPropertyOptional({
    description: 'Albero di blocchi iniziale (default: albero vuoto)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'content deve essere un oggetto.' })
  content?: Record<string, unknown>;
}
