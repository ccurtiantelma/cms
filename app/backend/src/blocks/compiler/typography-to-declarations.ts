/**
 * Risoluzione breakpoint dedicata per `kind: 'typography'`
 * (`SPEC-PROPKIND-V2-DETAILS.md` § 3 punto 3): a differenza di ogni altro
 * `kind` v2, `responsive` opera **per campo**, non sull'intero oggetto — ogni
 * campo presente porta il proprio envelope breakpoint indipendente
 * (`{ fontSize?: { default, tablet? }, fontWeight?: {...} }`), mai un unico
 * envelope a livello dell'intero `TypographyValue`. Per questo `typography`
 * non passa dal percorso generico "inviluppo breakpoint sull'intero valore" di
 * `to-css.ts`: questo modulo itera i campi e, per ciascuno, il proprio
 * envelope (se presente) o il valore nudo (se il campo non è avvolto),
 * raggruppando le dichiarazioni risultanti per breakpoint.
 *
 * Un campo il cui valore è un oggetto con chiave `default` è trattato come
 * envelope breakpoint; un `UnitValue` nudo (`{ value, unit }`) non ha mai una
 * chiave `default`, quindi il discriminante non è ambiguo.
 */
import {
  ResolvedBreakpoint,
  ResolvedBreakpointName,
  RESOLVED_BREAKPOINT_ORDER,
} from './css-declaration.types';
import { unitValueToCss, fontRefValueToCss } from './value-to-declarations';
import {
  FontRefValueShape,
  TypographyValueShape,
  UnitValueShape,
  isPlainObject,
} from './value-shapes.types';

interface CssDeclaration {
  property: string;
  value: string;
}

/** Campi di `TypographyValue`, nell'ordine dichiarato dall'interfaccia (SPEC-PROPKIND-V2-DETAILS.md § 3). */
const TYPOGRAPHY_FIELD_ORDER = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'textTransform',
  'fontStyle',
  'textDecoration',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
] as const;

type TypographyField = (typeof TYPOGRAPHY_FIELD_ORDER)[number];

/** Proprietà CSS di destinazione per ciascun campo di `TypographyValue`. */
const TYPOGRAPHY_FIELD_PROPERTY: Record<TypographyField, string> = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  textTransform: 'text-transform',
  fontStyle: 'font-style',
  textDecoration: 'text-decoration',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  wordSpacing: 'word-spacing',
};

/** Converte il valore nudo di un singolo campo di `TypographyValue` in una stringa CSS. */
function typographyFieldValueToCss(field: TypographyField, nakedValue: unknown): string {
  if (field === 'fontFamily') {
    return fontRefValueToCss(nakedValue as FontRefValueShape);
  }
  if (
    field === 'fontSize' ||
    field === 'lineHeight' ||
    field === 'letterSpacing' ||
    field === 'wordSpacing'
  ) {
    return unitValueToCss(nakedValue as UnitValueShape);
  }
  // fontWeight | textTransform | fontStyle | textDecoration: enum testuale, valore CSS letterale identico al token.
  return String(nakedValue);
}

/** `true` se `value` è un envelope breakpoint (`{ default, tablet?, ... }`), non un valore nudo. */
function isBreakpointEnvelope(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'default');
}

/**
 * Risolve il valore (già risolto per stato) di una prop `typography` in una
 * lista di `{ breakpoint, declarations }`, una voce per ciascun breakpoint
 * attivo che porta almeno una dichiarazione (SPEC-PROPKIND-V2-DETAILS.md § 3
 * punto 3 + § 10 punto 3, applicato per campo).
 */
export function typographyBreakpointDeclarations(
  stateValue: unknown,
  activeBreakpoints: ResolvedBreakpoint[],
): { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] {
  if (!isPlainObject(stateValue)) {
    return [];
  }
  const typography = stateValue as unknown as TypographyValueShape;
  const activeByName = new Map<ResolvedBreakpointName, ResolvedBreakpoint>(
    activeBreakpoints.map((breakpoint) => [breakpoint.name, breakpoint]),
  );
  const declarationsByBreakpoint = new Map<ResolvedBreakpointName, CssDeclaration[]>();

  for (const field of TYPOGRAPHY_FIELD_ORDER) {
    const fieldValue = typography[field];
    if (fieldValue === undefined) continue;

    const envelope = isBreakpointEnvelope(fieldValue) ? fieldValue : { default: fieldValue };
    for (const breakpointName of RESOLVED_BREAKPOINT_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(envelope, breakpointName)) continue;
      if (!activeByName.has(breakpointName)) continue;
      const nakedFieldValue = (envelope as Record<string, unknown>)[breakpointName];
      const declaration: CssDeclaration = {
        property: TYPOGRAPHY_FIELD_PROPERTY[field],
        value: typographyFieldValueToCss(field, nakedFieldValue),
      };
      const bucket = declarationsByBreakpoint.get(breakpointName) ?? [];
      bucket.push(declaration);
      declarationsByBreakpoint.set(breakpointName, bucket);
    }
  }

  const result: { breakpoint: ResolvedBreakpoint; declarations: CssDeclaration[] }[] = [];
  for (const breakpointName of RESOLVED_BREAKPOINT_ORDER) {
    const declarations = declarationsByBreakpoint.get(breakpointName);
    if (declarations && declarations.length > 0) {
      // Presente in `activeByName` per costruzione: è la condizione che ha popolato il bucket sopra.
      result.push({ breakpoint: activeByName.get(breakpointName)!, declarations });
    }
  }
  return result;
}
