import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

/**
 * Singola variazione su un nodo modificato (`field`: `'type'`, una chiave
 * `props.<nome>`, o `'children'` per un riordinamento — business-rules.md
 * § Revisioni, regola 4).
 */
export class PropertyDiffDto {
  @ApiProperty({ description: 'Campo variato', example: 'props.styleTextColor' })
  field!: string;

  @ApiProperty({
    description: 'Valore nella prima Revisione',
    type: 'object',
    additionalProperties: true,
  })
  before!: unknown;

  @ApiProperty({
    description: 'Valore nella seconda Revisione',
    type: 'object',
    additionalProperties: true,
  })
  after!: unknown;
}

/**
 * Esito del confronto strutturale fra due Revisioni (`GET
 * /app/pages/:guid/revisions/diff`, F07-01, business-rules.md § Revisioni,
 * regola 4). `added`/`removed`/`modified`/`unchanged` elencano `id` di nodo
 * a qualunque profondità dell'albero, non solo le radici.
 */
@ApiExtraModels(PropertyDiffDto)
export class PageRevisionDiffResponseDto {
  @ApiProperty({ description: 'Id dei nodi presenti solo nella seconda Revisione', type: [String] })
  added!: string[];

  @ApiProperty({ description: 'Id dei nodi presenti solo nella prima Revisione', type: [String] })
  removed!: string[];

  @ApiProperty({
    description: 'Variazioni per nodo modificato, chiave = id del nodo',
    type: 'object',
    additionalProperties: { type: 'array', items: { $ref: getSchemaPath(PropertyDiffDto) } },
  })
  modified!: Record<string, PropertyDiffDto[]>;

  @ApiProperty({ description: 'Id dei nodi identici in entrambe le Revisioni', type: [String] })
  unchanged!: string[];
}
