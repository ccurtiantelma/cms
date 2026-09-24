/**
 * Test delle regole della matrice dei permessi (SPEC-RBAC-F2b S33–S34, S38; criteri 9–11), con
 * il catalogo reale dei 20 codici.
 */
import { describe, it, expect } from 'vitest';
import {
  categoryState,
  isRoleAssignable,
  isSelectable,
  toggleCategory,
} from './permission-matrix.utils';
import {
  ADMIN_PERMISSION_CODES,
  ALL_PERMISSION_CODES,
  PERMISSION_CATALOG,
} from '../test/fixtures/permission-catalog';
import type { PermissionGroup, RoleRecord } from '../types/roles.types';

const SUPER_ADMIN = ALL_PERMISSION_CODES;
const group = (category: string): PermissionGroup =>
  PERMISSION_CATALOG.find((g) => g.category === category) as PermissionGroup;
const USERS = group('users');
const MEDIA = group('media');

describe('isSelectable (criterio 9)', () => {
  it('roles:manage → false anche per chi lo possiede', () => {
    expect(isSelectable('roles:manage', SUPER_ADMIN)).toBe(false);
  });

  it('codice non posseduto → false, posseduto → true', () => {
    expect(isSelectable('media:upload', ['pages:create'])).toBe(false);
    expect(isSelectable('media:upload', ['media:upload'])).toBe(true);
  });
});

describe('categoryState (criterio 10)', () => {
  it('nessuno selezionato → né checked né indeterminate', () => {
    expect(categoryState(MEDIA, [], SUPER_ADMIN)).toEqual({
      checked: false,
      indeterminate: false,
      disabled: false,
    });
  });

  it('alcuni selezionati → indeterminate', () => {
    expect(categoryState(MEDIA, ['media:upload'], SUPER_ADMIN)).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });
  });

  it('tutti i selezionabili selezionati → checked, anche senza il codice riservato', () => {
    const selectable = USERS.permissions.map((p) => p.code).filter((c) => c !== 'roles:manage');
    expect(categoryState(USERS, selectable, SUPER_ADMIN)).toEqual({
      checked: true,
      indeterminate: false,
      disabled: false,
    });
  });

  it('gruppo con soli codici riservati → disabled', () => {
    const reservedOnly: PermissionGroup = {
      category: 'users',
      permissions: [{ code: 'roles:manage', description: null }],
    };
    expect(categoryState(reservedOnly, [], SUPER_ADMIN).disabled).toBe(true);
  });

  it('gruppo di codici non posseduti → disabled', () => {
    expect(categoryState(MEDIA, [], ['pages:create']).disabled).toBe(true);
  });
});

describe('toggleCategory (criterio 11)', () => {
  it('"Seleziona tutti" su Utenti da SuperAdmin → 5 codici, mai roles:manage', () => {
    const selected = toggleCategory(USERS, [], SUPER_ADMIN);
    expect(selected).toHaveLength(5);
    expect(selected).not.toContain('roles:manage');
  });

  it('secondo clic → deselezionati, gli altri gruppi intatti', () => {
    const first = toggleCategory(USERS, ['pages:create'], SUPER_ADMIN);
    expect(toggleCategory(USERS, first, SUPER_ADMIN)).toEqual(['pages:create']);
  });

  it('un codice non selezionabile già nel ruolo resta in entrambi i passaggi', () => {
    // Chiamante senza media:delete_any che modifica un ruolo che lo contiene già.
    const caller = ['media:upload'];
    const first = toggleCategory(MEDIA, ['media:delete_any'], caller);
    expect(first.sort()).toEqual(['media:delete_any', 'media:upload']);
    const second = toggleCategory(MEDIA, first, caller);
    expect(second).toEqual(['media:delete_any']);
  });

  it('con la selezione parziale aggiunge i mancanti senza duplicati', () => {
    const selected = toggleCategory(MEDIA, ['media:upload'], SUPER_ADMIN);
    expect(selected.sort()).toEqual(['media:delete_any', 'media:upload']);
  });

  it('un Admin ottiene gli stessi 5 codici di Utenti', () => {
    expect(toggleCategory(USERS, [], ADMIN_PERMISSION_CODES)).toHaveLength(5);
  });
});

describe('isRoleAssignable (S38)', () => {
  const role = (permissions: string[]): RoleRecord => ({
    guid: 'r1',
    code: 'editor',
    name: 'Editor',
    description: null,
    isSystem: false,
    level: null,
    permissions,
    createdAt: null,
    updatedAt: null,
  });

  it('tutti i permessi posseduti → assegnabile', () => {
    expect(isRoleAssignable(role(['pages:create']), ['pages:create', 'roles:read'])).toBe(true);
    expect(isRoleAssignable(role([]), [])).toBe(true);
  });

  it('un permesso non posseduto → non assegnabile', () => {
    expect(isRoleAssignable(role(['pages:create', 'media:delete_any']), ['pages:create'])).toBe(
      false,
    );
  });
});
