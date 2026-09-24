/**
 * Contratto comune di storage documenti (ADR-8). `FilesService` dipende solo
 * da questa interfaccia, mai da un driver concreto — la scelta tra
 * `LocalDiskDriver` e `S3CompatibleDriver` avviene in `files.module.ts` in
 * base a `AppConstants.storageDriver`.
 */
export interface StorageDriver {
  /** Salva il blob sotto `key` (chiave generata server-side, mai il nome file originale). */
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  /** Restituisce uno stream leggibile del blob salvato sotto `key`. */
  download(key: string): Promise<NodeJS.ReadableStream>;
  /** Elimina fisicamente il blob salvato sotto `key`. Idempotente: nessun errore se `key` non esiste già (richiesto da ADR-11, il job di cleanup può ritentare sullo stesso blob). */
  delete(key: string): Promise<void>;
}

/** Token DI per iniettare il driver di storage attivo (vedi files.module.ts). */
export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
