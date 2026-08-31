import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DisplayConditionTarget, DisplayConditionType } from '../../common/enums';

/**
 * Regola di visualizzazione di un Template di tema, valutata da
 * `TemplateResolverService.resolveForRoute` — che riceve solo `path` (non un
 * guid di Pagina, nessuna dipendenza da `PagesModule`): `value` è quindi
 * sempre un path pubblico, mai un guid. `specific_page` richiede
 * corrispondenza esatta col path della richiesta, `path_pattern` supporta
 * `*` come wildcard. `value` è obbligatorio per entrambi, assente/ignorato
 * quando `target` è `entire_site`.
 */
export class DisplayConditionRuleDto {
  @ApiProperty({ description: 'Verso della regola', enum: DisplayConditionType })
  @IsEnum(DisplayConditionType, { message: 'type non valido.' })
  type!: DisplayConditionType;

  @ApiProperty({ description: 'Bersaglio della regola', enum: DisplayConditionTarget })
  @IsEnum(DisplayConditionTarget, { message: 'target non valido.' })
  target!: DisplayConditionTarget;

  @ApiPropertyOptional({
    description:
      'Path esatto (target specific_page) o pattern con wildcard "*" (target path_pattern); assente per entire_site.',
    example: '/blog/*',
  })
  @ValidateIf((rule: DisplayConditionRuleDto) => rule.target !== DisplayConditionTarget.EntireSite)
  @IsString({ message: 'value deve essere una stringa.' })
  @MaxLength(2048, { message: 'value non può superare i 2048 caratteri.' })
  value?: string;
}
