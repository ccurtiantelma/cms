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
import { useActiveBreakpoint, useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { resolveGridOutlineColumnCount } from './grid-outline.utils';

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

/**
 * Direzione flex di default quando `layout.direction` non è impostata: `row` per un contenitore
 * che ospita altri contenitori (righe/colonne create dai preset di struttura, che non scrivono
 * `layout`), `column` per uno che ospita widget (impilati). Il legacy `flexDirection.default`
 * vince se presente.
 */
export function resolveDefaultDirection(node: {
  props: Record<string, unknown>;
  children: readonly { type: string }[];
}): 'row' | 'column' {
  const legacy = (node.props.flexDirection as { default?: unknown } | undefined)?.default;
  if (legacy === 'row' || legacy === 'column') return legacy;
  return node.children.some((child) => child.type === 'container') ? 'row' : 'column';
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
  defaultDirection?: 'row' | 'column';
  /**
   * Valore grezzo di `layout` (`kind: 'layout'`, `container` v2, ADR-82), passato **solo**
   * dal canvas editor (`resolve-container-props.ts`) per l'overlay "Contorno griglia"
   * (T-container-layout-tab) — mai dal sito pubblico (`BlockRenderer.tsx` non lo valorizza,
   * lo stile reale resta sempre e solo il Runtime Style Bridge via `data-canvas-style-id`,
   * vedi il commento di testa del file). Facoltativo: la sua assenza equivale a "nessun
   * overlay", mai a un errore.
   */
  layout?: unknown;
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
  defaultDirection,
  layout,
}: ContainerProps) {
  // "Contorno griglia" (`ContainerLayoutTab.tsx`, Accordion "Elementi"): stato UI puramente
  // effimero, selettore mirato per id — un cambio dell'overlay su un altro nodo non
  // ri-renderizza questo componente (CLAUDE.md § dominio CMS, "selettori Zustand mirati").
  // Zero impatto sul markup salvato/pubblico: non scrive alcuna prop, solo un `<div>`
  // decorativo `aria-hidden` in più nel DOM del canvas admin.
  const isGridOutlineVisible = useBlockEditorStore(
    (state) => id !== undefined && state.gridOutlineNodeId === id,
  );
  const activeBreakpoint = useActiveBreakpoint();
  const gridOutlineColumnCount = isGridOutlineVisible
    ? resolveGridOutlineColumnCount(layout, activeBreakpoint)
    : null;
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
  if (contentWidth === 'boxed') {
    // `boxedWidth` è opzionale (nessun default, `container.block.ts`): un container "boxed"
    // senza un valore esplicito contava finora sull'ancestor `.pageBoxed` (il wrapper di
    // pagina, `max-width: var(--theme-layout-boxed-width)`) per apparire vincolato — un
    // no-op mascherato dalla coincidenza che quasi tutto vive dentro `.pageBoxed`. Un
    // ancestor "full" che ora esce da `.pageBoxed` (sotto) smaschera il caso: qui ricade
    // sulla stessa variabile tema, mai un valore magico duplicato.
    style.maxWidth = isUnitValue(boxedWidth)
      ? unitValueToCss(boxedWidth)
      : 'var(--theme-layout-boxed-width, none)';
    style.marginLeft = 'auto';
    style.marginRight = 'auto';
  }
  if (overflow === 'visible' || overflow === 'hidden' || overflow === 'auto') {
    style.overflow = overflow;
  }

  // Overlay "Contorno griglia": bande verticali equidistanti (`repeating-linear-gradient`),
  // una ogni `100% / gridOutlineColumnCount` — puramente decorativo, `aria-hidden`, mai nel
  // markup salvato/pubblico (il sito pubblico non monta mai questo ramo, `gridOutlineNodeId`
  // non esiste fuori dallo store dell'editor).
  const gridOutlineOverlay =
    gridOutlineColumnCount !== null
      ? createElement('div', {
          className: styles.gridOutline,
          'aria-hidden': 'true',
          style: {
            backgroundImage: `repeating-linear-gradient(to right, var(--grid-outline-color, rgba(217, 26, 122, 0.5)) 0, var(--grid-outline-color, rgba(217, 26, 122, 0.5)) 1px, transparent 1px, transparent calc(100% / ${gridOutlineColumnCount}))`,
          },
        })
      : null;

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
      'data-default-direction': defaultDirection,
      // Aggancio per il posizionamento a livello radice (`PageView.css`/`EditorCanvas.module.css`,
      // ADR-98): un root container `full` occupa tutte le tracce della griglia di pagina, senza
      // margini negativi. Nessun effetto su un container annidato (nessuna regola lo consuma).
      'data-content-width': contentWidth === 'full' ? 'full' : 'boxed',
      style: Object.keys(style).length > 0 ? style : undefined,
    },
    gridOutlineOverlay,
    children,
  );
}
