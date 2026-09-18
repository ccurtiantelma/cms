import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min, ValidateNested } from 'class-validator';

/**
 * DTO di `app_settings.breakpoints` (`ADR-76-breakpoints-configurabili.md` §
 * "Decisione" punto 1). `default` non ha soglia né `active` (sempre attivo,
 * non disattivabile): resta un oggetto vuoto nel payload solo per simmetria
 * di forma con le altre 6 chiavi (`BreakpointsValue`, `prop-spec.types.ts`).
 */

/** `widescreen`: unica chiave `min-width`. Le altre 5: `max-width`. */
export class BreakpointConfigDto {
  @ApiProperty({ description: 'Se il breakpoint è attivo per il sito' })
  @IsBoolean()
  active!: boolean;

  @ApiProperty({
    required: false,
    description: 'Soglia px (max-width): tutte le chiavi tranne widescreen',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxWidth?: number;

  @ApiProperty({ required: false, description: 'Soglia px (min-width): solo widescreen' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  minWidth?: number;
}

export class BreakpointsDto {
  @ApiProperty({
    description: 'Sempre attivo, nessuna soglia — presente solo per simmetria di forma',
  })
  @IsObject()
  default!: Record<string, never>;

  @ApiProperty({ type: BreakpointConfigDto, description: 'min-width, default 2400px' })
  @ValidateNested()
  @Type(() => BreakpointConfigDto)
  widescreen!: BreakpointConfigDto;

  @ApiProperty({ type: BreakpointConfigDto, description: 'max-width, default 1366px' })
  @ValidateNested()
  @Type(() => BreakpointConfigDto)
  laptop!: BreakpointConfigDto;

  @ApiProperty({ type: BreakpointConfigDto, description: 'max-width, default 1200px' })
  @ValidateNested()
  @Type(() => BreakpointConfigDto)
  tabletExtra!: BreakpointConfigDto;

  @ApiProperty({
    type: BreakpointConfigDto,
    description: 'max-width, default 1024px, attivo di default',
  })
  @ValidateNested()
  @Type(() => BreakpointConfigDto)
  tablet!: BreakpointConfigDto;

  @ApiProperty({ type: BreakpointConfigDto, description: 'max-width, default 880px' })
  @ValidateNested()
  @Type(() => BreakpointConfigDto)
  mobileExtra!: BreakpointConfigDto;

  @ApiProperty({
    type: BreakpointConfigDto,
    description: 'max-width, default 767px, attivo di default',
  })
  @ValidateNested()
  @Type(() => BreakpointConfigDto)
  mobile!: BreakpointConfigDto;
}
