import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SiteTemplateType } from '../../common/enums';
import { DisplayConditionRuleDto } from './display-condition-rule.dto';

/**
 * Aggiornamento di un Template di tema. Ogni campo è opzionale tranne
 * `version` — lock ottimistico (CLAUDE.md, `WHERE version = :version`): un
 * valore non combaciante produce `0` righe aggiornate, mai un overwrite
 * silenzioso (409).
 */
export class UpdateSiteTemplateDto {
  @ApiProperty({
    description: 'Version letta al caricamento del Template (lock ottimistico)',
    example: 3,
  })
  @IsInt({ message: 'version deve essere un intero.' })
  @Min(1, { message: 'version deve essere almeno 1.' })
  version!: number;

  @ApiPropertyOptional({ description: 'Titolo del Template' })
  @IsOptional()
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title?: string;

  @ApiPropertyOptional({ description: 'Tipo di Template', enum: SiteTemplateType })
  @IsOptional()
  @IsEnum(SiteTemplateType, { message: 'type non valido.' })
  type?: SiteTemplateType;

  @ApiPropertyOptional({
    description: 'Albero di blocchi aggiornato (sostituisce integralmente il precedente)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'contentTree deve essere un oggetto.' })
  contentTree?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Pubblicato' })
  @IsOptional()
  @IsBoolean({ message: 'isPublished deve essere un booleano.' })
  isPublished?: boolean;

  @ApiPropertyOptional({ description: 'Lingua' })
  @IsOptional()
  @IsString({ message: 'language deve essere una stringa.' })
  @Matches(/^[A-Za-z-]{2,10}$/, {
    message: 'language deve essere un codice lingua (2-10 caratteri).',
  })
  language?: string;

  @ApiPropertyOptional({ description: 'Priorità di risoluzione (più alto vince)' })
  @IsOptional()
  @IsInt({ message: 'priority deve essere un intero.' })
  priority?: number;

  @ApiPropertyOptional({
    description: "Condizioni di visualizzazione (sostituisce integralmente l'array precedente)",
    type: [DisplayConditionRuleDto],
  })
  @IsOptional()
  @IsArray({ message: 'displayConditions deve essere un array.' })
  @ArrayMaxSize(50, { message: 'displayConditions non può superare 50 regole.' })
  @ValidateNested({ each: true })
  @Type(() => DisplayConditionRuleDto)
  displayConditions?: DisplayConditionRuleDto[];
}
