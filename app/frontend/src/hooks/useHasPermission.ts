/**
 * Controllo dei permessi lato UI (ADR-99 § 10, SPEC-RBAC-F2b S27). Solo UX: l'autorità resta
 * il `PermissionsGuard` del backend.
 */
import { useAuthStore } from './useAuth';
import type { PermissionCode } from '../types/roles.types';

/**
 * Verifica se `permissions` contiene tutti i codici richiesti (AND, come `PermissionsGuard`).
 * @param permissions Permessi dell'utente; `null` se non ancora caricati → sempre `false`.
 * @param code Un codice o un elenco di codici, tutti richiesti.
 */
export function hasPermission(
  permissions: readonly string[] | null,
  code: PermissionCode | readonly PermissionCode[],
): boolean {
  if (!permissions) return false;
  const required: readonly PermissionCode[] = typeof code === 'string' ? [code] : code;
  return required.every((c) => permissions.includes(c));
}

/**
 * `true` se l'utente corrente ha tutti i permessi richiesti. Nessuna scorciatoia sul ruolo:
 * il SuperAdmin passa perché la sua lista li contiene tutti.
 * @param code Un codice o un elenco di codici, tutti richiesti.
 */
export function useHasPermission(code: PermissionCode | readonly PermissionCode[]): boolean {
  const permissions = useAuthStore((state) => state.permissions);
  return hasPermission(permissions, code);
}
