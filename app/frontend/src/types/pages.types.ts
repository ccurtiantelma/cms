/**
 * Tipi del modulo Pagine (F01/T7-T8). Riusa, dove possibile, gli schemi
 * generati da OpenAPI (`types/api.types.ts`); aggiunge solo tipi locali di
 * supporto (query params, valori form, correzioni di generazione) come fa
 * `admin.service.ts` per il modulo utenti.
 *
 * Due scostamenti noti rispetto allo swagger generato, entrambi documentati
 * qui invece che aggirati in silenzio:
 * 1. `PageDto.parentGuid` / `publishedAt` / `scheduledAt` sono generati come
 *    `Record<string, never> | null` invece di `string | null`: un limite di
 *    `@nestjs/swagger` nel derivare il tipo TS da `@ApiPropertyOptional({ nullable: true })`
 *    senza `type` esplicito. A runtime il backend restituisce sempre stringa o `null`
 *    (`PageDto` in `app/backend/src/pages/dto/page.dto.ts`) — qui si corregge il tipo.
 * 2. `PageRevisionSummaryDto` (`GET /app/pages/:guid/revisions`) non compare affatto
 *    come schema nominato in `api.types.ts`: gli endpoint che rispondono con
 *    `Pagination<T>` non hanno un `@ApiOkResponse` esplicito lato backend, quindi lo
 *    swagger export non genera il tipo del contenuto (`content?: never`). Il tipo
 *    locale `PageRevisionSummary` sotto è trascritto a mano da
 *    `app/backend/src/pages/dto/page-revision.dto.ts`, non inventato.
 */
import type { components } from './api.types';
import type { PaginationParams } from './common.types';

/** Metadati SEO/GEO di una Pagina — riuso diretto dello schema generato. */
export type PageSeo = components['schemas']['PageSeoDto'];

/** Coppia domanda/risposta della FAQ GEO — riuso diretto dello schema generato. */
export type PageFaqEntry = components['schemas']['PageFaqEntryDto'];

/** Payload di creazione — riuso diretto dello schema generato. */
export type CreatePagePayload = components['schemas']['CreatePageDto'];

/**
 * Payload di aggiornamento bozza (richiede `version` per il lock ottimistico).
 * `parentGuid` corretto in `string | null` — stesso limite di generazione
 * descritto nella nota 1 sopra, qui sullo schema `UpdatePageDto`.
 */
export type UpdatePagePayload = Omit<components['schemas']['UpdatePageDto'], 'parentGuid'> & {
  parentGuid?: string | null;
};

/** Payload di transizione di stato. */
export type ChangeStatusPayload = components['schemas']['ChangeStatusDto'];

/** Dettaglio completo di una Revisione (snapshot immutabile) — riuso diretto. */
export type PageRevisionDetail = components['schemas']['PageRevisionDetailDto'];

/**
 * Token di anteprima (`POST /app/pages/:guid/preview-token`, ADR-25) — riuso diretto.
 * `token` va aperto in `{PUBLIC_SITE_URL}/__preview/:token`, mai persistito lato client.
 */
export type PagePreviewToken = components['schemas']['PagePreviewTokenDto'];

/**
 * Rappresentazione di una Pagina come effettivamente restituita dall'API
 * (`PageDto` corretto — vedi nota 1 sopra).
 */
export type PageRecord = Omit<
  components['schemas']['PageDto'],
  'parentGuid' | 'publishedAt' | 'scheduledAt'
> & {
  parentGuid: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
};

/**
 * Voce di elenco di una Revisione (`GET /app/pages/:guid/revisions`).
 * Tipo locale — vedi nota 2 sopra.
 */
export interface PageRevisionSummary {
  guid: string;
  revisionNumber: number;
  title: string;
  slug: string;
  createdAt: string;
  authorName: string;
}

/** I cinque stati ammessi del ciclo di vita di una Pagina. */
export const PAGE_STATUSES = ['draft', 'review', 'scheduled', 'published', 'archived'] as const;

/** Stato del ciclo di vita di una Pagina. */
export type PageStatus = (typeof PAGE_STATUSES)[number];

/**
 * Transizioni ammesse per stato di partenza — trascritta letteralmente da
 * `app/backend/src/pages/pages.state-machine.ts` (a sua volta da
 * `docs/business-rules.md`). Usata SOLO per abilitare/disabilitare le azioni
 * in UI: la barriera reale resta il backend, che la applica indipendentemente.
 */
export const PAGE_STATUS_TRANSITIONS: Readonly<Record<PageStatus, readonly PageStatus[]>> =
  Object.freeze({
    draft: Object.freeze<PageStatus[]>(['review', 'scheduled', 'published']),
    review: Object.freeze<PageStatus[]>(['draft', 'scheduled', 'published']),
    scheduled: Object.freeze<PageStatus[]>(['draft', 'published', 'archived']),
    published: Object.freeze<PageStatus[]>(['draft', 'archived']),
    archived: Object.freeze<PageStatus[]>(['draft', 'published']),
  });

/** Etichette IT per badge/stato in UI. */
export const PAGE_STATUS_LABELS: Record<PageStatus, string> = {
  draft: 'Bozza',
  review: 'In revisione',
  scheduled: 'Programmata',
  published: 'Pubblicata',
  archived: 'Archiviata',
};

/** Colori Mantine per badge di stato. */
export const PAGE_STATUS_COLORS: Record<PageStatus, string> = {
  draft: 'gray',
  review: 'yellow',
  scheduled: 'cyan',
  published: 'green',
  archived: 'dark',
};

/** Filtri/parametri di query di `GET /app/pages`. */
export interface PagesQueryParams extends PaginationParams {
  status?: PageStatus;
  locale?: string;
}

/** Corpo strutturato di errore normalizzato da `AllExceptionsFilter`. */
export interface PagesErrorData {
  message?: string | string[];
  code?: string;
  details?: {
    transition?: string;
    path?: string;
  };
}
