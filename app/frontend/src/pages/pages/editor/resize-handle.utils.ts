/**
 * Logica pura delle maniglie di resize generiche su props `kind: 'unitValue'`
 * (SPEC-F04-super-elementor.md § 4.2, ADR-71-resize-handles-unita-dinamiche.md § "Decisione"
 * punti 1-2/5-6). Nessun DOM, nessun React — stesso principio di `container-resize.utils.ts`
 * (§ commento di testa di quel file), qui generalizzato a qualunque prop `unitValue` limitata
 * alle due unità che una maniglia trascinabile sa rappresentare in modo diretto (`px`/`%`,
 * ADR-71 punto 2), invece del solo `container.styleFlexBasis` (`'%'` fissa).
 *
 * `container-resize.utils.ts` resta invariato e non viene sostituito da questo file: la
 * maniglia esistente continua a leggerlo. Questo modulo serve `ResizeHandle.tsx`, il nuovo
 * componente generico collegato in aggiunta (ADR-71, task T4/T6 dell'esito RFC-F04e, `SPEC-F04-super-elementor.md`
 * § 4.2/4.3), per le props `unitValue` di ridimensionamento diretto e i quattro margini per
 * lato (`button`/`heading`/`richText`/`image`).
 *
 * `ADR-82-container-unificato-grid-flex.md` § "Decisione" punto 1 sostituisce, per
 * `container` `v: 2`, le vecchie `styleWidth`/`styleHeight` con `boxedWidth`/`minHeight`
 * (stesso `kind: 'unitValue'`, intervalli e unità propri — `boxedWidth` resta `px`/`%`,
 * `minHeight` dichiara `px`/`vh`: quest'ultima non pilotabile da questa maniglia, che si ferma
 * a `RESIZE_HANDLE_UNITS`, quindi `resolveResizePropSpec('container', 'minHeight')` risolve a
 * sole unità `px`). `image` continua a dichiarare `styleWidth`/`styleHeight` invariate (prop
 * proprie, non toccate da `ADR-82`) ma resta comunque esclusa da ogni maniglia trascinabile in
 * quanto widget foglia (`ADR-73`, vedi sotto).
 */
import { BLOCK_TYPES } from '../../../types/blocks.types';

/**
 * Le sole due unità che una maniglia trascinata col mouse sa rappresentare in modo diretto e
 * non ambiguo (ADR-71 § "Decisione" punto 2): `px` diretto, `%` relativo al contenitore
 * padre. Un sottoinsieme fisso di `LengthUnit` (`blocks.types.ts`), non un'estensione.
 */
export const RESIZE_HANDLE_UNITS = ['px', '%'] as const;

/** Una delle due unità pilotabili da una maniglia (vedi {@link RESIZE_HANDLE_UNITS}). */
export type ResizeHandleUnit = (typeof RESIZE_HANDLE_UNITS)[number];

/**
 * Nome di una delle sei props coperte da questo round (ADR-71 § "Decisione" punto 3).
 * `boxedWidth`/`minHeight`: prop di `container` `v: 2` (`ADR-82` § "Decisione" punto 1,
 * sostituiscono le `styleWidth`/`styleHeight` di `container` `v: 1`).
 */
export type ResizeHandlePropName =
  | 'boxedWidth'
  | 'minHeight'
  | 'styleMarginTop'
  | 'styleMarginBottom'
  | 'styleMarginLeft'
  | 'styleMarginRight';

/** Asse geometrico del gesto: orizzontale per larghezza/margini laterali, verticale per altezza/margini verticali. */
export type ResizeHandleAxis = 'horizontal' | 'vertical';

/** Valore composto di `kind: 'unitValue'` ristretto alle due unità pilotabili da una maniglia. */
export interface UnitValue {
  value: number;
  unit: ResizeHandleUnit;
}

/**
 * Intervallo e unità ammesse per una prop, lette dal registro (mai due copie del numero nel
 * codebase, stesso principio di `resolveContainerWidthSpec`). `units` è già ristretto alle
 * sole unità che questo componente sa pilotare — può essere un sottoinsieme proprio di
 * `prop.units` (es. `image.styleWidth` dichiara anche `'vw'` nel registro, ADR-58: qui non
 * compare, ma la prop resta comunque utilizzabile con `px`/`%`, ADR-71 § "Decisione" punto 2,
 * ultima frase — nessuna validazione/blocco delle altre unità già eventualmente salvate).
 */
export interface ResizePropSpec {
  min: number;
  max: number;
  units: readonly ResizeHandleUnit[];
}

/**
 * Widget foglia esclusi da qualunque maniglia di resize trascinabile sul canvas, parità
 * Elementor Pro (ADR-73-rimozione-maniglie-resize-widget-foglia.md § "Decisione" punto 1):
 * il ridimensionamento di questi quattro tipi avviene sempre tramite l'ispettore, mai per
 * trascinamento diretto. `container` non è incluso — non è un widget foglia (ha figli), le
 * sue maniglie (`styleFlexBasis` via `ContainerResizeHandle`, `styleWidth`/`styleHeight` via
 * questa stessa funzione) restano invariate (ADR-73 § "Decisione" punto 2). Unico punto di
 * verità: nessuna seconda lista duplicata in `EditorBlockWrapper.tsx` o `ResizeHandle.tsx`.
 */
const LEAF_BLOCK_TYPES_WITHOUT_RESIZE_HANDLE: readonly string[] = [
  'heading',
  'richText',
  'image',
  'button',
];

/**
 * Risolve `{min, max, units}` dal registro generato per `(blockType, propName)`, o `null` se
 * `blockType` è un widget foglia escluso dalla maniglia (ADR-73), se la prop non è dichiarata,
 * non è `kind: 'unitValue'`, non dichiara `min`/`max` numerici, o non ammette nessuna delle due
 * unità pilotabili da una maniglia — in ognuno di questi casi la maniglia corrispondente non si
 * monta (stesso principio di `CONTAINER_WIDTH_SPEC !== null`/`showContainerResizeHandle` in
 * `EditorBlockWrapper.tsx`).
 */
export function resolveResizePropSpec(
  blockType: string,
  propName: ResizeHandlePropName,
): ResizePropSpec | null {
  if (LEAF_BLOCK_TYPES_WITHOUT_RESIZE_HANDLE.includes(blockType)) return null;
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === blockType);
  const prop = descriptor?.props.find((entry) => entry.name === propName);
  if (!prop || prop.kind !== 'unitValue') return null;
  if (typeof prop.min !== 'number' || typeof prop.max !== 'number') return null;
  const units = RESIZE_HANDLE_UNITS.filter((unit) => prop.units?.includes(unit));
  if (units.length === 0) return null;
  return { min: prop.min, max: prop.max, units };
}

/**
 * Verso in cui il movimento del puntatore lungo il proprio asse fa CRESCERE il valore della
 * prop (ADR-71 § "Decisione" punto 5: "delta in pixel dal movimento del puntatore"; il verso
 * stesso è una scelta di linguaggio visivo dell'editor, non dello schema — stesso principio
 * del punto 5, prima frase). `1`: muoversi nel verso positivo delle coordinate del viewport
 * (destra per l'orizzontale, basso per il verticale) allarga il valore — comportamento del
 * lato "finale" di un box (`boxedWidth`/`minHeight`, stesso verso della maniglia esistente
 * di `container.styleFlexBasis`; `styleMarginBottom`/`styleMarginRight`, dove trascinare la
 * maniglia più lontano dal blocco, cioè verso il basso/destra, allarga quel margine). `-1`:
 * verso opposto, per i lati "iniziali" del box (`styleMarginTop`/`styleMarginLeft`, dove
 * trascinare la maniglia più lontano dal blocco è andare verso l'alto/sinistra).
 */
export function resolveResizeDirection(propName: ResizeHandlePropName): 1 | -1 {
  return propName === 'styleMarginTop' || propName === 'styleMarginLeft' ? -1 : 1;
}

/**
 * Converte un delta in pixel del puntatore nell'unità attiva della prop: diretto per `px`,
 * relativo a `parentSize` (in px, letto da `getBoundingClientRect()` del contenitore padre)
 * per `%` (ADR-71 § "Decisione" punto 5, seconda frase). `parentSize <= 0` non è convertibile
 * in una percentuale significativa: nessun delta.
 */
export function pixelDeltaToUnitDelta(
  deltaPx: number,
  unit: ResizeHandleUnit,
  parentSize: number,
): number {
  if (unit === 'px') return deltaPx;
  if (parentSize <= 0) return 0;
  return (deltaPx / parentSize) * 100;
}

/**
 * Valore arrotondato a un decimale e riportato dentro `[spec.min, spec.max]` — stesso
 * principio di `clampContainerWidthPercent`: un valore fuori range non deve mai raggiungere
 * `updateBlockPropsAction` (ADR-71 § "Decisione" punto 5, ultimo capoverso). Il validator
 * server-side resta comunque l'autorità finale (ADR-21) — questo clamping è solo UX.
 */
export function clampResizeValue(value: number, spec: Pick<ResizePropSpec, 'min' | 'max'>): number {
  if (!Number.isFinite(value)) return spec.min;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(spec.max, Math.max(spec.min, rounded));
}

/**
 * Valore già presente sulla prop, o `null` se assente/di forma diversa da quella attesa o di
 * un'unità che questa maniglia non pilota (es. `'vw'` salvato in precedenza tramite
 * l'ispettore): nessuna interpretazione tollerante, stesso principio di
 * `readContainerWidthPercent` — un valore in un'unità non pilotabile non viene convertito a
 * occhio, il chiamante ricade sul proprio valore di partenza di default.
 */
export function readUnitValue(
  value: unknown,
  allowedUnits: readonly ResizeHandleUnit[],
): UnitValue | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { value?: unknown; unit?: unknown };
  if (typeof candidate.unit !== 'string') return null;
  if (!allowedUnits.includes(candidate.unit as ResizeHandleUnit)) return null;
  if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) return null;
  return { value: candidate.value, unit: candidate.unit as ResizeHandleUnit };
}

/** Valore da persistere sulla prop, nella forma composta di `kind: 'unitValue'`. */
export function toUnitValue(value: number, unit: ResizeHandleUnit): UnitValue {
  return { value, unit };
}

/** Etichetta del badge di trascinamento: un decimale, mai `50.0px` dove basta `50px`. */
export function formatResizeBadge(value: number, unit: ResizeHandleUnit): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${unit}`;
}

/**
 * Antenato DOM che genera davvero un box lungo l'asse richiesto, a partire dal nodo stesso
 * escluso — stessa esigenza e stesso limite di passi di `resolveLayoutParentWidth`
 * (`container-resize.utils.ts`, vedi il commento di testa di quella funzione per il perché
 * `.childrenArea` va scavalcato), qui generalizzata a entrambi gli assi: larghezza per
 * `'horizontal'`, altezza per `'vertical'`.
 */
export function resolveLayoutParentSize(
  element: HTMLElement | null,
  axis: ResizeHandleAxis,
  maxHops = 4,
): number | null {
  let current = element?.parentElement ?? null;
  for (let hop = 0; current && hop < maxHops; hop += 1) {
    const rect = current.getBoundingClientRect();
    const size = axis === 'horizontal' ? rect.width : rect.height;
    if (size > 0) return size;
    current = current.parentElement;
  }
  return null;
}
