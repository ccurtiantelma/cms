import { Injectable, Logger } from '@nestjs/common';
import * as csstree from 'css-tree';
import { CssDeclarationBlock } from '../../blocks/compiler/css-declaration.types';
import { MAX_NODES } from '../../pages/content-tree';

/**
 * Sanitizzazione server-side AST di `kind: 'css'` (ADR-78 § "Decisione"
 * punti 1-6, 9-10 — approvata 2026-09-18) e difesa in profondità sul CSS
 * generato da `toCss()` (S1.2). Solo `kind: 'css'` è nello scope di questo
 * Sub-Task (S5.1): `kind: 'html'` (ADR-78 punti 7-8) non è toccato.
 *
 * Parsing sempre con `css-tree` (mai regex su stringa non parsata, ADR-78
 * punto 1): una allowlist di proprietà verificata su un CSS non parsato è
 * aggirabile con commenti, escape Unicode o annidamento malformato.
 */

/** Insieme chiuso dei `reason` di fallimento (SPEC-propkind-v2.md § 3.15, ADR-78 punto 6). */
export type CssSanitizeFailureReason = 'atRule' | 'selector' | 'property' | 'url' | 'parse';

/** Esito negativo di una sanitizzazione: mai una riparazione parziale (ADR-78 punto 6). */
export interface CssSanitizeFailure {
  reason: CssSanitizeFailureReason;
  detail: string;
}

/** Esito di `sanitizeUserCss`/`sanitizeGeneratedCss`: `css` è vuota quando `failure` è presente. */
export interface CssSanitizeOutcome {
  css: string;
  failure?: CssSanitizeFailure;
}

/** Pseudo-classi ammesse per l'auto-scoping `&:pseudo` (ADR-78 punto 2). Elenco chiuso. */
const ALLOWED_PSEUDO_CLASSES: ReadonlySet<string> = new Set([
  'hover',
  'focus',
  'active',
  'focus-within',
  'disabled',
]);

/**
 * Allowlist di proprietà, non blocklist (ADR-78 punto 3), raggruppata per le
 * categorie del superset dichiarato ("dimensioni, colori, tipografia,
 * flexbox/grid, transform, filter, transition" — SPEC-propkind-v2.md §
 * 3.9/3.10, ADR-78 punto 3). **Scelta implementativa non letterale**: né
 * l'ADR né lo SPEC enumerano i singoli nomi di proprietà in un unico posto,
 * quindi questo elenco è una scelta conservativa fatta qui, non trascritta
 * da un documento. Esclusioni deliberate, documentate singolarmente:
 * - `border*`/`border-radius`/`box-shadow`/`background*`/`position`/`top`/
 *   `right`/`bottom`/`left`/`z-index`/`content`/`cursor`: hanno già un
 *   `PropKind` strutturato dedicato nel registro (`border`, `radius`,
 *   `shadow`, `background`, `position`) — un secondo percorso via CSS libero
 *   duplicherebbe la superficie di validazione, e per `position`/`z-index`
 *   abiliterebbe overlay non controllati (vettore di attacco UI).
 * - Proprietà custom `--*`: non rientrano in nessuna delle 6 categorie
 *   (verificate a parte con `csstree.isCustomProperty`, non da questo elenco).
 * - Nessuna variante con prefisso vendor (`-webkit-*`, `-moz-*`, ecc.): non
 *   dichiarata da nessuna delle 6 categorie, e `-moz-binding` è
 *   esplicitamente vietata da ADR-78 punto 3 — restringere a zero prefissi
 *   evita di dover enumerare eccezioni caso per caso.
 */
const DIMENSION_PROPERTIES = [
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'box-sizing',
  'overflow',
  'overflow-x',
  'overflow-y',
  'aspect-ratio',
  'gap',
  'row-gap',
  'column-gap',
] as const;

const COLOR_PROPERTIES = [
  'color',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
  'caret-color',
  'accent-color',
  'text-decoration-color',
] as const;

const TYPOGRAPHY_PROPERTIES = [
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'word-spacing',
  'line-height',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-style',
  'text-transform',
  'text-align',
  'vertical-align',
  'white-space',
  'word-break',
  'overflow-wrap',
  'text-overflow',
  'direction',
] as const;

const FLEXBOX_GRID_PROPERTIES = [
  'display',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'justify-items',
  'justify-self',
  'align-items',
  'align-content',
  'align-self',
  'order',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-column',
  'grid-column-start',
  'grid-column-end',
  'grid-row',
  'grid-row-start',
  'grid-row-end',
  'grid-area',
  'grid-auto-flow',
  'grid-auto-columns',
  'grid-auto-rows',
  'place-items',
  'place-content',
  'place-self',
] as const;

const TRANSFORM_PROPERTIES = [
  'transform',
  'transform-origin',
  'transform-style',
  'perspective',
  'perspective-origin',
  'backface-visibility',
] as const;

const FILTER_PROPERTIES = ['filter', 'backdrop-filter'] as const;

const TRANSITION_PROPERTIES = [
  'transition',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
] as const;

/** Unione delle 7 categorie sopra, in minuscolo (case-insensitive sul nome proprietà). */
const ALLOWED_CSS_PROPERTIES: ReadonlySet<string> = new Set(
  [
    ...DIMENSION_PROPERTIES,
    ...COLOR_PROPERTIES,
    ...TYPOGRAPHY_PROPERTIES,
    ...FLEXBOX_GRID_PROPERTIES,
    ...TRANSFORM_PROPERTIES,
    ...FILTER_PROPERTIES,
    ...TRANSITION_PROPERTIES,
  ].map((prop) => prop.toLowerCase()),
);

/**
 * Difesa in profondità contro CSS legacy IE `expression()`, indipendente dal
 * nome della proprietà (ADR-78 punto 3): scansiona il **valore** generato di
 * ogni dichiarazione, case-insensitive.
 */
const EXPRESSION_PATTERN = /expression\s*\(/i;

/** 16 caratteri esadecimali minuscoli/maiuscoli — stesso formato guid del resto del registro. */
const HEX16 = '[0-9a-fA-F]{16}';

/**
 * `public/media/<guid>`, opzionalmente prefissato da `/` o `api/v1/`
 * (ADR-78 punto 4). Nessuna estensione richiesta (i media pubblici sono
 * risolti per id, non per path a file).
 */
const MEDIA_PUBLIC_PATTERN = new RegExp(`^(?:/|api/v1/)?public/media/${HEX16}$`);

/**
 * `assets/media/<guid>.<ext>`, stesso prefisso opzionale del pattern
 * pubblico (ADR-78 punto 4) — varianti statiche esportate dei media.
 */
const MEDIA_ASSETS_PATTERN = new RegExp(`^(?:/|api/v1/)?assets/media/${HEX16}\\.[A-Za-z0-9]+$`);

/**
 * Vero se `rawUrl` (il contenuto letterale di `url(...)`, già decodificato da
 * `css-tree`) referenzia un media pubblico interno del `FilesModule` (ADR-78
 * punto 4). Rifiuta sempre uno scheme esplicito (`http:`, `https:`,
 * `javascript:`, ecc.) o un path protocol-relative (`//host/...`) prima di
 * verificare il pattern — query string e hash sono ignorati (non fanno parte
 * del path). Funzione pura, esportata per essere testata direttamente.
 */
export function isAllowedMediaUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false; // scheme esplicito (http:, https:, javascript:, data:, ...)
  if (trimmed.startsWith('//')) return false; // protocol-relative
  const path = trimmed.split(/[?#]/, 1)[0];
  return MEDIA_PUBLIC_PATTERN.test(path) || MEDIA_ASSETS_PATTERN.test(path);
}

/** Una singola dichiarazione già validata, pronta per la serializzazione in output. */
interface ParsedDeclaration {
  property: string;
  valueText: string;
  important: boolean;
}

function failureOutcome(reason: CssSanitizeFailureReason, detail: string): CssSanitizeOutcome {
  return { css: '', failure: { reason, detail } };
}

/** Descrizione leggibile di un nodo AST per i messaggi di errore (best-effort, non lancia). */
function describeNode(node: csstree.CssNode): string {
  if (node.type === 'Raw') return node.value.trim();
  try {
    return csstree.generate(node);
  } catch {
    return node.type;
  }
}

/** Prima violazione `url()` trovata nel sottoalbero di un valore, o `null` se nessuna. */
function findUrlViolation(valueNode: csstree.CssNode): string | null {
  let violation: string | null = null;
  csstree.walk(valueNode, {
    visit: 'Url',
    enter(urlNode) {
      if (violation !== null) return;
      if (!isAllowedMediaUrl(urlNode.value)) {
        violation = urlNode.value;
      }
    },
  });
  return violation;
}

/** Serializza un elenco di dichiarazioni già validate, un `property: value;` per riga. */
function renderDeclarationsBlock(declarations: ParsedDeclaration[]): string {
  return declarations
    .map((decl) => `  ${decl.property}: ${decl.valueText}${decl.important ? ' !important' : ''};\n`)
    .join('');
}

/**
 * Valida esattamente un selettore `&` + pseudo-classe dalla lista chiusa
 * (`&:hover`, `&:focus`, ...): nessuna classe/id/tag/attributo/combinatore
 * oltre ai due nodi previsti (ADR-78 punto 2, grammatica concreta lasciata
 * aperta dall'ADR — scelta implementativa, non spec letterale). Ritorna il
 * nome della pseudo-classe (minuscolo) se valido, altrimenti `null`.
 */
function matchUserPseudoSelector(selector: csstree.Selector): string | null {
  const children = selector.children.toArray();
  if (children.length !== 2) return null;
  const [first, second] = children;
  if (first.type !== 'NestingSelector') return null;
  if (second.type !== 'PseudoClassSelector') return null;
  if (second.children !== null) return null; // no argomenti (es. :not(...) non ammesso)
  const name = second.name.toLowerCase();
  return ALLOWED_PSEUDO_CLASSES.has(name) ? name : null;
}

@Injectable()
export class CssTreeSanitizerService {
  private readonly logger = new Logger(CssTreeSanitizerService.name);

  /**
   * Sanitizza il CSS scritto dall'utente per `kind: 'css'` (ADR-78 punti
   * 1-6): parsing AST, auto-scoping obbligatorio sotto
   * `[data-block="<blockId>"]`, allowlist di proprietà, rifiuto integrale su
   * qualunque violazione (mai riparazione parziale).
   *
   * **Grammatica concreta (scelta implementativa, ADR-78 non la fissa)**: se
   * il valore non contiene alcuna `{` è trattato come lista di dichiarazioni
   * "nude" (`context: 'declarationList'`) e avvolto per intero sotto
   * `[data-block="<blockId>"] { ... }`. Altrimenti è trattato come uno
   * stylesheet completo (`context: 'stylesheet'`, `onParseError` rilancia —
   * mai riparazione silenziosa di CSS malformato): ogni regola top-level
   * (anche dentro `@media`) deve avere selettore esattamente `&` + una
   * pseudo-classe della lista chiusa, riscritto in output in
   * `[data-block="<blockId>"]:<pseudo>`. Un valore che mischia dichiarazioni
   * nude e regole nello stesso testo (es. `color:red; &:hover{...}`) cade
   * nel secondo ramo e viene rifiutato, perché lì una dichiarazione nuda a
   * livello radice non è una regola valida — conseguenza accettata di questa
   * scelta grammaticale, non testata esplicitamente dall'ADR.
   */
  sanitizeUserCss(css: string, blockId: string): CssSanitizeOutcome {
    if (css.includes('{')) {
      return this.sanitizeUserStylesheet(css, blockId);
    }
    return this.sanitizeBareDeclarations(css, blockId);
  }

  /**
   * Difesa in profondità sul CSS generato da `toCss()` (S1.2): serializza i
   * `CssDeclarationBlock[]` già prodotti dal chiamante in una stringa CSS e
   * la fa passare per lo stesso sanitizzatore AST (allowlist proprietà, `url()`,
   * `@-rule`) — **senza** il vincolo di selettore `&`, perché qui il
   * selettore è già `[data-block="..."]` generato dal compilatore, non
   * riscritto. `toCss()` non dovrebbe mai produrre output pericoloso per
   * costruzione: questa funzione verifica comunque, perché un bug nel
   * compilatore non deve poter iniettare CSS pericoloso solo perché non
   * passa dalla sanitizzazione utente.
   */
  sanitizeGeneratedCss(blocks: CssDeclarationBlock[]): CssSanitizeOutcome {
    const serialized = this.serializeDeclarationBlocks(blocks);
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(serialized, {
        context: 'stylesheet',
        onParseError: (err) => {
          throw err;
        },
      });
    } catch (err) {
      return failureOutcome(
        'parse',
        `CSS generato non interpretabile (bug del compilatore?): ${(err as Error).message}`,
      );
    }
    const styleSheet = ast as csstree.StyleSheet;
    const result = this.renderTopLevel(styleSheet.children, null);
    if ('failure' in result) return { css: '', failure: result.failure };
    return { css: result.css };
  }

  /**
   * Tree-shaking: rimuove dal CSS aggregato le regole (anche dentro
   * `@media`) il cui `data-block="<id>"` non è in `liveBlockIds`. Guardia
   * difensiva: un numero di id superiore a {@link MAX_NODES} indica un bug
   * del chiamante (l'albero a monte è già garantito ≤1500 nodi da
   * `assertValidContentTreeShape()`), non un input da correggere qui.
   */
  purgeUnreferencedRules(css: string, liveBlockIds: ReadonlySet<string>): string {
    if (liveBlockIds.size > MAX_NODES) {
      throw new Error(
        `purgeUnreferencedRules(): liveBlockIds.size (${liveBlockIds.size}) supera MAX_NODES (${MAX_NODES}) — l'albero a monte dovrebbe già essere garantito entro il limite da assertValidContentTreeShape(), questo è un bug del chiamante.`,
      );
    }
    if (css.trim().length === 0) return css;

    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(css, { context: 'stylesheet' });
    } catch (err) {
      // Best-effort: il purge è un'ottimizzazione, non un gate di sicurezza
      // (la sanitizzazione è già avvenuta a monte) — un CSS non
      // interpretabile qui è un bug altrove, ma non deve far fallire l'export.
      this.logger.warn(
        `purgeUnreferencedRules(): CSS non interpretabile, nessun purge applicato: ${(err as Error).message}`,
      );
      return css;
    }

    const styleSheet = ast as csstree.StyleSheet;
    const survivors = this.purgeChildren(styleSheet.children, liveBlockIds);
    return survivors.map((node) => csstree.generate(node)).join('\n');
  }

  // ─── Ramo (a): dichiarazioni nude, nessuna `{` nel valore originale ─────

  private sanitizeBareDeclarations(css: string, blockId: string): CssSanitizeOutcome {
    let parseError: Error | null = null;
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(css, {
        context: 'declarationList',
        onParseError: (err) => {
          if (!parseError) parseError = err;
        },
      });
    } catch (err) {
      return failureOutcome('parse', `CSS non interpretabile: ${(err as Error).message}`);
    }
    if (parseError) {
      return failureOutcome('parse', `CSS non interpretabile: ${(parseError as Error).message}`);
    }

    const declarationList = ast as csstree.DeclarationList;
    const result = this.collectDeclarations(declarationList.children);
    if (result.failure) return { css: '', failure: result.failure };

    const body = renderDeclarationsBlock(result.declarations);
    return { css: `[data-block="${blockId}"] {\n${body}}\n` };
  }

  // ─── Ramo (b): stylesheet completo, auto-scoping `&:pseudo` obbligatorio ─

  private sanitizeUserStylesheet(css: string, blockId: string): CssSanitizeOutcome {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(css, {
        context: 'stylesheet',
        onParseError: (err) => {
          throw err;
        },
      });
    } catch (err) {
      return failureOutcome('parse', `CSS non interpretabile: ${(err as Error).message}`);
    }

    const styleSheet = ast as csstree.StyleSheet;
    const result = this.renderTopLevel(styleSheet.children, blockId);
    if ('failure' in result) return { css: '', failure: result.failure };
    return { css: result.css };
  }

  /**
   * Renderizza i figli top-level di uno `StyleSheet`/`Block` di `@media`:
   * ogni figlio deve essere una `Rule` o un `Atrule` `@media` (ricorsivo).
   * `blockId` non `null` ⇒ modalità "CSS utente" (selettore deve essere
   * `&` + pseudo-classe, riscritto in `[data-block="<blockId>"]:<pseudo>`).
   * `blockId === null` ⇒ modalità "CSS generato" (selettore già concreto,
   * non riscritto — solo allowlist proprietà/url verificata sul contenuto).
   */
  private renderTopLevel(
    children: csstree.List<csstree.CssNode>,
    blockId: string | null,
  ): { css: string } | { failure: CssSanitizeFailure } {
    const parts: string[] = [];
    for (const child of children) {
      if (child.type === 'Rule') {
        const result = this.renderRule(child, blockId);
        if ('failure' in result) return result;
        parts.push(result.css);
      } else if (child.type === 'Atrule') {
        const result = this.renderMediaAtrule(child, blockId);
        if ('failure' in result) return result;
        parts.push(result.css);
      } else {
        return {
          failure: {
            reason: 'selector',
            detail: `Elemento CSS non ammesso in questo contesto: "${describeNode(child)}"`,
          },
        };
      }
    }
    return { css: parts.join('') };
  }

  private renderRule(
    rule: csstree.Rule,
    blockId: string | null,
  ): { css: string } | { failure: CssSanitizeFailure } {
    let selectorText: string;

    if (blockId !== null) {
      // Modalità utente: selettore deve essere `&` + pseudo-classe ammessa.
      if (rule.prelude.type !== 'SelectorList') {
        return { failure: { reason: 'selector', detail: 'Selettore non interpretabile.' } };
      }
      const pseudos: string[] = [];
      for (const sel of rule.prelude.children) {
        if (sel.type !== 'Selector') {
          return {
            failure: {
              reason: 'selector',
              detail: `Selettore non ammesso: "${describeNode(sel)}".`,
            },
          };
        }
        const pseudo = matchUserPseudoSelector(sel);
        if (pseudo === null) {
          return {
            failure: {
              reason: 'selector',
              detail: `Selettore "${describeNode(sel)}" non ammesso: solo "&" seguito da una tra :hover, :focus, :active, :focus-within, :disabled.`,
            },
          };
        }
        pseudos.push(pseudo);
      }
      selectorText = pseudos.map((pseudo) => `[data-block="${blockId}"]:${pseudo}`).join(', ');
    } else {
      // Modalità CSS generato: selettore già concreto (`[data-block="..."]`),
      // non riscritto — solo rigenerato in forma canonica.
      selectorText = csstree.generate(rule.prelude);
    }

    const declResult = this.collectDeclarations(rule.block.children);
    if (declResult.failure) return { failure: declResult.failure };

    const body = renderDeclarationsBlock(declResult.declarations);
    return { css: `${selectorText} {\n${body}}\n` };
  }

  private renderMediaAtrule(
    atrule: csstree.Atrule,
    blockId: string | null,
  ): { css: string } | { failure: CssSanitizeFailure } {
    if (atrule.name.toLowerCase() !== 'media') {
      return {
        failure: {
          reason: 'atRule',
          detail: `@${atrule.name} non ammessa: solo @media è nell'allowlist chiusa delle at-rule.`,
        },
      };
    }
    if (!atrule.block) {
      return { failure: { reason: 'atRule', detail: '@media senza blocco di regole.' } };
    }

    const inner = this.renderTopLevel(atrule.block.children, blockId);
    if ('failure' in inner) return inner;

    const mediaQueryText = atrule.prelude ? describeNode(atrule.prelude).trim() : '';
    return { css: `@media ${mediaQueryText} {\n${inner.css}}\n` };
  }

  /**
   * Valida e deduplica un elenco di dichiarazioni (`Block`/`DeclarationList`
   * children): allowlist di proprietà, rifiuto proprietà custom `--*`,
   * scansione `expression(` sul valore, rifiuto `url()` non ammessi. Dedup:
   * a parità di `property` (case-insensitive) nello stesso blocco, mantiene
   * solo l'ultima occorrenza — l'ordine di uscita segue la prima apparizione
   * della proprietà (scelta implementativa: `Map` non risposiziona una
   * chiave già presente quando il suo valore viene aggiornato).
   */
  private collectDeclarations(children: csstree.List<csstree.CssNode>): {
    declarations: ParsedDeclaration[];
    failure?: CssSanitizeFailure;
  } {
    const map = new Map<string, ParsedDeclaration>();
    for (const child of children) {
      if (child.type !== 'Declaration') {
        return {
          declarations: [],
          failure: {
            reason: 'parse',
            detail: `Elemento CSS non ammesso in un blocco di dichiarazioni: "${describeNode(child)}".`,
          },
        };
      }

      const property = child.property;
      const propertyLower = property.toLowerCase();

      if (csstree.isCustomProperty(property) || propertyLower.startsWith('--')) {
        return {
          declarations: [],
          failure: {
            reason: 'property',
            detail: `Proprietà custom "${property}" non ammessa.`,
          },
        };
      }
      if (!ALLOWED_CSS_PROPERTIES.has(propertyLower)) {
        return {
          declarations: [],
          failure: {
            reason: 'property',
            detail: `Proprietà "${property}" non è nell'allowlist consentita.`,
          },
        };
      }

      const valueNode = child.value;
      const valueText = valueNode.type === 'Raw' ? valueNode.value : csstree.generate(valueNode);

      if (EXPRESSION_PATTERN.test(valueText)) {
        return {
          declarations: [],
          failure: {
            reason: 'property',
            detail: `Il valore di "${property}" contiene "expression(", non ammesso.`,
          },
        };
      }

      if (valueNode.type !== 'Raw') {
        const urlViolation = findUrlViolation(valueNode);
        if (urlViolation !== null) {
          return {
            declarations: [],
            failure: {
              reason: 'url',
              detail: `url(${urlViolation}) non ammesso in "${property}": solo un media pubblico interno.`,
            },
          };
        }
      }

      map.set(propertyLower, { property, valueText, important: child.important === true });
    }
    return { declarations: [...map.values()] };
  }

  /** Serializza `CssDeclarationBlock[]` in una stringa CSS grezza, da far ripassare dall'AST sanitizer. */
  private serializeDeclarationBlocks(blocks: CssDeclarationBlock[]): string {
    return blocks
      .map((block) => {
        const body = block.declarations
          .map((decl) => `  ${decl.property}: ${decl.value};\n`)
          .join('');
        const rule = `${block.selector} {\n${body}}\n`;
        return block.mediaQuery ? `@media ${block.mediaQuery} {\n${rule}}\n` : rule;
      })
      .join('');
  }

  /** Filtra ricorsivamente `Rule`/`Atrule(@media)` il cui `data-block` non è in `liveBlockIds`. */
  private purgeChildren(
    children: csstree.List<csstree.CssNode>,
    liveBlockIds: ReadonlySet<string>,
  ): csstree.CssNode[] {
    const survivors: csstree.CssNode[] = [];
    for (const child of children) {
      if (child.type === 'Rule') {
        const selectorText = csstree.generate(child.prelude);
        const match = /data-block="([^"]+)"/.exec(selectorText);
        if (match && !liveBlockIds.has(match[1])) continue; // regola orfana, scartata
        survivors.push(child);
      } else if (child.type === 'Atrule' && child.name.toLowerCase() === 'media' && child.block) {
        const innerSurvivors = this.purgeChildren(child.block.children, liveBlockIds);
        if (innerSurvivors.length === 0) continue; // @media rimasto vuoto dopo il purge, scartato
        const newBlockChildren = new csstree.List<csstree.CssNode>().fromArray(innerSurvivors);
        // Cast pragmatico: css-tree non espone un costruttore tipizzato per un
        // `Atrule` con `block` sostituito — ricostruiamo l'oggetto letterale
        // (stessa forma di `Atrule`) e lo passiamo a `generate()`, che opera
        // per struttura e non per istanza di classe.
        const newAtrule = {
          ...child,
          block: { type: 'Block' as const, loc: child.block.loc, children: newBlockChildren },
        } as unknown as csstree.CssNode;
        survivors.push(newAtrule);
      } else {
        survivors.push(child);
      }
    }
    return survivors;
  }
}
