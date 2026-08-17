import { ConflictException } from '@nestjs/common';
import { DatabaseError } from 'pg';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Nome del vincolo Postgres → conflitto applicativo. Centralizzato apposta:
 * se un indice viene rinominato in una migrazione, questa mappa (e il test
 * di regressione che la copre) è l'unico posto da aggiornare.
 */
const PG_CONSTRAINT_CONFLICTS: Readonly<Record<string, { code: string; message: string }>> = {
  pages_slug_locale_root_uq: {
    code: 'PAGE_SLUG_DUPLICATE',
    message: 'Esiste già una pagina con questo slug per questa lingua.',
  },
  pages_slug_locale_child_uq: {
    code: 'PAGE_SLUG_DUPLICATE',
    message: 'Esiste già una pagina con questo slug per questa lingua e questo genitore.',
  },
  page_revisions_page_number_uq: {
    code: 'REVISION_NUMBER_CONFLICT',
    message: 'Conflitto nella numerazione delle revisioni: ripetere la pubblicazione.',
  },
};

/**
 * Converte una violazione di vincolo univoco Postgres in un
 * `ConflictException` applicativo, leggendo `err.constraint` — mai il testo
 * del messaggio, che dipende da locale e versione del server. Rilancia
 * l'errore originale se non è una violazione di unicità o se il vincolo non
 * è mappato (es. `pages_guid_idx`: collisione di guid, bug interno → resta
 * 500 tramite `AllExceptionsFilter`, non un conflitto utente).
 *
 * Drizzle ORM (>=0.44) avvolge ogni errore del driver in `DrizzleQueryError`,
 * con l'errore originale del driver `pg` in `.cause` — non è più il `catch`
 * a ricevere direttamente un `DatabaseError`. Verificato contro il comportamento
 * reale (`node_modules/drizzle-orm/pg-core/session.cjs`, `queryWithCache`).
 *
 * Debito preesistente NON risolto da questa utility: `AdminService` verifica
 * l'unicità dell'email con una SELECT preventiva invece di intercettare il
 * vincolo — vedi `docs/TODO.md`. Non è nello scope di F01 e non viene
 * rifattorizzato qui.
 */
export function mapPgError(err: unknown): never {
  const pgError = unwrapDatabaseError(err);
  if (pgError && pgError.code === PG_UNIQUE_VIOLATION && pgError.constraint) {
    const conflict = PG_CONSTRAINT_CONFLICTS[pgError.constraint];
    if (conflict) {
      throw new ConflictException({ message: conflict.message, code: conflict.code });
    }
  }
  throw err;
}

/** Trova il `DatabaseError` del driver `pg`, direttamente o dentro `.cause` (wrapping di Drizzle). */
function unwrapDatabaseError(err: unknown): DatabaseError | undefined {
  if (err instanceof DatabaseError) {
    return err;
  }
  // `Error.cause` (ES2022) non è nel target ES2021 del progetto: letto via un tipo strutturale minimo.
  const cause = (err as { cause?: unknown } | undefined)?.cause;
  if (cause instanceof DatabaseError) {
    return cause;
  }
  return undefined;
}
