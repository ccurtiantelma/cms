import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../../../src/admin/admin.service';
import { RolesService } from '../../../src/admin/roles/roles.service';
import type { SeedService } from '../../../src/admin/seed.service';
import type { AuditLogService } from '../../../src/common/audit-log.service';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import type { ExportService } from '../../../src/export/export.service';
import { PermissionCode, SYSTEM_ROLES } from '../../../src/permissions/permissions.registry';
import type { PermissionsService } from '../../../src/permissions/permissions.service';
import type { EmailQueueService } from '../../../src/queues/email-queue/email.queue.service';
import { createDrizzleMock } from '../permissions/drizzle-mock';

/**
 * `roleGuids` in `AdminService.createUser`/`updateUser` (SPEC-RBAC-F2a S17–S18,
 * criteri 2–3). `RolesService` è reale sopra il mock Drizzle, così si verifica
 * l'ordine effettivo: validazione dei ruoli prima di ogni scrittura, utente e
 * `user_roles` nella stessa transazione, email/invalidazione/audit dopo il commit.
 */
describe('AdminService — roleGuids atomici (SPEC-RBAC-F2a S17)', () => {
  const ADMIN: AuthInfo = { userId: 2, role: AppUserRoles.Admin, name: 'Admin', scopeId: null };
  const MANAGER: AuthInfo = {
    userId: 3,
    role: AppUserRoles.Manager,
    name: 'Manager',
    scopeId: null,
  };
  let grants: Record<number, readonly PermissionCode[]>;

  const TARGET = {
    id: 30,
    guid: 'user000000000030',
    name: 'Mario',
    email: 'mario@cms.test',
    role: AppUserRoles.User,
    isActive: true,
  };
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
  const NEW_USER_DTO = {
    name: 'Nuovo',
    email: 'nuovo@cms.test',
    role: AppUserRoles.User,
    roleGuids: [MEDIA_ROLE.guid],
  };

  let mock: ReturnType<typeof createDrizzleMock>;
  let findFirst: jest.Mock;
  let enqueueEmail: jest.Mock;
  let invalidateUsers: jest.Mock;
  let auditLog: jest.Mock;
  let order: string[];
  let service: AdminService;

  const opsOn = (op: string, table: string) =>
    mock.ops.filter((o) => o.op === op && o.table === table);

  beforeEach(() => {
    grants = {
      [ADMIN.userId]: SYSTEM_ROLES.admin.permissions,
      [MANAGER.userId]: [...SYSTEM_ROLES.manager.permissions, 'users:assign_roles'],
    };
    order = [];
    mock = createDrizzleMock();
    findFirst = jest.fn();
    (mock.db as unknown as { query: unknown }).query = { userEntity: { findFirst } };
    mock.db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      order.push('tx:begin');
      const result = await cb(mock.db);
      order.push('tx:commit');
      return result;
    });
    enqueueEmail = jest.fn(async () => {
      order.push('email');
    });
    invalidateUsers = jest.fn(async () => {
      order.push('invalidate');
    });
    auditLog = jest.fn(async (_userId: number, action: string) => {
      order.push(`audit:${action}`);
    });
    const permissionsService = {
      getUserPermissions: jest.fn(async (userId: number) => new Set(grants[userId] ?? [])),
      invalidateUsers,
    } as unknown as PermissionsService;
    const auditLogService = { log: auditLog } as unknown as AuditLogService;
    const rolesService = new RolesService(mock.dbService, permissionsService, auditLogService);
    service = new AdminService(
      mock.dbService,
      {} as SeedService,
      { enqueueEmail } as unknown as EmailQueueService,
      auditLogService,
      {} as ExportService,
      permissionsService,
      rolesService,
    );
  });

  // ─── criterio 2: nessuna scrittura su rifiuto ──────────────────────────────

  describe('createUser con roleGuids rifiutati → nessun utente, nessuna email, nessun audit', () => {
    beforeEach(() => findFirst.mockResolvedValue(undefined));

    const expectNothingWritten = (): void => {
      expect(opsOn('insert', 'users')).toEqual([]);
      expect(mock.db.transaction).not.toHaveBeenCalled();
      expect(enqueueEmail).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
      expect(invalidateUsers).not.toHaveBeenCalled();
    };

    it('anti-escalation → 403 PERMISSION_ESCALATION', async () => {
      mock.results.push([MEDIA_ROLE], [{ roleId: 60, code: 'media:delete_any' }]);

      await expect(service.createUser(NEW_USER_DTO, MANAGER)).rejects.toMatchObject({
        status: 403,
        response: { code: 'PERMISSION_ESCALATION' },
      });
      expectNothingWritten();
    });

    it('ruolo di sistema → 400 SYSTEM_ROLE_NOT_ASSIGNABLE', async () => {
      mock.results.push([SYSTEM_ROLE]);

      await expect(
        service.createUser({ ...NEW_USER_DTO, roleGuids: [SYSTEM_ROLE.guid] }, ADMIN),
      ).rejects.toMatchObject({ status: 400, response: { code: 'SYSTEM_ROLE_NOT_ASSIGNABLE' } });
      expectNothingWritten();
    });

    it('ruolo inesistente → 404', async () => {
      mock.results.push([]);

      await expect(service.createUser(NEW_USER_DTO, ADMIN)).rejects.toThrow(
        new NotFoundException('Ruolo non trovato.'),
      );
      expectNothingWritten();
    });

    it('users:assign_roles mancante → 403', async () => {
      grants[MANAGER.userId] = SYSTEM_ROLES.manager.permissions;

      await expect(service.createUser(NEW_USER_DTO, MANAGER)).rejects.toThrow(
        'richiesto permesso: users:assign_roles',
      );
      expectNothingWritten();
    });
  });

  it('updateUser con roleGuids rifiutati → nessun update su users', async () => {
    findFirst.mockResolvedValue({ ...TARGET });
    mock.results.push([SYSTEM_ROLE]);

    await expect(
      service.updateUser(TARGET.guid, { name: 'Luigi', roleGuids: [SYSTEM_ROLE.guid] }, ADMIN),
    ).rejects.toMatchObject({ status: 400 });

    expect(opsOn('update', 'users')).toEqual([]);
    expect(invalidateUsers).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  // ─── happy path: transazione unica, effetti dopo il commit ─────────────────

  it('createUser con roleGuids → utente e user_roles nella stessa transazione, poi email, invalidazione e audit', async () => {
    findFirst.mockResolvedValue(undefined);
    mock.results.push(
      [MEDIA_ROLE],
      [{ roleId: 60, code: 'media:upload' }],
      [{ id: 40, guid: 'user000000000040' }], // insert users … returning
      [], // insert user_roles
    );

    await expect(service.createUser(NEW_USER_DTO, ADMIN, '10.0.0.9')).resolves.toEqual({
      guid: 'user000000000040',
    });

    expect(mock.ops.filter((o) => o.op !== 'select').map((o) => `${o.op}:${o.table}`)).toEqual([
      'insert:users',
      'insert:user_roles',
    ]);
    expect(opsOn('insert', 'user_roles')[0].values).toEqual([{ userId: 40, roleId: 60 }]);
    expect(order).toEqual([
      'tx:begin',
      'tx:commit',
      'email',
      'invalidate',
      'audit:user.create',
      'audit:user.roles.update',
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      ADMIN.userId,
      'user.roles.update',
      'user',
      'user000000000040',
      { added: ['media_manager'], removed: [] },
      undefined,
      '10.0.0.9',
    );
  });

  it('createUser con roleGuids [] → come assente: nessun controllo dei ruoli', async () => {
    findFirst.mockResolvedValue(undefined);
    grants[MANAGER.userId] = SYSTEM_ROLES.manager.permissions; // senza users:assign_roles
    mock.results.push([{ id: 41, guid: 'user000000000041' }]);

    await service.createUser({ ...NEW_USER_DTO, roleGuids: [] }, MANAGER);

    expect(opsOn('insert', 'user_roles')).toEqual([]);
    expect(order).toEqual(['tx:begin', 'tx:commit', 'email', 'audit:user.create']);
  });

  // ─── criterio 3: una sola invalidazione, no-op ─────────────────────────────

  it('updateUser con cambio di role e di roleGuids → una sola invalidateUsers([id]) dopo il commit', async () => {
    findFirst.mockResolvedValue({ ...TARGET });
    mock.results.push(
      [MEDIA_ROLE],
      [], // ruoli attuali
      [{ roleId: 60, code: 'media:upload' }],
      [], // update users
      [], // insert user_roles
    );

    await service.updateUser(
      TARGET.guid,
      { role: AppUserRoles.Manager, roleGuids: [MEDIA_ROLE.guid] },
      ADMIN,
    );

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith([TARGET.id]);
    expect(order).toEqual([
      'tx:begin',
      'tx:commit',
      'invalidate',
      'audit:user.update',
      'audit:user.roles.update',
    ]);
    // roleGuids non finisce nel dettaglio di user.update: lo registra user.roles.update.
    expect(auditLog.mock.calls[0][4]).toEqual({ role: AppUserRoles.Manager });
  });

  it('updateUser con roleGuids uguale all’insieme attuale → nessuna transazione, invalidazione o user.roles.update', async () => {
    findFirst.mockResolvedValue({ ...TARGET });
    mock.results.push([MEDIA_ROLE], [{ id: 60, code: 'media_manager' }], []);

    await service.updateUser(TARGET.guid, { roleGuids: [MEDIA_ROLE.guid] }, ADMIN);

    expect(mock.db.transaction).not.toHaveBeenCalled();
    expect(invalidateUsers).not.toHaveBeenCalled();
    expect(order).toEqual(['audit:user.update']);
  });

  it('updateUser con roleGuids [] → rimuove tutti i ruoli, senza controllo di escalation (S18)', async () => {
    findFirst.mockResolvedValue({ ...TARGET });
    mock.results.push([{ id: 70, code: 'power' }], [], []);

    await service.updateUser(TARGET.guid, { roleGuids: [] }, MANAGER);

    expect(mock.ops.some((o) => o.table === 'role_permissions')).toBe(false);
    expect(opsOn('delete', 'user_roles')).toHaveLength(1);
    expect(invalidateUsers).toHaveBeenCalledWith([TARGET.id]);
  });

  it('findOneUser restituisce anche roles (S19)', async () => {
    findFirst.mockResolvedValue({ ...TARGET });
    mock.results.push([{ guid: MEDIA_ROLE.guid, code: MEDIA_ROLE.code, name: MEDIA_ROLE.name }]);

    await expect(service.findOneUser(TARGET.guid, ADMIN)).resolves.toMatchObject({
      guid: TARGET.guid,
      roles: [{ guid: MEDIA_ROLE.guid, code: 'media_manager', name: 'Media' }],
    });
  });
});
