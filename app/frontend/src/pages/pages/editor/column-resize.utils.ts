/**
 * Logica pura del ridimensionamento inter-colonna dei nodi `section` a due colonne nel
 * Canvas del Visual Builder: conversione posizione puntatore → uno dei tre stop discreti
 * di `columnRatio` (registro, `kind: 'enum'` fisso: `equal`/`33-66`/`66-33`), formattazione
 * del badge di anteprima. Nessun DOM, nessun React — stessa separazione già usata da
 * `resolveContainerWidthSpec` (`container-resize.utils.ts`): un solo punto in cui il nome e
 * la forma della prop sono scritti (`EditorBlockWrapper.tsx` per il gesto,
 * `useBlockEditorStore.ts` per il commit).
 *
 * A differenza della larghezza di `container` (percentuale continua, `kind: 'unitValue'`),
 * `columnRatio` è un enum a tre valori: il registro non ammette una percentuale libera come
 * 70/30, quindi il gesto qui sotto non calcola una percentuale continua da persistere —
 * calcola solo quale dei tre stop è il più vicino alla posizione del puntatore, e lo
 * persiste inalterato. Una quarta via (percentuale libera) cambierebbe lo schema dichiarato
 * di una prop esistente — vietato senza una nuova ADR e approvazione umana (CLAUDE.md §
 * Ask first), non decisa qui.
 */

/** I tre soli stop che il registro ammette per `columnRatio` (default `'equal'`). */
export const COLUMN_RATIO_VALUES = ['equal', '33-66', '66-33'] as const;
export type ColumnRatioValue = (typeof COLUMN_RATIO_VALUES)[number];

/** Posizione (percentuale della larghezza del contenitore) della linea di confine fra le due colonne, per ciascuno dei tre stop. */
export const COLUMN_RATIO_BOUNDARY_PERCENT: Record<ColumnRatioValue, number> = {
  equal: 50,
  '33-66': 33.333,
  '66-33': 66.667,
};

/** `true` se `value` è uno dei tre stop dichiarati dal registro per `columnRatio`. */
export function isColumnRatioValue(value: unknown): value is ColumnRatioValue {
  return (COLUMN_RATIO_VALUES as readonly unknown[]).includes(value);
}

/** Stop dichiarato sul nodo, o `'equal'` di ripiego — stesso default del registro. */
export function resolveColumnRatio(value: unknown): ColumnRatioValue {
  return isColumnRatioValue(value) ? value : 'equal';
}

/**
 * Enum più vicino fra i tre stop di `columnRatio` in base alla frazione `[0,1]` della
 * larghezza del contenitore raggiunta dal puntatore. Le due soglie tengono ogni stop a una
 * distanza ≥10% dai bordi e dagli altri: il "minimo 10% per colonna" del task è già
 * rispettato dai soli tre valori che il registro ammette, senza bisogno di un clamp
 * aggiuntivo qui.
 */
export function resolveColumnRatioFromFraction(fraction: number): ColumnRatioValue {
  if (fraction < 0.4) return '33-66';
  if (fraction > 0.6) return '66-33';
  return 'equal';
}

/** Etichetta del badge di trascinamento: ripartizione di entrambe le colonne, es. `"33% / 67%"`. */
export function formatColumnRatioBadge(ratio: ColumnRatioValue): string {
  const left = Math.round(COLUMN_RATIO_BOUNDARY_PERCENT[ratio]);
  return `${left}% / ${100 - left}%`;
}
