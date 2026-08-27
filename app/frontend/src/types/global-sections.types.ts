/**
 * Tipi del modulo Sezioni Globali (F06, ADR-40). Stesso principio di
 * `pages.types.ts`: riuso diretto degli schemi generati da OpenAPI
 * (`types/api.types.ts`), tipi locali solo per ciò che lo swagger non
 * esprime (query params dell'elenco, etichette di UI).
 */
import type { components } from './api.types';
import type { PaginationParams } from './common.types';

/** Rappresentazione admin di una Sezione Globale — riuso diretto dello schema generato. */
export type GlobalSectionRecord = components['schemas']['GlobalSectionDto'];

/** Payload di creazione — riuso diretto dello schema generato. */
export type CreateGlobalSectionPayload = components['schemas']['CreateGlobalSectionDto'];

/**
 * Payload di aggiornamento — riuso diretto. `version` è obbligatoria (lock
 * ottimistico): un valore obsoleto produce `409 GLOBAL_SECTION_VERSION_CONFLICT`,
 * mai un overwrite silenzioso.
 */
export type UpdateGlobalSectionPayload = components['schemas']['UpdateGlobalSectionDto'];

/**
 * Slot di layout pubblico (ADR-40). Derivato dallo schema generato invece di
 * riscritto: l'unione dei tre valori resta l'unica fonte di verità del backend
 * (`GlobalSectionLayoutSlot` in `common/enums.ts`).
 */
export type GlobalSectionLayoutSlot = GlobalSectionRecord['layoutSlot'];

/** I tre slot, nell'ordine in cui si presentano nella UI. */
export const GLOBAL_SECTION_LAYOUT_SLOTS: GlobalSectionLayoutSlot[] = ['none', 'header', 'footer'];

/** Etichette IT degli slot (tabella, select, badge). */
export const LAYOUT_SLOT_LABELS: Record<GlobalSectionLayoutSlot, string> = {
  none: 'Nessuno',
  header: 'Header',
  footer: 'Footer',
};

/** Colori dei badge di slot: assegnato = colorato, `none` = neutro. */
export const LAYOUT_SLOT_COLORS: Record<GlobalSectionLayoutSlot, string> = {
  none: 'gray',
  header: 'blue',
  footer: 'grape',
};

/** Parametri di query dell'elenco (`GET /app/global-sections`). */
export type GlobalSectionsQueryParams = PaginationParams;

/**
 * Corpo di errore del modulo, come normalizzato da `AllExceptionsFilter`. I
 * `code` che questa UI distingue esplicitamente:
 * - `GLOBAL_SECTION_VERSION_CONFLICT` — la riga è cambiata sotto le mani (409);
 * - `GLOBAL_SECTION_LAYOUT_SLOT_TAKEN` — lo slot è già occupato da un'altra
 *   Sezione attiva (409, vincolo di unicità parziale a DB, ADR-40);
 * - `GLOBAL_SECTION_SLUG_DUPLICATE` — slug già in uso fra le righe attive (409).
 */
export interface GlobalSectionsErrorData {
  message?: string;
  code?: string;
  details?: { path?: string };
}
