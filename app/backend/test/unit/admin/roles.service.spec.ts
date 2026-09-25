import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseError } from 'pg';
import { RolesService } from '../../../src/admin/roles/roles.service';
import type { AuditLogService } from '../../../src/common/audit-log.service';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import {
  ALL_PERMISSION_CODES,
  PermissionCode,
  SYSTEM_ROLES,
} from '../../../src/permissions/permissions.registry';
import type { PermissionsService } from '../../../src/permissions/permissions.service';
import { createDrizzleMock } from '../permissions/drizzle-mock';

/**
 * Unit test di `RolesService` (SPEC-RBAC-F1 criteri 12–16): anti-escalation,
 * `roles:manage` riservato ai ruoli di sistema (S6), ruoli di sistema modificabili
 * ma non eliminabili, `409 ROLE_IN_USE`, invalidazione post-commit e audit log.
 *
 * I permessi del chiamante vengono da `PermissionsService` (mock): SuperAdmin
 * = tutti i codici, Admin = seed del ruolo `admin` (senza `roles:manage`, P2).
 * Le query sono servite in ordine dal mock Drizzle (`results`, FIFO).
 */
describe('RolesService (unit) — ADR-99 § 7–8', () => {
  const SUPERADMIN: AuthInfo = {
    userId: 1,
    role: AppUserRoles.SuperAdmin,
    name: 'Root',
    scopeId: null,
  };
  const ADMIN: AuthInfo = { userId: 2, role: AppUserRoles.Admin, name: 'Admin', scopeId: null };
  const MANAGER: AuthInfo = {
    userId: 3,
    role: AppUserRoles.Manager,
    name: 'Manager',
    scopeId: null,
  };

  const GRANTS: Record<number, readonly PermissionCode[]> = {
    [SUPERADMIN.userId]: ALL_PERMISSION_CODES,
    [ADMIN.userId]: SYSTEM_ROLES.admin.permissions,
    [MANAGER.userId]: SYSTEM_ROLES.manager.permissions,
  };

  const CUSTOM_ROLE = {
    id: 50,
    guid: 'role0000000000aa',
    code: 'seo_specialist',
    name: 'SEO Specialist',
    description: null,
    isSystem: false,
    level: null,
    createdAt: new Date('2026-09-24T00:00:00Z'),
    updatedAt: new Date('2026-09-24T00:00:00Z'),
    createdBy: 1,
    updatedBy: 1,
  };
  const SYSTEM_ADMIN_ROLE = {
    ...CUSTOM_ROLE,
    id: 2,
    guid: 'sysadmin00000000',
    code: 'admin',
    name: 'Admin',
    isSystem: true,
    level: AppUserRoles.Admin,
  };

  /** Righe `{ roleId, code }` restituite da `loadRoleCodes`. */
  function roleCodes(roleId: number, codes: PermissionCode[]): { roleId: number; code: string }[] {
    return codes.map((code) => ({ roleId, code }));
  }

  /** Righe `{ id, code }` restituite dalla lookup dei permessi in `replaceRolePermissions`. */
  function permissionRows(codes: PermissionCode[]): { id: number; code: string }[] {
    return codes.map((code) => ({ id: ALL_PERMISSION_CODES.indexOf(code) + 1, code }));
  }

  /** Errore Postgres come lo solleva Drizzle (driver `pg` in `.cause`). */
  function pgError(code: string, constraint: string): Error {
    const cause = new DatabaseError('violazione vincolo', 0, 'error');
    cause.code = code;
    cause.constraint = constraint;
    const wrapped = new Error('Failed query');
    (wrapped as Error & { cause: unknown }).cause = cause;
    return wrapped;
  }

  let mock: ReturnType<typeof createDrizzleMock>;
  let permissionsService: {
    getUserPermissions: jest.Mock;
    invalidateRole: jest.Mock;
    invalidateUsers: jest.Mock;
  };
  let auditLog: { log: jest.Mock };
  let service: RolesService;

  beforeEach(() => {
    mock = createDrizzleMock();
    permissionsService = {
      getUserPermissions: jest.fn(async (userId: number) => new Set(GRANTS[userId] ?? [])),
      invalidateRole: jest.fn().mockResolvedValue(undefined),
      invalidateUsers: jest.fn().mockResolvedValue(undefined),
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new RolesService(
      mock.dbService,
      permissionsService as unknown as PermissionsService,
      auditLog as unknown as AuditLogService,
    );
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create() — criterio 12', () => {
    const INPUT = {
      code: 'seo_specialist',
      name: 'SEO Specialist',
      permissionCodes: ['pages:edit_any', 'pages:publish'] as PermissionCode[],
    };

    it('happy path (SuperAdmin): ruolo e associazioni in transazione, audit, nessuna invalidazione', async () => {
      mock.results.push(
        [{ id: 50, guid: CUSTOM_ROLE.guid }], // insert roles
        [], // delete role_permissions
        permissionRows(INPUT.permissionCodes), // lookup permessi
        [], // insert role_permissions
      );

      await expect(service.create(INPUT, SUPERADMIN, '10.0.0.1')).resolves.toEqual({
        guid: CUSTOM_ROLE.guid,
      });

      expect(mock.db.transaction).toHaveBeenCalledTimes(1);
      const roleInsert = mock.ops.find((o) => o.op === 'insert' && o.table === 'roles');
      expect(roleInsert?.values).toMatchObject({
        code: 'seo_specialist',
        isSystem: false,
        level: null,
      });
      const linkInsert = mock.ops.find((o) => o.op === 'insert' && o.table === 'role_permissions');
      expect(linkInsert?.values).toEqual(
        permissionRows(INPUT.permissionCodes).map((p) => ({ roleId: 50, permissionId: p.id })),
      );
      expect(permissionsService.invalidateRole).not.toHaveBeenCalled();
      expect(permissionsService.invalidateUsers).not.toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalledWith(
        SUPERADMIN.userId,
        'role.create',
        'role',
        CUSTOM_ROLE.guid,
        { code: 'seo_specialist', permissions: INPUT.permissionCodes },
        undefined,
        '10.0.0.1',
      );
    });

    it('chiamante senza roles:manage (Admin, P2) → 403, nessuna scrittura', async () => {
      await expect(service.create(INPUT, ADMIN)).rejects.toThrow(
        new ForbiddenException('Permessi insufficienti (richiesto permesso: roles:manage).'),
      );
      expect(mock.ops).toHaveLength(0);
    });

    it('codice permesso sconosciuto → 400 INVALID_PERMISSION_CODE', async () => {
      const attempt = service.create(
        { ...INPUT, permissionCodes: ['pages:create', 'blocks:html_embed' as PermissionCode] },
        SUPERADMIN,
      );
      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(
          { ...INPUT, permissionCodes: ['forms:manage' as PermissionCode] },
          SUPERADMIN,
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_PERMISSION_CODE' } });
      expect(mock.ops).toHaveLength(0);
    });

    it('S6: roles:manage in un ruolo custom → 400 RESERVED_PERMISSION, anche per il SuperAdmin', async () => {
      await expect(
        service.create({ ...INPUT, permissionCodes: ['pages:create', 'roles:manage'] }, SUPERADMIN),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'RESERVED_PERMISSION' },
      });
      expect(mock.ops).toHaveLength(0);
    });

    it('code ruolo malformato → 400 INVALID_ROLE_CODE', async () => {
      for (const code of ['SEO', 'ab', '1role', 'seo-specialist', 'x'.repeat(51)]) {
        await expect(service.create({ ...INPUT, code }, SUPERADMIN)).rejects.toMatchObject({
          status: 400,
          response: { code: 'INVALID_ROLE_CODE' },
        });
      }
    });

    it('code di un ruolo di sistema → 409 ROLE_CODE_DUPLICATE', async () => {
      await expect(service.create({ ...INPUT, code: 'admin' }, SUPERADMIN)).rejects.toMatchObject({
        status: 409,
        response: { code: 'ROLE_CODE_DUPLICATE' },
      });
    });

    it('code duplicato (roles_code_uq) → 409 ROLE_CODE_DUPLICATE, nessun audit', async () => {
      mock.results.push(pgError('23505', 'roles_code_uq'));

      const attempt = service.create(INPUT, SUPERADMIN);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: { code: 'ROLE_CODE_DUPLICATE' } });
      expect(auditLog.log).not.toHaveBeenCalled();
    });
  });

  // ─── update / delete su ruoli di sistema ───────────────────────────────────

  describe('ruoli di sistema modificabili — criterio 13', () => {
    it('update su ruolo di sistema → ok per il SuperAdmin', async () => {
      mock.results.push([SYSTEM_ADMIN_ROLE], roleCodes(SYSTEM_ADMIN_ROLE.id, []), []);

      await expect(
        service.update(SYSTEM_ADMIN_ROLE.guid, { name: 'Altro' }, SUPERADMIN),
      ).resolves.toEqual({
        guid: SYSTEM_ADMIN_ROLE.guid,
      });
      expect(mock.db.transaction).toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalledWith(
        SUPERADMIN.userId,
        'role.update',
        'role',
        SYSTEM_ADMIN_ROLE.guid,
        { name: 'Altro' },
        undefined,
        undefined,
      );
    });

    it('delete su ruolo di sistema → 403 SYSTEM_ROLE_READONLY anche per il SuperAdmin', async () => {
      mock.results.push([SYSTEM_ADMIN_ROLE]);

      await expect(service.delete(SYSTEM_ADMIN_ROLE.guid, SUPERADMIN)).rejects.toMatchObject({
        status: 403,
        response: { code: 'SYSTEM_ROLE_READONLY' },
      });
      expect(mock.db.transaction).not.toHaveBeenCalled();
    });

    it('ruolo inesistente → 404', async () => {
      mock.results.push([]);
      await expect(service.update('missing000000000', {}, SUPERADMIN)).rejects.toThrow(
        new NotFoundException('Ruolo non trovato.'),
      );
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update() — criteri 12/16', () => {
    it('S6: roles:manage aggiunto a un ruolo custom → 400 RESERVED_PERMISSION', async () => {
      mock.results.push([CUSTOM_ROLE], roleCodes(50, ['pages:publish']));

      await expect(
        service.update(CUSTOM_ROLE.guid, { permissionCodes: ['roles:manage'] }, SUPERADMIN),
      ).rejects.toMatchObject({ status: 400, response: { code: 'RESERVED_PERMISSION' } });
      expect(mock.db.transaction).not.toHaveBeenCalled();
    });

    it('Admin senza roles:manage → 403 anche su ruolo custom', async () => {
      mock.results.push([CUSTOM_ROLE]);

      await expect(service.update(CUSTOM_ROLE.guid, { name: 'X' }, ADMIN)).rejects.toThrow(
        'richiesto permesso: roles:manage',
      );
    });

    it('cambio permessi → riscrive le associazioni e invalida DOPO il commit', async () => {
      mock.results.push(
        [CUSTOM_ROLE], // findRole
        roleCodes(50, ['pages:publish']), // codici attuali
        [], // update roles
        [], // delete role_permissions
        permissionRows(['pages:publish', 'media:delete_any']),
        [], // insert role_permissions
      );
      const order: string[] = [];
      mock.db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const out = await cb(mock.db);
        order.push('commit');
        return out;
      });
      permissionsService.invalidateRole.mockImplementation(async () => {
        order.push('invalidate');
      });

      await service.update(
        CUSTOM_ROLE.guid,
        { permissionCodes: ['pages:publish', 'media:delete_any'] },
        SUPERADMIN,
      );

      expect(order).toEqual(['commit', 'invalidate']);
      expect(permissionsService.invalidateRole).toHaveBeenCalledWith(50);
      expect(auditLog.log).toHaveBeenCalledWith(
        SUPERADMIN.userId,
        'role.update',
        'role',
        CUSTOM_ROLE.guid,
        {
          permissions: {
            before: ['pages:publish'],
            after: ['pages:publish', 'media:delete_any'],
          },
        },
        undefined,
        undefined,
      );
    });

    it('rollback della transazione → nessuna invalidazione e nessun audit', async () => {
      mock.results.push(
        [CUSTOM_ROLE],
        roleCodes(50, ['pages:publish']),
        [], // update roles
        [], // delete role_permissions
        permissionRows(['media:delete_any']),
        new Error('deadlock detected'), // insert role_permissions
      );

      await expect(
        service.update(CUSTOM_ROLE.guid, { permissionCodes: ['media:delete_any'] }, SUPERADMIN),
      ).rejects.toThrow('deadlock detected');
      expect(permissionsService.invalidateRole).not.toHaveBeenCalled();
      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('stessi permessi in ordine diverso o solo nome → nessuna riscrittura né invalidazione', async () => {
      mock.results.push([CUSTOM_ROLE], roleCodes(50, ['pages:publish', 'pages:edit_any']), []);

      await service.update(
        CUSTOM_ROLE.guid,
        { name: 'SEO', permissionCodes: ['pages:edit_any', 'pages:publish'] },
        SUPERADMIN,
      );

      expect(
        mock.ops.filter((o) => o.table === 'role_permissions' && o.op !== 'select'),
      ).toHaveLength(0);
      expect(permissionsService.invalidateRole).not.toHaveBeenCalled();
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete() — criterio 14 (409 ROLE_IN_USE)', () => {
    it('ruolo assegnato → 409 ROLE_IN_USE, nessuna delete eseguita', async () => {
      mock.results.push([CUSTOM_ROLE], roleCodes(50, ['pages:publish']), [{ assigned: 3 }]);

      const attempt = service.delete(CUSTOM_ROLE.guid, SUPERADMIN);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({
        response: {
          code: 'ROLE_IN_USE',
          message: 'Il ruolo è assegnato a 3 utenti: rimuovilo prima di eliminarlo.',
        },
      });
      expect(mock.ops.filter((o) => o.op === 'delete')).toHaveLength(0);
      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('il conteggio include gli utenti disattivati (nessun filtro is_active)', async () => {
      mock.results.push([CUSTOM_ROLE], roleCodes(50, []), [{ assigned: 1 }]);

      await expect(service.delete(CUSTOM_ROLE.guid, SUPERADMIN)).rejects.toMatchObject({
        response: { code: 'ROLE_IN_USE' },
      });
      const countQuery = mock.ops.find((o) => o.op === 'select' && o.table === 'user_roles');
      expect(countQuery).toBeDefined();
      expect(mock.ops.some((o) => o.table === 'users')).toBe(false);
    });

    it('violazione FK concorrente (23503 su user_roles) → stesso 409 ROLE_IN_USE', async () => {
      mock.results.push(
        [CUSTOM_ROLE],
        roleCodes(50, ['pages:publish']),
        [{ assigned: 0 }],
        [], // delete role_permissions
        pgError('23503', 'user_roles_role_id_roles_id_fk'), // delete roles
      );

      await expect(service.delete(CUSTOM_ROLE.guid, SUPERADMIN)).rejects.toMatchObject({
        status: 409,
        response: { code: 'ROLE_IN_USE' },
      });
      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('altri errori DB si propagano invariati', async () => {
      mock.results.push(
        [CUSTOM_ROLE],
        roleCodes(50, []),
        [{ assigned: 0 }],
        [],
        new Error('connection lost'),
      );

      await expect(service.delete(CUSTOM_ROLE.guid, SUPERADMIN)).rejects.toThrow('connection lost');
    });

    it('ruolo non assegnato → elimina role_permissions e roles in transazione, con audit', async () => {
      mock.results.push([CUSTOM_ROLE], roleCodes(50, ['pages:publish']), [{ assigned: 0 }]);

      await service.delete(CUSTOM_ROLE.guid, SUPERADMIN);

      expect(mock.db.transaction).toHaveBeenCalledTimes(1);
      expect(mock.ops.filter((o) => o.op === 'delete').map((o) => o.table)).toEqual([
        'role_permissions',
        'roles',
      ]);
      expect(auditLog.log).toHaveBeenCalledWith(
        SUPERADMIN.userId,
        'role.delete',
        'role',
        CUSTOM_ROLE.guid,
        { code: 'seo_specialist', permissions: ['pages:publish'] },
        undefined,
        undefined,
      );
    });
  });

  // ─── setUserRoles ──────────────────────────────────────────────────────────

  describe('setUserRoles() — criterio 15 (anti-escalation)', () => {
    const TARGET_USER = { id: 30, guid: 'user000000000030', role: AppUserRoles.User };
    const MEDIA_ROLE = { ...CUSTOM_ROLE, id: 60, guid: 'role0000000000bb', code: 'media_manager' };

    it('chiamante che aggiunge un ruolo con permessi che non possiede → 403 PERMISSION_ESCALATION con i codici', async () => {
      // Con il seed attuale l'Admin possiede ogni codice assegnabile a un ruolo
      // custom (roles:manage è riservato, S6): l'escalation si esercita con un
      // Manager a cui un ruolo custom ha concesso users:assign_roles.
      mock.results.push(
        [TARGET_USER],
        [MEDIA_ROLE],
        [], // ruoli attuali
        roleCodes(60, ['media:upload', 'pages:delete', 'media:delete_any']),
      );
      GRANTS[MANAGER.userId] = [...SYSTEM_ROLES.manager.permissions, 'users:assign_roles'];

      await expect(
        service.setUserRoles(TARGET_USER.guid, [MEDIA_ROLE.guid], MANAGER),
      ).rejects.toMatchObject({
        status: 403,
        response: {
          code: 'PERMISSION_ESCALATION',
          message: 'Non puoi concedere permessi che non possiedi: pages:delete, media:delete_any.',
        },
      });
      expect(mock.db.transaction).not.toHaveBeenCalled();
      expect(permissionsService.invalidateUsers).not.toHaveBeenCalled();
      GRANTS[MANAGER.userId] = SYSTEM_ROLES.manager.permissions;
    });

    it('Admin aggiunge un ruolo con soli permessi suoi → ok, invalidazione del target dopo il commit, audit', async () => {
      mock.results.push(
        [TARGET_USER],
        [MEDIA_ROLE],
        [],
        roleCodes(60, ['media:upload', 'media:delete_any']),
        [], // insert user_roles
      );

      await expect(
        service.setUserRoles(TARGET_USER.guid, [MEDIA_ROLE.guid], ADMIN, '10.0.0.2'),
      ).resolves.toEqual({ guid: TARGET_USER.guid, roleGuids: [MEDIA_ROLE.guid] });

      const insert = mock.ops.find((o) => o.op === 'insert' && o.table === 'user_roles');
      expect(insert?.values).toEqual([{ userId: 30, roleId: 60 }]);
      expect(permissionsService.invalidateUsers).toHaveBeenCalledWith([30]);
      expect(auditLog.log).toHaveBeenCalledWith(
        ADMIN.userId,
        'user.roles.update',
        'user',
        TARGET_USER.guid,
        { added: ['media_manager'], removed: [] },
        undefined,
        '10.0.0.2',
      );
    });

    it('chiamante senza users:assign_roles (Manager) → 403', async () => {
      await expect(service.setUserRoles(TARGET_USER.guid, [], MANAGER)).rejects.toThrow(
        'richiesto permesso: users:assign_roles',
      );
      expect(mock.ops).toHaveLength(0);
    });

    it('Admin su target SuperAdmin → 403 con il messaggio di AdminService', async () => {
      mock.results.push([{ ...TARGET_USER, role: AppUserRoles.SuperAdmin }]);

      await expect(service.setUserRoles(TARGET_USER.guid, [], ADMIN)).rejects.toThrow(
        new ForbiddenException('Non puoi gestire utenti con ruolo SuperAdmin.'),
      );
    });

    it('ruolo di sistema → 400 SYSTEM_ROLE_NOT_ASSIGNABLE (S9)', async () => {
      mock.results.push([TARGET_USER], [SYSTEM_ADMIN_ROLE]);

      await expect(
        service.setUserRoles(TARGET_USER.guid, [SYSTEM_ADMIN_ROLE.guid], SUPERADMIN),
      ).rejects.toMatchObject({ status: 400, response: { code: 'SYSTEM_ROLE_NOT_ASSIGNABLE' } });
    });

    it('utente o ruolo inesistente → 404', async () => {
      mock.results.push([]);
      await expect(service.setUserRoles('nope', [], ADMIN)).rejects.toThrow(
        new NotFoundException('Utente non trovato.'),
      );

      mock.results.push([TARGET_USER], []);
      await expect(service.setUserRoles(TARGET_USER.guid, ['ghost'], ADMIN)).rejects.toThrow(
        new NotFoundException('Ruolo non trovato.'),
      );
    });

    it('rimozione di un ruolo con permessi che il chiamante non ha → ok senza controllo dei codici (S7)', async () => {
      const POWER_ROLE = { id: 70, code: 'power' };
      mock.results.push(
        [TARGET_USER],
        [POWER_ROLE], // ruoli attuali: nessun ruolo desiderato, quindi nessuna lookup dei ruoli
        [], // delete user_roles
      );
      GRANTS[MANAGER.userId] = [...SYSTEM_ROLES.manager.permissions, 'users:assign_roles'];

      await service.setUserRoles(TARGET_USER.guid, [], MANAGER);

      // Nessuna lettura di role_permissions: i codici del ruolo rimosso non contano.
      expect(mock.ops.some((o) => o.table === 'role_permissions')).toBe(false);
      expect(mock.ops.find((o) => o.op === 'delete')?.table).toBe('user_roles');
      expect(permissionsService.invalidateUsers).toHaveBeenCalledWith([30]);
      expect(auditLog.log).toHaveBeenCalledWith(
        MANAGER.userId,
        'user.roles.update',
        'user',
        TARGET_USER.guid,
        { added: [], removed: ['power'] },
        undefined,
        undefined,
      );
      GRANTS[MANAGER.userId] = SYSTEM_ROLES.manager.permissions;
    });

    it('insieme invariato → nessuna scrittura né invalidazione', async () => {
      mock.results.push([TARGET_USER], [MEDIA_ROLE], [{ id: 60, code: 'media_manager' }]);

      await service.setUserRoles(TARGET_USER.guid, [MEDIA_ROLE.guid, MEDIA_ROLE.guid], ADMIN);

      expect(mock.db.transaction).not.toHaveBeenCalled();
      expect(permissionsService.invalidateUsers).not.toHaveBeenCalled();
    });
  });

  // ─── lettura ───────────────────────────────────────────────────────────────

  describe('lettura', () => {
    it('list() restituisce i ruoli con i rispettivi codici', async () => {
      mock.results.push(
        [SYSTEM_ADMIN_ROLE, CUSTOM_ROLE],
        [...roleCodes(2, ['users:read']), ...roleCodes(50, ['pages:publish'])],
      );

      const roles = await service.list();

      expect(roles.map((r) => [r.code, r.isSystem, r.permissions])).toEqual([
        ['admin', true, ['users:read']],
        ['seo_specialist', false, ['pages:publish']],
      ]);
    });

    it('listPermissions() raggruppa per categoria nell’ordine del registro', async () => {
      mock.results.push([
        { code: 'media:upload', category: 'media', description: 'Caricare Media' },
        { code: 'pages:create', category: 'pages', description: 'Creare una Pagina' },
      ]);

      const groups = await service.listPermissions();

      expect(groups.map((g) => g.category)).toEqual(['pages', 'media']);
      expect(groups[1].permissions).toEqual([
        { code: 'media:upload', description: 'Caricare Media' },
      ]);
    });
  });
});
