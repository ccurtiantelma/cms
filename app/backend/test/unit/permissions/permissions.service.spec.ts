import {
  PERMISSIONS_CACHE_TTL_SECONDS,
  PermissionsService,
} from '../../../src/permissions/permissions.service';
import { computeRegistryHash, SYSTEM_ROLES } from '../../../src/permissions/permissions.registry';
import type { RedisService } from '../../../src/redis/redis.service';
import { createDrizzleMock } from './drizzle-mock';

/**
 * Unit test di `PermissionsService` (SPEC-RBAC-F1 criteri 6–9): risoluzione
 * cache → DB, rami di errore Redis (mai fail-open), unione sistema ∪ custom,
 * invalidazione per utente e per ruolo. DB e Redis sono i soli confini mockati.
 */
describe('PermissionsService (unit) — ADR-99 § 6', () => {
  const USER_ID = 42;
  const KEY = `perm:v${computeRegistryHash()}:user:${USER_ID}`;

  let mock: ReturnType<typeof createDrizzleMock>;
  let redis: {
    isReady: jest.Mock;
    getJson: jest.Mock;
    set: jest.Mock;
    delMany: jest.Mock;
  };
  let service: PermissionsService;

  beforeEach(() => {
    mock = createDrizzleMock();
    redis = {
      isReady: jest.fn().mockReturnValue(true),
      getJson: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delMany: jest.fn().mockResolvedValue(1),
    };
    service = new PermissionsService(mock.dbService, redis as unknown as RedisService);
  });

  it('la chiave segue il pattern perm:v<hash>:user:<id>', () => {
    expect(service.cacheKey(USER_ID)).toBe(KEY);
  });

  describe('getUserPermissions() — criterio 6', () => {
    it('miss → una sola query DB (union) → set con TTL 3600', async () => {
      mock.results.push([{ code: 'pages:create' }, { code: 'media:upload' }]);

      const granted = await service.getUserPermissions(USER_ID);

      expect([...granted].sort()).toEqual(['media:upload', 'pages:create']);
      expect(redis.getJson).toHaveBeenCalledWith(KEY);
      // Due rami (sistema, custom) in un unico statement UNION: un solo await.
      expect(mock.db.select).toHaveBeenCalledTimes(2);
      expect(mock.results).toHaveLength(0);
      expect(redis.set).toHaveBeenCalledWith(
        KEY,
        ['pages:create', 'media:upload'],
        PERMISSIONS_CACHE_TTL_SECONDS,
      );
      expect(PERMISSIONS_CACHE_TTL_SECONDS).toBe(3600);
    });

    it('hit → nessuna query DB e nessuna riscrittura', async () => {
      redis.getJson.mockResolvedValue(['pages:create', 'roles:read']);

      const granted = await service.getUserPermissions(USER_ID);

      expect([...granted]).toEqual(['pages:create', 'roles:read']);
      expect(mock.db.select).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('hit di un insieme vuoto è un hit (nessuna query DB)', async () => {
      redis.getJson.mockResolvedValue([]);

      const granted = await service.getUserPermissions(USER_ID);

      expect(granted.size).toBe(0);
      expect(mock.db.select).not.toHaveBeenCalled();
    });

    it('in cache scarta i codici fuori registro', async () => {
      redis.getJson.mockResolvedValue(['pages:create', 'blocks:html_embed']);

      expect([...(await service.getUserPermissions(USER_ID))]).toEqual(['pages:create']);
    });
  });

  describe('rami Redis — criterio 7 (mai fail-open)', () => {
    it('Redis non pronto → DB, nessuna chiamata a get/set', async () => {
      redis.isReady.mockReturnValue(false);
      mock.results.push([{ code: 'pages:create' }]);

      const granted = await service.getUserPermissions(USER_ID);

      expect([...granted]).toEqual(['pages:create']);
      expect(redis.getJson).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('get che lancia → DB', async () => {
      redis.getJson.mockRejectedValue(new Error('READONLY'));
      mock.results.push([{ code: 'media:upload' }]);

      expect([...(await service.getUserPermissions(USER_ID))]).toEqual(['media:upload']);
    });

    it('set che lancia → il risultato viene comunque restituito', async () => {
      redis.set.mockRejectedValue(new Error('OOM'));
      mock.results.push([{ code: 'media:upload' }]);

      expect([...(await service.getUserPermissions(USER_ID))]).toEqual(['media:upload']);
    });

    it('errore DB → si propaga (nessun default permissivo) e nulla va in cache', async () => {
      mock.results.push(new Error('connection refused'));

      await expect(service.getUserPermissions(USER_ID)).rejects.toThrow('connection refused');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('unione sistema ∪ custom — criterio 8', () => {
    it('User con ruolo custom {media:delete_any} → codici di user + media:delete_any', async () => {
      // La UNION del DB restituisce già codici distinti; l'insieme li preserva.
      mock.results.push([
        ...SYSTEM_ROLES.user.permissions.map((code) => ({ code })),
        { code: 'media:delete_any' },
      ]);

      const granted = await service.getUserPermissions(USER_ID);

      expect([...granted].sort()).toEqual(
        [...SYSTEM_ROLES.user.permissions, 'media:delete_any'].sort(),
      );
    });

    it('utente inattivo o inesistente → insieme vuoto, messo in cache', async () => {
      mock.results.push([]);

      const granted = await service.getUserPermissions(USER_ID);

      expect(granted.size).toBe(0);
      expect(redis.set).toHaveBeenCalledWith(KEY, [], PERMISSIONS_CACHE_TTL_SECONDS);
    });
  });

  describe('hasAll()', () => {
    it('AND: ok solo se tutti presenti, missing nell’ordine richiesto', async () => {
      redis.getJson.mockResolvedValue(['pages:create']);

      await expect(service.hasAll(USER_ID, ['pages:create'])).resolves.toEqual({
        ok: true,
        missing: [],
      });
      await expect(
        service.hasAll(USER_ID, ['pages:delete', 'pages:create', 'roles:manage']),
      ).resolves.toEqual({ ok: false, missing: ['pages:delete', 'roles:manage'] });
    });
  });

  describe('invalidazione — criterio 9', () => {
    it('invalidateUsers([]) non chiama Redis', async () => {
      await service.invalidateUsers([]);
      expect(redis.delMany).not.toHaveBeenCalled();
    });

    it('invalidateUsers cancella le chiavi deduplicate con l’hash corrente', async () => {
      await service.invalidateUsers([1, 2, 1]);
      expect(redis.delMany).toHaveBeenCalledWith([service.cacheKey(1), service.cacheKey(2)]);
    });

    it('invalidateRole cancella le chiavi di tutti e soli gli utenti con quel ruolo', async () => {
      mock.results.push([{ userId: 7 }, { userId: 9 }]);

      await service.invalidateRole(3);

      expect(mock.ops[0]).toMatchObject({ op: 'select', table: 'user_roles' });
      expect(redis.delMany).toHaveBeenCalledWith([service.cacheKey(7), service.cacheKey(9)]);
    });

    it('invalidateRole su ruolo non assegnato non chiama Redis', async () => {
      mock.results.push([]);
      await service.invalidateRole(3);
      expect(redis.delMany).not.toHaveBeenCalled();
    });

    it('DEL che fallisce → loggato, non propagato (S10)', async () => {
      redis.delMany.mockRejectedValue(new Error('timeout'));
      await expect(service.invalidateUsers([1])).resolves.toBeUndefined();
    });

    it('Redis non pronto → DEL accodato senza attendere', async () => {
      redis.isReady.mockReturnValue(false);
      redis.delMany.mockReturnValue(new Promise(() => undefined)); // mai risolta: riconnessione futura

      await expect(service.invalidateUsers([1])).resolves.toBeUndefined();
      expect(redis.delMany).toHaveBeenCalledWith([service.cacheKey(1)]);
    });
  });
});
