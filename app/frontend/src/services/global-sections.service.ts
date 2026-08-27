/**
 * Service per le chiamate API del modulo `app/global-sections` (F06 —
 * Sezioni Globali, ADR-40). Ogni funzione è una chiamata Axios pura:
 * gestione errori/notifiche resta alle pagine chiamanti (CLAUDE.md —
 * Convenzioni frontend), come in `pages.service.ts`.
 */
import api from './api';
import type { Pagination } from '../types/common.types';
import type {
  CreateGlobalSectionPayload,
  GlobalSectionRecord,
  GlobalSectionsQueryParams,
  UpdateGlobalSectionPayload,
} from '../types/global-sections.types';

const GLOBAL_SECTIONS_PREFIX = 'app/global-sections';

/** `GET /app/global-sections` — elenco paginato (soglia `Manager`+, nessuna ownership per riga). */
export async function fetchGlobalSections(
  params: GlobalSectionsQueryParams,
): Promise<Pagination<GlobalSectionRecord>> {
  const { data } = await api.get<Pagination<GlobalSectionRecord>>(GLOBAL_SECTIONS_PREFIX, {
    params,
  });
  return data;
}

/** `GET /app/global-sections/:guid` — dettaglio, albero di blocchi incluso. */
export async function fetchGlobalSection(guid: string): Promise<GlobalSectionRecord> {
  const { data } = await api.get<GlobalSectionRecord>(`${GLOBAL_SECTIONS_PREFIX}/${guid}`);
  return data;
}

/**
 * `POST /app/global-sections` — crea una Sezione Globale. `layoutSlot` assente
 * ⇒ `none` lato server: una Sezione nasce non innestata.
 */
export async function createGlobalSection(
  payload: CreateGlobalSectionPayload,
): Promise<GlobalSectionRecord> {
  const { data } = await api.post<GlobalSectionRecord>(GLOBAL_SECTIONS_PREFIX, payload);
  return data;
}

/**
 * `PATCH /app/global-sections/:guid` — aggiorna meta-dati e/o contenuto.
 * `payload.version` è obbligatoria (lock ottimistico): `409
 * GLOBAL_SECTION_VERSION_CONFLICT` se non combacia più, `409
 * GLOBAL_SECTION_LAYOUT_SLOT_TAKEN` se lo slot è già occupato da un'altra
 * Sezione attiva, `409 GLOBAL_SECTION_SLUG_DUPLICATE` se lo slug è già in uso.
 */
export async function updateGlobalSection(
  guid: string,
  payload: UpdateGlobalSectionPayload,
): Promise<GlobalSectionRecord> {
  const { data } = await api.patch<GlobalSectionRecord>(
    `${GLOBAL_SECTIONS_PREFIX}/${guid}`,
    payload,
  );
  return data;
}

/** `DELETE /app/global-sections/:guid` — soft-delete (204). */
export async function deleteGlobalSection(guid: string): Promise<void> {
  await api.delete(`${GLOBAL_SECTIONS_PREFIX}/${guid}`);
}
