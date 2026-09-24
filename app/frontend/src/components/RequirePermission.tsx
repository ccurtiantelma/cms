/**
 * Guard di rotta per permesso (SPEC-RBAC-F2b S28), accanto a `RequireRole` di `App.tsx`. Vive in
 * un file proprio per essere testabile senza importare l'intero albero delle rotte.
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuthStore } from '../hooks/useAuth';
import { hasPermission } from '../hooks/useHasPermission';
import { getToken, homePathForRole } from '../utils/auth.utils';
import type { PermissionCode } from '../types/roles.types';

interface RequirePermissionProps {
  /** Codice o elenco di codici richiesti (AND). */
  permission: PermissionCode | readonly PermissionCode[];
  children: ReactNode;
}

/**
 * Ammette solo chi ha `permission`, altrimenti reindirizza alla home dell'utente. Finché i
 * permessi sono `null` (GET /auth/me in corso) mostra un loader: con l'utente letto da
 * `localStorage` la rotta si monta prima della risposta, e un redirect immediato rimanderebbe
 * alla dashboard un utente autorizzato che ricarica la pagina (PLAN F2b, falla 7).
 */
export default function RequirePermission({
  permission,
  children,
}: RequirePermissionProps): JSX.Element {
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  if (permissions === null) {
    if (!getToken()) return <Navigate to="/login" replace />;
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!hasPermission(permissions, permission)) {
    return <Navigate to={homePathForRole(user?.role)} replace />;
  }
  return <>{children}</>;
}
