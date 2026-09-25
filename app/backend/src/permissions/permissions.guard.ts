import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthInfo } from '../common/types';
import { PermissionCode } from './permissions.registry';
import { PermissionsService } from './permissions.service';

/** Chiave dei metadati scritti da `@Permissions` e letti da questo guard. */
export const PERMISSIONS_KEY = 'rbac:permissions';

/**
 * Guard dei permessi granulari (ADR-99 § 5). Fail-closed su ogni ramo:
 * `authInfo` assente, metadati assenti/vuoti o permesso mancante → `403`; un
 * errore DB si propaga (500). Mai `true` per default.
 *
 * I permessi sono quelli di `authInfo.userId`, che in impersonificazione è
 * l'utente impersonato: si valutano i suoi permessi, non quelli del SuperAdmin.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  /** Inietta il `Reflector` per i metadati di `@Permissions` e il service di risoluzione (cache Redis → DB). */
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Autorizza la richiesta solo se l'utente possiede tutti i permessi richiesti. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionCode[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      this.logger.error(
        `PermissionsGuard senza permessi dichiarati su ${context.getClass().name}.${context.getHandler().name}: accesso negato.`,
      );
      throw new ForbiddenException('Permessi insufficienti.');
    }

    const req = context.switchToHttp().getRequest();
    const authInfo: AuthInfo | undefined = req['authInfo'];
    if (!authInfo) {
      throw new ForbiddenException(`Permessi insufficienti (richiesto permesso: ${required[0]}).`);
    }

    const { ok, missing } = await this.permissionsService.hasAll(authInfo.userId, required);
    if (!ok) {
      throw new ForbiddenException(`Permessi insufficienti (richiesto permesso: ${missing[0]}).`);
    }

    return true;
  }
}
