import { Logger } from '@nestjs/common';
import { PermissionsSeedService } from '../../../src/permissions/permissions-seed.service';
import {
  ALL_PERMISSION_CODES,
  PERMISSIONS,
  SYSTEM_ROLE_CODES,
  SYSTEM_ROLES,
} from '../../../src/permissions/permissions.registry';
import { PermissionsService } from '../../../src/permissions/permissions.service';
import type { RedisService } from '../../../src/redis/redis.service';
import { createDrizzleMock } from './drizzle-mock';

/**
 * Unit test di `PermissionsSeedService` (SPEC-RBAC-F1 criterio 5). Il DB è
 * mockato: si verificano gli statement emessi (upsert, delete delle
 * differenze, `onConflict*` che rendono il seed idempotente e convergente) e
 * il comportamento non bloccante all'avvio (S4). La convergenza reale su
 * Postgres è verificata su `cms_db_test` con due esecuzioni consecutive.
 */
describe('PermissionsSeedService (unit) — ADR-99 § 3', () => {
  const PERMISSION_IDS = new Map(ALL_PERMISSION_CODES.map((code, i) => [code, i + 1]));
  const ROLE_IDS: Record<string, number> = { superadmin: 1, admin: 2, manager: 3, user: 4 };

  let mock: ReturnType<typeof createDrizzleMock>;
  let permissionsService: { invalidateRole: jest.Mock };
  let service: PermissionsSeedService;

  /** Risultati nell'ordine in cui `sync()` attende le query. */
  function queueSync(options: { removed?: string[]; cleanedRoleIds?: number[] } = {}): void {
    mock.results.push(
      ALL_PERMISSION_CODES.map((code) => ({ id: PERMISSION_IDS.get(code), code })), // 1. upsert permissions
      (options.removed ?? []).map((code) => ({ code })), // 2. delete permissions fuori registro
      SYSTEM_ROLE_CODES.map((code) => ({ id: ROLE_IDS[code], code })), // 3. upsert ruoli di sistema
    );
    for (let i = 0; i < SYSTEM_ROLE_CODES.length; i++) mock.results.push([], []); // 4. delete + insert
    mock.results.push((options.cleanedRoleIds ?? []).map((roleId) => ({ roleId }))); // 5. riservati
  }

  beforeEach(() => {
    mock = createDrizzleMock();
    permissionsService = { invalidateRole: jest.fn().mockResolvedValue(undefined) };
    service = new PermissionsSeedService(
      mock.dbService,
      permissionsService as unknown as PermissionsService,
    );
  });

  describe('sync()', () => {
    it('DB vuoto: upsert di tutti i permessi e dei 4 ruoli di sistema, in una transazione', async () => {
      queueSync();

      const summary = await service.sync();

      expect(mock.db.transaction).toHaveBeenCalledTimes(1);
      expect(summary).toEqual({
        permissions: PERMISSIONS.length,
        removedPermissions: [],
        systemRoles: 4,
        cleanedCustomRoleIds: [],
      });

      const permissionUpsert = mock.ops.find((o) => o.op === 'insert' && o.table === 'permissions');
      expect(permissionUpsert?.values).toEqual(
        PERMISSIONS.map((p) => ({
          code: p.code,
          category: p.category,
          description: p.description,
        })),
      );
      expect(permissionUpsert?.calls).toContain('onConflictDoUpdate');

      const roleUpsert = mock.ops.find((o) => o.op === 'insert' && o.table === 'roles');
      expect(roleUpsert?.values).toEqual(
        SYSTEM_ROLE_CODES.map((code) => ({
          code,
          name: SYSTEM_ROLES[code].name,
          description: SYSTEM_ROLES[code].description,
          isSystem: true,
          level: SYSTEM_ROLES[code].level,
        })),
      );
      expect(roleUpsert?.calls).toContain('onConflictDoUpdate');
    });

    it('associazioni esatte per ogni ruolo di sistema, con onConflictDoNothing (idempotente)', async () => {
      queueSync();

      await service.sync();

      const linkInserts = mock.ops.filter(
        (o) => o.op === 'insert' && o.table === 'role_permissions',
      );
      expect(linkInserts).toHaveLength(4);
      for (const code of SYSTEM_ROLE_CODES) {
        const insert = linkInserts.find(
          (o) => (o.values as { roleId: number }[])[0].roleId === ROLE_IDS[code],
        );
        expect(insert?.calls).toContain('onConflictDoNothing');
        expect((insert?.values as { permissionId: number }[]).map((v) => v.permissionId)).toEqual(
          SYSTEM_ROLES[code].permissions.map((c) => PERMISSION_IDS.get(c)),
        );
      }
      // Per ogni ruolo, prima si rimuove la differenza (delete), poi si inserisce il resto.
      const linkOps = mock.ops.filter((o) => o.table === 'role_permissions').map((o) => o.op);
      expect(linkOps.slice(0, 8)).toEqual(Array(4).fill(['delete', 'insert']).flat());
    });

    it('seconda esecuzione: stessi statement, nessun codice rimosso, nessuna invalidazione', async () => {
      queueSync();
      const first = await service.sync();
      const firstOps = mock.ops.map((o) => [o.op, o.table, o.calls.join(',')]);
      mock.ops.length = 0;

      queueSync();
      const second = await service.sync();

      expect(second).toEqual(first);
      expect(mock.ops.map((o) => [o.op, o.table, o.calls.join(',')])).toEqual(firstOps);
      expect(permissionsService.invalidateRole).not.toHaveBeenCalled();
    });

    it('un codice uscito dal registro viene eliminato (cascade sulle associazioni) e riportato', async () => {
      queueSync({ removed: ['blocks:html_embed'] });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      const summary = await service.sync();

      expect(summary.removedPermissions).toEqual(['blocks:html_embed']);
      const deletePermissions = mock.ops.find(
        (o) => o.op === 'delete' && o.table === 'permissions',
      );
      expect(deletePermissions?.calls).toEqual(['where', 'returning']);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('blocks:html_embed'));
      warn.mockRestore();
    });

    it('un codice riservato inserito a mano in un ruolo custom viene rimosso e il ruolo invalidato dopo il commit', async () => {
      queueSync({ cleanedRoleIds: [50, 50, 51] });
      const order: string[] = [];
      mock.db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const out = await cb(mock.db);
        order.push('commit');
        return out;
      });
      permissionsService.invalidateRole.mockImplementation(async (id: number) => {
        order.push(`invalidate:${id}`);
      });

      const summary = await service.sync();

      expect(summary.cleanedCustomRoleIds).toEqual([50, 51]);
      expect(order).toEqual(['commit', 'invalidate:50', 'invalidate:51']);
    });

    it('errore a metà transazione → rigetta, nessuna invalidazione', async () => {
      mock.results.push(new Error('relation "permissions" does not exist'));

      await expect(service.sync()).rejects.toThrow('does not exist');
      expect(permissionsService.invalidateRole).not.toHaveBeenCalled();
    });
  });

  describe('onApplicationBootstrap() — S4 non bloccante', () => {
    it('un errore DB viene loggato con l’indicazione di migrare e non propagato', async () => {
      mock.results.push(new Error('relation "permissions" does not exist'));
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(expect.stringContaining('npm run db:migrate'));
      error.mockRestore();
    });

    it('dopo un seed fallito un utente risolto ha l’insieme vuoto (fail-closed)', async () => {
      mock.results.push(new Error('relation "permissions" does not exist'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      await service.onApplicationBootstrap();

      // Senza righe in roles/permissions la query dei permessi non restituisce nulla.
      mock.results.push([]);
      const redis = { isReady: jest.fn().mockReturnValue(false) };
      const permissions = new PermissionsService(mock.dbService, redis as unknown as RedisService);

      expect((await permissions.getUserPermissions(1)).size).toBe(0);
      jest.restoreAllMocks();
    });

    it('seed riuscito → log di completamento', async () => {
      queueSync();
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await service.onApplicationBootstrap();

      expect(log).toHaveBeenCalledWith(
        `Seed RBAC completato: ${PERMISSIONS.length} permessi, 4 ruoli di sistema.`,
      );
      log.mockRestore();
    });
  });
});
