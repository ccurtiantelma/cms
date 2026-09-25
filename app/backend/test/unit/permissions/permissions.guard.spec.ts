import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppUserRoles } from '../../../src/common/enums';
import { AuthInfo } from '../../../src/common/types';
import { Permissions } from '../../../src/permissions/permissions.decorator';
import { PERMISSIONS_KEY, PermissionsGuard } from '../../../src/permissions/permissions.guard';
import { PermissionCode } from '../../../src/permissions/permissions.registry';
import { PermissionsService } from '../../../src/permissions/permissions.service';
import type { RedisService } from '../../../src/redis/redis.service';
import { createDrizzleMock } from './drizzle-mock';

/**
 * Unit test di `PermissionsGuard` e `@Permissions` (SPEC-RBAC-F1 criteri
 * 10–11). La validazione passa da un `PermissionsService` reale con Redis e DB
 * mockati, così si verifica anche il percorso cache → DB, non solo il guard.
 */
describe('PermissionsGuard (unit) — ADR-99 § 5', () => {
  const ADMIN: AuthInfo = { userId: 10, role: AppUserRoles.Admin, name: 'Admin', scopeId: null };

  let mock: ReturnType<typeof createDrizzleMock>;
  let redis: { isReady: jest.Mock; getJson: jest.Mock; set: jest.Mock; delMany: jest.Mock };
  let permissionsService: PermissionsService;
  let guard: PermissionsGuard;

  /** Contesto HTTP con i metadati di `@Permissions` su handler e/o classe. */
  function contextFor(
    authInfo: AuthInfo | undefined,
    handlerCodes?: PermissionCode[],
    classCodes?: PermissionCode[],
  ): ExecutionContext {
    const handler = function handler(): void {};
    class TestController {}
    if (handlerCodes) Reflect.defineMetadata(PERMISSIONS_KEY, handlerCodes, handler);
    if (classCodes) Reflect.defineMetadata(PERMISSIONS_KEY, classCodes, TestController);
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => ({ authInfo }) }),
    } as unknown as ExecutionContext;
  }

  /** Permessi in cache per l'utente (hit Redis). */
  function cached(codes: PermissionCode[]): void {
    redis.getJson.mockResolvedValue(codes);
  }

  beforeEach(() => {
    mock = createDrizzleMock();
    redis = {
      isReady: jest.fn().mockReturnValue(true),
      getJson: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delMany: jest.fn().mockResolvedValue(1),
    };
    permissionsService = new PermissionsService(mock.dbService, redis as unknown as RedisService);
    guard = new PermissionsGuard(new Reflector(), permissionsService);
  });

  describe('criterio 10: decisione', () => {
    it('permesso presente (cache hit) → true, nessuna query DB', async () => {
      cached(['users:read']);

      await expect(guard.canActivate(contextFor(ADMIN, ['users:read']))).resolves.toBe(true);
      expect(redis.getJson).toHaveBeenCalledWith(permissionsService.cacheKey(ADMIN.userId));
      expect(mock.db.select).not.toHaveBeenCalled();
    });

    it('cache miss → DB → autorizza e popola la cache', async () => {
      mock.results.push([{ code: 'users:read' }]);

      await expect(guard.canActivate(contextFor(ADMIN, ['users:read']))).resolves.toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        permissionsService.cacheKey(ADMIN.userId),
        ['users:read'],
        3600,
      );
    });

    it('permesso assente → 403 con il messaggio del contratto', async () => {
      cached(['users:read']);

      const attempt = guard.canActivate(contextFor(ADMIN, ['roles:manage']));
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(guard.canActivate(contextFor(ADMIN, ['roles:manage']))).rejects.toThrow(
        'Permessi insufficienti (richiesto permesso: roles:manage).',
      );
    });

    it('AND con due codici, uno mancante → 403 che nomina il mancante', async () => {
      cached(['users:read']);

      await expect(
        guard.canActivate(contextFor(ADMIN, ['users:read', 'users:write'])),
      ).rejects.toThrow('Permessi insufficienti (richiesto permesso: users:write).');
    });

    it('AND con entrambi i codici → true', async () => {
      cached(['users:read', 'users:write']);

      await expect(
        guard.canActivate(contextFor(ADMIN, ['users:read', 'users:write'])),
      ).resolves.toBe(true);
    });

    it('i metadati dell’handler prevalgono su quelli di classe', async () => {
      cached(['users:read']);

      await expect(
        guard.canActivate(contextFor(ADMIN, ['users:read'], ['roles:manage'])),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(contextFor(ADMIN, undefined, ['roles:manage'])),
      ).rejects.toThrow('richiesto permesso: roles:manage');
    });

    it('permesso revocato: dopo l’invalidazione il guard rilegge dal DB e nega', async () => {
      // Prima richiesta: il DB concede, il valore finisce in cache.
      const store = new Map<string, unknown>();
      redis.getJson.mockImplementation(async (key: string) => store.get(key) ?? null);
      redis.set.mockImplementation(async (key: string, value: unknown) => {
        store.set(key, value);
      });
      redis.delMany.mockImplementation(async (keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return keys.length;
      });
      mock.results.push([{ code: 'media:delete_any' }]);
      await expect(guard.canActivate(contextFor(ADMIN, ['media:delete_any']))).resolves.toBe(true);

      // Ruolo rimosso: invalidazione esplicita, poi il DB non concede più nulla.
      await permissionsService.invalidateUsers([ADMIN.userId]);
      mock.results.push([]);
      await expect(guard.canActivate(contextFor(ADMIN, ['media:delete_any']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Redis non pronto → decide dal DB (mai fail-open)', async () => {
      redis.isReady.mockReturnValue(false);
      mock.results.push([]);

      await expect(guard.canActivate(contextFor(ADMIN, ['users:read']))).rejects.toThrow(
        ForbiddenException,
      );
      expect(redis.getJson).not.toHaveBeenCalled();
    });

    it('errore DB → si propaga, mai true', async () => {
      mock.results.push(new Error('db down'));

      await expect(guard.canActivate(contextFor(ADMIN, ['users:read']))).rejects.toThrow('db down');
    });
  });

  describe('criterio 11: fail-closed e impersonificazione', () => {
    it('authInfo assente → 403, nessuna risoluzione permessi', async () => {
      await expect(guard.canActivate(contextFor(undefined, ['users:read']))).rejects.toThrow(
        ForbiddenException,
      );
      expect(redis.getJson).not.toHaveBeenCalled();
      expect(mock.db.select).not.toHaveBeenCalled();
    });

    it('metadati assenti → 403', async () => {
      cached(['users:read']);
      await expect(guard.canActivate(contextFor(ADMIN))).rejects.toThrow(ForbiddenException);
    });

    it('metadati vuoti → 403', async () => {
      cached(['users:read']);
      await expect(guard.canActivate(contextFor(ADMIN, []))).rejects.toThrow(ForbiddenException);
    });

    it('impersonificazione → valuta authInfo.userId (l’impersonato), non il SuperAdmin', async () => {
      const impersonated: AuthInfo = {
        userId: 77,
        role: AppUserRoles.User,
        name: 'Utente',
        scopeId: null,
        impersonatedBy: 1,
      };
      cached(['pages:create']);

      await expect(guard.canActivate(contextFor(impersonated, ['users:read']))).rejects.toThrow(
        ForbiddenException,
      );
      expect(redis.getJson).toHaveBeenCalledWith(permissionsService.cacheKey(77));
      expect(redis.getJson).not.toHaveBeenCalledWith(permissionsService.cacheKey(1));
    });
  });

  describe('@Permissions su una rotta HTTP reale', () => {
    @Controller('probe')
    class ProbeController {
      @Get()
      @Permissions('users:read')
      read(): { ok: true } {
        return { ok: true };
      }
    }

    let app: INestApplication;
    let hasAll: jest.Mock;

    beforeAll(async () => {
      hasAll = jest.fn();
      const moduleRef = await Test.createTestingModule({
        controllers: [ProbeController],
        providers: [PermissionsGuard, { provide: PermissionsService, useValue: { hasAll } }],
      }).compile();
      app = moduleRef.createNestApplication();
      app.use((req: { authInfo?: AuthInfo }, _res: unknown, next: () => void) => {
        req.authInfo = ADMIN;
        next();
      });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('il decoratore da solo attiva il guard: 200 con il permesso', async () => {
      hasAll.mockResolvedValue({ ok: true, missing: [] });
      await request(app.getHttpServer()).get('/probe').expect(200, { ok: true });
      expect(hasAll).toHaveBeenCalledWith(ADMIN.userId, ['users:read']);
    });

    it('403 senza il permesso, nello stesso formato dei guard a soglia', async () => {
      hasAll.mockResolvedValue({ ok: false, missing: ['users:read'] });
      const res = await request(app.getHttpServer()).get('/probe').expect(403);
      expect(res.body.message).toBe('Permessi insufficienti (richiesto permesso: users:read).');
    });
  });
});
