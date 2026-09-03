import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { THEME_FONT_FAMILY_IDS } from './theme-config.dto';

/**
 * DTO dei Global Design Tokens (brand token di sito: palette, font base,
 * spaziatura base). Risorsa **separata** dal Global Theme Customizer
 * (ADR-4, `theme-config.dto.ts`): quel contratto governa esclusivamente il
 * tema Mantine della chrome amministrativa, questo governa i token di brand
 * a livello di sito, pensati per alimentare in un passo successivo lo
 * styling a livello di blocco (fuori scope qui). Nessun campo, tipo o
 * classe è condiviso con `ThemeConfigDto` salvo il riuso intenzionale della
 * whitelist font (`THEME_FONT_FAMILY_IDS`) per restare DRY con lo stack
 * font già mappato lato frontend e per lo stesso motivo anti-injection: un
 * font libero da stringa non deve mai raggiungere una variabile CSS.
 */

/** Versioni note del contratto GlobalTokens accettate in scrittura. */
export const GLOBAL_TOKENS_VERSIONS = [1] as const;

/** Unità di lunghezza ammesse per i campi dimensionali dei token (niente `%`: non ha senso per una base font/spacing). */
export const GLOBAL_TOKENS_LENGTH_UNITS = ['px', 'em', 'rem'] as const;

export type GlobalTokensLengthUnit = (typeof GLOBAL_TOKENS_LENGTH_UNITS)[number];

/** Formato hex obbligatorio `#rrggbb` di ogni token colore — stesso pattern anti-injection di ADR-4. */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX_MESSAGE = 'Ogni token colore deve essere in formato hex #rrggbb.';

/** Range numerico semplice condiviso da `baseSize` e `baseUnit` (nessuna dipendenza cross-field dall'unità: a differenza di ADR-4 v7, qui il range statico basta). */
const GLOBAL_TOKENS_DIMENSION_MIN = 1;
const GLOBAL_TOKENS_DIMENSION_MAX = 200;

/**
 * Valore dimensionale con unità esplicita (`{ value, unit }`), mai una
 * stringa CSS libera tipo `"16px"`: mantiene il valore numerico validabile
 * e l'unità vincolata a una whitelist.
 */
export class GlobalTokensDimensionDto {
  @ApiProperty({ description: 'Valore numerico della dimensione', example: 16 })
  @IsNumber({}, { message: 'value deve essere un numero.' })
  @Min(GLOBAL_TOKENS_DIMENSION_MIN, { message: `value minimo: ${GLOBAL_TOKENS_DIMENSION_MIN}.` })
  @Max(GLOBAL_TOKENS_DIMENSION_MAX, { message: `value massimo: ${GLOBAL_TOKENS_DIMENSION_MAX}.` })
  value!: number;

  @ApiProperty({ description: 'Unità CSS', enum: GLOBAL_TOKENS_LENGTH_UNITS, example: 'px' })
  @IsIn(GLOBAL_TOKENS_LENGTH_UNITS, { message: 'Unità non ammessa.' })
  unit!: GlobalTokensLengthUnit;
}

/** Quattro colori di brand a livello di sito: un hex ciascuno. */
export class GlobalTokensPaletteDto {
  @ApiProperty({ description: 'Colore primario di brand', example: '#93003c' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  primary!: string;

  @ApiProperty({ description: 'Colore secondario di brand', example: '#00a0d2' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  secondary!: string;

  @ApiProperty({ description: 'Colore testo di brand', example: '#333333' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  text!: string;

  @ApiProperty({ description: 'Colore accento di brand', example: '#f7a600' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  accent!: string;
}

/** Font base di sito (ID whitelisted, riusa `THEME_FONT_FAMILY_IDS` di ADR-4) e dimensione base testo. */
export class GlobalTokensTypographyDto {
  @ApiProperty({
    description: 'Font base di sito (ID whitelisted, stessa whitelist di ADR-4)',
    enum: THEME_FONT_FAMILY_IDS,
    example: 'inter',
  })
  @IsIn(THEME_FONT_FAMILY_IDS, { message: 'Font base non ammesso.' })
  mainFont!: string;

  @ApiProperty({ description: 'Dimensione base del testo', type: GlobalTokensDimensionDto })
  @IsDefined({ message: 'baseSize è obbligatorio.' })
  @ValidateNested()
  @Type(() => GlobalTokensDimensionDto)
  baseSize!: GlobalTokensDimensionDto;
}

/** Unità di spaziatura base di sito. */
export class GlobalTokensSpacingDto {
  @ApiProperty({ description: 'Unità di spaziatura base', type: GlobalTokensDimensionDto })
  @IsDefined({ message: 'baseUnit è obbligatorio.' })
  @ValidateNested()
  @Type(() => GlobalTokensDimensionDto)
  baseUnit!: GlobalTokensDimensionDto;
}

/**
 * Configurazione completa dei Global Design Tokens (riga `key='global_tokens'`
 * di `app_settings`). Separata dal contratto `ThemeConfigDto` di ADR-4.
 */
export class GlobalTokensDto {
  @ApiProperty({
    description: 'Versione del contratto GlobalTokens',
    example: 1,
    enum: GLOBAL_TOKENS_VERSIONS,
  })
  @IsInt({ message: 'version deve essere un intero.' })
  @IsIn(GLOBAL_TOKENS_VERSIONS, { message: 'Versione dei Global Design Tokens non supportata.' })
  version!: number;

  @ApiProperty({ description: 'Palette di brand a livello di sito', type: GlobalTokensPaletteDto })
  @IsDefined({ message: 'Il blocco palette è obbligatorio.' })
  @ValidateNested()
  @Type(() => GlobalTokensPaletteDto)
  palette!: GlobalTokensPaletteDto;

  @ApiProperty({ description: 'Tipografia base di sito', type: GlobalTokensTypographyDto })
  @IsDefined({ message: 'Il blocco typography è obbligatorio.' })
  @ValidateNested()
  @Type(() => GlobalTokensTypographyDto)
  typography!: GlobalTokensTypographyDto;

  @ApiProperty({ description: 'Spaziatura base di sito', type: GlobalTokensSpacingDto })
  @IsDefined({ message: 'Il blocco spacing è obbligatorio.' })
  @ValidateNested()
  @Type(() => GlobalTokensSpacingDto)
  spacing!: GlobalTokensSpacingDto;
}
