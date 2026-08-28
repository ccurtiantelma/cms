import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sanitizeHtml from 'sanitize-html';
import { BlockRegistry, DEFAULT_BLOCK_REGISTRY } from '../../blocks/block-registry';
import { PropSpec } from '../../blocks/prop-spec.types';
import { ValidatableBlockNode } from '../../blocks/validator/validatable-node.types';
import { BlockValidationError } from '../../blocks/validator/validation-result.types';
import {
  BASIC_SANITIZE_OPTIONS,
  BLOCK_COLOR_PROP_NAMES,
  INLINE_SANITIZE_OPTIONS,
} from './block-sanitize-profiles.config';

/**
 * Vero per un carattere di controllo C0 o DEL (code point 0x7f), esclusi tab
 * (0x09) e newline (0x0a) — SPEC-F02-blocchi.md par. 2.3.5. Espresso su code
 * point numerici e non su una classe regex con escape di controllo, perché
 * questi ultimi sopravvivono male alla scrittura/serializzazione del file
 * come caratteri di controllo letterali.
 */
function isStrippedControlChar(codePoint: number): boolean {
  const TAB = 0x09;
  const LF = 0x0a;
  const DEL = 0x7f;
  if (codePoint === TAB || codePoint === LF) return false;
  return codePoint <= 0x1f || codePoint === DEL;
}

/** Rimuove i caratteri di controllo da scartare in `plainText` (SPEC-F02-blocchi.md par. 2.3.5), preservando tab e newline. */
function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((ch) => !isStrippedControlChar(ch.codePointAt(0) ?? 0))
    .join('');
}

/** Esito della sanitizzazione: l'albero pulito più eventuali violazioni di `maxLength` (kind `richText`/`plainText`, verificate dopo la pulizia). */
export interface BlockTreeSanitizationResult {
  tree: ValidatableBlockNode[];
  errors: BlockValidationError[];
}

/**
 * Sanitizzazione **per `kind`**, guidata dal descrittore di ogni prop
 * (ADR-21 § 4, SPEC-F02-blocchi.md § 2, PLAN-F02 T3). Sostituisce, per
 * l'albero dei blocchi, la sanitizzazione cieca di F01
 * (`TreeSanitizerService`, che resta per `draftSeo`).
 *
 * **Ordine della pipeline (ADR-21 § 3, correzione T3)**: invocato **dopo**
 * `BlockTreeValidatorService` (tipo, annidamento, props dichiarate, e per
 * `url` anche `maxLength` — invariato dalla sanitizzazione) e **prima**
 * della persistenza. Assume un albero già strutturalmente conforme al
 * registro: un `type` sconosciuto o una prop non dichiarata qui sono un bug
 * del chiamante, non input da segnalare — il nodo si copia inalterato
 * piuttosto che duplicare una validazione già fatta a monte.
 *
 * `richText` e `plainText` sono gli unici due `kind` la cui pulizia può
 * accorciare la stringa (`sanitize-html`, rimozione caratteri di controllo):
 * per loro il `maxLength` si verifica **qui**, sul valore che verrà
 * effettivamente scritto — non nel validator (ADR-21 § 3, correzione T3).
 * `number`, `boolean`, `enum`, `mediaRef` non passano da `sanitize-html`
 * (SPEC-F02 § 2.3.4); `url` non è HTML e non è toccato da questo stadio
 * (SPEC-F02 § 2.3.7). `unitValue`/`border`/`shadow`/`cssClassName`/`htmlId`
 * (ADR-38) sono validati per forma/intervallo/pattern **solo** dal
 * validator, a monte di questo stadio: nessuno dei cinque è testo HTML,
 * quindi nessuno passa da `sanitize-html` qui, ma la correttezza di questo
 * stadio per i tre `kind` a valore oggetto dipende interamente dal validator
 * — un buco lì non verrebbe intercettato qui (ADR-38 § 7).
 */
@Injectable()
export class BlockPropSanitizerService {
  private readonly logger = new Logger(BlockPropSanitizerService.name);

  /** Sanitizza un intero albero di blocchi radice. Non muta l'input: ritorna una copia. */
  sanitizeTree(
    blocks: ValidatableBlockNode[],
    registry: BlockRegistry = DEFAULT_BLOCK_REGISTRY,
  ): BlockTreeSanitizationResult {
    const errors: BlockValidationError[] = [];
    const tree = blocks.map((node, index) =>
      this.sanitizeNode(node, `blocks[${index}]`, registry, errors),
    );
    return { tree, errors };
  }

  private sanitizeNode(
    node: ValidatableBlockNode,
    path: string,
    registry: BlockRegistry,
    errors: BlockValidationError[],
  ): ValidatableBlockNode {
    const definition = registry.definitions.get(node.type);
    const props: Record<string, unknown> = { ...node.props };

    if (definition) {
      for (const [propName, value] of Object.entries(node.props)) {
        const spec = definition.props[propName];
        if (!spec) {
          if (BLOCK_COLOR_PROP_NAMES.includes(propName as (typeof BLOCK_COLOR_PROP_NAMES)[number])) {
            props[propName] = value;
          }
          continue;
        }
        props[propName] = this.sanitizeProp(
          value,
          spec,
          propName,
          `${path}.props.${propName}`,
          node.type,
          errors,
        );
      }
    }

    const children = node.children.map((child, index) =>
      this.sanitizeNode(child, `${path}.children[${index}]`, registry, errors),
    );

    return { ...node, props, children };
  }

  private sanitizeProp(
    value: unknown,
    spec: PropSpec,
    propName: string,
    path: string,
    type: string,
    errors: BlockValidationError[],
  ): unknown {
    if (typeof value !== 'string') {
      // Tipo già segnalato dal validator (`reason: 'type'`): questo stadio
      // non prova a sanitizzare un valore che non è una stringa.
      return value;
    }

    if (spec.kind === 'richText') {
      const cleaned = this.sanitizeHtmlValue(value, spec.profile);
      this.checkMaxLength(cleaned, spec.maxLength, propName, path, type, 'richText', errors);
      return cleaned;
    }

    if (spec.kind === 'plainText') {
      const cleaned = stripControlChars(value);
      this.checkMaxLength(cleaned, spec.maxLength, propName, path, type, 'plainText', errors);
      return cleaned;
    }

    if (spec.kind === 'url') {
      // `url`: nessuna trasformazione, `maxLength` verificato dal validator (SPEC-F02 § 2.3.7).
      return value;
    }

    if (spec.kind === 'color') {
      // `color` (ADR-33 § 3/§ 6): il pattern esadecimale è già autorevole nel
      // validator (`BlockTreeValidatorService`), stessa divisione di
      // responsabilità di `url` — questo stadio non ripassa il valore da
      // `sanitize-html` e non lo rivalida, lo restituisce invariato.
      return value;
    }

    // Altri `kind` (`number`, `boolean`, `enum`, `mediaRef`, `cssClassName`,
    // `htmlId`): nessuna trasformazione, nessun passaggio da `sanitize-html`
    // (SPEC-F02 § 2.3.4). `unitValue`/`border`/`shadow` sono oggetti, non
    // stringhe: escono già dalla guardia `typeof value !== 'string'` in
    // testa al metodo, invariati — validati per forma solo dal validator
    // (ADR-38 § 7).
    return value;
  }

  private sanitizeHtmlValue(value: string, profile: 'inline' | 'basic'): string {
    const options = profile === 'basic' ? BASIC_SANITIZE_OPTIONS : INLINE_SANITIZE_OPTIONS;
    try {
      return sanitizeHtml(value, options);
    } catch (err) {
      this.logger.warn(`Albero non sanitizzabile: ${(err as Error).message}`);
      throw new BadRequestException({
        message: 'Contenuto non sanitizzabile.',
        code: 'CONTENT_SANITIZATION_FAILED',
      });
    }
  }

  /** `maxLength` in code point Unicode, sul valore già pulito (SPEC-F02-blocchi.md § 1.4). */
  private checkMaxLength(
    value: string,
    maxLength: number | undefined,
    propName: string,
    path: string,
    type: string,
    kind: 'richText' | 'plainText',
    errors: BlockValidationError[],
  ): void {
    if (maxLength === undefined) return;
    const actual = Array.from(value).length;
    if (actual > maxLength) {
      errors.push({
        code: 'BLOCK_PROP_INVALID',
        details: {
          path,
          type,
          prop: propName,
          kind,
          reason: 'maxLength',
          constraint: maxLength,
          actual,
        },
      });
    }
  }
}
