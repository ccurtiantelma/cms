import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISSIONS_KEY, PermissionsGuard } from './permissions.guard';
import { PermissionCode } from './permissions.registry';

export { PERMISSIONS_KEY };

/**
 * Richiede **tutti** i permessi indicati (semantica AND, ADR-99 § 5) e attiva
 * da solo `PermissionsGuard`. Accetta solo codici del registro: un codice
 * sconosciuto è un errore di compilazione. Applicabile a handler o classe; i
 * metadati dell'handler prevalgono su quelli di classe.
 */
export function Permissions(
  ...codes: [PermissionCode, ...PermissionCode[]]
): ClassDecorator & MethodDecorator {
  return applyDecorators(SetMetadata(PERMISSIONS_KEY, codes), UseGuards(PermissionsGuard));
}
