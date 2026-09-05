/**
 * Logica pura del ridimensionamento inter-colonna dei nodi `section` a due colonne nel
 * Canvas del Visual Builder: conversione posizione puntatore → uno dei cinque stop discreti
 * di `columnRatio` (registro, `kind: 'enum'` fisso: `equal`/`33-66`/`66-33`/`30-70`/`70-30`,
 * RFC-58), formattazione del badge di anteprima. Nessun DOM, nessun React — stessa
 * separazione già usata da `resolveContainerWidthSpec` (`container-resize.utils.ts`): un solo
 * punto in cui il nome e la forma della prop sono scritti (`EditorBlockWrapper.tsx` per il
 * gesto, `useBlockEditorStore.ts` per il commit).
 *
 * A differenza della larghezza di `container` (percentuale continua, `kind: 'unitValue'`),
 * `columnRatio` è un enum a cinque valori: il registro non ammette una percentuale libera,
 * quindi il gesto qui sotto non calcola una percentuale continua da persistere — calcola solo
 * quale dei cinque stop è il più vicino alla posizione del puntatore, e lo persiste inalterato.
 * Una sesta via (percentuale libera) cambierebbe lo schema dichiarato di una prop esistente —
 * vietato senza una nuova ADR e approvazione umana (CLAUDE.md § Ask first), non decisa qui.
 */

/** I cinque soli stop che il registro ammette per `columnRatio` (default `'equal'`). */
export const COLUMN_RATIO_VALUES = ['equal', '33-66', '66-33', '30-70', '70-30'] as const;
export type ColumnRatioValue = (typeof COLUMN_RATIO_VALUES)[number];

/** Posizione (percentuale della larghezza del contenitore) della linea di confine fra le due colonne, per ciascuno dei cinque stop. */
export const COLUMN_RATIO_BOUNDARY_PERCENT: Record<ColumnRatioValue, number> = {
  equal: 50,
  '33-66': 33.333,
  '66-33': 66.667,
  '30-70': 30,
  '70-30': 70,
};

/** `true` se `value` è uno dei cinque stop dichiarati dal registro per `columnRatio`. */
export function isColumnRatioValue(value: unknown): value is ColumnRatioValue {
  return (COLUMN_RATIO_VALUES as readonly unknown[]).includes(value);
}

/** Stop dichiarato sul nodo, o `'equal'` di ripiego — stesso default del registro. */
export function resolveColumnRatio(value: unknown): ColumnRatioValue {
  return isColumnRatioValue(value) ? value : 'equal';
}

/**
 * Enum più vicino fra i cinque stop di `columnRatio` in base alla frazione `[0,1]` della
 * larghezza del contenitore raggiunta dal puntatore: nearest-neighbor generico su
 * `COLUMN_RATIO_VALUES`, confrontando `fraction` con ciascun `COLUMN_RATIO_BOUNDARY_PERCENT`
 * (riportato a `[0,1]`) e tenendo lo stop a distanza minima — nessuna soglia scritta a mano,
 * cresce con l'enum senza toccare questa funzione a ogni nuovo stop (RFC-58).
 */
export function resolveColumnRatioFromFraction(fraction: number): ColumnRatioValue {
  let nearest: ColumnRatioValue = COLUMN_RATIO_VALUES[0];
  let smallestDistance = Number.POSITIVE_INFINITY;
  for (const value of COLUMN_RATIO_VALUES) {
    const distance = Math.abs(fraction - COLUMN_RATIO_BOUNDARY_PERCENT[value] / 100);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearest = value;
    }
  }
  return nearest;
}

/** Etichetta del badge di trascinamento: ripartizione di entrambe le colonne, es. `"33% / 67%"`. */
export function formatColumnRatioBadge(ratio: ColumnRatioValue): string {
  const left = Math.round(COLUMN_RATIO_BOUNDARY_PERCENT[ratio]);
  return `${left}% / ${100 - left}%`;
}
