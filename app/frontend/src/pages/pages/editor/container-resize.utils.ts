/**
 * Logica pura del ridimensionamento orizzontale dei nodi `container` nel Canvas del
 * Visual Builder: lettura della prop di larghezza dal registro, conversione
 * puntatore → percentuale, formattazione del badge. Nessun DOM, nessun React — così la
 * stessa regola è verificabile da un unit test senza montare l'editor, e resta un solo
 * punto in cui il nome e la forma della prop sono scritti (`EditorBlockWrapper.tsx` per il
 * gesto, `useBlockEditorStore.ts` per il commit).
 *
 * La prop di larghezza è ora dichiarata dal registro (`container.block.ts`):
 * `styleFlexBasis`, `kind: 'unitValue'`, unità `%` — l'unica eccezione a "container è
 * layout puro" di ADR-39 § 2 ("Alternative scartate"). {@link resolveContainerWidthSpec}
 * continua a interrogare il registro generato invece di dare `min`/`max` per scontati: il
 * validatore server-side respinge ogni prop non dichiarata con `BLOCK_PROP_NOT_DECLARED`
 * (`block-tree-validator.service.ts` § `validateProps`), quindi un intervallo scritto qui a
 * mano potrebbe divergere da quello che il backend applica davvero e produrre un `400` al
 * salvataggio pur avendo una maniglia visivamente funzionante.
 */
import { BLOCK_TYPES } from '../../../types/blocks.types';

/**
 * Nome atteso della prop che porta la larghezza orizzontale di un `container`, e forma
 * attesa del suo valore: `kind: 'unitValue'` (ADR-38 § 2) con `'%'` fra le unità ammesse —
 * l'unico `kind` del registro capace di esprimere una misura continua dentro un intervallo
 * dichiarato. Una prop con questo nome ma di `kind` diverso non viene usata: sarebbe un
 * omonimo, non questa prop.
 */
export const CONTAINER_WIDTH_PROP = 'styleFlexBasis';

/** Valore composto di `kind: 'unitValue'` ristretto alla percentuale — l'unica unità che il gesto sa produrre. */
export interface ContainerWidthValue {
  value: number;
  unit: '%';
}

/** Intervallo ammesso per la larghezza, letto dal registro (mai due copie del numero nel codebase). */
export interface ContainerWidthSpec {
  min: number;
  max: number;
}

/**
 * Intervallo dichiarato dal registro per la prop di larghezza di `container`, o `null` se
 * il registro non la dichiara (stato attuale — vedi il commento di testa). `null` è il
 * segnale che spegne la maniglia: nessun elemento renderizzato, nessun commit possibile.
 */
export function resolveContainerWidthSpec(): ContainerWidthSpec | null {
  const descriptor = BLOCK_TYPES.find((entry) => entry.type === 'container');
  const prop = descriptor?.props.find((entry) => entry.name === CONTAINER_WIDTH_PROP);
  if (!prop || prop.kind !== 'unitValue') return null;
  if (!prop.units?.includes('%')) return null;
  if (typeof prop.min !== 'number' || typeof prop.max !== 'number') return null;
  return { min: prop.min, max: prop.max };
}

/**
 * Percentuale arrotondata a un decimale e riportata dentro `[min, max]`. Un decimale è la
 * granularità del badge (`33.3%`): arrotondare qui — non solo in fase di visualizzazione —
 * evita che il valore committato porti decimali che l'utente non ha mai visto.
 */
export function clampContainerWidthPercent(percent: number, spec: ContainerWidthSpec): number {
  if (!Number.isFinite(percent)) return spec.min;
  const rounded = Math.round(percent * 10) / 10;
  return Math.min(spec.max, Math.max(spec.min, rounded));
}

/**
 * Percentuale corrispondente alla posizione orizzontale del puntatore: la distanza fra il
 * bordo sinistro del nodo (fisso per tutta la durata del gesto, catturato al
 * `pointerdown`) e il puntatore, rapportata alla larghezza del contenitore padre.
 * @param clientX Ascissa viewport del puntatore.
 * @param originLeft Ascissa viewport del bordo sinistro del nodo ridimensionato.
 * @param parentWidth Larghezza in px del contenitore padre — `0` non è ridimensionabile.
 */
export function containerWidthPercentFromPointer(
  clientX: number,
  originLeft: number,
  parentWidth: number,
  spec: ContainerWidthSpec,
): number | null {
  if (parentWidth <= 0) return null;
  return clampContainerWidthPercent(((clientX - originLeft) / parentWidth) * 100, spec);
}

/**
 * Percentuale già presente sul nodo, o `null` se la prop è assente/di forma diversa da
 * quella attesa. Nessuna interpretazione tollerante: un valore in `px` non è una
 * percentuale e non viene convertito a occhio.
 */
export function readContainerWidthPercent(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { value?: unknown; unit?: unknown };
  if (candidate.unit !== '%') return null;
  if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) return null;
  return candidate.value;
}

/** Valore da persistere sulla prop, nella forma composta di `kind: 'unitValue'`. */
export function toContainerWidthValue(percent: number): ContainerWidthValue {
  return { value: percent, unit: '%' };
}

/** Etichetta del badge di trascinamento: un decimale, mai `50.0%` dove basta `50%`. */
export function formatContainerWidthBadge(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/**
 * Antenato DOM che genera davvero un box, a partire dal nodo stesso escluso. Serve perché
 * il genitore DOM diretto del wrapper di un blocco è `.childrenArea`, dichiarata
 * `display: contents` (`EditorBlockWrapper.module.css`): un elemento senza box, il cui
 * `getBoundingClientRect()` è degenere e non può fare da riferimento per una percentuale.
 * Si risale finché non si incontra una larghezza reale, con un tetto di passi per non
 * arrivare mai fino a `<html>` inseguendo un layout non ancora misurato.
 */
export function resolveLayoutParentWidth(element: HTMLElement | null, maxHops = 4): number | null {
  let current = element?.parentElement ?? null;
  for (let hop = 0; current && hop < maxHops; hop += 1) {
    const width = current.getBoundingClientRect().width;
    if (width > 0) return width;
    current = current.parentElement;
  }
  return null;
}
