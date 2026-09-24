/**
 * Ruoli come li restituisce `GET app/admin/roles`: i 4 di sistema del seed, poi i personalizzati
 * in ordine di nome.
 */
import type { RoleRecord } from '../../types/roles.types';
import { ADMIN_PERMISSION_CODES, ALL_PERMISSION_CODES } from './permission-catalog';

function role(
  overrides: Partial<RoleRecord> & Pick<RoleRecord, 'guid' | 'code' | 'name'>,
): RoleRecord {
  return {
    description: null,
    isSystem: false,
    level: null,
    permissions: [],
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
  };
}

export const SYSTEM_ROLES: RoleRecord[] = [
  role({
    guid: 'sys0000000000001',
    code: 'superadmin',
    name: 'SuperAdmin',
    isSystem: true,
    level: 5,
    permissions: ALL_PERMISSION_CODES,
  }),
  role({
    guid: 'sys0000000000002',
    code: 'admin',
    name: 'Admin',
    isSystem: true,
    level: 10,
    permissions: ADMIN_PERMISSION_CODES,
  }),
  role({
    guid: 'sys0000000000003',
    code: 'manager',
    name: 'Manager',
    isSystem: true,
    level: 20,
    permissions: ['pages:create', 'pages:edit_own'],
  }),
  role({
    guid: 'sys0000000000004',
    code: 'user',
    name: 'User',
    isSystem: true,
    level: 30,
    permissions: ['pages:create'],
  }),
];

export const EDITOR_ROLE: RoleRecord = role({
  guid: 'cus0000000000001',
  code: 'redattore',
  name: 'Redattore',
  description: 'Pubblica le Pagine di tutti',
  permissions: ['pages:edit_any', 'pages:publish'],
});

export const AUDITOR_ROLE: RoleRecord = role({
  guid: 'cus0000000000002',
  code: 'revisore',
  name: 'Revisore',
  permissions: ['audit:read', 'roles:read', 'users:read'],
});

export const ROLES: RoleRecord[] = [...SYSTEM_ROLES, EDITOR_ROLE, AUDITOR_ROLE];
