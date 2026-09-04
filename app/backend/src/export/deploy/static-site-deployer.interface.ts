/**
 * Contratto di deployment della superficie statica (RFC-44, Decisione 8):
 * `ExportProcessor` dipende solo da questa interfaccia, mai da un adapter
 * concreto o da `node:fs` direttamente — stesso disaccoppiamento già in uso
 * per `StorageDriver` (ADR-8). Un solo metodo di scrittura e uno di
 * rimozione, entrambi su un percorso *relativo* alla destinazione: la
 * radice (cartella locale oggi, storage distribuito domani, ADR-53 § 4) è
 * responsabilità dell'adapter, mai del chiamante.
 *
 * `S3Deployer`/`CloudflarePagesDeployer` restano fuori da questo file:
 * attivare un provider esterno introduce credenziali e superficie di
 * costo/compliance che `CLAUDE.md` § Ask first blocca senza un'ADR
 * dedicata. Non si aggiungono nemmeno come stub (RFC-44 § Decisione 8: uno
 * stub non testabile darebbe un falso senso di completamento).
 */
export interface StaticSiteDeployer {
  /** Scrive `content` sul percorso relativo, creando le sottodirectory necessarie e sovrascrivendo in modo sicuro un file già esistente. */
  write(relativePath: string, content: Buffer | string): Promise<void>;
  /** Rimuove il file al percorso relativo. Idempotente: nessun errore se il file non esiste già. */
  remove(relativePath: string): Promise<void>;
}

/** Token DI per iniettare l'adapter di deployment attivo (vedi export.module.ts). */
export const STATIC_SITE_DEPLOYER = Symbol('STATIC_SITE_DEPLOYER');
