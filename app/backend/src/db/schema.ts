/**
 * Schema Drizzle ORM — CMS.
 * Contiene per ora solo le entità core (utenti, audit log).
 * Le tabelle di dominio del CMS si aggiungono qui,
 * seguendo la stessa convenzione di colonne base (id/guid/isActive/createdAt/
 * updatedAt/createdBy/updatedBy) e FK `{ onDelete: 'restrict', onUpdate: 'restrict' }`.
 * MAI modificare questo file senza generare una migrazione (`drizzle-kit generate`).
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  char,
  index,
  jsonb,
  uniqueIndex,
  AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { Utils } from '../common/utils';
import { AppUserRoles } from '../common/enums';

// ─── USERS ────────────────────────────────────────────────────────────────────

export const userEntity = pgTable(
  'users',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    name: varchar('name', { length: 100 }).notNull(),
    surname: varchar('surname', { length: 100 }),
    email: varchar('email', { length: 200 }).notNull(),
    pwd: text('pwd').notNull(),
    role: integer('role').notNull().default(AppUserRoles.User),
    /** Campo generico di scoping multi-tenant/multi-sede, a disposizione dei moduli del CMS. */
    scopeId: varchar('scope_id', { length: 100 }),
    isActive: boolean('is_active').notNull().default(true),
    pwdSet: boolean('pwd_set').notNull().default(false),
    actionToken: varchar('action_token', { length: 64 }),
    actionTokenExpiresAt: timestamp('action_token_expires_at', { withTimezone: true }),
    isMfaEnabled: boolean('is_mfa_enabled').notNull().default(false),
    totpSecret: varchar('totp_secret', { length: 200 }),
    totpQrCode: text('totp_qr_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: integer('created_by').references((): AnyPgColumn => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    updatedBy: integer('updated_by').references((): AnyPgColumn => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email), uniqueIndex('users_guid_idx').on(t.guid)],
);

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
// Nessuna tabella `logins`: Redis è l'unica session store (vedi src/redis).

export const auditLogEntity = pgTable(
  'audit_log',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    userId: integer('user_id').references(() => userEntity.id, {
      onDelete: 'set null',
      onUpdate: 'restrict',
    }),
    impersonatedBy: integer('impersonated_by').references(() => userEntity.id, {
      onDelete: 'set null',
      onUpdate: 'restrict',
    }),
    action: varchar('action', { length: 100 }).notNull(),
    entity: varchar('entity', { length: 100 }),
    entityId: varchar('entity_id', { length: 100 }),
    details: text('details'),
    ip: varchar('ip', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('audit_user_idx').on(t.userId),
    index('audit_entity_idx').on(t.entity, t.entityId),
    uniqueIndex('audit_guid_idx').on(t.guid),
  ],
);

// ─── APP SETTINGS ─────────────────────────────────────────────────────────────
// Settaggi globali di installazione come coppie key/value jsonb (ADR-4).
// Tabella generica: il tema del Global Theme Customizer è la riga `key = 'theme'`;
// futuri settaggi (branding, feature flag) riusano la stessa tabella.

export const appSettingEntity = pgTable(
  'app_settings',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    key: varchar('key', { length: 100 }).notNull(),
    value: jsonb('value').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: integer('created_by').references(() => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    updatedBy: integer('updated_by').references(() => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
  },
  (t) => [
    uniqueIndex('app_settings_key_idx').on(t.key),
    uniqueIndex('app_settings_guid_idx').on(t.guid),
  ],
);

// ─── FILES ────────────────────────────────────────────────────────────────────
// Astrazione di storage documenti (ADR-8): metadata dei file caricati, il blob
// vero e proprio vive nel driver configurato (`STORAGE_DRIVER`), mai in questa
// tabella. `entity`/`entityId` riusano lo stesso pattern non-FK di `audit_log`:
// un file può restare "orfano" finché il progetto verticale non lo associa
// alla propria entità di dominio.

export const fileEntity = pgTable(
  'files',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    /** Nome file originale fornito dal client — solo per display, MAI usato come path fisico. */
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 150 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Driver che ha salvato fisicamente il file ('local' | 's3'), vedi storage-driver.interface.ts. */
    storageDriver: varchar('storage_driver', { length: 20 }).notNull(),
    /** Chiave/path generata server-side (mai il nome originale) — previene path traversal. */
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    /** Nome della tabella/dominio a cui il file è associato, facoltativo. */
    entity: varchar('entity', { length: 100 }),
    /** Id/guid dell'entità di dominio associata, facoltativo. */
    entityId: varchar('entity_id', { length: 100 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: integer('created_by').references(() => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    updatedBy: integer('updated_by').references(() => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
  },
  (t) => [
    uniqueIndex('files_guid_idx').on(t.guid),
    uniqueIndex('files_storage_key_idx').on(t.storageKey),
    index('files_entity_idx').on(t.entity, t.entityId),
  ],
);

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
// Notifiche persistenti per-utente (campanella con badge in UI). La riga viene
// creata da `NotificationsService.notify()` (chiamato dai moduli applicativi del
// progetto verticale su eventi di dominio) e, se `RealtimeModule` è montato in
// app.module.ts, pushata anche via Socket.io (`AppGateway.emitToUser`) sulla
// room `user:${userId}` — vedi ADR-12. Nessun `applyScopeFilter`: a differenza
// di audit_log/files, qui la visibilità è per singolo utente (`userId`), non
// multi-tenant/multi-sede.

export const notificationEntity = pgTable(
  'notifications',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    userId: integer('user_id')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    /** Codice tipo libero per il progetto verticale (es. 'task.assigned', 'system.info'). */
    type: varchar('type', { length: 100 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message').notNull(),
    /** Percorso frontend opzionale su cui portare l'utente al click, facoltativo. */
    link: varchar('link', { length: 500 }),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    createdBy: integer('created_by').references(() => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    updatedBy: integer('updated_by').references(() => userEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
  },
  (t) => [
    uniqueIndex('notifications_guid_idx').on(t.guid),
    index('notifications_user_unread_idx').on(t.userId, t.isRead),
  ],
);

// ─── RELATIONS ──────────────────────────────────────────────────────────────────

export const usersRelations = relations(userEntity, ({ one, many }) => ({
  createdByUser: one(userEntity, { fields: [userEntity.createdBy], references: [userEntity.id] }),
  updatedByUser: one(userEntity, { fields: [userEntity.updatedBy], references: [userEntity.id] }),
  auditLogs: many(auditLogEntity),
}));

export const auditLogRelations = relations(auditLogEntity, ({ one }) => ({
  user: one(userEntity, { fields: [auditLogEntity.userId], references: [userEntity.id] }),
  impersonatedByUser: one(userEntity, {
    fields: [auditLogEntity.impersonatedBy],
    references: [userEntity.id],
  }),
}));

export const appSettingsRelations = relations(appSettingEntity, ({ one }) => ({
  createdByUser: one(userEntity, {
    fields: [appSettingEntity.createdBy],
    references: [userEntity.id],
  }),
  updatedByUser: one(userEntity, {
    fields: [appSettingEntity.updatedBy],
    references: [userEntity.id],
  }),
}));

export const filesRelations = relations(fileEntity, ({ one }) => ({
  createdByUser: one(userEntity, {
    fields: [fileEntity.createdBy],
    references: [userEntity.id],
  }),
  updatedByUser: one(userEntity, {
    fields: [fileEntity.updatedBy],
    references: [userEntity.id],
  }),
}));

export const notificationsRelations = relations(notificationEntity, ({ one }) => ({
  user: one(userEntity, { fields: [notificationEntity.userId], references: [userEntity.id] }),
  createdByUser: one(userEntity, {
    fields: [notificationEntity.createdBy],
    references: [userEntity.id],
  }),
  updatedByUser: one(userEntity, {
    fields: [notificationEntity.updatedBy],
    references: [userEntity.id],
  }),
}));
