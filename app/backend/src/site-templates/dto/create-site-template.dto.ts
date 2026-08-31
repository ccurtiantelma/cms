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
  ValidateNested,
} from 'class-validator';
import { SiteTemplateType } from '../../common/enums';
import { DisplayConditionRuleDto } from './display-condition-rule.dto';

/**
 * Creazione di un Template di tema (RFC-40 Opzione B). `contentTree` passa
 * per la stessa pipeline di scrittura di Pagine/Sezioni Globali (migrazione →
 * validazione di registro → sanitizzazione, ADR-21): un envelope assente o
 * malformato è respinto per intero.
 */
export class CreateSiteTemplateDto {
  @ApiProperty({ description: 'Titolo del Template', example: 'Ricerca — layout risultati' })
  @IsString({ message: 'Il titolo deve essere una stringa.' })
  @MaxLength(255, { message: 'Il titolo non può superare i 255 caratteri.' })
  title!: string;

  @ApiProperty({ description: 'Tipo di Template', enum: SiteTemplateType })
  @IsEnum(SiteTemplateType, { message: 'type non valido.' })
  type!: SiteTemplateType;

  @ApiPropertyOptional({
    description: 'Albero di blocchi iniziale (default: albero vuoto)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'contentTree deve essere un oggetto.' })
  contentTree?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Pubblicato (default false)', example: false })
  @IsOptional()
  @IsBoolean({ message: 'isPublished deve essere un booleano.' })
  isPublished?: boolean;

  @ApiPropertyOptional({ description: 'Lingua (default "IT")', example: 'IT' })
  @IsOptional()
  @IsString({ message: 'language deve essere una stringa.' })
  @Matches(/^[A-Za-z-]{2,10}$/, {
    message: 'language deve essere un codice lingua (2-10 caratteri).',
  })
  language?: string;

  @ApiPropertyOptional({
    description: 'Priorità di risoluzione (default 0, più alto vince)',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'priority deve essere un intero.' })
  priority?: number;

  @ApiPropertyOptional({
    description: 'Condizioni di visualizzazione (default nessuna)',
    type: [DisplayConditionRuleDto],
  })
  @IsOptional()
  @IsArray({ message: 'displayConditions deve essere un array.' })
  @ArrayMaxSize(50, { message: 'displayConditions non può superare 50 regole.' })
  @ValidateNested({ each: true })
  @Type(() => DisplayConditionRuleDto)
  displayConditions?: DisplayConditionRuleDto[];
}
