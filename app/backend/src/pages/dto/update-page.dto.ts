import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageSeoDto } from './page-seo.dto';

/**
 * Aggiornamento della bozza di una Pagina. Ogni campo è opzionale e tocca
 * solo la bozza (`draftXxx`): non modifica mai `status`/pubblicazione (T5).
 * `version` è obbligatoria — lock ottimistico (CLAUDE.md, `WHERE version =
 * :version`): un valore non combaciante produce `0` righe aggiornate, mai un
 * overwrite silenzioso.
 *
 * `parentGuid` è a tre stati: assente = non toccare il genitore attuale,
 * `null` = spostare la Pagina in radice, stringa = nuovo genitore.
 */
export class UpdatePageDto {
  @ApiProperty({
    description: 'Version letta al caricamento della bozza (lock ottimistico)',
    example: 3,
  })
  @IsInt({ message: 'version deve essere un intero.' })
  @Min(1, { message: 'version deve essere almeno 1.' })
  version!: number;

  @ApiPropertyOptional({ description: 'Titolo della Pagina' })
  @IsOptional()
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Slug (normalizzato server-side); non rigenerato automaticamente dal titolo',
  })
  @IsOptional()
  @IsString({ message: 'Lo slug deve essere una stringa.' })
  @MaxLength(255, { message: 'Lo slug non può superare i 255 caratteri.' })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Guid della nuova Pagina genitore; null per spostare in radice',
    nullable: true,
    example: 'a1b2c3d4e5f6a7b8',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'parentGuid deve essere una stringa o null.' })
  @Length(16, 16, { message: 'parentGuid deve essere lungo 16 caratteri.' })
  parentGuid?: string | null;

  @ApiPropertyOptional({
    description: 'Albero di blocchi aggiornato (sostituisce integralmente la bozza)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'draftContent deve essere un oggetto.' })
  draftContent?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Metadati SEO/GEO aggiornati (sostituiscono integralmente i precedenti)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PageSeoDto)
  draftSeo?: PageSeoDto;
}
