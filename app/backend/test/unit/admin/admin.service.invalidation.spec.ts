import { ForbiddenException } from '@nestjs/common';
import { AdminService } from '../../../src/admin/admin.service';
import type { SeedService } from '../../../src/admin/seed.service';
import { assertTargetRoleManageable } from '../../../src/admin/user-management.rules';
import type { AuditLogService } from '../../../src/common/audit-log.service';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import type { DbService } from '../../../src/db/db.service';
import type { ExportService } from '../../../src/export/export.service';
import type { PermissionsService } from '../../../src/permissions/permissions.service';
import type { RolesService } from '../../../src/admin/roles/roles.service';
import type { EmailQueueService } from '../../../src/queues/email-queue/email.queue.service';

/**
 * Hook additivi di invalidazione della cache permessi in `AdminService`
 * (SPEC-RBAC-F1 criterio 17): il ruolo di sistema dei permessi segue
 * `users.role` e un utente disattivato ha l'insieme vuoto, quindi entrambi i
 * cambi devono cancellare la chiave `perm:*` dell'utente dopo l'update.
 * File nuovo: nessun test esistente di `AdminService` viene modificato.
 */
describe('AdminService — invalidazione cache permessi (ADR-99 § 6)', () => {
  const ADMIN: AuthInfo = { userId: 2, role: AppUserRoles.Admin, name: 'Admin', scopeId: null };
  const TARGET = {
    id: 30,
    guid: 'user000000000030',
    name: 'Mario',
    email: 'mario@cms.test',
    role: AppUserRoles.User,
    isActive: true,
  };

  let findFirst: jest.Mock;
  let updateWhere: jest.Mock;
  let invalidateUsers: jest.Mock;
  let service: AdminService;
  let order: string[];

  beforeEach(() => {
    order = [];
    findFirst = jest.fn().mockResolvedValue({ ...TARGET });
    updateWhere = jest.fn(async () => {
      order.push('update');
    });
    invalidateUsers = jest.fn(async () => {
      order.push('invalidate');
    });
    const db = {
      query: { userEntity: { findFirst } },
      update: jest.fn(() => ({ set: jest.fn(() => ({ where: updateWhere })) })),
    };
    service = new AdminService(
      { db } as unknown as DbService,
      {} as SeedService,
      {} as EmailQueueService,
      { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService,
      {} as ExportService,
      { invalidateUsers } as unknown as PermissionsService,
      {} as RolesService,
    );
  });

  it('updateUser con cambio di role → invalidateUsers([id]) dopo l’update', async () => {
    await service.updateUser(TARGET.guid, { role: AppUserRoles.Manager }, ADMIN);

    expect(invalidateUsers).toHaveBeenCalledWith([TARGET.id]);
    expect(order).toEqual(['update', 'invalidate']);
  });

  it('updateUser con lo stesso role → nessuna invalidazione', async () => {
    await service.updateUser(TARGET.guid, { role: AppUserRoles.User }, ADMIN);
    expect(invalidateUsers).not.toHaveBeenCalled();
  });

  it('updateUser senza role → nessuna invalidazione', async () => {
    await service.updateUser(TARGET.guid, { name: 'Luigi' }, ADMIN);
    expect(invalidateUsers).not.toHaveBeenCalled();
  });

  it('toggleActiveUser → invalidateUsers([id]) dopo l’update', async () => {
    await service.toggleActiveUser(TARGET.guid, ADMIN);

    expect(invalidateUsers).toHaveBeenCalledWith([TARGET.id]);
    expect(order).toEqual(['update', 'invalidate']);
  });

  it('target SuperAdmin → 403 prima di qualsiasi update o invalidazione (regola invariata)', async () => {
    findFirst.mockResolvedValue({ ...TARGET, role: AppUserRoles.SuperAdmin });

    await expect(service.toggleActiveUser(TARGET.guid, ADMIN)).rejects.toThrow(
      new ForbiddenException('Non puoi gestire utenti con ruolo SuperAdmin.'),
    );
    expect(order).toEqual([]);
  });

  describe('assertTargetRoleManageable (regola estratta, condivisa con RolesService)', () => {
    it('Admin su SuperAdmin → 403; SuperAdmin su SuperAdmin e Admin su User → ok', () => {
      expect(() => assertTargetRoleManageable(AppUserRoles.SuperAdmin, ADMIN)).toThrow(
        'Non puoi gestire utenti con ruolo SuperAdmin.',
      );
      expect(() =>
        assertTargetRoleManageable(AppUserRoles.SuperAdmin, {
          ...ADMIN,
          role: AppUserRoles.SuperAdmin,
        }),
      ).not.toThrow();
      expect(() => assertTargetRoleManageable(AppUserRoles.User, ADMIN)).not.toThrow();
    });
  });
});
