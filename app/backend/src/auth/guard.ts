import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Type,
} from '@nestjs/common';
import { AppUserRoles } from '../common/enums';
import { AuthInfo } from '../common/types';

/**
 * Factory generica per guard RBAC a soglia (CLAUDE.md, "RBAC a soglie di ruolo").
 * Numero minore = privilegio maggiore: un utente è autorizzato se `authInfo.role <= minRole`.
 * Per `AppUserRoles.SuperAdmin` (valore minimo dell'enum) il confronto equivale a un match esatto.
 * @param minRole Soglia minima di ruolo richiesta.
 * @returns Una classe guard iniettabile da usare con `@UseGuards(...)`.
 */
export function requireRole(minRole: AppUserRoles): Type<CanActivate> {
  @Injectable()
  class RoleGuard implements CanActivate {
    /** Autorizza la richiesta solo se `authInfo.role` soddisfa la soglia minima. */
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest();
      const authInfo: AuthInfo | undefined = req['authInfo'];

      if (!authInfo || authInfo.role > minRole) {
        throw new ForbiddenException(
          `Permessi insufficienti (richiesto ruolo ${AppUserRoles[minRole]} o superiore).`,
        );
      }

      return true;
    }
  }

  return RoleGuard;
}

export const GuardSuperAdmin = requireRole(AppUserRoles.SuperAdmin);
export const GuardAdmin = requireRole(AppUserRoles.Admin);
export const GuardManager = requireRole(AppUserRoles.Manager);
