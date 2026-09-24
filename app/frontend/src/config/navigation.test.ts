/**
 * Test della visibilità delle voci della sidebar (SPEC-RBAC-F2b S31, criterio 8). La tabella
 * fissa la visibilità delle voci a soglia di ruolo per i 4 ruoli, che il refactor del filtro
 * (`isNavigationItemVisible`) non deve cambiare.
 */
import { describe, it, expect } from 'vitest';
import { IconShieldLock } from '@tabler/icons-react';
import { isNavigationItemVisible, navigationItems, type NavigationItem } from './navigation';
import { AppUserRoles } from '../types/common.types';

const { SuperAdmin, Admin, Manager, User } = AppUserRoles;

/** Voci a soglia di ruolo esistenti prima della F2b e ruoli che le vedono. */
const ROLE_GATED: Record<string, AppUserRoles[]> = {
  '/dashboard': [SuperAdmin, Admin, Manager, User],
  '/pages': [SuperAdmin, Admin, Manager, User],
  '/theme-editor': [SuperAdmin],
  '/global-sections': [SuperAdmin, Admin, Manager],
  '/site-templates': [SuperAdmin, Admin, Manager],
  '/users': [SuperAdmin, Admin],
};

describe('isNavigationItemVisible (SPEC F2b S31)', () => {
  const roleGatedItems = navigationItems.filter((item) => item.path in ROLE_GATED);

  it('copre tutte le voci a soglia di ruolo', () => {
    expect(roleGatedItems.map((item) => item.path).sort()).toEqual(Object.keys(ROLE_GATED).sort());
  });

  const cases = roleGatedItems.flatMap((item) =>
    [SuperAdmin, Admin, Manager, User].map((role) => ({
      path: item.path,
      role,
      expected: ROLE_GATED[item.path].includes(role),
      item,
    })),
  );

  it.each(cases)('$path per il ruolo $role → $expected', ({ item, role, expected }) => {
    // La visibilità di queste voci non dipende dai permessi, caricati o no.
    expect(isNavigationItemVisible(item, role, null)).toBe(expected);
    expect(isNavigationItemVisible(item, role, [])).toBe(expected);
  });

  it('senza ruolo noto solo le voci senza `roles` sono visibili', () => {
    const visible = roleGatedItems.filter((item) => isNavigationItemVisible(item, undefined, []));
    expect(visible.map((item) => item.path)).toEqual(['/dashboard', '/pages']);
  });

  describe('voce con `permission`', () => {
    const byPermission: NavigationItem = {
      label: 'Ruoli',
      path: '/roles',
      icon: IconShieldLock,
      permission: 'roles:read',
    };

    it('visibile a un User con il permesso', () => {
      expect(isNavigationItemVisible(byPermission, User, ['roles:read'])).toBe(true);
    });

    it('nascosta a un Admin senza il permesso', () => {
      expect(isNavigationItemVisible(byPermission, Admin, ['pages:read'])).toBe(false);
    });

    it('nascosta finché i permessi sono null', () => {
      expect(isNavigationItemVisible(byPermission, SuperAdmin, null)).toBe(false);
    });

    it('`roles` e `permission` in AND', () => {
      const both: NavigationItem = { ...byPermission, roles: [SuperAdmin, Admin] };
      expect(isNavigationItemVisible(both, User, ['roles:read'])).toBe(false);
      expect(isNavigationItemVisible(both, Admin, ['roles:read'])).toBe(true);
      expect(isNavigationItemVisible(both, Admin, [])).toBe(false);
    });
  });
});
