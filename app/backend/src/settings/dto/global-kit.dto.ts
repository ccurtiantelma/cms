import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { registerDecorator } from 'class-validator';
import { BorderStyle, LengthUnit } from '../../blocks/prop-spec.types';

/**
 * DTO di `app_settings.global_kit` (`docs/ai/specs/SPEC-GLOBAL-KIT.md` § 1,
 * `ADR-77-global-kit-schema.md`). Schema aperto (Site Settings completo:
 * colori/font globali, stile di tema per elemento, layout, lightbox, font/
 * icone/codice custom) — riferimenti `colorRef`/`fontRef`/`TypographyValue`
 * riusano le stesse forme di valore di `SPEC-PROPKIND-V2-DETAILS.md` § 1-3,
 * mai una forma duplicata per lo stesso concetto.
 *
 * NOTA DI SCOPE: `BorderValue`/`ShadowValue` dentro `ThemeStyle.image`/
 * `ThemeStyle.button` non sono definiti in dettaglio in nessuno dei documenti
 * letti per questo Sub-Task (`SPEC-GLOBAL-KIT.md`, `ADR-76`, `ADR-77`,
 * `SPEC-PROPKIND-V2-DETAILS.md` § 1-2) — solo `RadiusValue` lo è (§ 5, riusato
 * qui identico). Per non inventare vincoli di dominio non scritti
 * (`docs/constitution.md`), questo DTO valida la **forma** di `BorderValue`/
 * `ShadowValue` (stessi campi del `kind: 'border'|'shadow'` v1 già in
 * `prop-spec.types.ts`, colore però `ColorRefValue` invece di hex letterale,
 * coerente con "ThemeStyle referenzia sempre variabili gk") senza imporre un
 * intervallo numerico non documentato: `width`/`radius`/`x`/`y`/`blur`/
 * `spread` sono validati come numeri, non contro un `[min,max]` specifico.
 * Punto aperto da confermare con una revisione dedicata se `SPEC-GLOBAL-KIT.md`
 * viene approvata con un intervallo esplicito.
 */

/** I 4 id riservati (`ADR-77` § "Decisione" punto 2): non eliminabili, mai riusabili da un'entry custom. */
export const GLOBAL_TOKEN_RESERVED_IDS = ['primary', 'secondary', 'text', 'accent'] as const;
export type GlobalTokenReservedId = (typeof GLOBAL_TOKEN_RESERVED_IDS)[number];

/** Forma di un `guid` custom: 16 esadecimali minuscoli (stesso pattern di `mediaRef`/`pageRef`). */
export const GUID16_PATTERN = /^[0-9a-f]{16}$/;

/** Pattern hex di `GlobalColorEntry.value` (`SPEC-GLOBAL-KIT.md` § 1): 3, 6 o 8 cifre, alpha sempre ammesso qui. */
const GLOBAL_COLOR_HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Limiti totali (system + custom), `ADR-77` § "Decisione" punto 1 / `SPEC-GLOBAL-KIT.md` § 1 vincolo 1. */
export const GLOBAL_COLORS_MAX_TOTAL = 34;
export const GLOBAL_FONTS_MAX_TOTAL = 24;

/** Vocabolario chiuso delle famiglie di sistema (stesso elenco di `block-tree-validator.service.ts`). */
export const SYSTEM_FONT_FAMILIES = [
  'default',
  'inter',
  'roboto',
  'playfair',
  'montserrat',
  'monospace',
] as const;

const FONT_WEIGHT_VALUES = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  'normal',
  'bold',
] as const;
const TEXT_TRANSFORM_VALUES = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;
const FONT_STYLE_VALUES = ['normal', 'italic', 'oblique'] as const;
const TEXT_DECORATION_VALUES = ['none', 'underline', 'overline', 'line-through'] as const;
const FONT_FAMILY_SOURCES = ['system', 'google', 'custom'] as const;

/** Stessi intervalli di `SPEC-PROPKIND-V2-DETAILS.md` § 3, riusati identici qui. */
const FONT_SIZE_UNITS: readonly LengthUnit[] = ['px', 'em', 'rem', 'vw', '%'];
const FONT_SIZE_RANGE: [number, number] = [1, 400];
const LETTER_SPACING_UNITS: readonly LengthUnit[] = ['px', 'em'];
const LETTER_SPACING_RANGE: [number, number] = [-20, 50];
const WORD_SPACING_UNITS: readonly LengthUnit[] = ['px', 'em'];
const WORD_SPACING_RANGE: [number, number] = [-20, 100];
const LINE_HEIGHT_UNITS = ['em', 'px'] as const;
const LINE_HEIGHT_EM_RANGE: [number, number] = [0, 10];
const LINE_HEIGHT_PX_RANGE: [number, number] = [0, 200];

/** Stesso intervallo/unità di `SPEC-PROPKIND-V2-DETAILS.md` § 5 (`kind: 'radius'`). */
const RADIUS_RANGE: [number, number] = [0, 500];
const RADIUS_UNITS = ['px', '%'] as const;

const CUSTOM_FONT_WEIGHTS = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
] as const;

const CUSTOM_CODE_LOCATIONS = ['head', 'bodyStart', 'bodyEnd'] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── `ColorRefValue` (SPEC-PROPKIND-V2-DETAILS.md § 1) ─────────────────────

/** Verifica di forma di un `ColorRefValue`: hex 3/6/8 cifre, oppure `{ ref: <id riservato o guid16> }`. */
function isValidColorRefValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
  }
  if (isPlainRecord(value) && Object.keys(value).length === 1 && typeof value.ref === 'string') {
    const ref = value.ref;
    return (
      (GLOBAL_TOKEN_RESERVED_IDS as readonly string[]).includes(ref) || GUID16_PATTERN.test(ref)
    );
  }
  return false;
}

@ValidatorConstraint({ name: 'isColorRefValue', async: false })
class ColorRefValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidColorRefValue(value);
  }
  defaultMessage(): string {
    return "Valore colore non valido: atteso '#rgb'|'#rrggbb'|'#rrggbbaa' oppure { ref: <id globale> }.";
  }
}

/** Decoratore di campo per un `ColorRefValue` (`SPEC-PROPKIND-V2-DETAILS.md` § 1). */
function IsColorRefValue(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isColorRefValue',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: ColorRefValueConstraint,
    });
  };
}

// ─── `FontRefValue` (SPEC-PROPKIND-V2-DETAILS.md § 2) ──────────────────────

function isValidFontRefValue(value: unknown): boolean {
  if (isPlainRecord(value) && Object.keys(value).length === 1 && typeof value.ref === 'string') {
    const ref = value.ref;
    return (
      (GLOBAL_TOKEN_RESERVED_IDS as readonly string[]).includes(ref) || GUID16_PATTERN.test(ref)
    );
  }
  if (
    isPlainRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.family === 'string' &&
    typeof value.source === 'string'
  ) {
    if (!(FONT_FAMILY_SOURCES as readonly string[]).includes(value.source)) return false;
    if (value.source === 'system') {
      return (SYSTEM_FONT_FAMILIES as readonly string[]).includes(value.family);
    }
    // 'google'/'custom': verifica di forma soltanto qui (DTO-level, nessun
    // accesso DB). La verifica contro l'allowlist sincronizzata è compito del
    // service (`SettingsService.updateGlobalKit`), che conosce già
    // `customFonts[]` dello stesso payload e può leggere `fonts.google_allowlist`.
    return true;
  }
  return false;
}

@ValidatorConstraint({ name: 'isFontRefValue', async: false })
class FontRefValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidFontRefValue(value);
  }
  defaultMessage(): string {
    return "Font non valido: atteso { ref: <id globale> } oppure { family, source: 'system'|'google'|'custom' }.";
  }
}

function IsFontRefValue(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isFontRefValue',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: FontRefValueConstraint,
    });
  };
}

// ─── `UnitValue` con range dipendente dal campo (SPEC-PROPKIND-V2-DETAILS.md § 3) ──

function isValidUnitValueInRange(
  value: unknown,
  units: readonly string[],
  range: [number, number],
): boolean {
  if (!isPlainRecord(value)) return false;
  const { value: num, unit } = value;
  return (
    typeof num === 'number' &&
    num >= range[0] &&
    num <= range[1] &&
    typeof unit === 'string' &&
    units.includes(unit)
  );
}

function IsUnitValueInRange(
  units: readonly string[],
  range: [number, number],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isUnitValueInRange',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isValidUnitValueInRange(value, units, range);
        },
        defaultMessage(): string {
          return `Valore fuori range [${range[0]}, ${range[1]}] o unità non ammessa (${units.join('|')}).`;
        },
      },
    });
  };
}

/** `lineHeight` ha un intervallo diverso per unità (`em` 0–10, `px` 0–200): un solo decoratore dedicato. */
function IsLineHeightValue(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isLineHeightValue',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (!isPlainRecord(value)) return false;
          const { value: num, unit } = value;
          if (typeof num !== 'number' || typeof unit !== 'string') return false;
          if (!(LINE_HEIGHT_UNITS as readonly string[]).includes(unit)) return false;
          const range = unit === 'em' ? LINE_HEIGHT_EM_RANGE : LINE_HEIGHT_PX_RANGE;
          return num >= range[0] && num <= range[1];
        },
        defaultMessage(): string {
          return "lineHeight fuori range ('em': 0-10, 'px': 0-200).";
        },
      },
    });
  };
}

// ─── `TypographyValue` (SPEC-PROPKIND-V2-DETAILS.md § 3) ───────────────────

/** Tutti i campi opzionali (`{}` è un valore valido, § 3 punto 1). */
export class TypographyValueDto {
  @ApiPropertyOptional({
    description: 'Famiglia (ColorRef-like: { ref } oppure { family, source })',
  })
  @IsOptional()
  @IsFontRefValue()
  fontFamily?: unknown;

  @ApiPropertyOptional({ description: 'Dimensione carattere ({ value, unit }, 1-400)' })
  @IsOptional()
  @IsUnitValueInRange(FONT_SIZE_UNITS, FONT_SIZE_RANGE)
  fontSize?: unknown;

  @ApiPropertyOptional({ enum: FONT_WEIGHT_VALUES })
  @IsOptional()
  @IsIn(FONT_WEIGHT_VALUES)
  fontWeight?: string;

  @ApiPropertyOptional({ enum: TEXT_TRANSFORM_VALUES })
  @IsOptional()
  @IsIn(TEXT_TRANSFORM_VALUES)
  textTransform?: string;

  @ApiPropertyOptional({ enum: FONT_STYLE_VALUES })
  @IsOptional()
  @IsIn(FONT_STYLE_VALUES)
  fontStyle?: string;

  @ApiPropertyOptional({ enum: TEXT_DECORATION_VALUES })
  @IsOptional()
  @IsIn(TEXT_DECORATION_VALUES)
  textDecoration?: string;

  @ApiPropertyOptional({ description: "Altezza riga ({ value, unit }: 'em' 0-10, 'px' 0-200)" })
  @IsOptional()
  @IsLineHeightValue()
  lineHeight?: unknown;

  @ApiPropertyOptional({ description: 'Spaziatura lettere ({ value, unit }, -20-50)' })
  @IsOptional()
  @IsUnitValueInRange(LETTER_SPACING_UNITS, LETTER_SPACING_RANGE)
  letterSpacing?: unknown;

  @ApiPropertyOptional({ description: 'Spaziatura parole ({ value, unit }, -20-100)' })
  @IsOptional()
  @IsUnitValueInRange(WORD_SPACING_UNITS, WORD_SPACING_RANGE)
  wordSpacing?: unknown;
}

// ─── `GlobalColorEntry` / `GlobalFontEntry` (SPEC-GLOBAL-KIT.md § 1) ───────

/**
 * `system` è derivato dall'`id` (riservato ⟺ `system: true`): un `PUT` che
 * disallinea i due produce `400` (`SPEC-GLOBAL-KIT.md` § 1 vincolo 2).
 */
@ValidatorConstraint({ name: 'systemFlagMatchesReservedId', async: false })
class SystemFlagMatchesReservedIdConstraint implements ValidatorConstraintInterface {
  validate(system: unknown, args: ValidationArguments): boolean {
    const entry = args.object as { id?: unknown };
    const id = typeof entry.id === 'string' ? entry.id : undefined;
    const isReserved =
      id !== undefined && (GLOBAL_TOKEN_RESERVED_IDS as readonly string[]).includes(id);
    return typeof system === 'boolean' && system === isReserved;
  }
  defaultMessage(): string {
    return "'system' deve essere true solo per gli id riservati (primary|secondary|text|accent) e false per ogni altro id (SPEC-GLOBAL-KIT.md § 1 vincolo 2).";
  }
}

export class GlobalColorEntryDto {
  @ApiPropertyOptional({
    description:
      "Id: uno dei 4 riservati (primary|secondary|text|accent) o guid16 custom. Assente su un'entry nuova: generato dal backend.",
  })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^(${GLOBAL_TOKEN_RESERVED_IDS.join('|')}|[0-9a-f]{16})$`))
  id?: string;

  @ApiProperty({ description: 'Etichetta visibile, libera', maxLength: 60 })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty({ description: "Valore hex ('#rgb'|'#rrggbb'|'#rrggbbaa')" })
  @IsString()
  @Matches(GLOBAL_COLOR_HEX_PATTERN)
  value!: string;

  @ApiProperty({ description: 'Derivato dal backend: true solo per i 4 id riservati' })
  @IsBoolean()
  @Validate(SystemFlagMatchesReservedIdConstraint)
  system!: boolean;
}

export class GlobalFontEntryDto {
  @ApiPropertyOptional({
    description:
      "Id: uno dei 4 riservati (primary|secondary|text|accent) o guid16 custom. Assente su un'entry nuova: generato dal backend.",
  })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^(${GLOBAL_TOKEN_RESERVED_IDS.join('|')}|[0-9a-f]{16})$`))
  id?: string;

  @ApiProperty({ description: 'Etichetta visibile, libera', maxLength: 60 })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty({
    description: 'Blocco tipografico (SPEC-PROPKIND-V2-DETAILS.md § 3)',
    type: TypographyValueDto,
  })
  @ValidateNested()
  @Type(() => TypographyValueDto)
  typography!: TypographyValueDto;

  @ApiProperty({ description: 'Derivato dal backend: true solo per i 4 id riservati' })
  @IsBoolean()
  @Validate(SystemFlagMatchesReservedIdConstraint)
  system!: boolean;
}

/**
 * Array-level: nessun id duplicato, dimensione totale entro il limite
 * dichiarato (`SPEC-GLOBAL-KIT.md` § 1 vincolo 1). **Non** verifica qui che i
 * 4 id riservati siano tutti presenti: quel controllo richiede di conoscere
 * il valore *corrente* già salvato (per distinguere "mai esistito" da "appena
 * rimosso") e produce `409`, non `400` — è quindi un controllo di servizio
 * (`SettingsService.updateGlobalKit`), non DTO-level stateless (ADR-77 §
 * "Conformità": "`409` o validazione DTO, a scelta dell'implementazione" — qui
 * la scelta è `409`, esplicitamente richiesta dal task operativo di S1.3).
 */
function makeGlobalTokenArrayConstraint(maxTotal: number, label: string) {
  @ValidatorConstraint({ name: `globalTokenArray_${label}`, async: false })
  class GlobalTokenArrayConstraint implements ValidatorConstraintInterface {
    validate(entries: unknown): boolean {
      if (!Array.isArray(entries)) return false;
      if (entries.length > maxTotal) return false;
      const ids = entries.map((e) => (isPlainRecord(e) ? e.id : undefined));
      const definedIds = ids.filter((id): id is string => typeof id === 'string');
      const noDuplicates = new Set(definedIds).size === definedIds.length;
      return noDuplicates;
    }
    defaultMessage(): string {
      return `${label}: nessun id duplicato, massimo ${maxTotal} voci totali.`;
    }
  }
  return GlobalTokenArrayConstraint;
}

const ColorsArrayConstraint = makeGlobalTokenArrayConstraint(GLOBAL_COLORS_MAX_TOTAL, 'colors');
const FontsArrayConstraint = makeGlobalTokenArrayConstraint(GLOBAL_FONTS_MAX_TOTAL, 'fonts');

// ─── `ThemeStyle` (SPEC-GLOBAL-KIT.md § 1) ─────────────────────────────────

export class StatefulColorRefDto {
  @ApiProperty({ description: 'ColorRefValue di stato "normal"' })
  @IsColorRefValue()
  normal!: unknown;

  @ApiPropertyOptional({ description: 'ColorRefValue di stato "hover" (ADR-75)' })
  @IsOptional()
  @IsColorRefValue()
  hover?: unknown;
}

export class ElementStyleDto {
  @ApiProperty({ type: TypographyValueDto })
  @ValidateNested()
  @Type(() => TypographyValueDto)
  typography!: TypographyValueDto;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  color!: unknown;
}

/**
 * Vedi nota di scope in testa al file: forma allineata a `kind: 'border'` v1
 * (`prop-spec.types.ts`), colore però `ColorRefValue`; nessun intervallo
 * numerico imposto (non documentato per questo contesto).
 */
export class ThemeBorderValueDto {
  @ApiProperty({ description: 'Spessore in px' })
  @IsNumber()
  width!: number;

  @ApiProperty({ enum: ['solid', 'dashed', 'dotted', 'none'] })
  @IsIn(['solid', 'dashed', 'dotted', 'none'])
  style!: BorderStyle;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  color!: unknown;
}

/** Stessa nota di scope di `ThemeBorderValueDto`. */
export class ThemeShadowValueDto {
  @ApiProperty() @IsNumber() x!: number;
  @ApiProperty() @IsNumber() y!: number;
  @ApiProperty() @IsNumber() blur!: number;
  @ApiProperty() @IsNumber() spread!: number;
  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  color!: unknown;
}

/** Identico a `RadiusValue` (SPEC-PROPKIND-V2-DETAILS.md § 5): 0-500, `unit` fisso `'px'|'%'`. */
export class ThemeRadiusValueDto {
  @ApiProperty() @IsNumber() @Min(RADIUS_RANGE[0]) @Max(RADIUS_RANGE[1]) tl!: number;
  @ApiProperty() @IsNumber() @Min(RADIUS_RANGE[0]) @Max(RADIUS_RANGE[1]) tr!: number;
  @ApiProperty() @IsNumber() @Min(RADIUS_RANGE[0]) @Max(RADIUS_RANGE[1]) br!: number;
  @ApiProperty() @IsNumber() @Min(RADIUS_RANGE[0]) @Max(RADIUS_RANGE[1]) bl!: number;
  @ApiProperty({ enum: RADIUS_UNITS }) @IsIn(RADIUS_UNITS) unit!: string;
  @ApiProperty() @IsBoolean() linked!: boolean;
}

export class ThemeBodyStyleDto {
  @ApiProperty({ type: TypographyValueDto })
  @ValidateNested()
  @Type(() => TypographyValueDto)
  typography!: TypographyValueDto;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  color!: unknown;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  background!: unknown;
}

export class ThemeLinkStyleDto {
  @ApiProperty({ type: StatefulColorRefDto })
  @ValidateNested()
  @Type(() => StatefulColorRefDto)
  color!: StatefulColorRefDto;
}

export class ThemeButtonStyleDto {
  @ApiProperty({ type: TypographyValueDto })
  @ValidateNested()
  @Type(() => TypographyValueDto)
  typography!: TypographyValueDto;

  @ApiProperty({ type: StatefulColorRefDto })
  @ValidateNested()
  @Type(() => StatefulColorRefDto)
  background!: StatefulColorRefDto;

  @ApiProperty({ type: StatefulColorRefDto })
  @ValidateNested()
  @Type(() => StatefulColorRefDto)
  color!: StatefulColorRefDto;

  @ApiProperty({ type: ThemeBorderValueDto })
  @ValidateNested()
  @Type(() => ThemeBorderValueDto)
  border!: ThemeBorderValueDto;

  @ApiProperty({ type: ThemeRadiusValueDto })
  @ValidateNested()
  @Type(() => ThemeRadiusValueDto)
  radius!: ThemeRadiusValueDto;
}

export class ThemeImageStyleDto {
  @ApiProperty({ type: ThemeBorderValueDto })
  @ValidateNested()
  @Type(() => ThemeBorderValueDto)
  border!: ThemeBorderValueDto;

  @ApiProperty({ type: ThemeRadiusValueDto })
  @ValidateNested()
  @Type(() => ThemeRadiusValueDto)
  radius!: ThemeRadiusValueDto;

  @ApiProperty({ type: ThemeShadowValueDto })
  @ValidateNested()
  @Type(() => ThemeShadowValueDto)
  shadow!: ThemeShadowValueDto;
}

export class ThemeFormFieldsStyleDto {
  @ApiProperty({ type: ThemeBorderValueDto })
  @ValidateNested()
  @Type(() => ThemeBorderValueDto)
  border!: ThemeBorderValueDto;

  @ApiProperty({ type: ThemeRadiusValueDto })
  @ValidateNested()
  @Type(() => ThemeRadiusValueDto)
  radius!: ThemeRadiusValueDto;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  color!: unknown;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  background!: unknown;
}

/**
 * `ThemeStyle.*` non ha campi obbligatori a livello di singolo elemento
 * (`SPEC-GLOBAL-KIT.md` § 1 vincolo 4): ogni membro è opzionale, il fallback
 * vive nel CSS compilato (default hardcoded), mai nel validator.
 */
export class ThemeStyleDto {
  @ApiPropertyOptional({ type: ThemeBodyStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeBodyStyleDto)
  body?: ThemeBodyStyleDto;

  @ApiPropertyOptional({ type: ElementStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ElementStyleDto)
  h1?: ElementStyleDto;

  @ApiPropertyOptional({ type: ElementStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ElementStyleDto)
  h2?: ElementStyleDto;

  @ApiPropertyOptional({ type: ElementStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ElementStyleDto)
  h3?: ElementStyleDto;

  @ApiPropertyOptional({ type: ElementStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ElementStyleDto)
  h4?: ElementStyleDto;

  @ApiPropertyOptional({ type: ElementStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ElementStyleDto)
  h5?: ElementStyleDto;

  @ApiPropertyOptional({ type: ElementStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ElementStyleDto)
  h6?: ElementStyleDto;

  @ApiPropertyOptional({ type: ThemeLinkStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeLinkStyleDto)
  link?: ThemeLinkStyleDto;

  @ApiPropertyOptional({ type: ThemeButtonStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeButtonStyleDto)
  button?: ThemeButtonStyleDto;

  @ApiPropertyOptional({ type: ThemeImageStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeImageStyleDto)
  image?: ThemeImageStyleDto;

  @ApiPropertyOptional({ type: ThemeFormFieldsStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeFormFieldsStyleDto)
  formFields?: ThemeFormFieldsStyleDto;
}

// ─── `LayoutSettings` / `LightboxSettings` (SPEC-GLOBAL-KIT.md § 1) ────────

const LAYOUT_LENGTH_UNITS: readonly LengthUnit[] = ['px', '%', 'em', 'rem', 'vw', 'vh'];

export class UnitValueDto {
  @ApiProperty() @IsNumber() value!: number;
  @ApiProperty({ enum: LAYOUT_LENGTH_UNITS }) @IsIn(LAYOUT_LENGTH_UNITS) unit!: LengthUnit;
}

/** Identico a `SpacingValue` (SPEC-PROPKIND-V2-DETAILS.md § 4): un solo `unit` per i 4 lati. */
export class SpacingValueDto {
  @ApiProperty() @IsNumber() top!: number;
  @ApiProperty() @IsNumber() right!: number;
  @ApiProperty() @IsNumber() bottom!: number;
  @ApiProperty() @IsNumber() left!: number;
  @ApiProperty({ enum: LAYOUT_LENGTH_UNITS }) @IsIn(LAYOUT_LENGTH_UNITS) unit!: LengthUnit;
  @ApiProperty() @IsBoolean() linked!: boolean;
}

export class LayoutSettingsDto {
  @ApiProperty({ type: UnitValueDto })
  @ValidateNested()
  @Type(() => UnitValueDto)
  contentWidth!: UnitValueDto;

  @ApiProperty({ type: UnitValueDto })
  @ValidateNested()
  @Type(() => UnitValueDto)
  widgetSpace!: UnitValueDto;

  @ApiProperty({ enum: ['h1', 'none'] })
  @IsIn(['h1', 'none'])
  pageTitleSelector!: 'h1' | 'none';

  @ApiProperty({ type: SpacingValueDto })
  @ValidateNested()
  @Type(() => SpacingValueDto)
  defaultContainerPadding!: SpacingValueDto;
}

export class LightboxSettingsDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  bgColor!: unknown;

  @ApiProperty({ description: 'ColorRefValue' })
  @IsColorRefValue()
  uiColor!: unknown;

  @ApiProperty() @IsBoolean() showTitle!: boolean;
  @ApiProperty() @IsBoolean() showDescription!: boolean;
  @ApiProperty() @IsBoolean() zoom!: boolean;
  @ApiProperty() @IsBoolean() share!: boolean;
}

// ─── `CustomFontEntry` / `CustomIconEntry` / `CustomCodeEntry` (§ 1) ───────

class CustomFontFileDto {
  @ApiProperty({ description: 'mediaRef guid16 del file woff2' })
  @IsString()
  @Matches(GUID16_PATTERN)
  woff2!: string;
}

/** Un `woff2` per ogni voce di `weights`, stesso ordine (`SPEC-GLOBAL-KIT.md` § 1 vincolo 5). */
@ValidatorConstraint({ name: 'customFontFilesMatchWeights', async: false })
class CustomFontFilesMatchWeightsConstraint implements ValidatorConstraintInterface {
  validate(files: unknown, args: ValidationArguments): boolean {
    const entry = args.object as { weights?: unknown };
    if (!Array.isArray(files) || !Array.isArray(entry.weights)) return false;
    return files.length === entry.weights.length;
  }
  defaultMessage(): string {
    return "'files' deve avere esattamente un woff2 per ogni voce di 'weights', nello stesso ordine (reason: required).";
  }
}

export class CustomFontEntryDto {
  @ApiPropertyOptional({ description: "Guid16, assente su un'entry nuova: generato dal backend." })
  @IsOptional()
  @IsString()
  @Matches(GUID16_PATTERN)
  id?: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  family!: string;

  @ApiProperty({ type: [CustomFontFileDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFontFileDto)
  @Validate(CustomFontFilesMatchWeightsConstraint)
  files!: CustomFontFileDto[];

  @ApiProperty({ enum: CUSTOM_FONT_WEIGHTS, isArray: true })
  @IsArray()
  @IsIn(CUSTOM_FONT_WEIGHTS, { each: true })
  weights!: string[];
}

export class CustomIconEntryDto {
  @ApiPropertyOptional({ description: "Guid16, assente su un'entry nuova: generato dal backend." })
  @IsOptional()
  @IsString()
  @Matches(GUID16_PATTERN)
  id?: string;

  @ApiProperty({ description: 'mediaRef guid16 dello SVG (sanitizzato DOMPurify, ADR-80 § 10)' })
  @IsString()
  @Matches(GUID16_PATTERN)
  svgMediaRef!: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  label!: string;
}

/**
 * `ConditionsValue` (`docs/SPEC-propkind-v2.md` § 3.19) non è tra i documenti
 * letti per questo Sub-Task: validato qui come oggetto plain generico, senza
 * inventare una forma interna non documentata (`docs/constitution.md`).
 */
export class CustomCodeEntryDto {
  @ApiPropertyOptional({ description: "Guid16, assente su un'entry nuova: generato dal backend." })
  @IsOptional()
  @IsString()
  @Matches(GUID16_PATTERN)
  id?: string;

  @ApiProperty({ enum: CUSTOM_CODE_LOCATIONS })
  @IsIn(CUSTOM_CODE_LOCATIONS)
  location!: 'head' | 'bodyStart' | 'bodyEnd';

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  priority!: number;

  @ApiProperty({
    maxLength: 20000,
    description: "Nessuna sanitizzazione HTML: Admin+ è l'unico controllo (ADR-78)",
  })
  @IsString()
  @MaxLength(20000)
  code!: string;

  @ApiProperty({
    description:
      'ConditionsValue (SPEC-propkind-v2.md § 3.19), forma non validata a questo livello',
  })
  @IsObject()
  conditions!: Record<string, unknown>;
}

// ─── `GlobalKitDto` (root) ──────────────────────────────────────────────────

export class GlobalKitDto {
  @ApiProperty({ type: [GlobalColorEntryDto], maxItems: GLOBAL_COLORS_MAX_TOTAL })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GlobalColorEntryDto)
  @Validate(ColorsArrayConstraint)
  colors!: GlobalColorEntryDto[];

  @ApiProperty({ type: [GlobalFontEntryDto], maxItems: GLOBAL_FONTS_MAX_TOTAL })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GlobalFontEntryDto)
  @Validate(FontsArrayConstraint)
  fonts!: GlobalFontEntryDto[];

  @ApiProperty({ type: ThemeStyleDto })
  @ValidateNested()
  @Type(() => ThemeStyleDto)
  themeStyle!: ThemeStyleDto;

  @ApiProperty({ type: LayoutSettingsDto })
  @ValidateNested()
  @Type(() => LayoutSettingsDto)
  layout!: LayoutSettingsDto;

  @ApiProperty({ type: LightboxSettingsDto })
  @ValidateNested()
  @Type(() => LightboxSettingsDto)
  lightbox!: LightboxSettingsDto;

  @ApiProperty({ type: [CustomFontEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFontEntryDto)
  customFonts!: CustomFontEntryDto[];

  @ApiProperty({ type: [CustomIconEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomIconEntryDto)
  customIcons!: CustomIconEntryDto[];

  @ApiProperty({ type: [CustomCodeEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomCodeEntryDto)
  customCode!: CustomCodeEntryDto[];
}
