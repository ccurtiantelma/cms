/**
 * Blocco `container`: `v: 2` (ADR-82-container-unificato-grid-flex.md), sostituisce
 * integralmente `section` come contenitore principale di pagina. Il layout Flexbox/Grid
 * (`layout`, `kind: 'layout'`), lo spaziamento (`padding`/`margin`, `kind: 'spacing'`), il
 * bordo/raggio/ombra/sfondo/posizione/trasformazione/filtro (`kind: 'radius'`/`'position'`/
 * `'transform'`/`'filter'`, più `'border'`/`'shadow'`/`'background'` non ancora implementati
 * dal compilatore, ADR-82 § "Conseguenze") **non sono letti qui**: sono valori liberi PropKind
 * v2, resi dal Runtime Style Bridge (`components/blocks/generateCanvasCss.ts`) via il
 * selettore `[data-canvas-style-id="<id>"]` su questo stesso elemento radice — mai una seconda
 * implementazione locale della stessa conversione valore→CSS (CLAUDE.md, mirror unico).
 *
 * Questo componente resta responsabile solo di ciò che il Runtime Style Bridge non copre:
 * il tag HTML semantico (`tag`, `kind: 'enum'`), gli attributi custom (`htmlId`/`cssClass`,
 * `kind: 'htmlId'`/`'cssClassName'`) e le poche prop scalari semplici non incluse nei 9 `kind`
 * v2 + `layout` (`contentWidth`/`boxedWidth`/`minHeight`/`overflow`/`opacity`) — troppo
 * semplici per giustificare un decimo `kind` dedicato nel compilatore, rese qui con `style`
 * inline mirato (mai un intero foglio di stile duplicato).
 *
 * `id` (il `node.id` strutturale, mai una prop del blocco) è **obbligatorio**: è il valore
 * portato da `data-canvas-style-id`, il bersaglio del CSS generato per questo nodo. Deviazione
 * dichiarata dal selettore `[data-block="<id>"]` di `SPEC-PROPKIND-V2-DETAILS.md` § 10 (pensato
 * per il consumer HTML pubblico) e dall'attributo `data-block-id` già usato da
 * `EditorBlockWrapper.tsx`/`EditorStructureNavigator.tsx` (identità del nodo per la chrome
 * dell'editor, un livello di annidamento più in alto — riusarlo qui applicherebbe due volte
 * ogni dichiarazione `layout`/`spacing` a due elementi annidati, es. `display: grid` sia sul
 * wrapper della chrome sia su questo contenitore, rompendo il layout): vedi il resoconto finale
 * per il dettaglio di questa scelta di design non coperta letteralmente dai documenti.
 */
import { createElement, type CSSProperties, type ReactNode } from 'react';
import styles from './Container.module.css';

/** `tag` (ADR-82 § "Decisione" punto 1): elenco chiuso a 8 nomi, default `'div'`. */
const ALLOWED_TAGS = [
  'div',
  'section',
  'header',
  'footer',
  'article',
  'aside',
  'nav',
  'main',
] as const;
type ContainerTag = (typeof ALLOWED_TAGS)[number];

function resolveTag(value: unknown): ContainerTag {
  return typeof value === 'string' && (ALLOWED_TAGS as readonly string[]).includes(value)
    ? (value as ContainerTag)
    : 'div';
}

/** Forma runtime di un `UnitValue` (`boxedWidth`/`minHeight`, `kind: 'unitValue'`). */
interface UnitValueLike {
  value: number;
  unit: string;
}

function isUnitValue(value: unknown): value is UnitValueLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UnitValueLike).value === 'number' &&
    typeof (value as UnitValueLike).unit === 'string'
  );
}

function unitValueToCss(value: UnitValueLike): string {
  return `${value.value}${value.unit}`;
}

interface ContainerProps {
  /**
   * `node.id` strutturale — vedi il commento di testa del file. Tecnicamente opzionale solo
   * per la compatibilità strutturale con `CONTAINER_COMPONENTS`
   * (`EditorBlockWrapper.tsx`, una mappa `type → componente` con firma comune a ogni
   * contenitore del registro, nessuno degli altri richiede un `id`): entrambi i chiamanti
   * reali (`BlockRenderer.tsx`, `resolveContainerComponentProps`) lo passano sempre.
   */
  id?: string;
  children: ReactNode;
  tag?: unknown;
  contentWidth?: unknown;
  boxedWidth?: unknown;
  minHeight?: unknown;
  overflow?: unknown;
  opacity?: unknown;
  htmlId?: unknown;
  cssClass?: unknown;
}

export default function Container({
  id,
  children,
  tag,
  contentWidth,
  boxedWidth,
  minHeight,
  overflow,
  opacity,
  htmlId,
  cssClass,
}: ContainerProps) {
  const resolvedTag = resolveTag(tag);

  const className = [styles.container, typeof cssClass === 'string' && cssClass ? cssClass : '']
    .filter(Boolean)
    .join(' ');

  const style: CSSProperties = {};
  if (typeof opacity === 'number') {
    style.opacity = opacity;
  }
  if (isUnitValue(minHeight)) {
    style.minHeight = unitValueToCss(minHeight);
  }
  if (contentWidth === 'boxed' && isUnitValue(boxedWidth)) {
    style.maxWidth = unitValueToCss(boxedWidth);
    style.marginLeft = 'auto';
    style.marginRight = 'auto';
  }
  if (overflow === 'visible' || overflow === 'hidden' || overflow === 'auto') {
    style.overflow = overflow;
  }

  // `createElement` invece di JSX (`<Tag>`): `resolvedTag` è solo una stringa di nome-tag
  // ('div'/'section'/...), mai un componente — usare JSX con un identificatore capitalizzato
  // per una stringa dinamica innescherebbe la regola `react-hooks/static-components` (che
  // presume un componente "creato durante il render", non un tag HTML nativo scelto da una
  // prop). `createElement(resolvedTag, ...)` esprime la stessa semantica senza quell'ambiguità.
  return createElement(
    resolvedTag,
    {
      className,
      id: typeof htmlId === 'string' && htmlId ? htmlId : undefined,
      'data-canvas-style-id': id,
      style: Object.keys(style).length > 0 ? style : undefined,
    },
    children,
  );
}
