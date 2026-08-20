import { Injectable } from '@nestjs/common';
import { BlockDefinition } from '../block-definition.types';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../block-registry';
import { EnumPropSpec, PropSpec, RESPONSIVE_BREAKPOINTS, ResponsiveBreakpointName } from '../prop-spec.types';
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
    if (!allowedHere.includes(node.type)) {
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
      extra?: { constraint?: number | string[]; actual?: number },
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
        if (!isEnumTokenAllowed(value, spec.values)) return invalid('enum', { constraint: [...spec.values] });
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
      Object.keys(value).every((key) => RESPONSIVE_BREAKPOINTS.includes(key as ResponsiveBreakpointName));

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
