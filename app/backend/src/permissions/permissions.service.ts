import { Injectable, Logger } from '@nestjs/common';
import { and, eq, notInArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  permissionEntity,
  roleEntity,
  rolePermissionEntity,
  userEntity,
  userRoleEntity,
} from '../db/schema';
import { RedisService } from '../redis/redis.service';
import {
  computeRegistryHash,
  isPermissionCode,
  PermissionCode,
  SYSTEM_RESERVED_PERMISSIONS,
} from './permissions.registry';

/** TTL di sicurezza della cache permessi (ADR-99 § 6): l'invalidazione esplicita resta la via primaria. */
export const PERMISSIONS_CACHE_TTL_SECONDS = 3600;

/** Esito di `hasAll`: `missing` elenca i codici mancanti nell'ordine richiesto. */
export interface PermissionCheckResult {
  ok: boolean;
  missing: PermissionCode[];
}

/**
 * Risolve i permessi effettivi di un utente (ADR-99 § 1): permessi del ruolo di
 * sistema con `level = users.role` **∪** permessi dei ruoli personalizzati in
 * `user_roles`. `users.role` è letto dal DB, non dal JWT (SPEC S1), così un
 * cambio ha effetto immediato una volta invalidata la cache.
 *
 * Cache Redis per utente `perm:v<hashRegistro>:user:<userId>` (ADR-99 § 6), mai
 * legata a `login:*`/`session:*`. Fail-closed: un errore Redis ripiega sul DB,
 * un errore DB si propaga (500). Non esiste un default permissivo.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  /** Calcolato una volta all'avvio: un deploy che cambia il registro cambia il prefisso delle chiavi. */
  private readonly registryHash = computeRegistryHash();

  /** Inietta DB (fonte di verità) e Redis (cache per utente). */
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  /** Chiave di cache dei permessi di un utente per il registro corrente. */
  cacheKey(userId: number): string {
    return `perm:v${this.registryHash}:user:${userId}`;
  }

  /**
   * Permessi effettivi dell'utente. Utente inesistente o disattivato → insieme
   * vuoto (SPEC S2). Con Redis non pronto la cache viene saltata del tutto: con
   * `maxRetriesPerRequest: null` un comando resterebbe in coda fino alla riconnessione.
   */
  async getUserPermissions(userId: number): Promise<ReadonlySet<PermissionCode>> {
    const key = this.cacheKey(userId);

    if (this.redis.isReady()) {
      try {
        const cached = await this.redis.getJson<string[]>(key);
        if (cached) {
          return new Set(cached.filter(isPermissionCode));
        }
      } catch (err) {
        this.logger.warn(
          `Lettura cache permessi fallita per utente ${userId}, uso il DB: ${(err as Error).message}`,
        );
      }
    }

    const codes = await this.loadFromDb(userId);

    if (this.redis.isReady()) {
      try {
        await this.redis.set(key, codes, PERMISSIONS_CACHE_TTL_SECONDS);
      } catch (err) {
        this.logger.warn(
          `Scrittura cache permessi fallita per utente ${userId}: ${(err as Error).message}`,
        );
      }
    }

    return new Set(codes);
  }

  /** Verifica in AND che l'utente possieda tutti i `codes`. */
  async hasAll(userId: number, codes: readonly PermissionCode[]): Promise<PermissionCheckResult> {
    const granted = await this.getUserPermissions(userId);
    const missing = codes.filter((code) => !granted.has(code));
    return { ok: missing.length === 0, missing };
  }

  /**
   * Cancella la cache permessi degli utenti indicati. Va chiamato **dopo** il
   * commit della transazione che ha modificato ruoli/permessi (SPEC S10). Un
   * errore viene loggato e non propagato: la finestra residua è coperta dal TTL.
   * Con Redis non pronto il `DEL` viene accodato senza attendere, così parte
   * alla riconnessione invece di bloccare la richiesta.
   */
  async invalidateUsers(userIds: readonly number[]): Promise<void> {
    const keys = [...new Set(userIds)].map((id) => this.cacheKey(id));
    if (keys.length === 0) return;

    if (!this.redis.isReady()) {
      this.logger.warn(
        `Redis non pronto: invalidazione permessi accodata per ${keys.length} utenti.`,
      );
      this.redis.delMany(keys).catch((err: unknown) => this.logInvalidationError(err, keys));
      return;
    }

    try {
      await this.redis.delMany(keys);
    } catch (err) {
      this.logInvalidationError(err, keys);
    }
  }

  /**
   * Invalida la cache di tutti gli utenti a cui è assegnato un ruolo
   * personalizzato. Gli utenti sono letti da `user_roles` (mai `SCAN`/`KEYS`).
   * I ruoli di sistema cambiano solo al deploy e sono coperti dall'hash del registro.
   */
  async invalidateRole(roleId: number): Promise<void> {
    const rows = await this.db.db
      .select({ userId: userRoleEntity.userId })
      .from(userRoleEntity)
      .where(eq(userRoleEntity.roleId, roleId));
    await this.invalidateUsers(rows.map((r) => r.userId));
  }

  /**
   * Un'unica query `UNION` (quindi con codici distinti): ramo del ruolo di
   * sistema agganciato a `users.role` e ramo dei ruoli personalizzati. Il ramo
   * custom esclude i codici riservati (S6) anche se presenti in DB per modifica
   * manuale: difesa in profondità rispetto alla pulizia del seed.
   */
  private async loadFromDb(userId: number): Promise<PermissionCode[]> {
    const activeUser = and(eq(userEntity.id, userId), eq(userEntity.isActive, true));

    const systemBranch = this.db.db
      .select({ code: permissionEntity.code })
      .from(userEntity)
      .innerJoin(
        roleEntity,
        and(eq(roleEntity.level, userEntity.role), eq(roleEntity.isSystem, true)),
      )
      .innerJoin(rolePermissionEntity, eq(rolePermissionEntity.roleId, roleEntity.id))
      .innerJoin(permissionEntity, eq(permissionEntity.id, rolePermissionEntity.permissionId))
      .where(activeUser);

    const customBranch = this.db.db
      .select({ code: permissionEntity.code })
      .from(userEntity)
      .innerJoin(userRoleEntity, eq(userRoleEntity.userId, userEntity.id))
      .innerJoin(
        roleEntity,
        and(eq(roleEntity.id, userRoleEntity.roleId), eq(roleEntity.isSystem, false)),
      )
      .innerJoin(rolePermissionEntity, eq(rolePermissionEntity.roleId, roleEntity.id))
      .innerJoin(permissionEntity, eq(permissionEntity.id, rolePermissionEntity.permissionId))
      .where(and(activeUser, notInArray(permissionEntity.code, [...SYSTEM_RESERVED_PERMISSIONS])));

    const rows = await systemBranch.union(customBranch);
    return rows.map((r) => r.code).filter(isPermissionCode);
  }

  private logInvalidationError(err: unknown, keys: string[]): void {
    this.logger.error(
      `Invalidazione cache permessi fallita (${keys.join(', ')}): ${(err as Error).message}. ` +
        `Le chiavi scadranno entro ${PERMISSIONS_CACHE_TTL_SECONDS}s.`,
    );
  }
}
