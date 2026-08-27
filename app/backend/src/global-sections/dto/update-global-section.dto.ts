import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { GlobalSectionLayoutSlot } from '../../common/enums';

/**
 * Aggiornamento di una Sezione Globale. Ogni campo è opzionale tranne
 * `version` — lock ottimistico (CLAUDE.md, `WHERE version = :version`): un
 * valore non combaciante produce `0` righe aggiornate, mai un overwrite
 * silenzioso (409).
 */
export class UpdateGlobalSectionDto {
  @ApiProperty({
    description: 'Version letta al caricamento della Sezione (lock ottimistico)',
    example: 3,
  })
  @IsInt({ message: 'version deve essere un intero.' })
  @Min(1, { message: 'version deve essere almeno 1.' })
  version!: number;

  @ApiPropertyOptional({ description: 'Titolo della Sezione Globale' })
  @IsOptional()
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Slug admin (normalizzato server-side); non rigenerato automaticamente dal titolo',
  })
  @IsOptional()
  @IsString({ message: 'Lo slug deve essere una stringa.' })
  @MaxLength(255, { message: 'Lo slug non può superare i 255 caratteri.' })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Slot di layout pubblico',
    enum: GlobalSectionLayoutSlot,
    example: GlobalSectionLayoutSlot.Footer,
  })
  @IsOptional()
  @IsEnum(GlobalSectionLayoutSlot, { message: 'layoutSlot non valido.' })
  layoutSlot?: GlobalSectionLayoutSlot;

  @ApiPropertyOptional({
    description: 'Albero di blocchi aggiornato (sostituisce integralmente il precedente)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'content deve essere un oggetto.' })
  content?: Record<string, unknown>;
}
