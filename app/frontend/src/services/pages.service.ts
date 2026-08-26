/**
 * Service per le chiamate API del modulo `app/pages` (F01 — Gestione Pagine).
 * Ogni funzione è una chiamata Axios pura: gestione errori/notifiche resta
 * alle pagine chiamanti (vedi CLAUDE.md — Convenzioni frontend).
 */
import api from './api';
import type { Pagination, PaginationParams } from '../types/common.types';
import type {
  ChangeStatusPayload,
  CreatePagePayload,
  CreateTranslationPayload,
  PagePreviewToken,
  PageRecord,
  PageRevisionDetail,
  PageRevisionSummary,
  PagesQueryParams,
  PageTranslationSummary,
  UpdatePagePayload,
} from '../types/pages.types';

const PAGES_PREFIX = 'app/pages';

/** `GET /app/pages` — elenco paginato (User: solo le proprie righe, ADR-18). */
export async function fetchPages(params: PagesQueryParams): Promise<Pagination<PageRecord>> {
  const { data } = await api.get<Pagination<PageRecord>>(PAGES_PREFIX, { params });
  return data;
}

/** `GET /app/pages/:guid` — dettaglio Pagina, bozza corrente inclusa. */
export async function fetchPage(guid: string): Promise<PageRecord> {
  const { data } = await api.get<PageRecord>(`${PAGES_PREFIX}/${guid}`);
  return data;
}

/** `POST /app/pages` — crea una Pagina in `draft`. */
export async function createPage(payload: CreatePagePayload): Promise<PageRecord> {
  const { data } = await api.post<PageRecord>(PAGES_PREFIX, payload);
  return data;
}

/**
 * `PATCH /app/pages/:guid` — aggiorna la bozza. `payload.version` è
 * obbligatoria (lock ottimistico): `409 PAGE_VERSION_CONFLICT` se non
 * combacia più, `409 PAGE_SLUG_DUPLICATE` se lo slug è già in uso.
 */
export async function updatePage(guid: string, payload: UpdatePagePayload): Promise<PageRecord> {
  const { data } = await api.patch<PageRecord>(`${PAGES_PREFIX}/${guid}`, payload);
  return data;
}

/**
 * `POST /app/pages/:guid/status` — transizione di stato. `scheduledAt` è
 * obbligatorio nel payload quando `status === 'scheduled'`.
 */
export async function changePageStatus(
  guid: string,
  payload: ChangeStatusPayload,
): Promise<PageRecord> {
  const { data } = await api.post<PageRecord>(`${PAGES_PREFIX}/${guid}/status`, payload);
  return data;
}

/**
 * `GET /app/pages/:guid/translations` — righe attive dello stesso gruppo di traduzione
 * (`translationGroupId`), bozze e Pagina `:guid` stessa incluse. Nessun filtro di ownership
 * (stesso principio di `createPageTranslation` — vedi `pages.service.ts` backend): chi può
 * vedere/creare una traduzione può anche listare il gruppo.
 */
export async function fetchPageTranslations(guid: string): Promise<PageTranslationSummary[]> {
  const { data } = await api.get<PageTranslationSummary[]>(`${PAGES_PREFIX}/${guid}/translations`);
  return data;
}

/**
 * `POST /app/pages/:guid/translations` — crea una traduzione in `draft` nello stesso
 * gruppo. `409` se il gruppo ha già una riga in quel locale (corsa fra due editor).
 */
export async function createPageTranslation(
  guid: string,
  payload: CreateTranslationPayload,
): Promise<PageRecord> {
  const { data } = await api.post<PageRecord>(`${PAGES_PREFIX}/${guid}/translations`, payload);
  return data;
}

/** `DELETE /app/pages/:guid` — soft-delete (Admin+). */
export async function deletePage(guid: string): Promise<void> {
  await api.delete(`${PAGES_PREFIX}/${guid}`);
}

/** `GET /app/pages/:guid/revisions` — elenco paginato Revisioni, più recenti prima. */
export async function fetchPageRevisions(
  guid: string,
  params: PaginationParams,
): Promise<Pagination<PageRevisionSummary>> {
  const { data } = await api.get<Pagination<PageRevisionSummary>>(
    `${PAGES_PREFIX}/${guid}/revisions`,
    { params },
  );
  return data;
}

/** `GET /app/pages/:guid/revisions/:revisionGuid` — dettaglio Revisione, snapshot incluso. */
export async function getPageRevision(
  guid: string,
  revisionGuid: string,
): Promise<PageRevisionDetail> {
  const { data } = await api.get<PageRevisionDetail>(
    `${PAGES_PREFIX}/${guid}/revisions/${revisionGuid}`,
  );
  return data;
}

/**
 * `POST /app/pages/:guid/revisions/:revisionGuid/restore` — ripristina una
 * Revisione passata in una NUOVA bozza (Manager+). Non tocca la Revisione
 * online né ripubblica automaticamente.
 */
export async function restorePageRevision(guid: string, revisionGuid: string): Promise<PageRecord> {
  const { data } = await api.post<PageRecord>(
    `${PAGES_PREFIX}/${guid}/revisions/${revisionGuid}/restore`,
  );
  return data;
}

/**
 * `POST /app/pages/:guid/preview-token` — emette un token di anteprima della bozza
 * (JWT dedicato, scadenza 15 minuti, non rinnovabile — ADR-25). Stessa guard
 * RBAC/ownership della modifica della Pagina: `403` su riga altrui o pagina non più in
 * stato `draft`, `404` se non trovata/eliminata. Il token va aperto subito in
 * `{PUBLIC_SITE_URL}/__preview/:token`, mai persistito lato client.
 */
export async function issuePagePreviewToken(guid: string): Promise<PagePreviewToken> {
  const { data } = await api.post<PagePreviewToken>(`${PAGES_PREFIX}/${guid}/preview-token`);
  return data;
}
