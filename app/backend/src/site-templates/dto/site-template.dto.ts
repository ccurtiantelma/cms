import { ApiProperty } from '@nestjs/swagger';
import { SiteTemplateType } from '../../common/enums';
import { DisplayConditionRuleDto } from './display-condition-rule.dto';

/** Rappresentazione admin di un Template di tema (RFC-40 Opzione B). */
export class SiteTemplateResponseDto {
  @ApiProperty({ description: 'Guid del Template', example: 'a1b2c3d4e5f6a7b8' })
  guid!: string;

  @ApiProperty({ description: 'Titolo del Template' })
  title!: string;

  @ApiProperty({ description: 'Tipo di Template', enum: SiteTemplateType })
  type!: SiteTemplateType;

  @ApiProperty({
    description: 'Albero di blocchi corrente',
    type: 'object',
    additionalProperties: true,
  })
  contentTree!: Record<string, unknown>;

  @ApiProperty({ description: 'Pubblicato' })
  isPublished!: boolean;

  @ApiProperty({ description: 'Lingua' })
  language!: string;

  @ApiProperty({ description: 'Priorità di risoluzione (più alto vince)' })
  priority!: number;

  @ApiProperty({ description: 'Condizioni di visualizzazione', type: [DisplayConditionRuleDto] })
  displayConditions!: DisplayConditionRuleDto[];

  @ApiProperty({ description: 'Version corrente (lock ottimistico)', example: 1 })
  version!: number;

  @ApiProperty({ description: 'Data creazione' })
  createdAt!: Date;

  @ApiProperty({ description: 'Data ultimo aggiornamento' })
  updatedAt!: Date;
}
