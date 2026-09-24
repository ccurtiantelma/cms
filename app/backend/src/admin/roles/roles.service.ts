import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { AuditLogService } from '../../common/audit-log.service';
import { isPgForeignKeyViolation, mapPgError } from '../../common/db-error.mapper';
import { AuthInfo } from '../../common/types';
import { DbService } from '../../db/db.service';
import {
  permissionEntity,
  roleEntity,
  rolePermissionEntity,
  userEntity,
  userRoleEntity,
} from '../../db/schema';
import {
  isPermissionCode,
  PERMISSION_CATEGORIES,
  PermissionCode,
  SYSTEM_RESERVED_PERMISSIONS,
  SYSTEM_ROLE_CODES,
} from '../../permissions/permissions.registry';
import { PermissionsService } from '../../permissions/permissions.service';
import { assertTargetRoleManageable } from '../user-management.rules';
import {
  CreateRoleInput,
  PermissionGroup,
  ROLE_CODE_PATTERN,
  RoleView,
  UpdateRoleInput,
} from './roles.types';

/** Vincolo FK `user_roles.role_id → roles.id` (`restrict`): backstop del `409 ROLE_IN_USE`. */
const USER_ROLES_ROLE_FK = 'user_roles_role_id_roles_id_fk';

type RoleRow = typeof roleEntity.$inferSelect;

/**
 * Service di dominio dei ruoli personalizzati (ADR-99 § 7–8, SPEC-RBAC-F1 §
 * `RolesService`). Nessun controller in F1: i `403`/`400`/`409` sono eccezioni
 * NestJS che il controller di F2 esporrà via HTTP.
 *
 * Regole di sicurezza:
 * - **Anti-escalation** (ADR-99 § 8): si concedono solo permessi posseduti dal
 *   chiamante; modificare/eliminare un ruolo richiede di possederne tutti i permessi.
 * - **Codici riservati** (SPEC S6): `roles:manage` non entra mai in un ruolo
 *   personalizzato, altrimenti la firma P2 ("solo SuperAdmin") sarebbe aggirabile.
 * - **Ruoli di sistema in sola lettura** (P3) e non assegnabili via `user_roles` (S9).
 * - **`409 ROLE_IN_USE`** (P6): un ruolo assegnato ad almeno un utente non si elimina.
 *
 * I permessi del chiamante vengono sempre da `PermissionsService`, mai dal JWT.
 * Le scritture avvengono in transazione, con invalidazione della cache dopo il
 * commit (S10) e audit log.
 */
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  /** Inietta DB, risoluzione/invalidazione permessi e audit log. */
  constructor(
    private readonly db: DbService,
    private readonly permissionsService: PermissionsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── Lettura ─────────────────────────────────────────────────────────────

  /** Tutti i ruoli, prima quelli di sistema, con i rispettivi codici permesso. */
  async list(): Promise<RoleView[]> {
    const roles = await this.db.db
      .select()
      .from(roleEntity)
      .orderBy(desc(roleEntity.isSystem), asc(roleEntity.name));
    const codesByRole = await this.loadRoleCodes(roles.map((r) => r.id));
    return roles.map((role) => this.toView(role, codesByRole.get(role.id) ?? []));
  }

  /** Dettaglio di un ruolo per `guid` (SPEC S8). */
  async findOne(guid: string): Promise<RoleView> {
    const role = await this.findRoleOrFail(guid);
    const codesByRole = await this.loadRoleCodes([role.id]);
    return this.toView(role, codesByRole.get(role.id) ?? []);
  }

  /** Permessi del registro sincronizzati in DB, raggruppati per categoria. */
  async listPermissions(): Promise<PermissionGroup[]> {
    const rows = await this.db.db
      .select({
        code: permissionEntity.code,
        category: permissionEntity.category,
        description: permissionEntity.description,
      })
      .from(permissionEntity)
      .orderBy(asc(permissionEntity.category), asc(permissionEntity.code));

    return PERMISSION_CATEGORIES.map((category) => ({
      category,
      permissions: rows
        .filter((r) => r.category === category && isPermissionCode(r.code))
        .map((r) => ({ code: r.code as PermissionCode, description: r.description })),
    })).filter((group) => group.permissions.length > 0);
  }

  // ─── Scrittura ruoli (roles:manage) ──────────────────────────────────────

  /** Crea un ruolo personalizzato. Nessuna invalidazione: il ruolo nasce non assegnato. */
  async create(input: CreateRoleInput, authInfo: AuthInfo, ip?: string): Promise<{ guid: string }> {
    const callerPermissions = await this.permissionsService.getUserPermissions(authInfo.userId);
    this.assertHasPermission(callerPermissions, 'roles:manage');

    if (!ROLE_CODE_PATTERN.test(input.code)) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_CODE',
        message:
          'Codice ruolo non valido: minuscole, cifre e underscore, da 3 a 50 caratteri, inizia con una lettera.',
      });
    }
    // I codici di sistema sono occupati dal seed; qui si evita che un ruolo
    // custom li prenoti su un DB non ancora seedato.
    if ((SYSTEM_ROLE_CODES as readonly string[]).includes(input.code)) {
      throw new ConflictException({
        code: 'ROLE_CODE_DUPLICATE',
        message: 'Esiste già un ruolo con questo codice.',
      });
    }

    const codes = this.validatePermissionCodes(input.permissionCodes);
    this.assertNoEscalation(callerPermissions, codes);

    let created: { id: number; guid: string };
    try {
      created = await this.db.db.transaction(async (tx) => {
        const [role] = await tx
          .insert(roleEntity)
          .values({
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            isSystem: false,
            level: null,
            createdBy: authInfo.userId,
            updatedBy: authInfo.userId,
          })
          .returning({ id: roleEntity.id, guid: roleEntity.guid });
        await this.replaceRolePermissions(tx, role.id, codes);
        return role;
      });
    } catch (err) {
      mapPgError(err);
    }

    this.logger.log(`Ruolo ${created.id} (${input.code}) creato da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'role.create',
      'role',
      created.guid,
      { code: input.code, permissions: codes },
      authInfo.impersonatedBy,
      ip,
    );
    return { guid: created.guid };
  }

  /**
   * Modifica nome, descrizione e/o permessi di un ruolo personalizzato. Se i
   * permessi cambiano, invalida la cache di tutti gli utenti del ruolo dopo il commit.
   */
  async update(
    guid: string,
    input: UpdateRoleInput,
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<{ guid: string }> {
    const role = await this.findRoleOrFail(guid);
    this.assertNotSystem(role);

    const callerPermissions = await this.permissionsService.getUserPermissions(authInfo.userId);
    this.assertHasPermission(callerPermissions, 'roles:manage');

    const currentCodes = (await this.loadRoleCodes([role.id])).get(role.id) ?? [];
    this.assertNoEscalation(callerPermissions, currentCodes);

    const nextCodes =
      input.permissionCodes === undefined
        ? undefined
        : this.validatePermissionCodes(input.permissionCodes);
    if (nextCodes) this.assertNoEscalation(callerPermissions, nextCodes);

    const permissionsChanged = nextCodes !== undefined && !sameCodes(currentCodes, nextCodes);

    await this.db.db.transaction(async (tx) => {
      await tx
        .update(roleEntity)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          updatedAt: new Date(),
          updatedBy: authInfo.userId,
        })
        .where(eq(roleEntity.id, role.id));
      if (permissionsChanged) {
        await this.replaceRolePermissions(tx, role.id, nextCodes);
      }
    });

    if (permissionsChanged) {
      await this.permissionsService.invalidateRole(role.id);
    }

    this.logger.log(`Ruolo ${role.id} (${role.code}) aggiornato da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'role.update',
      'role',
      role.guid,
      {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(permissionsChanged && { permissions: { before: currentCodes, after: nextCodes } }),
      },
      authInfo.impersonatedBy,
      ip,
    );
    return { guid: role.guid };
  }

  /**
   * Elimina un ruolo personalizzato non assegnato. `409 ROLE_IN_USE` se almeno
   * un utente (attivo o no) lo ha: nessuna perdita silenziosa di permessi (P6).
   * La FK `restrict` su `user_roles.role_id` copre la corsa fra conteggio e delete.
   */
  async delete(guid: string, authInfo: AuthInfo, ip?: string): Promise<void> {
    const role = await this.findRoleOrFail(guid);
    this.assertNotSystem(role);

    const callerPermissions = await this.permissionsService.getUserPermissions(authInfo.userId);
    this.assertHasPermission(callerPermissions, 'roles:manage');

    const currentCodes = (await this.loadRoleCodes([role.id])).get(role.id) ?? [];
    this.assertNoEscalation(callerPermissions, currentCodes);

    try {
      await this.db.db.transaction(async (tx) => {
        const [{ assigned }] = await tx
          .select({ assigned: count() })
          .from(userRoleEntity)
          .where(eq(userRoleEntity.roleId, role.id));
        if (assigned > 0) {
          throw roleInUse(
            `Il ruolo è assegnato a ${assigned} utenti: rimuovilo prima di eliminarlo.`,
          );
        }
        await tx.delete(rolePermissionEntity).where(eq(rolePermissionEntity.roleId, role.id));
        await tx.delete(roleEntity).where(eq(roleEntity.id, role.id));
      });
    } catch (err) {
      if (isPgForeignKeyViolation(err, USER_ROLES_ROLE_FK)) {
        throw roleInUse(
          'Il ruolo è stato assegnato a un utente durante l’eliminazione: rimuovilo prima di eliminarlo.',
        );
      }
      throw err;
    }

    this.logger.log(`Ruolo ${role.id} (${role.code}) eliminato da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'role.delete',
      'role',
      role.guid,
      { code: role.code, permissions: currentCodes },
      authInfo.impersonatedBy,
      ip,
    );
  }

  // ─── Assegnazione agli utenti (users:assign_roles) ───────────────────────

  /**
   * Sostituisce l'insieme dei ruoli aggiuntivi di un utente. L'anti-escalation
   * si applica solo ai ruoli **aggiunti** (SPEC S7): rimuovere un ruolo riduce i
   * privilegi. Il livello base resta `users.role` (S9).
   */
  async setUserRoles(
    userGuid: string,
    roleGuids: string[],
    authInfo: AuthInfo,
    ip?: string,
  ): Promise<{ guid: string; roleGuids: string[] }> {
    const callerPermissions = await this.permissionsService.getUserPermissions(authInfo.userId);
    this.assertHasPermission(callerPermissions, 'users:assign_roles');

    const [target] = await this.db.db
      .select({ id: userEntity.id, guid: userEntity.guid, role: userEntity.role })
      .from(userEntity)
      .where(eq(userEntity.guid, userGuid));
    if (!target) throw new NotFoundException('Utente non trovato.');
    assertTargetRoleManageable(target.role, authInfo);

    const desiredGuids = [...new Set(roleGuids)];
    const desiredRoles =
      desiredGuids.length === 0
        ? []
        : await this.db.db.select().from(roleEntity).where(inArray(roleEntity.guid, desiredGuids));
    if (desiredRoles.length !== desiredGuids.length) {
      throw new NotFoundException('Ruolo non trovato.');
    }
    if (desiredRoles.some((r) => r.isSystem)) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_NOT_ASSIGNABLE',
        message:
          "I ruoli di sistema non si assegnano come ruoli aggiuntivi: si modifica il ruolo base dell'utente.",
      });
    }

    const currentRoles = await this.db.db
      .select({ id: roleEntity.id, code: roleEntity.code })
      .from(userRoleEntity)
      .innerJoin(roleEntity, eq(roleEntity.id, userRoleEntity.roleId))
      .where(eq(userRoleEntity.userId, target.id));
    const currentRoleIds = new Set(currentRoles.map((r) => r.id));
    const desiredRoleIds = new Set(desiredRoles.map((r) => r.id));
    const added = desiredRoles.filter((r) => !currentRoleIds.has(r.id));
    const removed = currentRoles.filter((r) => !desiredRoleIds.has(r.id));
    const removedIds = removed.map((r) => r.id);

    if (added.length > 0) {
      const codesByRole = await this.loadRoleCodes(added.map((r) => r.id));
      this.assertNoEscalation(
        callerPermissions,
        added.flatMap((r) => codesByRole.get(r.id) ?? []),
      );
    }

    if (added.length === 0 && removedIds.length === 0) {
      return { guid: target.guid, roleGuids: desiredGuids };
    }

    await this.db.db.transaction(async (tx) => {
      if (removedIds.length > 0) {
        await tx
          .delete(userRoleEntity)
          .where(
            and(eq(userRoleEntity.userId, target.id), inArray(userRoleEntity.roleId, removedIds)),
          );
      }
      if (added.length > 0) {
        await tx
          .insert(userRoleEntity)
          .values(added.map((r) => ({ userId: target.id, roleId: r.id })))
          .onConflictDoNothing();
      }
    });

    await this.permissionsService.invalidateUsers([target.id]);

    this.logger.log(`Ruoli aggiuntivi dell'utente ${target.id} aggiornati da ${authInfo.userId}.`);
    await this.auditLogService.log(
      authInfo.userId,
      'user.roles.update',
      'user',
      target.guid,
      { added: added.map((r) => r.code), removed: removed.map((r) => r.code) },
      authInfo.impersonatedBy,
      ip,
    );
    return { guid: target.guid, roleGuids: desiredGuids };
  }

  // ─── Helper ──────────────────────────────────────────────────────────────

  private async findRoleOrFail(guid: string): Promise<RoleRow> {
    const [role] = await this.db.db.select().from(roleEntity).where(eq(roleEntity.guid, guid));
    if (!role) throw new NotFoundException('Ruolo non trovato.');
    return role;
  }

  /** Codici permesso per ruolo, in un'unica query. */
  private async loadRoleCodes(roleIds: number[]): Promise<Map<number, PermissionCode[]>> {
    const result = new Map<number, PermissionCode[]>();
    if (roleIds.length === 0) return result;

    const rows = await this.db.db
      .select({ roleId: rolePermissionEntity.roleId, code: permissionEntity.code })
      .from(rolePermissionEntity)
      .innerJoin(permissionEntity, eq(permissionEntity.id, rolePermissionEntity.permissionId))
      .where(inArray(rolePermissionEntity.roleId, roleIds));

    for (const { roleId, code } of rows) {
      if (!isPermissionCode(code)) continue;
      result.set(roleId, [...(result.get(roleId) ?? []), code]);
    }
    return result;
  }

  /**
   * Riscrive le associazioni di un ruolo. I codici sono già validati contro il
   * registro: se in DB ne manca uno, il seed non è stato eseguito (errore 500).
   */
  private async replaceRolePermissions(
    tx: Pick<DbService['db'], 'select' | 'insert' | 'delete'>,
    roleId: number,
    codes: readonly PermissionCode[],
  ): Promise<void> {
    await tx.delete(rolePermissionEntity).where(eq(rolePermissionEntity.roleId, roleId));
    if (codes.length === 0) return;

    const permissions = await tx
      .select({ id: permissionEntity.id, code: permissionEntity.code })
      .from(permissionEntity)
      .where(inArray(permissionEntity.code, [...codes]));
    if (permissions.length !== codes.length) {
      throw new Error('Registro permessi non sincronizzato in DB: eseguire il seed RBAC.');
    }
    await tx
      .insert(rolePermissionEntity)
      .values(permissions.map((p) => ({ roleId, permissionId: p.id })));
  }

  /** Deduplica e valida i codici: tutti nel registro (`400`) e nessuno riservato (`400`, S6). */
  private validatePermissionCodes(codes: readonly string[]): PermissionCode[] {
    const unique = [...new Set(codes)];
    const unknown = unique.filter((code) => !isPermissionCode(code));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION_CODE',
        message: `Codici permesso sconosciuti: ${unknown.join(', ')}.`,
      });
    }
    const valid = unique as PermissionCode[];
    const reserved = valid.filter((code) => SYSTEM_RESERVED_PERMISSIONS.includes(code));
    if (reserved.length > 0) {
      throw new BadRequestException({
        code: 'RESERVED_PERMISSION',
        message: `Permessi riservati ai ruoli di sistema, non assegnabili a un ruolo personalizzato: ${reserved.join(', ')}.`,
      });
    }
    return valid;
  }

  private assertHasPermission(granted: ReadonlySet<PermissionCode>, code: PermissionCode): void {
    if (!granted.has(code)) {
      throw new ForbiddenException(`Permessi insufficienti (richiesto permesso: ${code}).`);
    }
  }

  /** Anti-escalation (ADR-99 § 8): `codes` ⊆ permessi del chiamante. */
  private assertNoEscalation(
    granted: ReadonlySet<PermissionCode>,
    codes: readonly PermissionCode[],
  ): void {
    const missing = [...new Set(codes)].filter((code) => !granted.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_ESCALATION',
        message: `Non puoi concedere permessi che non possiedi: ${missing.join(', ')}.`,
      });
    }
  }

  private assertNotSystem(role: RoleRow): void {
    if (role.isSystem) {
      throw new ForbiddenException({
        code: 'SYSTEM_ROLE_READONLY',
        message: 'I ruoli di sistema sono in sola lettura.',
      });
    }
  }

  private toView(role: RoleRow, permissions: PermissionCode[]): RoleView {
    return {
      guid: role.guid,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      level: role.level,
      permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}

function roleInUse(message: string): ConflictException {
  return new ConflictException({ code: 'ROLE_IN_USE', message });
}

function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  return setA.size === new Set(b).size && b.every((code) => setA.has(code));
}
