import { Injectable } from '@nestjs/common';
import { BlockDefinition } from '../block-definition.types';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../block-registry';
import {
  BorderStyle,
  EnumPropSpec,
  LengthUnit,
  PropKind,
  PropSpec,
  RESPONSIVE_BREAKPOINTS,
  ResponsiveBreakpointName,
  UnitValuePropSpec,
} from '../prop-spec.types';
import { ValidatableBlockNode } from './validatable-node.types';
import {
  BlockPropInvalidReason,
  BlockTreeValidationResult,
  BlockValidationError,
} from './validation-result.types';

/** Contesto opzionale passato all'interprete per la verifica di `minRole` (ADR-18: filtro aggiuntivo, non sostituisce ownership/guard). */
export interface BlockTreeValidationContext {
  /** Livello di ruolo RBAC dell'autore (valore più basso = più privilegi). Assente = nessun filtro `minRole` applicato. */
  roleLevel?: number;
}

/** Schemi ammessi per `kind: 'url'` (SPEC-F02-blocchi.md § 3.6): assoluta http/https, `mailto:`, root-relative con una sola barra iniziale. */
const ABSOLUTE_URL_PATTERN = /^https?:\/\/.+/i;
const MAILTO_URL_PATTERN = /^mailto:.+/i;
const ROOT_RELATIVE_URL_PATTERN = /^\/(?!\/).*/;

/** Forma di un `guid`: 16 caratteri esadecimali minuscoli, coerente con `Utils.randomString` (`app/backend/src/common/utils.ts`). */
const GUID_PATTERN = /^[0-9a-f]{16}$/;

/**
 * Pattern **fisso e stretto** per `kind: 'color'` (ADR-33 § 3): solo
 * esadecimale a 3 o 6 cifre, niente `rgb()`/`hsl()`/`url()`/parole chiave
 * CSS — non un campo `pattern` generico riusabile da altre prop.
 */
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Pattern **fisso e stretto** per un singolo token di `cssClassName`/`htmlId`
 * (ADR-38 § 5): lettere/cifre/`-`/`_`, mai una cifra iniziale, ≤ 50
 * caratteri — stesso principio di `HEX_COLOR_PATTERN`, non un `pattern`
 * generico configurabile dal registro.
 */
const CSS_IDENTIFIER_TOKEN_PATTERN = /^[a-zA-Z_-][a-zA-Z0-9_-]{0,49}$/;
const CSS_CLASS_NAME_MAX_LENGTH = 100;
const CSS_CLASS_NAME_MAX_TOKENS = 3;

/** Stili ammessi per `kind: 'border'` (ADR-38 § 3). */
const BORDER_STYLES: readonly BorderStyle[] = ['solid', 'dashed', 'dotted', 'none'];
/** Intervalli fissi (unità implicita px) per `kind: 'border'` — non configurabili dalla prop (ADR-38 § 3). */
const BORDER_WIDTH_RANGE: [number, number] = [0, 12];
const BORDER_RADIUS_RANGE: [number, number] = [0, 48];

/** Intervalli fissi (unità implicita px) per `kind: 'shadow'` — non configurabili dalla prop (ADR-38 § 4). */
const SHADOW_OFFSET_RANGE: [number, number] = [-48, 48];
const SHADOW_BLUR_RANGE: [number, number] = [0, 64];
const SHADOW_SPREAD_RANGE: [number, number] = [-24, 24];

/**
 * L'unico interprete che valida qualunque albero di blocchi contro il
 * registro (ADR-21 § 2, PLAN-F02 T2): nessuna classe `class-validator` per
 * tipo. Guidato interamente dai descrittori (`BlockDefinition`/`PropSpec`).
 *
 * **Ordine della pipeline (ADR-21 § 3, correzione T3)**: questo servizio
 * implementa lo stadio "validazione contro il registro" — invocato **dopo**
 * la forma dell'envelope e la migrazione, e **prima** della sanitizzazione
 * per `kind` (T3) e della persistenza. Questo stadio verifica `maxLength`
 * solo per `url`, perché la sanitizzazione non lo modifica: valore letto e
 * valore persistito coincidono. Per `richText` e `plainText` la pulizia
 * (`sanitize-html`, rimozione caratteri di controllo) può accorciare la
 * stringa, quindi il loro `maxLength` **non** si verifica qui: è
 * responsabilità di `BlockPropSanitizerService`
 * (`common/sanitizer/block-prop-sanitizer.service.ts`), dopo la pulizia, sul
 * valore che verrà effettivamente scritto.
 */
@Injectable()
export class BlockTreeValidatorService {
  /**
   * Valida un intero albero di blocchi radice. Ritorna un esito strutturato
   * (mai un'eccezione): un albero non conforme colleziona **tutti** i suoi
   * errori, con il path del nodo colpevole in ogni voce — mai il primo
   * errore soltanto, perché la persistenza è sempre integrale o nulla
   * (business-rules.md § Blocchi regola 4).
   *
   * @param blocks Nodi di radice, già passati dallo stadio forma envelope e
   *   dalla migrazione (T4). Questo servizio non li muta.
   * @param registry Registro dei tipi da usare (default: quello di
   *   produzione). Un parametro esplicito permette a T7 di iniettare un
   *   registro di test con un tipo a `v: 2`.
   * @param context Contesto opzionale (soglia di ruolo per `minRole`).
   */
  validateTree(
    blocks: ValidatableBlockNode[],
    registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
    context: BlockTreeValidationContext = {},
  ): BlockTreeValidationResult {
    const errors: BlockValidationError[] = [];
    blocks.forEach((node, index) => {
      this.validateNode(node, `blocks[${index}]`, null, registry, context, errors);
    });
    return { valid: errors.length === 0, errors };
  }

  /**
   * Valida un singolo nodo (tipo, annidamento, props) e ricorre sui figli.
   * Continua a scendere anche dopo un errore di annidamento, per collezionare
   * ogni nodo colpevole dell'albero in un solo esito — mai fermarsi al primo.
   */
  private validateNode(
    node: ValidatableBlockNode,
    path: string,
    parentType: string | null,
    registry: BlockRegistry,
    context: BlockTreeValidationContext,
    errors: BlockValidationError[],
  ): void {
    const definition = this.resolveDefinition(node.type, registry, context);
    if (!definition) {
      errors.push({
        code: 'BLOCK_TYPE_UNKNOWN',
        details: { path, type: node.type },
      });
      // Tipo sconosciuto: `children.allow` di questo nodo è indeterminabile,
      // non si scende oltre su questo ramo.
      return;
    }

    const allowedHere =
      parentType === null
        ? registry.rootAllowed
        : (registry.definitions.get(parentType)?.children.allow ?? []);
    // Sentinel wildcard (ADR-39 § 4): '*' ammette qualunque tipo già risolto
    // con successo sopra (quindi filtrato per `enabled`/`minRole`) — nessun
    // controllo di appartenenza da fare, il tipo è già noto e ammesso.
    if (allowedHere !== '*' && !allowedHere.includes(node.type)) {
      errors.push({
        code: 'BLOCK_NESTING_NOT_ALLOWED',
        details: { path, type: node.type, parentType, allowed: [...allowedHere] },
      });
      // L'annidamento non è ammesso ma il tipo è noto: si continua comunque
      // a validare props e figli, per riportare tutti gli errori dell'albero.
    }

    this.validateProps(node, path, definition, errors);

    node.children.forEach((child, index) => {
      this.validateNode(child, `${path}.children[${index}]`, node.type, registry, context, errors);
    });
  }

  /** Risolve la definizione di un tipo, rispettando `enabled` e `minRole` (SPEC-F02-blocchi.md § 4: entrambi producono `BLOCK_TYPE_UNKNOWN`). */
  private resolveDefinition(
    type: string,
    registry: BlockRegistry,
    context: BlockTreeValidationContext,
  ): BlockDefinition | undefined {
    const definition = registry.definitions.get(type);
    if (!definition || !definition.enabled) {
      return undefined;
    }
    if (
      definition.minRole !== undefined &&
      context.roleLevel !== undefined &&
      context.roleLevel > definition.minRole
    ) {
      return undefined;
    }
    return definition;
  }

  /** Valida `props`: ogni chiave presente deve essere dichiarata, ogni prop dichiarata obbligatoria deve essere presente e conforme. */
  private validateProps(
    node: ValidatableBlockNode,
    path: string,
    definition: BlockDefinition,
    errors: BlockValidationError[],
  ): void {
    const declaredNames = Object.keys(definition.props);

    for (const propName of Object.keys(node.props)) {
      if (!Object.prototype.hasOwnProperty.call(definition.props, propName)) {
        errors.push({
          code: 'BLOCK_PROP_NOT_DECLARED',
          details: {
            path: `${path}.props.${propName}`,
            type: node.type,
            prop: propName,
            declared: declaredNames,
          },
        });
      }
    }

    for (const [propName, spec] of Object.entries(definition.props)) {
      const propPath = `${path}.props.${propName}`;
      const present = Object.prototype.hasOwnProperty.call(node.props, propName);

      if (!present) {
        if (spec.required) {
          errors.push({
            code: 'BLOCK_PROP_INVALID',
            details: {
              path: propPath,
              type: node.type,
              prop: propName,
              kind: spec.kind,
              reason: 'required',
            },
          });
        }
        // Prop assente e non obbligatoria: il default dichiarato si applica
        // altrove nella pipeline (migrazione/persistenza), non qui.
        continue;
      }

      this.validatePropValue(node.props[propName], propName, propPath, node.type, spec, errors);
    }
  }

  /** Valida un singolo valore di prop già dichiarata e presente, secondo il suo `kind`. */
  private validatePropValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: PropSpec,
    errors: BlockValidationError[],
  ): void {
    const invalid = (
      reason: BlockPropInvalidReason,
      extra?: { constraint?: number | string[] | [number, number]; actual?: number },
    ): void => {
      errors.push({
        code: 'BLOCK_PROP_INVALID',
        details: { path, type, prop: propName, kind: spec.kind, reason, ...extra },
      });
    };

    switch (spec.kind) {
      case 'plainText': {
        if (typeof value !== 'string') return invalid('type');
        if (spec.nonEmpty && value.trim().length === 0) return invalid('empty');
        // `maxLength` non si verifica qui: la rimozione dei caratteri di
        // controllo può accorciare la stringa. Responsabilità di
        // `BlockPropSanitizerService`, dopo la pulizia (ADR-21 § 3, correzione T3).
        return;
      }
      case 'richText': {
        if (typeof value !== 'string') return invalid('type');
        // `maxLength` non si verifica qui: `sanitize-html` può accorciare la
        // stringa. Responsabilità di `BlockPropSanitizerService`, dopo la
        // pulizia (ADR-21 § 3, correzione T3).
        return;
      }
      case 'number': {
        if (typeof value !== 'number' || Number.isNaN(value)) return invalid('type');
        // `min`/`max` opzionali (ADR-47 § "Decisione"): assenti, nessun
        // vincolo di range — comportamento invariato per ogni prop `number`
        // senza intervallo dichiarato. Dichiarati sempre insieme (unico uso
        // reale a oggi, `section.styleOverlayOpacity`, `0 ≤ x ≤ 1`).
        if (spec.min !== undefined && spec.max !== undefined) {
          if (value < spec.min || value > spec.max) {
            return invalid('range', { constraint: [spec.min, spec.max], actual: value });
          }
        }
        return;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') return invalid('type');
        return;
      }
      case 'enum': {
        if (spec.responsive) {
          this.validateResponsiveEnumValue(value, propName, path, type, spec, errors);
          return;
        }
        if (typeof value !== 'string') return invalid('type');
        if (!isEnumTokenAllowed(value, spec.values))
          return invalid('enum', { constraint: [...spec.values] });
        return;
      }
      case 'url': {
        if (typeof value !== 'string') return invalid('type');
        // `maxLength` si verifica qui, prima della sanitizzazione: `url` non
        // passa da `sanitize-html` (SPEC-F02 § 2.3.7), quindi il valore letto
        // è già quello persistito (ADR-21 § 3, correzione T3).
        if (spec.maxLength !== undefined) {
          const actual = codePointLength(value);
          if (actual > spec.maxLength)
            return invalid('maxLength', { constraint: spec.maxLength, actual });
        }
        if (!isAllowedUrl(value)) return invalid('urlScheme');
        return;
      }
      case 'mediaRef': {
        if (typeof value !== 'string') return invalid('type');
        if (!GUID_PATTERN.test(value)) return invalid('guidFormat');
        return;
      }
      case 'pageRef': {
        // Stessa validazione di forma di `mediaRef` (16 hex): nessuna
        // verifica di esistenza/pubblicazione della Pagina a scrittura, la
        // risoluzione è a valle nella pipeline SSR (ADR-52 § 3/§ 4).
        if (typeof value !== 'string') return invalid('type');
        if (!GUID_PATTERN.test(value)) return invalid('guidFormat');
        return;
      }
      case 'color': {
        if (typeof value !== 'string') return invalid('type');
        if (!HEX_COLOR_PATTERN.test(value)) return invalid('format');
        return;
      }
      case 'cssClassName': {
        if (typeof value !== 'string') return invalid('type');
        if (!isValidCssClassName(value)) return invalid('format');
        return;
      }
      case 'htmlId': {
        if (typeof value !== 'string') return invalid('type');
        if (!CSS_IDENTIFIER_TOKEN_PATTERN.test(value)) return invalid('format');
        return;
      }
      case 'unitValue': {
        this.validateUnitValue(value, propName, path, type, spec, errors);
        return;
      }
      case 'border': {
        this.validateBorder(value, propName, path, type, errors);
        return;
      }
      case 'shadow': {
        this.validateShadow(value, propName, path, type, errors);
        return;
      }
      /* istanbul ignore next -- `PropKind` è un'unione chiusa: nessun altro caso possibile a compile time. */
      default: {
        // Exhaustiveness check: se un `kind` nuovo viene aggiunto a PropSpec
        // senza aggiornare questo switch, il progetto non compila più qui.
        const exhaustive: never = spec;
        return exhaustive;
      }
    }
  }

  /**
   * Valida il ramo per-breakpoint di un `EnumPropSpec` con `responsive: true`
   * (ADR-29 § 2/§ 4). Nessun `reason` nuovo: l'envelope malformato (valore non
   * oggetto, `default` mancante, chiave fuori dall'elenco chiuso) produce
   * `reason: 'type'` sul path della prop; un token fuori da `spec.values` su
   * una singola voce produce `reason: 'enum'` sul path **della voce**
   * (`…props.styleSpaceBefore.tablet`). La verifica del token è condivisa con
   * il ramo scalare tramite `isEnumTokenAllowed`.
   */
  private validateResponsiveEnumValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: EnumPropSpec,
    errors: BlockValidationError[],
  ): void {
    const isEnvelopeShapeValid =
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, 'default') &&
      Object.keys(value).every((key) =>
        RESPONSIVE_BREAKPOINTS.includes(key as ResponsiveBreakpointName),
      );

    if (!isEnvelopeShapeValid) {
      errors.push({
        code: 'BLOCK_PROP_INVALID',
        details: { path, type, prop: propName, kind: spec.kind, reason: 'type' },
      });
      return;
    }

    const envelope = value as Record<ResponsiveBreakpointName, unknown>;
    for (const breakpoint of RESPONSIVE_BREAKPOINTS) {
      if (!Object.prototype.hasOwnProperty.call(envelope, breakpoint)) continue;
      if (!isEnumTokenAllowed(envelope[breakpoint], spec.values)) {
        errors.push({
          code: 'BLOCK_PROP_INVALID',
          details: {
            path: `${path}.${breakpoint}`,
            type,
            prop: propName,
            kind: spec.kind,
            reason: 'enum',
            constraint: [...spec.values],
          },
        });
      }
    }
  }

  /** Spinge un errore `BLOCK_PROP_INVALID` con `path` esplicito — usato dai `kind` a valore oggetto per puntare al campo interno colpevole (ADR-38). */
  private pushPropInvalid(
    errors: BlockValidationError[],
    path: string,
    type: string,
    prop: string,
    kind: PropKind,
    reason: BlockPropInvalidReason,
    extra?: { constraint?: number | string[] | [number, number]; actual?: number },
  ): void {
    errors.push({
      code: 'BLOCK_PROP_INVALID',
      details: { path, type, prop, kind, reason, ...extra },
    });
  }

  /**
   * Valida `kind: 'unitValue'` (ADR-38 § 2): oggetto `{value, unit}`, mai
   * libero — `value` dentro `[spec.min, spec.max]`, `unit` dentro
   * `spec.units`. Forma diversa da `{value,unit}` → `reason: 'type'` sul
   * path della prop, non sui sotto-campi.
   */
  private validateUnitValue(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    spec: UnitValuePropSpec,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['value', 'unit'])) {
      this.pushPropInvalid(errors, path, type, propName, 'unitValue', 'type');
      return;
    }

    const numericValue = value.value;
    if (typeof numericValue !== 'number' || Number.isNaN(numericValue)) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'unitValue', 'type');
    } else if (numericValue < spec.min || numericValue > spec.max) {
      this.pushPropInvalid(errors, `${path}.value`, type, propName, 'unitValue', 'range', {
        constraint: [spec.min, spec.max],
        actual: numericValue,
      });
    }

    const unit = value.unit;
    if (typeof unit !== 'string' || !spec.units.includes(unit as LengthUnit)) {
      this.pushPropInvalid(errors, `${path}.unit`, type, propName, 'unitValue', 'enum', {
        constraint: [...spec.units],
      });
    }
  }

  /** Valida `kind: 'border'` (ADR-38 § 3): oggetto a 4 campi fissi, ogni campo vincolato. */
  private validateBorder(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['width', 'style', 'color', 'radius'])) {
      this.pushPropInvalid(errors, path, type, propName, 'border', 'type');
      return;
    }

    const { width, style, color, radius } = value;

    if (typeof width !== 'number' || Number.isNaN(width)) {
      this.pushPropInvalid(errors, `${path}.width`, type, propName, 'border', 'type');
    } else if (width < BORDER_WIDTH_RANGE[0] || width > BORDER_WIDTH_RANGE[1]) {
      this.pushPropInvalid(errors, `${path}.width`, type, propName, 'border', 'range', {
        constraint: BORDER_WIDTH_RANGE,
        actual: width,
      });
    }

    if (typeof style !== 'string' || !BORDER_STYLES.includes(style as BorderStyle)) {
      this.pushPropInvalid(errors, `${path}.style`, type, propName, 'border', 'enum', {
        constraint: [...BORDER_STYLES],
      });
    }

    if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
      this.pushPropInvalid(errors, `${path}.color`, type, propName, 'border', 'format');
    }

    if (typeof radius !== 'number' || Number.isNaN(radius)) {
      this.pushPropInvalid(errors, `${path}.radius`, type, propName, 'border', 'type');
    } else if (radius < BORDER_RADIUS_RANGE[0] || radius > BORDER_RADIUS_RANGE[1]) {
      this.pushPropInvalid(errors, `${path}.radius`, type, propName, 'border', 'range', {
        constraint: BORDER_RADIUS_RANGE,
        actual: radius,
      });
    }
  }

  /** Valida `kind: 'shadow'` (ADR-38 § 4): oggetto a 5 campi fissi, ogni campo numerico vincolato da un intervallo fisso. */
  private validateShadow(
    value: unknown,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): void {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ['x', 'y', 'blur', 'spread', 'color'])) {
      this.pushPropInvalid(errors, path, type, propName, 'shadow', 'type');
      return;
    }

    const { x, y, blur, spread, color } = value;
    const numericFields: Array<[string, unknown, [number, number]]> = [
      ['x', x, SHADOW_OFFSET_RANGE],
      ['y', y, SHADOW_OFFSET_RANGE],
      ['blur', blur, SHADOW_BLUR_RANGE],
      ['spread', spread, SHADOW_SPREAD_RANGE],
    ];
    for (const [field, fieldValue, range] of numericFields) {
      if (typeof fieldValue !== 'number' || Number.isNaN(fieldValue)) {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'shadow', 'type');
      } else if (fieldValue < range[0] || fieldValue > range[1]) {
        this.pushPropInvalid(errors, `${path}.${field}`, type, propName, 'shadow', 'range', {
          constraint: range,
          actual: fieldValue,
        });
      }
    }

    if (typeof color !== 'string' || !HEX_COLOR_PATTERN.test(color)) {
      this.pushPropInvalid(errors, `${path}.color`, type, propName, 'shadow', 'format');
    }
  }
}

/** Vero se `value` è un oggetto semplice (mai `null`, mai un array) — guardia comune ai `kind` a valore oggetto (ADR-38). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Vero se le chiavi di `value` sono un sottoinsieme esatto di `keys` — nessuna chiave estranea ammessa in un `kind` a forma fissa (ADR-38). */
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/**
 * Verifica `kind: 'cssClassName'` (ADR-38 § 5): 1–3 token spazio-separati,
 * ciascuno conforme a `CSS_IDENTIFIER_TOKEN_PATTERN`, somma ≤ 100 caratteri.
 * Spazi multipli o ai bordi producono token vuoti, che il pattern respinge.
 */
function isValidCssClassName(value: string): boolean {
  if (value.length === 0 || value.length > CSS_CLASS_NAME_MAX_LENGTH) return false;
  const tokens = value.split(' ');
  if (tokens.length > CSS_CLASS_NAME_MAX_TOKENS) return false;
  return tokens.every((token) => CSS_IDENTIFIER_TOKEN_PATTERN.test(token));
}

/**
 * Verifica se `value` è un token ammesso della lista `values` di un
 * `EnumPropSpec` — condivisa fra il ramo scalare e il ramo per breakpoint di
 * `case 'enum'` (ADR-29 § 4: "la verifica del token in una funzione sola
 * usata da entrambi i percorsi").
 */
function isEnumTokenAllowed(value: unknown, values: readonly string[]): value is string {
  return typeof value === 'string' && values.includes(value);
}

/** Lunghezza in code point Unicode (non byte, non unità UTF-16) — SPEC-F02-blocchi.md § 1.4. */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** Forme ammesse per `kind: 'url'` (SPEC-F02-blocchi.md § 3.6). Nessun protocol-relative, nessuna relativa senza barra iniziale, nessuno schema fuori dall'elenco. */
function isAllowedUrl(value: string): boolean {
  return (
    ABSOLUTE_URL_PATTERN.test(value) ||
    MAILTO_URL_PATTERN.test(value) ||
    ROOT_RELATIVE_URL_PATTERN.test(value)
  );
}
