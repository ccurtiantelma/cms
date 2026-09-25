/**
 * Test di `useHasPermission` (SPEC-RBAC-F2b S27, criterio 5).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuthStore } from './useAuth';
import { useHasPermission } from './useHasPermission';
import type { PermissionCode } from '../types/roles.types';
import { AppUserRoles } from '../types/common.types';

function check(code: PermissionCode | readonly PermissionCode[]): boolean {
  return renderHook(() => useHasPermission(code)).result.current;
}

describe('useHasPermission (SPEC F2b S27)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, permissions: null });
  });

  it('permessi non ancora caricati (null) → false', () => {
    expect(check('roles:read')).toBe(false);
  });

  it('codice presente → true, assente → false', () => {
    useAuthStore.setState({ permissions: ['roles:read'] });
    expect(check('roles:read')).toBe(true);
    expect(check('roles:manage')).toBe(false);
  });

  it('array → true solo se tutti i codici sono presenti (AND)', () => {
    useAuthStore.setState({ permissions: ['roles:read', 'users:assign_roles'] });
    expect(check(['roles:read', 'users:assign_roles'])).toBe(true);
    expect(check(['roles:read', 'roles:manage'])).toBe(false);
  });

  it('nessuna scorciatoia sul ruolo: un SuperAdmin senza il codice in lista → false', () => {
    useAuthStore.setState({
      user: {
        id: 1,
        guid: 'sa00000000000001',
        name: 'Root',
        email: 'root@example.com',
        role: AppUserRoles.SuperAdmin,
        scopeId: null,
      },
      permissions: ['roles:read'],
    });
    expect(check('roles:manage')).toBe(false);
  });

  it('reagisce ai cambi dello store', () => {
    const { result, rerender } = renderHook(() => useHasPermission('roles:read'));
    expect(result.current).toBe(false);
    useAuthStore.setState({ permissions: ['roles:read'] });
    rerender();
    expect(result.current).toBe(true);
  });
});
