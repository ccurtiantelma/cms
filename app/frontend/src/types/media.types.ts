/**
 * Tipi della Media Library (RFC-F05/F09 § 2 — "DTO del file").
 *
 * I nomi dei campi ricalcano `FileMetadataDto` del backend
 * (`app/backend/src/files/dto/file-metadata.dto.ts`), non una versione
 * "ripulita" lato client: rinominarli qui creerebbe due vocabolari per la
 * stessa riga di `files`, e il primo `openapi:types` li rimetterebbe in
 * disaccordo. In particolare l'identità è `guid` e mai `id` (`CLAUDE.md`
 * § Divieti assoluti: nessun id numerico nelle URL), e la dimensione è
 * `sizeBytes` — il suffisso dichiara l'unità.
 */
import type { PaginationParams } from './common.types';

/** Valore di `entity` che marca una riga di `files` come media editoriale (ADR-27 § 2). */
export const PAGE_MEDIA_ENTITY = 'page-media';

/**
 * Metadati pubblici di un file caricato. Mai `storageKey`/`checksumSha256`:
 * sono dettagli interni del driver di storage e il backend non li espone (ADR-8).
 */
export interface MediaFileRecord {
  /** Identificatore pubblico, 16 esadecimali. È il valore scritto nella prop `mediaRef`. */
  guid: string;
  /** Nome file originale — solo display, mai un path fisico. */
  originalName: string;
  /** MIME dichiarato dal client all'upload; l'autorità resta la firma sui byte (ADR-27 § 3). */
  mimeType: string;
  sizeBytes: number;
  /**
   * Dimensioni lette dagli header raster all'upload (RFC § 3). `null` per i
   * non-raster e per ogni riga caricata prima della feature: non è "zero", è
   * "non misurato", e la griglia deve reggere entrambi i casi.
   */
  width: number | null;
  height: number | null;
  /**
   * URL pubblico derivato server-side (`api/v1/public/media/:guid`), `null` se
   * la riga non è servibile pubblicamente.
   *
   * **Il frontend non lo consuma**: il `src` di un media si compone in un solo
   * punto, `resolveMediaSrc()` di `components/blocks/media-url.ts`, condiviso
   * fra `app/frontend` e `app/public-site` (ADR-27 § 6). Il campo resta nel
   * contratto per i consumatori API fuori dai due workspace Vite.
   */
  url: string | null;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
}

/**
 * Filtri dell'elenco media, oltre alla paginazione standard `?p=&i=&q=&o=&d=`.
 * `type` e non `interface`: `usePaginatedList` vincola i filtri extra a
 * `Record<string, unknown>`, che un'interfaccia non soddisfa (nessun index
 * signature implicito).
 */
export type MediaListFilters = {
  /** Dominio di appartenenza; la libreria dell'editor passa sempre `page-media`. */
  entity?: string;
  /** Filtro di prefisso sul MIME, es. `image/`. */
  mimePrefix?: string;
};

/** Parametri completi di `GET api/v1/app/files`. */
export type MediaListParams = PaginationParams & MediaListFilters;
