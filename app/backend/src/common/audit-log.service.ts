import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { auditLogEntity } from '../db/schema';
import { Utils } from './utils';

/**
 * Servizio centrale per la registrazione di eventi di sicurezza e amministrazione
 * nella tabella `audit_log`. Copre solo eventi rilevanti (login/logout,
 * impersonificazione, gestione utenti, operazioni di sistema) — non è un log
 * esaustivo di ogni CRUD (già coperto da createdBy/updatedBy).
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  /** Inietta il servizio DB usato per scrivere le voci di audit log. */
  constructor(private readonly db: DbService) {}

  /**
   * Registra un evento di audit. Un fallimento dell'inserimento viene loggato
   * con Winston ma non propagato: l'audit log non deve mai bloccare l'operazione
   * applicativa (login, gestione utenti, ecc.) che lo ha generato.
   * @param userId Autore formale dell'azione (l'utente impersonato, se in corso impersonificazione), o null se non noto.
   * @param action Codice azione (es. 'login', 'logout', 'user.create').
   * @param entity Tipo di entità coinvolta (es. 'user'), opzionale.
   * @param entityId Identificatore (guid) dell'entità coinvolta, opzionale.
   * @param details Dettagli aggiuntivi: oggetto (verrà serializzato in JSON) o stringa, opzionale.
   * @param impersonatedBy Id del SuperAdmin reale, presente solo durante impersonificazione.
   * @param ip Indirizzo IP del chiamante, opzionale.
   */
  async log(
    userId: number | null,
    action: string,
    entity?: string,
    entityId?: string,
    details?: string | Record<string, unknown>,
    impersonatedBy?: number,
    ip?: string,
  ): Promise<void> {
    try {
      await this.db.db.insert(auditLogEntity).values({
        guid: Utils.randomString(16),
        userId,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        details:
          details === undefined
            ? null
            : typeof details === 'string'
              ? details
              : JSON.stringify(details),
        impersonatedBy: impersonatedBy ?? null,
        ip: ip ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Impossibile registrare audit log (action=${action}, userId=${userId}): ${(err as Error).message}`,
      );
    }
  }
}
