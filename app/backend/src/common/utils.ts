import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppUserRoles } from './enums';
import { AuthInfo } from './types';

/** Cost factor bcrypt per l'hashing password. */
const BCRYPT_ROUNDS = 12;

/** Unità di durata supportate da {@link Utils.parseDurationToSeconds}. */
const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

export class Utils {
  /**
   * Hash bcrypt di una password. Da usare per ogni nuova password
   * (creazione utente, attivazione account, reset, cambio password).
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Verifica una password in chiaro contro l'hash bcrypt salvato.
   * @param password Password in chiaro da verificare.
   * @param storedHash Hash bcrypt salvato nel campo `pwd` dell'utente.
   */
  static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    return bcrypt.compare(password, storedHash);
  }

  /**
   * Genera una stringa hex casuale della lunghezza specificata (usata per `guid`,
   * `jti` del JWT e token azione come attivazione/reset password).
   */
  static randomString(length: number): string {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  /**
   * Filtro di visibilità multi-tenant/multi-sede generico.
   * Restituisce il `scopeId` da usare nel WHERE Drizzle, oppure `null` se
   * l'utente ha un ruolo pari o superiore alla soglia elevata (vede tutto).
   * OBBLIGATORIO su ogni query multi-tenant/multi-sede (CLAUDE.md, Security Policy).
   *
   * @param authInfo Informazioni di autenticazione della richiesta corrente.
   * @param elevatedThreshold Soglia di ruolo che garantisce visibilità globale (default: Admin).
   */
  static applyScopeFilter(
    authInfo: AuthInfo,
    elevatedThreshold: AppUserRoles = AppUserRoles.Admin,
  ): string | null {
    if (authInfo.role <= elevatedThreshold) return null;
    return authInfo.scopeId;
  }

  /**
   * Converte una durata testuale in stile JWT (es. `15m`, `1h`, `7d`, `30s`)
   * nel corrispondente numero di secondi. Accetta anche un numero puro
   * (già in secondi) come stringa o valore numerico.
   * Usata per derivare la TTL della chiave Redis `login:${token}` a partire
   * da `AppConstants.jwtExpiration`, mantenendo le due impostazioni sincronizzate.
   *
   * @param duration Durata testuale (es. `'15m'`) o numero di secondi.
   * @returns Numero di secondi corrispondente.
   * @throws Error se il formato non è riconosciuto.
   */
  static parseDurationToSeconds(duration: string | number): number {
    if (typeof duration === 'number') return duration;

    const trimmed = duration.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);

    const match = /^(\d+)\s*(s|m|h|d)$/i.exec(trimmed);
    if (!match) {
      throw new Error(`Formato durata non riconosciuto: "${duration}"`);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    return value * DURATION_UNIT_SECONDS[unit];
  }
}
