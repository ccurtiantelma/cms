import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  Matches,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';

/**
 * DTO del Global Theme Customizer (ADR-4, contratto v7). Set chiuso di campi,
 * speculare a `ThemeConfig` in `app/frontend/src/theme.ts`: ogni colore è
 * validato con regex hex strict, i font sono ID di una whitelist (gli stack
 * CSS vivono solo lato frontend), le misure sono numeri con range chiusi e le
 * ombre sono spec strutturate — nessuna stringa libera raggiunge mai una
 * variabile CSS o il theme object lato frontend (vettore di CSS injection).
 * Il ValidationPipe globale (`forbidNonWhitelisted: true`) rifiuta ogni campo
 * fuori dal set. Dalla v7, ogni campo dimensionale (dimensioni testo e
 * titoli, spaziatura, radius token, ombre, larghezza navbar) porta anche
 * un'unità CSS (`px`/`em`/`rem`/`%`, `%` escluso dove il CSS non lo ammette):
 * il range `@Min`/`@Max` statico su quei campi non basta più (dipende
 * dall'unità scelta in un campo gemello), quindi la validazione del range
 * passa da un `@Validate` cross-field (`ThemeDimensionRangesConstraint`),
 * mentre `@IsNumber` resta sui singoli campi come controllo di tipo.
 */

/** Le 14 palette native Mantine v7 ammesse come colore primario (ADR-4 §1). */
export const THEME_PRIMARY_COLORS = [
  'blue',
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'dark',
] as const;

export type ThemePrimaryColor = (typeof THEME_PRIMARY_COLORS)[number];

/** Selezioni ammesse per il primario: le 14 palette native + palette custom. */
export const THEME_PRIMARY_SELECTIONS = [...THEME_PRIMARY_COLORS, 'custom'] as const;

export type ThemePrimarySelection = (typeof THEME_PRIMARY_SELECTIONS)[number];

/** I 5 size token nativi Mantine, comuni a tutte le scale. */
export const THEME_SIZE_VALUES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

export type ThemeSizeValue = (typeof THEME_SIZE_VALUES)[number];

/** Valori `radius` nativi Mantine ammessi come default (ADR-4 §1). */
export const THEME_RADIUS_VALUES = THEME_SIZE_VALUES;

export type ThemeRadiusValue = ThemeSizeValue;

/** Versioni note del contratto ThemeConfig accettate in scrittura (v1–v6 → migrate in lettura). */
export const THEME_CONFIG_VERSIONS = [7] as const;

/**
 * Unità CSS selezionabili per i campi dimensionali (v7). `%` è escluso dove
 * il CSS non lo ammette — vedi `THEME_LENGTH_UNITS`, usato dalle ombre:
 * `box-shadow` accetta solo `<length>`, mai percentuali.
 */
export const THEME_UNITS = ['px', 'em', 'rem', '%'] as const;

export type ThemeUnit = (typeof THEME_UNITS)[number];

/** Unità di lunghezza pure (senza `%`), per i campi dove il CSS vieta le percentuali. */
export const THEME_LENGTH_UNITS = ['px', 'em', 'rem'] as const;

export type ThemeLengthUnit = (typeof THEME_LENGTH_UNITS)[number];

/** Le 9 voci semantiche del tema (v6): un hex base ciascuna, sfumature generate lato frontend. */
export const THEME_SEMANTIC_COLOR_NAMES = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'alert',
  'error',
  'danger',
  'info',
] as const;

export type ThemeSemanticColorName = (typeof THEME_SEMANTIC_COLOR_NAMES)[number];

/** Stile del bordo destro della sidebar applicativa: bordo sottile o ombra proiettata. */
export const THEME_NAVBAR_EDGE_STYLES = ['border', 'shadow'] as const;

/** Sentinella "non impostato" dei knob componente (il default nativo Mantine resta attivo). */
export const THEME_UNSET = 'unset' as const;

/** Size opzionale di un componente (`unset` = default nativo). */
export const THEME_SIZE_OPTIONS = [THEME_UNSET, ...THEME_SIZE_VALUES] as const;

/** Ombra opzionale di un componente (`none` la rimuove, `unset` = default nativo). */
export const THEME_SHADOW_OPTIONS = [THEME_UNSET, 'none', ...THEME_SIZE_VALUES] as const;

/** ID whitelisted dei font stack di testo/titoli (gli stack CSS vivono nel frontend). */
export const THEME_FONT_FAMILY_IDS = [
  'inter',
  'system',
  'humanist',
  'geometric',
  'rounded',
  'serif',
  'slab',
] as const;

/** ID whitelisted dei font stack monospace. */
export const THEME_MONO_FONT_FAMILY_IDS = ['system-mono', 'courier'] as const;

/** Pesi font ammessi per i titoli. */
export const THEME_FONT_WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'] as const;

/** Opzioni `focusRing` native Mantine. */
export const THEME_FOCUS_RING_VALUES = ['auto', 'always', 'never'] as const;

/** Opzioni `cursorType` native Mantine. */
export const THEME_CURSOR_VALUES = ['default', 'pointer'] as const;

/** Variant ammesse come default di Button. */
export const THEME_BUTTON_VARIANTS = [
  THEME_UNSET,
  'filled',
  'light',
  'outline',
  'subtle',
  'default',
  'gradient',
] as const;

/** Variant ammesse come default di ActionIcon. */
export const THEME_ACTION_ICON_VARIANTS = [
  THEME_UNSET,
  'filled',
  'light',
  'outline',
  'subtle',
  'default',
  'transparent',
] as const;

/** Variant ammesse come default di Badge. */
export const THEME_BADGE_VARIANTS = [
  THEME_UNSET,
  'filled',
  'light',
  'outline',
  'dot',
  'default',
] as const;

/** Variant ammesse come default dei campi input. */
export const THEME_INPUT_VARIANTS = [THEME_UNSET, 'default', 'filled', 'unstyled'] as const;

/** Tipi di Loader ammessi. */
export const THEME_LOADER_TYPES = [THEME_UNSET, 'oval', 'bars', 'dots'] as const;

/** Formato hex obbligatorio `#rrggbb` di ogni token colore (ADR-4 §3). */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX_MESSAGE = 'Ogni token colore deve essere in formato hex #rrggbb.';

/** Set chiuso degli 11 token semantici di un singolo scheme (light o dark). */
export class ThemeSchemeTokensDto {
  @ApiProperty({ description: 'Sfondo applicativo', example: '#f8f9fa' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  pageBg!: string;

  @ApiProperty({ description: 'Sfondo card / superfici contenuto', example: '#ffffff' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  cardBg!: string;

  @ApiProperty({ description: 'Bordo card', example: '#ffffff' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  cardBorder!: string;

  @ApiProperty({ description: 'Testo principale', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  textPrimary!: string;

  @ApiProperty({ description: 'Testo secondario/dimmed', example: '#868e96' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  textSecondary!: string;

  @ApiProperty({ description: 'Colore del titolo H1', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  headingH1!: string;

  @ApiProperty({ description: 'Colore del titolo H2', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  headingH2!: string;

  @ApiProperty({ description: 'Colore del titolo H3', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  headingH3!: string;

  @ApiProperty({ description: 'Colore del titolo H4', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  headingH4!: string;

  @ApiProperty({ description: 'Colore del titolo H5', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  headingH5!: string;

  @ApiProperty({ description: 'Colore del titolo H6', example: '#000000' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  headingH6!: string;

  @ApiProperty({ description: 'Sfondo sidebar', example: '#242424' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  navbarBg!: string;

  @ApiProperty({ description: 'Testo voci navbar', example: '#b8b8b8' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  navbarText!: string;

  @ApiProperty({ description: 'Sfondo hover voce navbar', example: '#2e2e2e' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  navbarHoverBg!: string;

  @ApiProperty({ description: 'Sfondo voce navbar attiva', example: '#1971c2' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  navbarActiveBg!: string;

  @ApiProperty({ description: 'Testo voce navbar attiva', example: '#ffffff' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  navbarActiveText!: string;

  @ApiProperty({ description: 'Bordi interni sidebar', example: '#3b3b3b' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  navbarBorder!: string;
}

/** I 9 colori semantici del tema: un hex base ciascuno (sfumature generate lato frontend). */
export class ThemeColorsDto {
  @ApiProperty({ description: 'Colore primario', example: '#228be6' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  primary!: string;

  @ApiProperty({ description: 'Colore secondario', example: '#868e96' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  secondary!: string;

  @ApiProperty({ description: 'Colore accento', example: '#be4bdb' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  accent!: string;

  @ApiProperty({ description: 'Colore successo', example: '#40c057' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  success!: string;

  @ApiProperty({ description: 'Colore avviso', example: '#fab005' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  warning!: string;

  @ApiProperty({ description: 'Colore allerta', example: '#f76707' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  alert!: string;

  @ApiProperty({ description: 'Colore errore', example: '#fa5252' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  error!: string;

  @ApiProperty({ description: 'Colore pericolo', example: '#c92a2a' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  danger!: string;

  @ApiProperty({ description: 'Colore informativo', example: '#15aabf' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  info!: string;
}

/** Indici shade (0–9) della palette primaria per scheme. */
export class ThemePrimaryShadeDto {
  @ApiProperty({ description: 'Shade filled nello scheme chiaro (0–9)', example: 8 })
  @IsInt({ message: 'La shade light deve essere un intero.' })
  @Min(0, { message: 'La shade light minima è 0.' })
  @Max(9, { message: 'La shade light massima è 9.' })
  light!: number;

  @ApiProperty({ description: 'Shade filled nello scheme scuro (0–9)', example: 5 })
  @IsInt({ message: 'La shade dark deve essere un intero.' })
  @Min(0, { message: 'La shade dark minima è 0.' })
  @Max(9, { message: 'La shade dark massima è 9.' })
  dark!: number;
}

/** Gradiente di default delle variant `gradient`. */
export class ThemeGradientDto {
  @ApiProperty({ description: 'Colore di partenza', example: '#228be6' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  from!: string;

  @ApiProperty({ description: 'Colore di arrivo', example: '#15aabf' })
  @Matches(HEX_COLOR_REGEX, { message: HEX_MESSAGE })
  to!: string;

  @ApiProperty({ description: 'Angolo in gradi (0–360)', example: 45 })
  @IsNumber({}, { message: "L'angolo del gradiente deve essere un numero." })
  @Min(0, { message: "L'angolo minimo del gradiente è 0." })
  @Max(360, { message: "L'angolo massimo del gradiente è 360." })
  deg!: number;
}

/**
 * Scala di dimensioni testo `xs`–`xl`, nell'unità di `ThemeTypographyDto.fontSizeUnit`
 * (v7). Range dipendente dall'unità: validato da `ThemeDimensionRangesConstraint`,
 * non da `@Min`/`@Max` statici.
 */
export class ThemeFontSizesDto {
  @ApiProperty({ description: 'Dimensione testo xs', example: 12 })
  @IsNumber({}, { message: 'Ogni dimensione testo deve essere un numero.' })
  xs!: number;

  @ApiProperty({ description: 'Dimensione testo sm', example: 14 })
  @IsNumber({}, { message: 'Ogni dimensione testo deve essere un numero.' })
  sm!: number;

  @ApiProperty({ description: 'Dimensione testo md', example: 16 })
  @IsNumber({}, { message: 'Ogni dimensione testo deve essere un numero.' })
  md!: number;

  @ApiProperty({ description: 'Dimensione testo lg', example: 18 })
  @IsNumber({}, { message: 'Ogni dimensione testo deve essere un numero.' })
  lg!: number;

  @ApiProperty({ description: 'Dimensione testo xl', example: 20 })
  @IsNumber({}, { message: 'Ogni dimensione testo deve essere un numero.' })
  xl!: number;
}

/** Scala di interlinee `xs`–`xl` (moltiplicatori 0.8–3). */
export class ThemeLineHeightsDto {
  @ApiProperty({ description: 'Interlinea xs', example: 1.4 })
  @IsNumber({}, { message: 'Ogni interlinea deve essere un numero.' })
  @Min(0.8, { message: 'Interlinea minima: 0.8.' })
  @Max(3, { message: 'Interlinea massima: 3.' })
  xs!: number;

  @ApiProperty({ description: 'Interlinea sm', example: 1.45 })
  @IsNumber({}, { message: 'Ogni interlinea deve essere un numero.' })
  @Min(0.8, { message: 'Interlinea minima: 0.8.' })
  @Max(3, { message: 'Interlinea massima: 3.' })
  sm!: number;

  @ApiProperty({ description: 'Interlinea md', example: 1.55 })
  @IsNumber({}, { message: 'Ogni interlinea deve essere un numero.' })
  @Min(0.8, { message: 'Interlinea minima: 0.8.' })
  @Max(3, { message: 'Interlinea massima: 3.' })
  md!: number;

  @ApiProperty({ description: 'Interlinea lg', example: 1.6 })
  @IsNumber({}, { message: 'Ogni interlinea deve essere un numero.' })
  @Min(0.8, { message: 'Interlinea minima: 0.8.' })
  @Max(3, { message: 'Interlinea massima: 3.' })
  lg!: number;

  @ApiProperty({ description: 'Interlinea xl', example: 1.65 })
  @IsNumber({}, { message: 'Ogni interlinea deve essere un numero.' })
  @Min(0.8, { message: 'Interlinea minima: 0.8.' })
  @Max(3, { message: 'Interlinea massima: 3.' })
  xl!: number;
}

/**
 * Scala di spaziatura `xs`–`xl`, nell'unità di `ThemeConfigDto.spacingUnit`
 * (v7). Range dipendente dall'unità: validato da `ThemeDimensionRangesConstraint`,
 * non da `@Min`/`@Max` statici.
 */
export class ThemeSpacingDto {
  @ApiProperty({ description: 'Spaziatura xs', example: 10 })
  @IsNumber({}, { message: 'Ogni spaziatura deve essere un numero.' })
  xs!: number;

  @ApiProperty({ description: 'Spaziatura sm', example: 12 })
  @IsNumber({}, { message: 'Ogni spaziatura deve essere un numero.' })
  sm!: number;

  @ApiProperty({ description: 'Spaziatura md', example: 16 })
  @IsNumber({}, { message: 'Ogni spaziatura deve essere un numero.' })
  md!: number;

  @ApiProperty({ description: 'Spaziatura lg', example: 20 })
  @IsNumber({}, { message: 'Ogni spaziatura deve essere un numero.' })
  lg!: number;

  @ApiProperty({ description: 'Spaziatura xl', example: 32 })
  @IsNumber({}, { message: 'Ogni spaziatura deve essere un numero.' })
  xl!: number;
}

/**
 * Valori dei radius token `xs`–`xl`, nell'unità di `ThemeConfigDto.radiusScaleUnit`
 * (v7). Range dipendente dall'unità: validato da `ThemeDimensionRangesConstraint`,
 * non da `@Min`/`@Max` statici.
 */
export class ThemeRadiusScaleDto {
  @ApiProperty({ description: 'Radius xs', example: 2 })
  @IsNumber({}, { message: 'Ogni radius deve essere un numero.' })
  xs!: number;

  @ApiProperty({ description: 'Radius sm', example: 4 })
  @IsNumber({}, { message: 'Ogni radius deve essere un numero.' })
  sm!: number;

  @ApiProperty({ description: 'Radius md', example: 8 })
  @IsNumber({}, { message: 'Ogni radius deve essere un numero.' })
  md!: number;

  @ApiProperty({ description: 'Radius lg', example: 16 })
  @IsNumber({}, { message: 'Ogni radius deve essere un numero.' })
  lg!: number;

  @ApiProperty({ description: 'Radius xl', example: 32 })
  @IsNumber({}, { message: 'Ogni radius deve essere un numero.' })
  xl!: number;
}

/**
 * Dimensione e interlinea di un livello di titolo. `fontSize` nell'unità di
 * `ThemeHeadingsDto.fontSizeUnit` (v7); range dipendente dall'unità,
 * validato da `ThemeDimensionRangesConstraint`, non da `@Min`/`@Max` statici.
 */
export class ThemeHeadingSizeDto {
  @ApiProperty({ description: 'Dimensione font', example: 34 })
  @IsNumber({}, { message: 'La dimensione del titolo deve essere un numero.' })
  fontSize!: number;

  @ApiProperty({ description: 'Interlinea (0.8–3)', example: 1.3 })
  @IsNumber({}, { message: "L'interlinea del titolo deve essere un numero." })
  @Min(0.8, { message: 'Interlinea minima: 0.8.' })
  @Max(3, { message: 'Interlinea massima: 3.' })
  lineHeight!: number;
}

/** Dimensioni dei sei livelli di titolo h1–h6. */
export class ThemeHeadingSizesDto {
  @ApiProperty({ description: 'Titolo h1', type: ThemeHeadingSizeDto })
  @IsDefined({ message: 'Il blocco h1 è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizeDto)
  h1!: ThemeHeadingSizeDto;

  @ApiProperty({ description: 'Titolo h2', type: ThemeHeadingSizeDto })
  @IsDefined({ message: 'Il blocco h2 è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizeDto)
  h2!: ThemeHeadingSizeDto;

  @ApiProperty({ description: 'Titolo h3', type: ThemeHeadingSizeDto })
  @IsDefined({ message: 'Il blocco h3 è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizeDto)
  h3!: ThemeHeadingSizeDto;

  @ApiProperty({ description: 'Titolo h4', type: ThemeHeadingSizeDto })
  @IsDefined({ message: 'Il blocco h4 è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizeDto)
  h4!: ThemeHeadingSizeDto;

  @ApiProperty({ description: 'Titolo h5', type: ThemeHeadingSizeDto })
  @IsDefined({ message: 'Il blocco h5 è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizeDto)
  h5!: ThemeHeadingSizeDto;

  @ApiProperty({ description: 'Titolo h6', type: ThemeHeadingSizeDto })
  @IsDefined({ message: 'Il blocco h6 è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizeDto)
  h6!: ThemeHeadingSizeDto;
}

/** Configurazione dei titoli (font whitelisted, peso, dimensioni per livello). */
export class ThemeHeadingsDto {
  @ApiProperty({
    description: 'Font dei titoli (ID whitelisted)',
    enum: THEME_FONT_FAMILY_IDS,
    example: 'inter',
  })
  @IsIn(THEME_FONT_FAMILY_IDS, { message: 'Font dei titoli non ammesso.' })
  fontFamily!: string;

  @ApiProperty({ description: 'Peso dei titoli', enum: THEME_FONT_WEIGHTS, example: '700' })
  @IsIn(THEME_FONT_WEIGHTS, { message: 'Peso dei titoli non ammesso.' })
  fontWeight!: string;

  @ApiProperty({
    description: 'Unità CSS condivisa dalla dimensione di ogni livello h1–h6 (v7)',
    enum: THEME_UNITS,
    example: 'px',
  })
  @IsIn(THEME_UNITS, { message: 'Unità dimensione titoli non ammessa.' })
  fontSizeUnit!: ThemeUnit;

  @ApiProperty({ description: 'Dimensioni h1–h6', type: ThemeHeadingSizesDto })
  @IsDefined({ message: 'Il blocco sizes dei titoli è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingSizesDto)
  sizes!: ThemeHeadingSizesDto;
}

/** Blocco tipografico completo. */
export class ThemeTypographyDto {
  @ApiProperty({
    description: 'Font del testo (ID whitelisted)',
    enum: THEME_FONT_FAMILY_IDS,
    example: 'inter',
  })
  @IsIn(THEME_FONT_FAMILY_IDS, { message: 'Font del testo non ammesso.' })
  fontFamily!: string;

  @ApiProperty({
    description: 'Font monospace (ID whitelisted)',
    enum: THEME_MONO_FONT_FAMILY_IDS,
    example: 'system-mono',
  })
  @IsIn(THEME_MONO_FONT_FAMILY_IDS, { message: 'Font monospace non ammesso.' })
  fontFamilyMonospace!: string;

  @ApiProperty({ description: 'Dimensioni testo xs–xl', type: ThemeFontSizesDto })
  @IsDefined({ message: 'Il blocco fontSizes è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeFontSizesDto)
  fontSizes!: ThemeFontSizesDto;

  @ApiProperty({ description: 'Unità CSS di fontSizes (v7)', enum: THEME_UNITS, example: 'px' })
  @IsIn(THEME_UNITS, { message: 'Unità dimensioni testo non ammessa.' })
  fontSizeUnit!: ThemeUnit;

  @ApiProperty({ description: 'Interlinee xs–xl', type: ThemeLineHeightsDto })
  @IsDefined({ message: 'Il blocco lineHeights è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeLineHeightsDto)
  lineHeights!: ThemeLineHeightsDto;

  @ApiProperty({ description: 'Configurazione titoli', type: ThemeHeadingsDto })
  @IsDefined({ message: 'Il blocco headings è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeHeadingsDto)
  headings!: ThemeHeadingsDto;
}

/**
 * Ombra strutturata (la stringa CSS è generata dal frontend, mai dall'utente).
 * `y`/`blur`/`spread` nell'unità di `ThemeConfigDto.shadowUnit` (v7, mai `%`:
 * `box-shadow` non ammette percentuali); range dipendente dall'unità,
 * validato da `ThemeDimensionRangesConstraint`, non da `@Min`/`@Max` statici.
 */
export class ThemeShadowSpecDto {
  @ApiProperty({ description: 'Offset verticale', example: 1 })
  @IsNumber({}, { message: "L'offset Y dell'ombra deve essere un numero." })
  y!: number;

  @ApiProperty({ description: 'Sfocatura', example: 3 })
  @IsNumber({}, { message: "La sfocatura dell'ombra deve essere un numero." })
  blur!: number;

  @ApiProperty({ description: 'Espansione', example: 0 })
  @IsNumber({}, { message: "L'espansione dell'ombra deve essere un numero." })
  spread!: number;

  @ApiProperty({ description: 'Opacità del nero (0–1)', example: 0.05 })
  @IsNumber({}, { message: "L'opacità dell'ombra deve essere un numero." })
  @Min(0, { message: 'Opacità minima: 0.' })
  @Max(1, { message: 'Opacità massima: 1.' })
  opacity!: number;
}

/** Ombre xs–xl come spec strutturate. */
export class ThemeShadowsDto {
  @ApiProperty({ description: 'Ombra xs', type: ThemeShadowSpecDto })
  @IsDefined({ message: "L'ombra xs è obbligatoria." })
  @ValidateNested()
  @Type(() => ThemeShadowSpecDto)
  xs!: ThemeShadowSpecDto;

  @ApiProperty({ description: 'Ombra sm', type: ThemeShadowSpecDto })
  @IsDefined({ message: "L'ombra sm è obbligatoria." })
  @ValidateNested()
  @Type(() => ThemeShadowSpecDto)
  sm!: ThemeShadowSpecDto;

  @ApiProperty({ description: 'Ombra md', type: ThemeShadowSpecDto })
  @IsDefined({ message: "L'ombra md è obbligatoria." })
  @ValidateNested()
  @Type(() => ThemeShadowSpecDto)
  md!: ThemeShadowSpecDto;

  @ApiProperty({ description: 'Ombra lg', type: ThemeShadowSpecDto })
  @IsDefined({ message: "L'ombra lg è obbligatoria." })
  @ValidateNested()
  @Type(() => ThemeShadowSpecDto)
  lg!: ThemeShadowSpecDto;

  @ApiProperty({ description: 'Ombra xl', type: ThemeShadowSpecDto })
  @IsDefined({ message: "L'ombra xl è obbligatoria." })
  @ValidateNested()
  @Type(() => ThemeShadowSpecDto)
  xl!: ThemeShadowSpecDto;
}

/** Default dei Button. */
export class ThemeButtonDefaultsDto {
  @ApiProperty({ description: 'Variant di default', enum: THEME_BUTTON_VARIANTS, example: 'unset' })
  @IsIn(THEME_BUTTON_VARIANTS, { message: 'Variant Button non ammessa.' })
  variant!: string;

  @ApiProperty({ description: 'Size di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Size Button non ammessa.' })
  size!: string;

  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius Button non ammesso.' })
  radius!: string;
}

/** Default degli ActionIcon. */
export class ThemeActionIconDefaultsDto {
  @ApiProperty({
    description: 'Variant di default',
    enum: THEME_ACTION_ICON_VARIANTS,
    example: 'unset',
  })
  @IsIn(THEME_ACTION_ICON_VARIANTS, { message: 'Variant ActionIcon non ammessa.' })
  variant!: string;

  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius ActionIcon non ammesso.' })
  radius!: string;
}

/** Default dei Badge. */
export class ThemeBadgeDefaultsDto {
  @ApiProperty({ description: 'Variant di default', enum: THEME_BADGE_VARIANTS, example: 'unset' })
  @IsIn(THEME_BADGE_VARIANTS, { message: 'Variant Badge non ammessa.' })
  variant!: string;

  @ApiProperty({ description: 'Size di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Size Badge non ammessa.' })
  size!: string;

  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius Badge non ammesso.' })
  radius!: string;
}

/** Default dei campi input (TextInput, PasswordInput, Select, NumberInput). */
export class ThemeInputDefaultsDto {
  @ApiProperty({ description: 'Variant di default', enum: THEME_INPUT_VARIANTS, example: 'unset' })
  @IsIn(THEME_INPUT_VARIANTS, { message: 'Variant input non ammessa.' })
  variant!: string;

  @ApiProperty({ description: 'Size di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Size input non ammessa.' })
  size!: string;

  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius input non ammesso.' })
  radius!: string;
}

/** Default delle superfici Paper/Card. */
export class ThemeCardDefaultsDto {
  @ApiProperty({ description: 'Ombra di default', enum: THEME_SHADOW_OPTIONS, example: 'unset' })
  @IsIn(THEME_SHADOW_OPTIONS, { message: 'Ombra card non ammessa.' })
  shadow!: string;

  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius card non ammesso.' })
  radius!: string;

  @ApiProperty({ description: 'Padding di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Padding card non ammesso.' })
  padding!: string;

  @ApiProperty({ description: 'Bordo visibile (withBorder)', example: false })
  @IsBoolean({ message: 'withBorder deve essere un boolean.' })
  withBorder!: boolean;
}

/** Default di Modal (e blur overlay condiviso con Drawer). */
export class ThemeModalDefaultsDto {
  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius modale non ammesso.' })
  radius!: string;

  @ApiProperty({ description: 'Ombra di default', enum: THEME_SHADOW_OPTIONS, example: 'unset' })
  @IsIn(THEME_SHADOW_OPTIONS, { message: 'Ombra modale non ammessa.' })
  shadow!: string;

  @ApiProperty({ description: 'Padding di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Padding modale non ammesso.' })
  padding!: string;

  @ApiProperty({ description: 'Blur overlay (0–12)', example: 0 })
  @IsNumber({}, { message: "Il blur dell'overlay deve essere un numero." })
  @Min(0, { message: 'Blur overlay minimo: 0.' })
  @Max(12, { message: 'Blur overlay massimo: 12.' })
  overlayBlur!: number;

  @ApiProperty({ description: 'Modale centrata verticalmente', example: false })
  @IsBoolean({ message: 'centered deve essere un boolean.' })
  centered!: boolean;
}

/** Default delle Table. */
export class ThemeTableDefaultsDto {
  @ApiProperty({ description: 'Righe alternate', example: false })
  @IsBoolean({ message: 'striped deve essere un boolean.' })
  striped!: boolean;

  @ApiProperty({ description: 'Evidenzia riga al passaggio', example: false })
  @IsBoolean({ message: 'highlightOnHover deve essere un boolean.' })
  highlightOnHover!: boolean;

  @ApiProperty({ description: 'Bordo esterno tabella', example: false })
  @IsBoolean({ message: 'withTableBorder deve essere un boolean.' })
  withTableBorder!: boolean;

  @ApiProperty({ description: 'Bordi tra le colonne', example: false })
  @IsBoolean({ message: 'withColumnBorders deve essere un boolean.' })
  withColumnBorders!: boolean;

  @ApiProperty({
    description: 'Spaziatura verticale delle celle',
    enum: THEME_SIZE_OPTIONS,
    example: 'unset',
  })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Spaziatura verticale tabella non ammessa.' })
  verticalSpacing!: string;
}

/** Default dei Tooltip. */
export class ThemeTooltipDefaultsDto {
  @ApiProperty({ description: 'Freccia sul tooltip', example: false })
  @IsBoolean({ message: 'withArrow deve essere un boolean.' })
  withArrow!: boolean;

  @ApiProperty({ description: 'Radius di default', enum: THEME_SIZE_OPTIONS, example: 'unset' })
  @IsIn(THEME_SIZE_OPTIONS, { message: 'Radius tooltip non ammesso.' })
  radius!: string;
}

/** Default dei Loader. */
export class ThemeLoaderDefaultsDto {
  @ApiProperty({ description: 'Tipo di animazione', enum: THEME_LOADER_TYPES, example: 'unset' })
  @IsIn(THEME_LOADER_TYPES, { message: 'Tipo di loader non ammesso.' })
  type!: string;
}

/** Default per-componente applicati via `theme.components`. */
export class ThemeComponentsDto {
  @ApiProperty({ description: 'Default Button', type: ThemeButtonDefaultsDto })
  @IsDefined({ message: 'Il blocco button è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeButtonDefaultsDto)
  button!: ThemeButtonDefaultsDto;

  @ApiProperty({ description: 'Default ActionIcon', type: ThemeActionIconDefaultsDto })
  @IsDefined({ message: 'Il blocco actionIcon è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeActionIconDefaultsDto)
  actionIcon!: ThemeActionIconDefaultsDto;

  @ApiProperty({ description: 'Default Badge', type: ThemeBadgeDefaultsDto })
  @IsDefined({ message: 'Il blocco badge è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeBadgeDefaultsDto)
  badge!: ThemeBadgeDefaultsDto;

  @ApiProperty({ description: 'Default campi input', type: ThemeInputDefaultsDto })
  @IsDefined({ message: 'Il blocco input è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeInputDefaultsDto)
  input!: ThemeInputDefaultsDto;

  @ApiProperty({ description: 'Default Paper/Card', type: ThemeCardDefaultsDto })
  @IsDefined({ message: 'Il blocco card è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeCardDefaultsDto)
  card!: ThemeCardDefaultsDto;

  @ApiProperty({ description: 'Default Modal/Drawer', type: ThemeModalDefaultsDto })
  @IsDefined({ message: 'Il blocco modal è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeModalDefaultsDto)
  modal!: ThemeModalDefaultsDto;

  @ApiProperty({ description: 'Default Table', type: ThemeTableDefaultsDto })
  @IsDefined({ message: 'Il blocco table è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeTableDefaultsDto)
  table!: ThemeTableDefaultsDto;

  @ApiProperty({ description: 'Default Tooltip', type: ThemeTooltipDefaultsDto })
  @IsDefined({ message: 'Il blocco tooltip è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeTooltipDefaultsDto)
  tooltip!: ThemeTooltipDefaultsDto;

  @ApiProperty({ description: 'Default Loader', type: ThemeLoaderDefaultsDto })
  @IsDefined({ message: 'Il blocco loader è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeLoaderDefaultsDto)
  loader!: ThemeLoaderDefaultsDto;
}

interface NumericRange {
  min: number;
  max: number;
}

/** Deriva i limiti `em`/`rem` da un limite `px` (÷16) senza duplicare tabelle a mano. */
function deriveLengthLimits(px: NumericRange): Record<ThemeLengthUnit, NumericRange> {
  const ratio = 16;
  return {
    px,
    em: { min: px.min / ratio, max: px.max / ratio },
    rem: { min: px.min / ratio, max: px.max / ratio },
  };
}

/** Come `deriveLengthLimits`, con l'aggiunta di un range `%` scelto esplicitamente (non derivabile da px). */
function deriveLimitsWithPercent(
  px: NumericRange,
  percent: NumericRange,
): Record<ThemeUnit, NumericRange> {
  return { ...deriveLengthLimits(px), '%': percent };
}

/**
 * Range numerici per unità dei campi dimensionali (v7) — stessi range in px
 * dei decorator `@Min`/`@Max` storici (ora rimossi dai singoli campi
 * dimensionali, sostituiti da questa tabella), stessi range `%`/em/rem del
 * frontend (`THEME_DIMENSION_UNIT_LIMITS` in `theme.ts`). `%` è assente per
 * le ombre: `box-shadow` non ammette percentuali.
 */
const THEME_DIMENSION_LIMITS = {
  fontSize: deriveLimitsWithPercent({ min: 8, max: 48 }, { min: 50, max: 300 }),
  headingFontSize: deriveLimitsWithPercent({ min: 10, max: 96 }, { min: 50, max: 400 }),
  spacing: deriveLimitsWithPercent({ min: 0, max: 80 }, { min: 0, max: 100 }),
  radius: deriveLimitsWithPercent({ min: 0, max: 48 }, { min: 0, max: 50 }),
  shadowY: deriveLengthLimits({ min: -24, max: 48 }),
  shadowBlur: deriveLengthLimits({ min: 0, max: 120 }),
  shadowSpread: deriveLengthLimits({ min: -32, max: 32 }),
  navbarWidth: deriveLimitsWithPercent({ min: 180, max: 320 }, { min: 10, max: 50 }),
} as const;

function isInRange(value: unknown, range: NumericRange): boolean {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max
  );
}

/**
 * Validatore cross-field dei campi dimensionali (v7): il range corretto
 * dipende dall'unità scelta in un campo gemello (es. `spacingUnit`), che i
 * decorator `@Min`/`@Max` statici non possono leggere — necessario un
 * `@Validate` sull'intero `ThemeConfigDto` (agganciato a `version`, sempre
 * presente). Aggregato in un solo controllo invece di un decorator per campo:
 * i campi coinvolti vivono a profondità diverse (`typography.fontSizes`,
 * `typography.headings.sizes.*.fontSize`, `spacing`, `radiusScale`,
 * `shadows.*`, `navbarWidth`), fuori dalla portata di un singolo decorator
 * di proprietà (che vede solo l'oggetto che lo contiene direttamente).
 */
@ValidatorConstraint({ name: 'themeDimensionRanges', async: false })
class ThemeDimensionRangesConstraint implements ValidatorConstraintInterface {
  private failedField = '';

  validate(_value: unknown, args: ValidationArguments): boolean {
    const config = args.object as ThemeConfigDto;
    const checks: Array<[string, unknown, string, keyof typeof THEME_DIMENSION_LIMITS]> = [];

    const fontSizeUnit = config.typography?.fontSizeUnit;
    const fontSizes = config.typography?.fontSizes;
    if (fontSizes && fontSizeUnit) {
      for (const size of THEME_SIZE_VALUES) {
        checks.push([`typography.fontSizes.${size}`, fontSizes[size], fontSizeUnit, 'fontSize']);
      }
    }

    const headingsFontSizeUnit = config.typography?.headings?.fontSizeUnit;
    const headingSizes = config.typography?.headings?.sizes;
    if (headingSizes && headingsFontSizeUnit) {
      for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
        checks.push([
          `typography.headings.sizes.${level}.fontSize`,
          headingSizes[level]?.fontSize,
          headingsFontSizeUnit,
          'headingFontSize',
        ]);
      }
    }

    if (config.spacing && config.spacingUnit) {
      for (const size of THEME_SIZE_VALUES) {
        checks.push([`spacing.${size}`, config.spacing[size], config.spacingUnit, 'spacing']);
      }
    }

    if (config.radiusScale && config.radiusScaleUnit) {
      for (const size of THEME_SIZE_VALUES) {
        checks.push([
          `radiusScale.${size}`,
          config.radiusScale[size],
          config.radiusScaleUnit,
          'radius',
        ]);
      }
    }

    if (config.shadows && config.shadowUnit) {
      for (const size of THEME_SIZE_VALUES) {
        const spec = config.shadows[size];
        if (!spec) continue;
        checks.push([`shadows.${size}.y`, spec.y, config.shadowUnit, 'shadowY']);
        checks.push([`shadows.${size}.blur`, spec.blur, config.shadowUnit, 'shadowBlur']);
        checks.push([`shadows.${size}.spread`, spec.spread, config.shadowUnit, 'shadowSpread']);
      }
    }

    if (typeof config.navbarWidth === 'number' && config.navbarWidthUnit) {
      checks.push(['navbarWidth', config.navbarWidth, config.navbarWidthUnit, 'navbarWidth']);
    }

    for (const [field, value, unit, limitKey] of checks) {
      const limits = (THEME_DIMENSION_LIMITS[limitKey] as Record<string, NumericRange>)[unit];
      if (!limits || !isInRange(value, limits)) {
        this.failedField = field;
        return false;
      }
    }
    return true;
  }

  defaultMessage(): string {
    return `Il valore dimensionale "${this.failedField}" è fuori dal range consentito per l'unità selezionata.`;
  }
}

/** Configurazione completa del tema di installazione (riga `key='theme'` di `app_settings`). */
export class ThemeConfigDto {
  @ApiProperty({
    description: 'Versione del contratto ThemeConfig',
    example: 7,
    enum: THEME_CONFIG_VERSIONS,
  })
  @IsInt({ message: 'version deve essere un intero.' })
  @IsIn(THEME_CONFIG_VERSIONS, { message: 'Versione del tema non supportata.' })
  // Cross-field su tutto il DTO (v7): il range dei campi dimensionali dipende
  // dall'unità di un campo gemello, fuori dalla portata di un @Min/@Max
  // statico — vedi ThemeDimensionRangesConstraint. Agganciato qui perché
  // `version` è l'unico campo sempre presente e semanticamente radice del
  // contratto versionato.
  @Validate(ThemeDimensionRangesConstraint)
  version!: number;

  @ApiProperty({ description: 'Larghezza sidebar espansa', example: 210 })
  @IsNumber({}, { message: 'navbarWidth deve essere un numero.' })
  navbarWidth!: number;

  @ApiProperty({ description: 'Unità CSS di navbarWidth (v7)', enum: THEME_UNITS, example: 'px' })
  @IsIn(THEME_UNITS, { message: 'Unità larghezza navbar non ammessa.' })
  navbarWidthUnit!: ThemeUnit;

  @ApiProperty({
    description: 'Sidebar chiusa (solo icone) di default al caricamento',
    example: false,
  })
  @IsBoolean({ message: 'navbarDefaultCollapsed deve essere un boolean.' })
  navbarDefaultCollapsed!: boolean;

  @ApiProperty({
    description: 'Stile del bordo destro della sidebar: bordo sottile o ombra proiettata',
    enum: THEME_NAVBAR_EDGE_STYLES,
    example: 'border',
  })
  @IsIn(THEME_NAVBAR_EDGE_STYLES, { message: 'Stile del bordo navbar non ammesso.' })
  navbarEdgeStyle!: string;

  @ApiProperty({
    description:
      "Intensità (0–1) dell'ombra del bordo destro sidebar quando navbarEdgeStyle è 'shadow'",
    example: 0.16,
  })
  @IsNumber({}, { message: "L'intensità dell'ombra navbar deve essere un numero." })
  @Min(0, { message: 'Intensità ombra navbar minima: 0.' })
  @Max(1, { message: 'Intensità ombra navbar massima: 1.' })
  navbarEdgeShadowIntensity!: number;

  @ApiProperty({ description: 'I 9 colori semantici del tema', type: ThemeColorsDto })
  @IsDefined({ message: 'Il blocco colors è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors!: ThemeColorsDto;

  @ApiProperty({ description: 'Shade filled per scheme', type: ThemePrimaryShadeDto })
  @IsDefined({ message: 'Il blocco primaryShade è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemePrimaryShadeDto)
  primaryShade!: ThemePrimaryShadeDto;

  @ApiProperty({
    description: 'Radius di default dei componenti',
    enum: THEME_RADIUS_VALUES,
    example: 'md',
  })
  @IsIn(THEME_RADIUS_VALUES, { message: 'Radius non ammesso.' })
  radius!: ThemeRadiusValue;

  @ApiProperty({
    description: 'Anello di focus',
    enum: THEME_FOCUS_RING_VALUES,
    example: 'auto',
  })
  @IsIn(THEME_FOCUS_RING_VALUES, { message: 'Valore focusRing non ammesso.' })
  focusRing!: string;

  @ApiProperty({
    description: 'Cursore sui controlli interattivi',
    enum: THEME_CURSOR_VALUES,
    example: 'default',
  })
  @IsIn(THEME_CURSOR_VALUES, { message: 'Valore cursorType non ammesso.' })
  cursorType!: string;

  @ApiProperty({ description: 'Rispetta prefers-reduced-motion', example: false })
  @IsBoolean({ message: 'respectReducedMotion deve essere un boolean.' })
  respectReducedMotion!: boolean;

  @ApiProperty({ description: 'Contrasto automatico sui filled', example: false })
  @IsBoolean({ message: 'autoContrast deve essere un boolean.' })
  autoContrast!: boolean;

  @ApiProperty({ description: 'Soglia di luminanza per autoContrast (0–1)', example: 0.3 })
  @IsNumber({}, { message: 'luminanceThreshold deve essere un numero.' })
  @Min(0, { message: 'luminanceThreshold minima: 0.' })
  @Max(1, { message: 'luminanceThreshold massima: 1.' })
  luminanceThreshold!: number;

  @ApiProperty({ description: 'Scala globale interfaccia (0.75–1.5)', example: 1 })
  @IsNumber({}, { message: 'scale deve essere un numero.' })
  @Min(0.75, { message: 'scale minima: 0.75.' })
  @Max(1.5, { message: 'scale massima: 1.5.' })
  scale!: number;

  @ApiProperty({ description: 'Gradiente di default', type: ThemeGradientDto })
  @IsDefined({ message: 'Il blocco defaultGradient è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeGradientDto)
  defaultGradient!: ThemeGradientDto;

  @ApiProperty({ description: 'Blocco tipografico', type: ThemeTypographyDto })
  @IsDefined({ message: 'Il blocco typography è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeTypographyDto)
  typography!: ThemeTypographyDto;

  @ApiProperty({ description: 'Scala di spaziatura xs–xl', type: ThemeSpacingDto })
  @IsDefined({ message: 'Il blocco spacing è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeSpacingDto)
  spacing!: ThemeSpacingDto;

  @ApiProperty({ description: 'Unità CSS di spacing (v7)', enum: THEME_UNITS, example: 'px' })
  @IsIn(THEME_UNITS, { message: 'Unità spaziatura non ammessa.' })
  spacingUnit!: ThemeUnit;

  @ApiProperty({ description: 'Valori dei radius token xs–xl', type: ThemeRadiusScaleDto })
  @IsDefined({ message: 'Il blocco radiusScale è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeRadiusScaleDto)
  radiusScale!: ThemeRadiusScaleDto;

  @ApiProperty({ description: 'Unità CSS di radiusScale (v7)', enum: THEME_UNITS, example: 'px' })
  @IsIn(THEME_UNITS, { message: 'Unità radius token non ammessa.' })
  radiusScaleUnit!: ThemeUnit;

  @ApiProperty({ description: 'Ombre xs–xl strutturate', type: ThemeShadowsDto })
  @IsDefined({ message: 'Il blocco shadows è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeShadowsDto)
  shadows!: ThemeShadowsDto;

  @ApiProperty({
    description: 'Unità CSS di shadows (v7) — solo lunghezze, mai %',
    enum: THEME_LENGTH_UNITS,
    example: 'px',
  })
  @IsIn(THEME_LENGTH_UNITS, { message: 'Unità ombre non ammessa (niente percentuali).' })
  shadowUnit!: ThemeLengthUnit;

  @ApiProperty({ description: 'Default per-componente', type: ThemeComponentsDto })
  @IsDefined({ message: 'Il blocco components è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeComponentsDto)
  components!: ThemeComponentsDto;

  @ApiProperty({ description: 'Token per lo scheme chiaro', type: ThemeSchemeTokensDto })
  @IsDefined({ message: 'Il blocco light è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeSchemeTokensDto)
  light!: ThemeSchemeTokensDto;

  @ApiProperty({ description: 'Token per lo scheme scuro', type: ThemeSchemeTokensDto })
  @IsDefined({ message: 'Il blocco dark è obbligatorio.' })
  @ValidateNested()
  @Type(() => ThemeSchemeTokensDto)
  dark!: ThemeSchemeTokensDto;
}
