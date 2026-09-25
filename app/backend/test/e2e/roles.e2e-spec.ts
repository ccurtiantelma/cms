import 'reflect-metadata';

// Va importato PRIMA di `AppModule` (vedi `sanity-isolation.e2e-spec.ts`):
// installa `jest.mock('nodemailer', ...)` a livello di modulo.
import './setup/network-mocks.setup';

import * as crypto from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AppConstants } from '../../src/common/app-constants';
import { AppUserRoles } from '../../src/common/enums';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import {
  auditLogEntity,
  permissionEntity,
  roleEntity,
  rolePermissionEntity,
  userEntity,
  userRoleEntity,
} from '../../src/db/schema';
import { PermissionsSeedService } from '../../src/permissions/permissions-seed.service';
import {
  ALL_PERMISSION_CODES,
  PERMISSION_CATEGORIES,
  SYSTEM_ROLES,
} from '../../src/permissions/permissions.registry';
import { EmailQueueService } from '../../src/queues/email-queue/email.queue.service';
import { closeTestDb, getTestDb, runMigrations, truncateAllTables } from './helpers/db-test.helper';
import {
  closeTestRedisClient,
  flushTestRedis,
  getTestRedisClient,
} from './helpers/redis-test.helper';

/**
 * Rotte RBAC della F2a (SPEC-RBAC-F2a criteri 6–21) su DB `cms_db_test` e
 * Redis DB #1 reali: ruoli e catalogo permessi, `roleGuids` sugli utenti,
 * `auth/me` con `permissions`, `403`/`409`, anti-escalation e propagazione
 * immediata dei permessi senza rilogin (ADR-99 § Conformità).
 *
 * Setup S22, in quest'ordine a ogni test: `truncateAllTables` (svuota anche
 * `roles`/`permissions` e riusa gli id utente), `flushTestRedis` (nessuna
 * chiave `perm:*` sopravvissuta per un id riusato), `sync()` del seed RBAC.
 * `EmailQueueService` è mockato: la coda è un confine, e serve verificare che
 * nessuna email parta per un utente non creato (S17).
 */
describe('RBAC F2a — ruoli, permessi, assegnazione e auth/me (e2e)', () => {
  let app: INestApplication;
  let enqueueEmail: jest.Mock;
  let userSeq = 0;

  interface TestUser {
    id: number;
    guid: string;
    email: string;
    bearer: string;
    cookie: string;
  }

  beforeAll(async () => {
    await runMigrations();
    enqueueEmail = jest.fn().mockResolvedValue(undefined);

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailQueueService)
      .useValue({ enqueueEmail })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser(AppConstants.cookieSecret));
    await app.init();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    await app.get(PermissionsSeedService).sync();
    enqueueEmail.mockClear();
  });

  afterAll(async () => {
    await app?.close();
    await closeTestDb();
    await closeTestRedisClient();
  });

  // ─── Helper ────────────────────────────────────────────────────────────────

  function signCookieValue(value: string, secret: string): string {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `s:${value}.${signature}`;
  }

  /** Utente inserito a DB con JWT firmato e sessione `login:` su Redis. */
  async function createUser(
    role: AppUserRoles,
    opts: { isActive?: boolean } = {},
  ): Promise<TestUser> {
    const email = `rbac.e2e.${role}.${++userSeq}@cms.test`;
    const [user] = await getTestDb()
      .insert(userEntity)
      .values({
        name: 'E2E',
        surname: String(role),
        email,
        pwd: 'x',
        role,
        isActive: opts.isActive ?? true,
        pwdSet: true,
        isMfaEnabled: false,
      })
      .returning();
    const token = jwt.sign(
      { id: user.id, role, name: 'E2E', scopeId: null },
      AppConstants.securityKey,
      { expiresIn: '15m' },
    );
    await getTestRedisClient().set(`login:${token}`, 'sessione-e2e');
    const rtk = signCookieValue(`e2e-refresh-token-${user.id}`, AppConstants.cookieSecret);
    return {
      id: user.id,
      guid: user.guid,
      email,
      bearer: `Bearer ${token}`,
      cookie: `rtk=${encodeURIComponent(rtk)}`,
    };
  }

  /** Client HTTP su `api/v1`, autenticato se `auth` è passato. */
  function http(auth?: TestUser) {
    const server = app.getHttpServer();
    const withAuth = (req: request.Test): request.Test =>
      auth ? req.set('Authorization', auth.bearer).set('Cookie', auth.cookie) : req;
    return {
      get: (path: string) => withAuth(request(server).get(`/api/v1${path}`)),
      post: (path: string, body?: object) =>
        withAuth(request(server).post(`/api/v1${path}`)).send(body),
      patch: (path: string, body?: object) =>
        withAuth(request(server).patch(`/api/v1${path}`)).send(body),
      delete: (path: string) => withAuth(request(server).delete(`/api/v1${path}`)),
    };
  }

  async function createRole(
    superAdmin: TestUser,
    code: string,
    permissionCodes: string[],
  ): Promise<string> {
    const res = await http(superAdmin)
      .post('/app/admin/roles', { code, name: code, permissionCodes })
      .expect(201);
    return res.body.guid as string;
  }

  async function roleGuidByCode(code: string): Promise<string> {
    const [role] = await getTestDb()
      .select({ guid: roleEntity.guid })
      .from(roleEntity)
      .where(eq(roleEntity.code, code));
    return role.guid;
  }

  async function auditActions(): Promise<string[]> {
    const rows = await getTestDb().select({ action: auditLogEntity.action }).from(auditLogEntity);
    return rows.map((r) => r.action);
  }

  async function assignedRoleCodes(userId: number): Promise<string[]> {
    const rows = await getTestDb()
      .select({ code: roleEntity.code })
      .from(userRoleEntity)
      .innerJoin(roleEntity, eq(roleEntity.id, userRoleEntity.roleId))
      .where(eq(userRoleEntity.userId, userId));
    return rows.map((r) => r.code).sort();
  }

  /**
   * Ruolo personalizzato con `roles:manage`, inserito via SQL dopo il `sync()`:
   * via API è impossibile (S6), ed è l'unico modo di costruire un ruolo con un
   * codice che l'Admin non possiede (criteri 18–19).
   */
  async function insertContaminatedRole(): Promise<{ id: number; guid: string }> {
    const db = getTestDb();
    const [role] = await db
      .insert(roleEntity)
      .values({ code: 'contaminated', name: 'Contaminato', isSystem: false })
      .returning({ id: roleEntity.id, guid: roleEntity.guid });
    const [manage] = await db
      .select({ id: permissionEntity.id })
      .from(permissionEntity)
      .where(eq(permissionEntity.code, 'roles:manage'));
    await db.insert(rolePermissionEntity).values({ roleId: role.id, permissionId: manage.id });
    return role;
  }

  // ─── Lettura (criteri 6–8) ────────────────────────────────────────────────

  describe('lettura di ruoli e catalogo', () => {
    it.each([
      ['SuperAdmin', AppUserRoles.SuperAdmin],
      ['Admin', AppUserRoles.Admin],
    ])('%s: GET roles → 200 con i 4 ruoli di sistema (criterio 6)', async (_label, role) => {
      const caller = await createUser(role);

      const res = await http(caller).get('/app/admin/roles').expect(200);

      const system = res.body.filter((r: { isSystem: boolean }) => r.isSystem);
      expect(system.map((r: { code: string; level: number }) => [r.code, r.level]).sort()).toEqual([
        ['admin', AppUserRoles.Admin],
        ['manager', AppUserRoles.Manager],
        ['superadmin', AppUserRoles.SuperAdmin],
        ['user', AppUserRoles.User],
      ]);
      const admin = res.body.find((r: { code: string }) => r.code === 'admin');
      expect(admin.permissions).toContain('roles:read');
      expect(admin.permissions).not.toContain('roles:manage');
      expect(admin).toEqual(
        expect.objectContaining({ guid: expect.any(String), name: expect.any(String) }),
      );
    });

    it('GET permissions → 200, gruppi nell’ordine di PERMISSION_CATEGORIES, 20 codici (criterio 7)', async () => {
      const admin = await createUser(AppUserRoles.Admin);

      const res = await http(admin).get('/app/admin/permissions').expect(200);

      const categories = res.body.map((g: { category: string }) => g.category);
      expect(categories).toEqual(PERMISSION_CATEGORIES.filter((c) => categories.includes(c)));
      const codes = res.body.flatMap((g: { permissions: { code: string }[] }) =>
        g.permissions.map((p) => p.code),
      );
      expect(codes).toHaveLength(20);
      expect([...codes].sort()).toEqual([...ALL_PERMISSION_CODES].sort());
    });

    it.each([
      ['Manager', AppUserRoles.Manager],
      ['User', AppUserRoles.User],
    ])('%s: GET roles e GET permissions → 403 roles:read (criterio 8)', async (_label, role) => {
      const caller = await createUser(role);

      for (const path of ['/app/admin/roles', '/app/admin/permissions']) {
        const res = await http(caller).get(path).expect(403);
        expect(res.body.message).toBe('Permessi insufficienti (richiesto permesso: roles:read).');
      }
    });

    it('senza token → 401 (criterio 8)', async () => {
      await http().get('/app/admin/roles').expect(401);
      await http().get('/app/admin/permissions').expect(401);
    });
  });

  // ─── Scrittura ruoli (criteri 9–13) ───────────────────────────────────────

  describe('scrittura di ruoli personalizzati', () => {
    it('SuperAdmin POST roles → 201, il ruolo compare in GET roles, audit role.create (criterio 9)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);

      const guid = await createRole(superAdmin, 'seo_specialist', [
        'pages:edit_any',
        'pages:publish',
      ]);

      const res = await http(superAdmin).get('/app/admin/roles').expect(200);
      const created = res.body.find((r: { guid: string }) => r.guid === guid);
      expect(created).toMatchObject({ code: 'seo_specialist', isSystem: false, level: null });
      expect([...created.permissions].sort()).toEqual(['pages:edit_any', 'pages:publish']);
      expect(await auditActions()).toContain('role.create');
    });

    it('Admin POST/PATCH/DELETE roles → 403 roles:manage dal guard, senza effetti (criterio 10)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const admin = await createUser(AppUserRoles.Admin);
      const guid = await createRole(superAdmin, 'editor_plus', ['pages:edit_any']);
      const expected = 'Permessi insufficienti (richiesto permesso: roles:manage).';

      const create = await http(admin)
        .post('/app/admin/roles', { code: 'intruso', name: 'x', permissionCodes: [] })
        .expect(403);
      expect(create.body.message).toBe(expected);
      // Guard prima delle pipe: un body non valido riceve comunque 403, non 400.
      await http(admin).post('/app/admin/roles', { bogus: true }).expect(403);
      const patch = await http(admin)
        .patch(`/app/admin/roles/${guid}`, { name: 'Rinominato' })
        .expect(403);
      expect(patch.body.message).toBe(expected);
      const del = await http(admin).delete(`/app/admin/roles/${guid}`).expect(403);
      expect(del.body.message).toBe(expected);

      const roles = await getTestDb()
        .select()
        .from(roleEntity)
        .where(eq(roleEntity.isSystem, false));
      expect(roles.map((r) => [r.code, r.name])).toEqual([['editor_plus', 'editor_plus']]);
    });

    it('SuperAdmin POST roles: RESERVED_PERMISSION, INVALID_PERMISSION_CODE, INVALID_ROLE_CODE, ROLE_CODE_DUPLICATE, campo extra (criterio 11)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const post = (body: object) => http(superAdmin).post('/app/admin/roles', body);
      const base = { name: 'Ruolo', permissionCodes: ['pages:create'] };

      const reserved = await post({
        ...base,
        code: 'gestore_ruoli',
        permissionCodes: ['pages:create', 'roles:manage'],
      }).expect(400);
      expect(reserved.body.code).toBe('RESERVED_PERMISSION');

      const unknown = await post({
        ...base,
        code: 'fantasma',
        permissionCodes: ['ghost:do'],
      }).expect(400);
      expect(unknown.body.code).toBe('INVALID_PERMISSION_CODE');

      const badCode = await post({ ...base, code: 'Bad-Code' }).expect(400);
      expect(badCode.body.code).toBe('INVALID_ROLE_CODE');

      const systemCode = await post({ ...base, code: 'admin' }).expect(409);
      expect(systemCode.body.code).toBe('ROLE_CODE_DUPLICATE');

      await post({ ...base, code: 'doppione' }).expect(201);
      const duplicate = await post({ ...base, code: 'doppione' }).expect(409);
      expect(duplicate.body.code).toBe('ROLE_CODE_DUPLICATE');

      await post({ ...base, code: 'con_extra', extra: 'no' }).expect(400);
    });

    it('SuperAdmin PATCH/DELETE: ruolo di sistema modificabile ma non eliminabile, code 400, body vuoto 400, guid inesistente 404 (criterio 12)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const adminRole = await roleGuidByCode('admin');
      const custom = await createRole(superAdmin, 'revisore', ['pages:publish']);
      const client = http(superAdmin);

      const patchSystem = await client
        .patch(`/app/admin/roles/${adminRole}`, { name: 'Hack' })
        .expect(200);
      expect(patchSystem.body).toEqual({ guid: adminRole });
      const deleteSystem = await client.delete(`/app/admin/roles/${adminRole}`).expect(403);
      expect(deleteSystem.body.code).toBe('SYSTEM_ROLE_READONLY');

      await client.patch(`/app/admin/roles/${custom}`, { code: 'altro_codice' }).expect(400);
      const empty = await client.patch(`/app/admin/roles/${custom}`, {}).expect(400);
      expect(empty.body.message).toBe('Nessun campo da aggiornare.');

      await client.patch('/app/admin/roles/nonesiste000000', { name: 'x' }).expect(404);
      await client.delete('/app/admin/roles/nonesiste000000').expect(404);

      const ok = await client
        .patch(`/app/admin/roles/${custom}`, { name: 'Revisore', description: 'Pubblica' })
        .expect(200);
      expect(ok.body).toEqual({ guid: custom });
      expect(await auditActions()).toContain('role.update');
    });

    it('DELETE di un ruolo assegnato a un utente inattivo → 409 ROLE_IN_USE; dopo la rimozione → 204 (criterio 13)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const inactive = await createUser(AppUserRoles.User, { isActive: false });
      const guid = await createRole(superAdmin, 'temporaneo', ['pages:create', 'pages:delete']);
      await http(superAdmin)
        .patch(`/app/admin/users/${inactive.guid}`, { roleGuids: [guid] })
        .expect(200);

      const conflict = await http(superAdmin).delete(`/app/admin/roles/${guid}`).expect(409);
      expect(conflict.body.code).toBe('ROLE_IN_USE');
      expect(conflict.body.message).toBe(
        'Il ruolo è assegnato a 1 utenti: rimuovilo prima di eliminarlo.',
      );
      const [role] = await getTestDb().select().from(roleEntity).where(eq(roleEntity.guid, guid));
      expect(role).toBeDefined();
      const links = await getTestDb()
        .select()
        .from(rolePermissionEntity)
        .where(eq(rolePermissionEntity.roleId, role.id));
      expect(links).toHaveLength(2);

      await http(superAdmin)
        .patch(`/app/admin/users/${inactive.guid}`, { roleGuids: [] })
        .expect(200);
      await http(superAdmin).delete(`/app/admin/roles/${guid}`).expect(204);

      const res = await http(superAdmin).get('/app/admin/roles').expect(200);
      expect(res.body.map((r: { guid: string }) => r.guid)).not.toContain(guid);
      expect(await auditActions()).toContain('role.delete');
    });
  });

  // ─── Assegnazione e propagazione immediata (criteri 14–16) ────────────────

  describe('assegnazione e propagazione senza rilogin (ADR-99 § Conformità)', () => {
    it('ruolo con roles:read assegnato a uno User: 403 → 200 con lo stesso token; auth/me lo riflette (criterio 14)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const user = await createUser(AppUserRoles.User);

      await http(user).get('/app/admin/roles').expect(403);

      const reviewer = await createRole(superAdmin, 'reviewer', ['roles:read']);
      await http(superAdmin)
        .patch(`/app/admin/users/${user.guid}`, { roleGuids: [reviewer] })
        .expect(200);

      await http(user).get('/app/admin/roles').expect(200);
      const me = await http(user).get('/auth/me').expect(200);
      expect(me.body.permissions).toContain('roles:read');
    });

    it('revoca per ruolo e per utente → di nuovo 403 senza rilogin (criterio 15)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const user = await createUser(AppUserRoles.User);
      const reviewer = await createRole(superAdmin, 'reviewer', ['roles:read', 'pages:publish']);
      await http(superAdmin)
        .patch(`/app/admin/users/${user.guid}`, { roleGuids: [reviewer] })
        .expect(200);
      await http(user).get('/app/admin/roles').expect(200); // popola la cache perm:*

      // Invalidazione per ruolo: tolto roles:read dal ruolo.
      await http(superAdmin)
        .patch(`/app/admin/roles/${reviewer}`, { permissionCodes: ['pages:publish'] })
        .expect(200);
      await http(user).get('/app/admin/roles').expect(403);

      // Rimessa la voce, poi invalidazione per utente: ruoli aggiuntivi svuotati.
      await http(superAdmin)
        .patch(`/app/admin/roles/${reviewer}`, { permissionCodes: ['roles:read'] })
        .expect(200);
      await http(user).get('/app/admin/roles').expect(200);
      await http(superAdmin).patch(`/app/admin/users/${user.guid}`, { roleGuids: [] }).expect(200);
      await http(user).get('/app/admin/roles').expect(403);
    });

    it('GET users/:guid restituisce roles dopo l’assegnazione, [] dopo la rimozione (criterio 16)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const user = await createUser(AppUserRoles.User);
      const reviewer = await createRole(superAdmin, 'reviewer', ['roles:read']);

      await http(superAdmin)
        .patch(`/app/admin/users/${user.guid}`, { roleGuids: [reviewer] })
        .expect(200);
      const assigned = await http(superAdmin).get(`/app/admin/users/${user.guid}`).expect(200);
      expect(assigned.body.roles).toEqual([{ guid: reviewer, code: 'reviewer', name: 'reviewer' }]);
      expect(assigned.body.role).toBe(AppUserRoles.User);

      await http(superAdmin).patch(`/app/admin/users/${user.guid}`, { roleGuids: [] }).expect(200);
      const removed = await http(superAdmin).get(`/app/admin/users/${user.guid}`).expect(200);
      expect(removed.body.roles).toEqual([]);
    });
  });

  // ─── Anti-escalation e sicurezza (criteri 17–20) ──────────────────────────

  describe('anti-escalation e atomicità', () => {
    it('Admin POST users con un ruolo di codici posseduti → 201, assegnazione, email e audit (criterio 17)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const admin = await createUser(AppUserRoles.Admin);
      const mediaCleaner = await createRole(superAdmin, 'media_cleaner', ['media:delete_any']);

      const res = await http(admin)
        .post('/app/admin/users', {
          name: 'Nuovo',
          email: 'nuovo.media@cms.test',
          role: AppUserRoles.User,
          roleGuids: [mediaCleaner],
        })
        .expect(201);

      const [created] = await getTestDb()
        .select()
        .from(userEntity)
        .where(eq(userEntity.guid, res.body.guid));
      expect(await assignedRoleCodes(created.id)).toEqual(['media_cleaner']);
      expect(enqueueEmail).toHaveBeenCalledTimes(1);
      const actions = await auditActions();
      expect(actions).toContain('user.create');
      expect(actions).toContain('user.roles.update');
    });

    it('Admin PATCH users con un ruolo contenente codici non posseduti → 403 PERMISSION_ESCALATION, nulla modificato (criterio 18)', async () => {
      const admin = await createUser(AppUserRoles.Admin);
      const target = await createUser(AppUserRoles.User);
      const contaminated = await insertContaminatedRole();

      const res = await http(admin)
        .patch(`/app/admin/users/${target.guid}`, {
          name: 'Cambiato',
          roleGuids: [contaminated.guid],
        })
        .expect(403);

      expect(res.body.code).toBe('PERMISSION_ESCALATION');
      expect(res.body.message).toContain('roles:manage');
      expect(await assignedRoleCodes(target.id)).toEqual([]);
      const [row] = await getTestDb().select().from(userEntity).where(eq(userEntity.id, target.id));
      expect(row.name).toBe('E2E');
      expect(await auditActions()).not.toContain('user.update');
    });

    it('ruolo contaminato assegnato via SQL a un Admin: roles:manage filtrato dalla risoluzione (criterio 19)', async () => {
      const admin = await createUser(AppUserRoles.Admin);
      const contaminated = await insertContaminatedRole();
      await getTestDb()
        .insert(userRoleEntity)
        .values({ userId: admin.id, roleId: contaminated.id });

      const res = await http(admin)
        .post('/app/admin/roles', { code: 'scalata', name: 'x', permissionCodes: [] })
        .expect(403);
      expect(res.body.message).toBe('Permessi insufficienti (richiesto permesso: roles:manage).');
      const me = await http(admin).get('/auth/me').expect(200);
      expect(me.body.permissions).not.toContain('roles:manage');
    });

    it('Admin POST users con un ruolo di sistema → 400 SYSTEM_ROLE_NOT_ASSIGNABLE, nessun utente e nessuna email (criterio 20)', async () => {
      const admin = await createUser(AppUserRoles.Admin);
      const managerRole = await roleGuidByCode('manager');

      const res = await http(admin)
        .post('/app/admin/users', {
          name: 'Mai',
          email: 'mai.creato@cms.test',
          role: AppUserRoles.User,
          roleGuids: [managerRole],
        })
        .expect(400);

      expect(res.body.code).toBe('SYSTEM_ROLE_NOT_ASSIGNABLE');
      const rows = await getTestDb()
        .select()
        .from(userEntity)
        .where(eq(userEntity.email, 'mai.creato@cms.test'));
      expect(rows).toEqual([]);
      expect(enqueueEmail).not.toHaveBeenCalled();
    });

    it('Admin su target SuperAdmin con roleGuids → 403; PATCH senza roleGuids invariato (criterio 20)', async () => {
      const superAdmin = await createUser(AppUserRoles.SuperAdmin);
      const admin = await createUser(AppUserRoles.Admin);
      const user = await createUser(AppUserRoles.User);
      const reviewer = await createRole(superAdmin, 'reviewer', ['roles:read']);

      await http(admin)
        .patch(`/app/admin/users/${superAdmin.guid}`, { roleGuids: [reviewer] })
        .expect(403);

      await http(superAdmin)
        .patch(`/app/admin/users/${user.guid}`, { roleGuids: [reviewer] })
        .expect(200);
      const before = (await auditActions()).filter((a) => a === 'user.roles.update').length;

      await http(admin).patch(`/app/admin/users/${user.guid}`, { name: 'Solo nome' }).expect(200);

      expect(await assignedRoleCodes(user.id)).toEqual(['reviewer']);
      const after = (await auditActions()).filter((a) => a === 'user.roles.update').length;
      expect(after).toBe(before);
    });
  });

  // ─── auth/me (criterio 21) ────────────────────────────────────────────────

  it('GET auth/me di un Manager: permissions del seed manager in ordine alfabetico, campi preesistenti invariati (criterio 21)', async () => {
    const manager = await createUser(AppUserRoles.Manager);

    const res = await http(manager).get('/auth/me').expect(200);

    expect(res.body.permissions).toEqual([...SYSTEM_ROLES.manager.permissions].sort());
    expect(res.body).toMatchObject({
      userId: manager.id,
      role: AppUserRoles.Manager,
      guid: manager.guid,
      email: manager.email,
      isMfaEnabled: false,
    });
    expect(res.body).toHaveProperty('surname');
    expect(res.body).toHaveProperty('scopeId');
  });

  it('i permessi dei ruoli personalizzati si sommano al livello base in auth/me', async () => {
    const superAdmin = await createUser(AppUserRoles.SuperAdmin);
    const user = await createUser(AppUserRoles.User);
    const guid = await createRole(superAdmin, 'pubblicatore', ['pages:publish']);
    await http(superAdmin)
      .patch(`/app/admin/users/${user.guid}`, { roleGuids: [guid] })
      .expect(200);

    const res = await http(user).get('/auth/me').expect(200);

    expect(res.body.permissions).toEqual(
      [...new Set([...SYSTEM_ROLES.user.permissions, 'pages:publish'])].sort(),
    );
  });
});
