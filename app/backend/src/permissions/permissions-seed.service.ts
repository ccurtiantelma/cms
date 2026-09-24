import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { permissionEntity, roleEntity, rolePermissionEntity } from '../db/schema';
import { PermissionsService } from './permissions.service';
import {
  ALL_PERMISSION_CODES,
  PERMISSIONS,
  SYSTEM_RESERVED_PERMISSIONS,
  SYSTEM_ROLE_CODES,
  SYSTEM_ROLES,
} from './permissions.registry';

/** Riepilogo di una sincronizzazione, usato nei log e nei test. */
export interface PermissionsSyncSummary {
  permissions: number;
  removedPermissions: string[];
  systemRoles: number;
  /** Id dei ruoli personalizzati da cui sono stati rimossi codici riservati (S6). */
  cleanedCustomRoleIds: number[];
}

/**
 * Sincronizza il DB sul registro `permissions.registry.ts` (ADR-99 § 3, SPEC §
 * `PermissionsSeedService.sync()`). Idempotente e convergente fra istanze
 * concorrenti: solo upsert per `code` e `onConflictDoNothing`, nessun lock.
 *
 * Distinto da `admin/seed.service.ts` (dati demo, SuperAdmin only): questo è
 * il registro di sicurezza e gira a ogni avvio.
 */
@Injectable()
export class PermissionsSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSeedService.name);

  /** Inietta il DB e il service permessi (per invalidare i ruoli ripuliti). */
  constructor(
    private readonly db: DbService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Esegue `sync()` all'avvio senza mai bloccarlo (SPEC S4). Se fallisce
   * (tipicamente migrazioni non applicate) il sistema resta fail-closed:
   * nessun utente ha permessi e ogni rotta `@Permissions` risponde `403`.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const summary = await this.sync();
      this.logger.log(
        `Seed RBAC completato: ${summary.permissions} permessi, ${summary.systemRoles} ruoli di sistema.`,
      );
    } catch (err) {
      this.logger.error(
        `Seed RBAC fallito, nessun utente avrà permessi granulari finché non riesce ` +
          `(eseguire \`npm run db:migrate\` se le tabelle mancano): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Allinea `permissions`, i 4 ruoli di sistema e le loro associazioni al
   * registro, in una sola transazione. Pubblico: il setup e2e di F2 lo richiama
   * dopo `truncateAllTables`.
   */
  async sync(): Promise<PermissionsSyncSummary> {
    const summary = await this.db.db.transaction(async (tx) => {
      // 1. Upsert dei permessi del registro.
      const permissionRows = await tx
        .insert(permissionEntity)
        .values(
          PERMISSIONS.map((p) => ({
            code: p.code,
            category: p.category,
            description: p.description,
          })),
        )
        .onConflictDoUpdate({
          target: permissionEntity.code,
          set: {
            category: sql`excluded.category`,
            description: sql`excluded.description`,
          },
        })
        .returning({ id: permissionEntity.id, code: permissionEntity.code });
      const permissionIdByCode = new Map(permissionRows.map((r) => [r.code, r.id]));

      // 2. Codici usciti dal registro: `cascade` su `role_permissions` (S5).
      const removed = await tx
        .delete(permissionEntity)
        .where(notInArray(permissionEntity.code, [...ALL_PERMISSION_CODES]))
        .returning({ code: permissionEntity.code });
      if (removed.length > 0) {
        this.logger.warn(
          `Permessi rimossi perché assenti dal registro: ${removed.map((r) => r.code).join(', ')}.`,
        );
      }

      // 3. Upsert dei ruoli di sistema.
      const roleRows = await tx
        .insert(roleEntity)
        .values(
          SYSTEM_ROLE_CODES.map((code) => ({
            code,
            name: SYSTEM_ROLES[code].name,
            description: SYSTEM_ROLES[code].description,
            isSystem: true,
            level: SYSTEM_ROLES[code].level,
          })),
        )
        .onConflictDoUpdate({
          target: roleEntity.code,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            isSystem: true,
            level: sql`excluded.level`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: roleEntity.id, code: roleEntity.code });

      // 4. Associazioni esatte dei ruoli di sistema.
      for (const role of roleRows) {
        const definition = SYSTEM_ROLES[role.code as keyof typeof SYSTEM_ROLES];
        const desiredIds = definition.permissions.map((code) => {
          const id = permissionIdByCode.get(code);
          if (id === undefined) throw new Error(`Permesso ${code} non sincronizzato.`);
          return id;
        });

        await tx
          .delete(rolePermissionEntity)
          .where(
            and(
              eq(rolePermissionEntity.roleId, role.id),
              notInArray(rolePermissionEntity.permissionId, desiredIds),
            ),
          );
        await tx
          .insert(rolePermissionEntity)
          .values(desiredIds.map((permissionId) => ({ roleId: role.id, permissionId })))
          .onConflictDoNothing();
      }

      // 5. Codici riservati finiti in un ruolo personalizzato (modifica manuale del DB).
      const reservedIds = SYSTEM_RESERVED_PERMISSIONS.map((code) =>
        permissionIdByCode.get(code),
      ).filter((id): id is number => id !== undefined);
      const cleaned =
        reservedIds.length === 0
          ? []
          : await tx
              .delete(rolePermissionEntity)
              .where(
                and(
                  inArray(rolePermissionEntity.permissionId, reservedIds),
                  inArray(
                    rolePermissionEntity.roleId,
                    tx
                      .select({ id: roleEntity.id })
                      .from(roleEntity)
                      .where(eq(roleEntity.isSystem, false)),
                  ),
                ),
              )
              .returning({ roleId: rolePermissionEntity.roleId });
      const cleanedCustomRoleIds = [...new Set(cleaned.map((r) => r.roleId))];
      if (cleanedCustomRoleIds.length > 0) {
        this.logger.warn(
          `Codici riservati rimossi dai ruoli personalizzati ${cleanedCustomRoleIds.join(', ')}.`,
        );
      }

      return {
        permissions: permissionRows.length,
        removedPermissions: removed.map((r) => r.code),
        systemRoles: roleRows.length,
        cleanedCustomRoleIds,
      };
    });

    // Post-commit (S10): la cache degli utenti di un ruolo ripulito può contenere il codice riservato.
    for (const roleId of summary.cleanedCustomRoleIds) {
      await this.permissionsService.invalidateRole(roleId);
    }

    return summary;
  }
}
