/**
 * Rendering condizionale per permesso (ADR-99 § 10, SPEC-RBAC-F2b S30). Solo UX: il backend
 * rifiuta comunque ciò che la UI lascia passare.
 */
import type { ReactNode } from 'react';
import { useHasPermission } from '../hooks/useHasPermission';
import type { PermissionCode } from '../types/roles.types';

interface CanProps {
  /** Codice o elenco di codici richiesti (AND). */
  permission: PermissionCode | readonly PermissionCode[];
  /**
   * Nodo mostrato solo se permesso, oppure funzione `(allowed) => ReactNode` per disabilitare
   * invece di nascondere.
   */
  children: ReactNode | ((allowed: boolean) => ReactNode);
  /** Mostrato al posto di `children` (nodo) se il permesso manca. Default `null`. */
  fallback?: ReactNode;
}

/** Mostra `children` solo se l'utente corrente ha `permission`. */
export default function Can({ permission, children, fallback = null }: CanProps): JSX.Element {
  const allowed = useHasPermission(permission);
  if (typeof children === 'function') return <>{children(allowed)}</>;
  return <>{allowed ? children : fallback}</>;
}
