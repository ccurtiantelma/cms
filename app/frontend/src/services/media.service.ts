/**
 * Service per le chiamate API della Media Library (`app/files`, RFC-F05/F09 § 1).
 * Ogni funzione è una chiamata Axios pura: la gestione errori/notifiche resta
 * ai chiamanti (vedi CLAUDE.md — Convenzioni frontend), come in `pages.service.ts`.
 *
 * Non esiste una rotta `app/files/upload`: l'upload è il `POST app/files` già in
 * servizio per lo storage documenti (ADR-8). Una seconda rotta con la stessa
 * semantica sarebbe un doppione con due punti di applicazione dello stesso
 * limite di dimensione (RFC § 1, punto di firma N5).
 */
import api from './api';
import type { Pagination } from '../types/common.types';
import type {
  MediaFileRecord,
  MediaListParams,
  MediaTransformRequest,
  MediaTransformResult,
} from '../types/media.types';
import { PAGE_MEDIA_ENTITY } from '../types/media.types';

const FILES_PREFIX = 'app/files';

/** `GET /app/files` — elenco paginato dei file, con ricerca su nome e filtri `entity`/`mimePrefix`. */
export async function fetchMediaFiles(
  params: MediaListParams,
): Promise<Pagination<MediaFileRecord>> {
  const { data } = await api.get<Pagination<MediaFileRecord>>(FILES_PREFIX, { params });
  return data;
}

/**
 * `POST /app/files` — carica un file come media editoriale.
 *
 * `entity` è fissato a `page-media`: è l'opt-in esplicito che rende la riga
 * leggibile dalla rotta pubblica (ADR-27 § 2). Ometterlo produrrebbe un upload
 * accettato e poi invisibile al sito pubblico — un blocco `image` che punta a
 * un `guid` servito con 404.
 *
 * Nessun `Content-Type` impostato a mano: con un `FormData` axios calcola da sé
 * il boundary multipart, e forzarlo produrrebbe un boundary mancante.
 */
export async function uploadMediaFile(file: File): Promise<MediaFileRecord> {
  const form = new FormData();
  form.append('file', file);
  form.append('entity', PAGE_MEDIA_ENTITY);
  const { data } = await api.post<MediaFileRecord>(FILES_PREFIX, form);
  return data;
}

/**
 * `GET /app/files/:guid/metadata` — metadati di un singolo file, senza toccare
 * lo storage. Il suffisso `/metadata` è necessario perché `GET /app/files/:guid`
 * è già il download in streaming del blob.
 */
export async function fetchMediaMetadata(guid: string): Promise<MediaFileRecord> {
  const { data } = await api.get<MediaFileRecord>(`${FILES_PREFIX}/${guid}/metadata`);
  return data;
}

/** `DELETE /app/files/:guid` — soft-delete (autore o Admin+, `files.service.ts`). */
export async function deleteMediaFile(guid: string): Promise<void> {
  await api.delete(`${FILES_PREFIX}/${guid}`);
}

/**
 * `PATCH /app/files/:guid/focal-point` — aggiorna il punto focale editoriale (ADR-49 § M4),
 * percentuale 0-100. Ritorna i metadati aggiornati (`focalX`/`focalY` inclusi): `MediaCropperModal`
 * li usa per riflettere subito il valore persistito, senza un secondo giro di `fetchMediaMetadata`.
 */
export async function updateFocalPoint(
  guid: string,
  focalX: number,
  focalY: number,
): Promise<MediaFileRecord> {
  const { data } = await api.patch<MediaFileRecord>(`${FILES_PREFIX}/${guid}/focal-point`, {
    focalX,
    focalY,
  });
  return data;
}

/**
 * `POST /app/files/:guid/transform` — accoda la generazione asincrona di una variante (ADR-49):
 * mai eseguita nel path di questa chiamata, il lavoro pixel-level vive nel worker BullMQ
 * (`MediaProcessor`). Ritorna l'id del job accodato, solo a scopo di riscontro in UI.
 */
export async function requestImageTransform(
  guid: string,
  transform: MediaTransformRequest,
): Promise<MediaTransformResult> {
  const { data } = await api.post<MediaTransformResult>(
    `${FILES_PREFIX}/${guid}/transform`,
    transform,
  );
  return data;
}
