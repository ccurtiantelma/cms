import { ForbiddenException } from '@nestjs/common';
import { SQL, eq } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { AppUserRoles } from './enums';
import { AuthInfo } from './types';

/**
 * Helper di ownership per riga (ADR-18 § D5). Tre funzioni pure, senza
 * accesso al database: chi legge la riga o esegue la query è sempre il
 * service chiamante. Generico sull'ownership, muto sugli stati — regole
 * specifiche di dominio (es. "solo in draft") restano nel service.
 */

/**
 * Vero se il chiamante supera la soglia di elevazione e quindi opera su
 * qualunque riga, indipendentemente da chi l'ha creata. I ruoli sono a
 * soglie con numero minore = privilegio maggiore (`AppUserRoles`).
 */
export function hasElevatedRowAccess(authInfo: AuthInfo, elevatedThreshold: AppUserRoles): boolean {
  return authInfo.role <= elevatedThreshold;
}

/**
 * Lancia `ForbiddenException` se il chiamante non è elevato e non è
 * l'autore della riga. Da chiamare nel service dopo il caricamento della
 * riga e prima di ogni scrittura.
 */
export function assertRowOwnership(
  authInfo: AuthInfo,
  row: { createdBy: number },
  elevatedThreshold: AppUserRoles,
  message: string,
): void {
  if (hasElevatedRowAccess(authInfo, elevatedThreshold)) {
    return;
  }
  if (row.createdBy === authInfo.userId) {
    return;
  }
  throw new ForbiddenException(message);
}

/**
 * Condizione Drizzle da mettere in AND nel WHERE di un elenco paginato.
 * Restituisce `undefined` se il chiamante è elevato (nessun filtro da
 * applicare). Va applicata sia alla query dei dati sia a quella del totale.
 */
export function rowOwnershipFilter(
  authInfo: AuthInfo,
  ownerColumn: PgColumn,
  elevatedThreshold: AppUserRoles,
): SQL | undefined {
  if (hasElevatedRowAccess(authInfo, elevatedThreshold)) {
    return undefined;
  }
  return eq(ownerColumn, authInfo.userId);
}
