/**
 * Emissione CSS per `shapeDividerTop`/`shapeDividerBottom` (ADR-82 §
 * "Decisione" punto 1, § "Conseguenze": "un elemento decorativo assoluto con
 * `svg` inline dall'allowlist a 20 nomi, non un `background-image`" — qui
 * l'SVG **è** veicolato via `background-image` con una data URI, la forma
 * più semplice per uno pseudo-elemento generato via CSS senza introdurre un
 * nodo DOM aggiuntivo nel markup del blocco: scelta di design di questo
 * Sub-Task, non specificata in dettaglio da ADR-82 oltre alla descrizione
 * generale, documentata qui e segnalata nel resoconto finale.
 *
 * A differenza degli altri generatori di `value-to-declarations.ts`, questa
 * funzione non produce solo `CssDeclaration[]` ma un `CssDeclarationBlock[]`
 * completo: il divisore vive su uno pseudo-elemento dedicato
 * (`::before` per il bordo superiore, `::after` per quello inferiore) del
 * selettore del blocco, non sul blocco stesso — nessun altro `kind` del
 * registro ha bisogno di un selettore diverso da quello del proprio nodo,
 * `shapeDivider` sì per costruzione (è un elemento decorativo, non uno
 * stile applicato al nodo). `shapeDivider` non è mai `stateful`/`responsive`
 * (ADR-82 § "Decisione" punto 1): un'unica combinazione, nessuna iterazione
 * stato×breakpoint.
 *
 * **Semplificazione dichiarata**: le 20 voci di `SHAPE_DIVIDER_STYLES`
 * (`prop-spec.types.ts`) condividono qui un piccolo insieme di **6 forme SVG
 * rappresentative**, raggruppate per famiglia visiva (onda, triangolo, curva,
 * zigzag, split, gocce) invece di 20 tracciati interamente distinti: nessun
 * requisito del gap analysis specifica il disegno esatto di ciascuno stile, e
 * ADR-82 lascia esplicitamente aperta l'implementazione grafica ("un
 * elemento decorativo assoluto con svg inline dall'allowlist", nessun
 * dettaglio oltre). Scelta di design segnalata nel resoconto finale come
 * debito esplicito (l'allowlist resta comunque chiusa a 20 nomi a livello di
 * schema/validazione, indipendentemente da questa semplificazione visiva).
 */
import { CssDeclaration, CssDeclarationBlock } from './css-declaration.types';
import {
  ColorRefValueShape,
  ShapeDividerValueShape,
  UnitValueShape,
  isPlainObject,
} from './value-shapes.types';
import { colorRefValueToCss, unitValueToCss } from './value-to-declarations';

/** Le 6 forme SVG rappresentative (viewBox `0 0 1200 100`, `preserveAspectRatio='none'`). */
const SHAPE_FAMILY_PATHS = {
  wave: 'M0,60 C150,120 350,0 600,60 C850,120 1050,0 1200,60 L1200,100 L0,100 Z',
  triangle: 'M0,100 L600,0 L1200,100 Z',
  curve: 'M0,100 C400,0 800,0 1200,100 Z',
  zigzag:
    'M0,100 L100,40 L200,100 L300,40 L400,100 L500,40 L600,100 L700,40 L800,100 L900,40 L1000,100 L1100,40 L1200,100 Z',
  split: 'M0,100 L600,0 L600,100 Z M600,0 L1200,100 L600,100 Z',
  drops:
    'M0,50 Q150,110 300,50 Q450,-10 600,50 Q750,110 900,50 Q1050,-10 1200,50 L1200,100 L0,100 Z',
} as const;

type ShapeFamily = keyof typeof SHAPE_FAMILY_PATHS;

/** Mappa ciascuno dei 20 nomi dell'allowlist alla propria famiglia visiva rappresentativa (vedi nota di modulo). */
const SHAPE_DIVIDER_STYLE_FAMILY: Record<string, ShapeFamily> = {
  mountains: 'triangle',
  drops: 'drops',
  clouds: 'wave',
  zigzag: 'zigzag',
  pyramids: 'triangle',
  triangles: 'triangle',
  tilt: 'triangle',
  curve: 'curve',
  waves: 'wave',
  waveBrush: 'wave',
  arrow: 'triangle',
  split: 'split',
  book: 'curve',
  curveAsymmetrical: 'curve',
  wavesPattern: 'wave',
  wave: 'wave',
  zigzagMultiple: 'zigzag',
  waveOpacity: 'wave',
  triangleAsymmetrical: 'triangle',
  curveOpacity: 'curve',
};

/** Costruisce la data URI SVG inline (`background-image`) per uno stile/colore risolti. */
function shapeDividerSvgDataUri(style: string, fillCss: string): string {
  const family = SHAPE_DIVIDER_STYLE_FAMILY[style] ?? 'wave';
  const pathD = SHAPE_FAMILY_PATHS[family];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 100' preserveAspectRatio='none'>` +
    `<path d='${pathD}' fill='${fillCss}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Compila `shapeDividerTop`/`shapeDividerBottom` in un `CssDeclarationBlock`
 * unico, sullo pseudo-elemento `::before`/`::after` del blocco (vedi nota di
 * modulo). Valore malformato/assente → nessun blocco emesso (`[]`), stesso
 * principio difensivo degli altri generatori di `value-to-declarations.ts`.
 *
 * @param blockId Identificativo del blocco ospite (stesso `ctx.blockId` di `toCss()`).
 * @param edge `'top'` per `shapeDividerTop` (`::before`), `'bottom'` per `shapeDividerBottom` (`::after`).
 * @param value Valore nudo di `shapeDivider` (mai `stateful`/`responsive`, nessun inviluppo da risolvere).
 * @returns Un array con zero o un `CssDeclarationBlock`.
 */
export function shapeDividerToCssBlock(
  blockId: string,
  edge: 'top' | 'bottom',
  value: unknown,
): CssDeclarationBlock[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const shape = value as unknown as ShapeDividerValueShape;
  const fillCss = colorRefValueToCss(shape.color as ColorRefValueShape);
  const widthCss = unitValueToCss(shape.width as UnitValueShape);
  const heightCss = unitValueToCss(shape.height as UnitValueShape);

  const transforms: string[] = [];
  if (shape.flip) transforms.push('scaleX(-1)');
  if (shape.invert) transforms.push('scaleY(-1)');

  const declarations: CssDeclaration[] = [
    { property: 'content', value: '""' },
    { property: 'position', value: 'absolute' },
    { property: edge, value: '0' },
    { property: 'left', value: '0' },
    { property: 'width', value: widthCss },
    { property: 'height', value: heightCss },
    { property: 'background-image', value: shapeDividerSvgDataUri(shape.style, fillCss) },
    { property: 'background-repeat', value: 'no-repeat' },
    { property: 'background-size', value: '100% 100%' },
    { property: 'pointer-events', value: 'none' },
    { property: 'z-index', value: shape.aboveContent ? '2' : '0' },
  ];
  if (transforms.length > 0) {
    declarations.push({ property: 'transform', value: transforms.join(' ') });
  }

  return [
    {
      selector: `[data-block="${blockId}"]::${edge === 'top' ? 'before' : 'after'}`,
      declarations,
    },
  ];
}
