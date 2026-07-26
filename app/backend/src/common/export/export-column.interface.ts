/**
 * Definizione di una colonna per l'export di una lista/report (Excel o PDF).
 * Il modulo di dominio verticale la costruisce a partire dalle proprie righe
 * già filtrate con `Utils.applyScopeFilter` (ADR-10) — `ExportService` non
 * conosce alcuna entità di dominio, solo intestazioni e chiavi generiche.
 */
export interface ExportColumn<T> {
  /** Intestazione visibile nella colonna esportata. */
  header: string;
  /** Chiave della riga (`T`) da cui leggere il valore della colonna. */
  key: keyof T;
  /** Larghezza colonna in caratteri (solo Excel), default 20. */
  width?: number;
}
