import { ForbiddenException } from '@nestjs/common';
import { AppUserRoles } from '../common/enums';
import { AuthInfo } from '../common/types';

/**
 * Verifica che il chiamante possa vedere/gestire un utente con il ruolo indicato.
 * Regola critica (`business-rules.md` § Attori e ruoli): un Admin (non
 * SuperAdmin) non può vedere né gestire utenti SuperAdmin. Condivisa da
 * `AdminService` e `RolesService` (ADR-99 § 8, "restano le regole esistenti").
 * @throws ForbiddenException se il target è SuperAdmin e il chiamante non lo è.
 */
export function assertTargetRoleManageable(targetRole: number, authInfo: AuthInfo): void {
  if (targetRole <= AppUserRoles.SuperAdmin && authInfo.role > AppUserRoles.SuperAdmin) {
    throw new ForbiddenException('Non puoi gestire utenti con ruolo SuperAdmin.');
  }
}
