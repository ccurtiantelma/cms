import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesService } from '../../../src/admin/roles/roles.service';
import type { UserRolesPlan } from '../../../src/admin/roles/roles.types';
import type { AuditLogService } from '../../../src/common/audit-log.service';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import { PermissionCode, SYSTEM_ROLES } from '../../../src/permissions/permissions.registry';
import type { PermissionsService } from '../../../src/permissions/permissions.service';
import { createDrizzleMock } from '../permissions/drizzle-mock';

/**
 * `RolesService.planUserRoles` / `applyUserRoles` (SPEC-RBAC-F2a S17,
 * criterio 1): il piano esegue solo letture e validazioni, su qualunque esito,
 * errori compresi; l'applicazione esegue solo scritture su `user_roles` nella
 * transazione del chiamante, senza invalidazione né audit.
 */
describe('RolesService — planUserRoles / applyUserRoles (SPEC-RBAC-F2a S17)', () => {
  const ADMIN: AuthInfo = { userId: 2, role: AppUserRoles.Admin, name: 'Admin', scopeId: null };
  const MANAGER: AuthInfo = {
    userId: 3,
    role: AppUserRoles.Manager,
    name: 'Manager',
    scopeId: null,
  };
  const GRANTS: Record<number, readonly PermissionCode[]> = {
    [ADMIN.userId]: SYSTEM_ROLES.admin.permissions,
    [MANAGER.userId]: [...SYSTEM_ROLES.manager.permissions, 'users:assign_roles'],
  };

  const EXISTING_USER = { id: 30, role: AppUserRoles.User };
  const NEW_USER = { id: null, role: AppUserRoles.User };
  const MEDIA_ROLE = {
    id: 60,
    guid: 'role0000000000bb',
    code: 'media_manager',
    name: 'Media',
    description: null,
    isSystem: false,
    level: null,
  };
  const SYSTEM_ROLE = {
    ...MEDIA_ROLE,
    id: 2,
    guid: 'sysadmin00000000',
    code: 'admin',
    isSystem: true,
  };

  let mock: ReturnType<typeof createDrizzleMock>;
  let permissionsService: { getUserPermissions: jest.Mock; invalidateUsers: jest.Mock };
  let auditLog: { log: jest.Mock };
  let service: RolesService;

  const writes = (): string[] =>
    mock.ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`);

  beforeEach(() => {
    mock = createDrizzleMock();
    permissionsService = {
      getUserPermissions: jest.fn(async (userId: number) => new Set(GRANTS[userId] ?? [])),
      invalidateUsers: jest.fn().mockResolvedValue(undefined),
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new RolesService(
      mock.dbService,
      permissionsService as unknown as PermissionsService,
      auditLog as unknown as AuditLogService,
    );
  });

  afterEach(() => {
    // Nessun esito del piano scrive, apre transazioni, invalida o registra audit.
    expect(writes()).toEqual([]);
    expect(mock.db.transaction).not.toHaveBeenCalled();
    expect(permissionsService.invalidateUsers).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('utente esistente: calcola aggiunti e rimossi', async () => {
    mock.results.push(
      [MEDIA_ROLE],
      [{ id: 70, code: 'power' }], // ruoli attuali
      [{ roleId: 60, code: 'media:upload' }],
    );

    const plan = await service.planUserRoles(EXISTING_USER, [MEDIA_ROLE.guid], ADMIN);

    expect(plan).toEqual({
      roleGuids: [MEDIA_ROLE.guid],
      added: [{ id: 60, code: 'media_manager' }],
      removed: [{ id: 70, code: 'power' }],
      changed: true,
    });
  });

  it('utente non ancora creato: nessuna lettura dei ruoli attuali', async () => {
    mock.results.push([MEDIA_ROLE], [{ roleId: 60, code: 'media:upload' }]);

    const plan = await service.planUserRoles(NEW_USER, [MEDIA_ROLE.guid], ADMIN);

    expect(plan.added).toEqual([{ id: 60, code: 'media_manager' }]);
    expect(plan.removed).toEqual([]);
    expect(mock.ops.filter((o) => o.table === 'user_roles')).toEqual([]);
  });

  it('insieme invariato → changed false', async () => {
    mock.results.push([MEDIA_ROLE], [{ id: 60, code: 'media_manager' }]);

    const plan = await service.planUserRoles(EXISTING_USER, [MEDIA_ROLE.guid], ADMIN);

    expect(plan.changed).toBe(false);
  });

  it('users:assign_roles mancante → 403 senza nessuna query', async () => {
    await expect(
      service.planUserRoles(EXISTING_USER, [MEDIA_ROLE.guid], { ...MANAGER, userId: 99 }),
    ).rejects.toThrow('richiesto permesso: users:assign_roles');
    expect(mock.ops).toHaveLength(0);
  });

  it('target SuperAdmin gestito da un Admin → 403', async () => {
    await expect(
      service.planUserRoles({ id: 1, role: AppUserRoles.SuperAdmin }, [], ADMIN),
    ).rejects.toThrow(new ForbiddenException('Non puoi gestire utenti con ruolo SuperAdmin.'));
  });

  it('ruolo inesistente → 404', async () => {
    mock.results.push([]);
    await expect(service.planUserRoles(NEW_USER, ['ghost00000000000'], ADMIN)).rejects.toThrow(
      new NotFoundException('Ruolo non trovato.'),
    );
  });

  it('ruolo di sistema → 400 SYSTEM_ROLE_NOT_ASSIGNABLE', async () => {
    mock.results.push([SYSTEM_ROLE]);
    await expect(service.planUserRoles(NEW_USER, [SYSTEM_ROLE.guid], ADMIN)).rejects.toMatchObject({
      status: 400,
      response: { code: 'SYSTEM_ROLE_NOT_ASSIGNABLE' },
    });
  });

  it('anti-escalation sui ruoli aggiunti → 403 PERMISSION_ESCALATION', async () => {
    mock.results.push([MEDIA_ROLE], [], [{ roleId: 60, code: 'media:delete_any' }]);
    await expect(
      service.planUserRoles(EXISTING_USER, [MEDIA_ROLE.guid], MANAGER),
    ).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_ESCALATION' } });
  });
});

describe('RolesService — applyUserRoles', () => {
  it('scrive solo su user_roles tramite la tx ricevuta, senza invalidazione né audit', async () => {
    const mock = createDrizzleMock();
    const invalidateUsers = jest.fn();
    const log = jest.fn();
    const service = new RolesService(
      mock.dbService,
      { invalidateUsers } as unknown as PermissionsService,
      { log } as unknown as AuditLogService,
    );
    const plan: UserRolesPlan = {
      roleGuids: ['role0000000000bb'],
      added: [{ id: 60, code: 'media_manager' }],
      removed: [{ id: 70, code: 'power' }],
      changed: true,
    };

    await service.applyUserRoles(mock.db as never, 30, plan);

    expect(mock.ops.map((o) => `${o.op}:${o.table}`)).toEqual([
      'delete:user_roles',
      'insert:user_roles',
    ]);
    expect(mock.ops[1].values).toEqual([{ userId: 30, roleId: 60 }]);
    expect(mock.ops[1].calls).toContain('onConflictDoNothing');
    expect(invalidateUsers).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
