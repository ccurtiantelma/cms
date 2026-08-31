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
  date,
  char,
  index,
  jsonb,
  uniqueIndex,
  AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { Utils } from '../common/utils';
import { AppUserRoles, GlobalSectionLayoutSlot } from '../common/enums';

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

// ─── PAGES ────────────────────────────────────────────────────────────────────
// Entità centrale del CMS (F01). Il contenuto è un albero di blocchi in `jsonb`,
// mai HTML opaco. Bozza e pubblicato coesistono: `draftContent`/`draftSeo` sono
// il lavoro in corso, ciò che è online vive nella revisione puntata da
// `publishedRevisionId`. Ogni riga ha un `locale`; le traduzioni sono righe
// autonome legate da `translationGroupId` (A3/A5: mono-sito, più lingue, nessun
// `siteId` e nessuno `scopeId` di dominio).
// `version` è il lock ottimistico: ogni UPDATE gira con `WHERE version = :version`
// e incrementa la colonna; zero righe aggiornate ⇒ 409.

export const pageEntity = pgTable(
  'pages',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),

    // Identità pubblica
    title: varchar('title', { length: 255 }).notNull(),
    /** Identificatore pubblico, unico per `locale` + genitore fra le righe attive. */
    slug: varchar('slug', { length: 255 }).notNull(),
    locale: varchar('locale', { length: 10 }).notNull(),
    parentId: integer('parent_id').references((): AnyPgColumn => pageEntity.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),
    /** Chiave opaca condivisa dalle traduzioni della stessa Pagina (ADR/A3, scelta S4). */
    translationGroupId: char('translation_group_id', { length: 16 }).notNull(),

    // Ciclo di vita: draft | review | scheduled | published | archived
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    /**
     * Revisione attualmente online. Nullable per necessità: `pages` e
     * `page_revisions` si referenziano a vicenda, quindi la riga della pagina
     * nasce senza revisione e viene aggiornata nella stessa transazione di
     * pubblicazione, dopo l'INSERT della revisione.
     */
    publishedRevisionId: integer('published_revision_id').references(
      (): AnyPgColumn => pageRevisionEntity.id,
      { onDelete: 'restrict', onUpdate: 'restrict' },
    ),

    // Contenuto in lavorazione — albero di blocchi e metadati SEO/GEO della bozza
    draftContent: jsonb('draft_content').notNull(),
    draftSeo: jsonb('draft_seo').notNull(),

    /** Lock ottimistico: incrementato a ogni UPDATE, confrontato nella WHERE. */
    version: integer('version').notNull().default(1),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Autore della riga: unica nozione di proprietà, immutabile (ADR-18 § D2). */
    createdBy: integer('created_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    updatedBy: integer('updated_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
  },
  (t) => [
    uniqueIndex('pages_guid_idx').on(t.guid),

    // Unicità dello slug: DUE indici parziali, non uno solo.
    // 1) Con `parent_id` nullable, in un indice univoco NULL != NULL: un indice
    //    unico su (locale, parent_id, slug) NON protegge le pagine root.
    // 2) Il soft delete è obbligatorio: senza il predicato su `is_active` una
    //    pagina eliminata occuperebbe il proprio slug per sempre.
    // Conseguenza approvata: il soft delete libera lo slug; ripristinare una
    // pagina il cui slug è stato riassegnato fallisce con 409.
    uniqueIndex('pages_slug_locale_root_uq')
      .on(t.locale, t.slug)
      .where(sql`${t.parentId} is null and ${t.isActive}`),
    uniqueIndex('pages_slug_locale_child_uq')
      .on(t.locale, t.parentId, t.slug)
      .where(sql`${t.parentId} is not null and ${t.isActive}`),

    index('pages_status_locale_idx').on(t.status, t.locale),
    index('pages_translation_group_idx').on(t.translationGroupId),
    /**
     * Al massimo una riga attiva per gruppo di traduzione e Locale (regola 3,
     * `business-rules.md` § Multilingua; RFC-F05 § 2, M2). Indice parziale su
     * `is_active`: il soft delete libera lo slot, coerente con lo stesso
     * pattern già in uso per l'unicità dello slug qui sopra.
     */
    uniqueIndex('pages_translation_group_locale_uq')
      .on(t.translationGroupId, t.locale)
      .where(sql`${t.isActive}`),
    index('pages_parent_idx').on(t.parentId),
    /** Predicato di ownership degli elenchi paginati (ADR-18 § D6). */
    index('pages_created_by_idx').on(t.createdBy),
  ],
);

// ─── PAGE REVISIONS ───────────────────────────────────────────────────────────
// Tabella APPEND-ONLY (ADR-19): una riga viene inserita alla pubblicazione e non
// è mai più toccata. Struttura ridotta a id/guid/createdAt/createdBy come da
// CLAUDE.md § Database — deliberatamente SENZA `updatedAt`/`updatedBy` (che
// dichiarerebbero un percorso di modifica inesistente), SENZA `isActive` (lo
// scivolo verso una cancellazione logica vietata) e SENZA `version` (non c'è
// concorrenza su righe che non si aggiornano). Lo snapshot è completo (S1):
// nessun diff, nessun rimando alla riga viva. La potatura delle revisioni
// eccedenti NON è implementata ed è rinviata da ADR-19.

export const pageRevisionEntity = pgTable(
  'page_revisions',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),

    pageId: integer('page_id')
      .notNull()
      .references(() => pageEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    /** Progressivo per pagina: unico insieme a `page_id`, mai riusato. */
    revisionNumber: integer('revision_number').notNull(),

    // Snapshot immutabile del contenuto pubblicato
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    content: jsonb('content').notNull(),
    seo: jsonb('seo').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
  },
  (t) => [
    uniqueIndex('page_revisions_guid_idx').on(t.guid),
    uniqueIndex('page_revisions_page_number_uq').on(t.pageId, t.revisionNumber),
  ],
);

// ─── GLOBAL SECTIONS ──────────────────────────────────────────────────────────
// Sezioni Globali (F06, ADR-40): Header/Footer come contenuto a blocchi
// innestato in uno slot di layout pubblico, non Pagine, non `app_settings`.
// `content` è lo stesso envelope jsonb di ADR-21 (albero di blocchi validato
// contro il registro). Al massimo una riga attiva per `layoutSlot` diverso da
// `none` (indice parziale sotto), così lo stesso vincolo protegge sia
// `header` che `footer` senza due colonne booleane dedicate.

export const globalSectionEntity = pgTable(
  'global_sections',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    title: varchar('title', { length: 255 }).notNull(),
    /** Identificatore admin, unico fra le righe attive — non una rotta pubblica. */
    slug: varchar('slug', { length: 255 }).notNull(),
    layoutSlot: varchar('layout_slot', { length: 20 })
      .notNull()
      .default(GlobalSectionLayoutSlot.None),
    /** Quando lo slot è `header`, decide se la sezione resta fissa in cima al viewport. */
    isSticky: boolean('is_sticky').notNull().default(false),
    /** Albero di blocchi (envelope `{ version, blocks }`, ADR-21), stessa pipeline di validazione delle Pagine. */
    content: jsonb('content').notNull(),
    /** Lock ottimistico: incrementato a ogni UPDATE, confrontato nella WHERE. */
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    updatedBy: integer('updated_by')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
  },
  (t) => [
    uniqueIndex('global_sections_guid_idx').on(t.guid),
    uniqueIndex('global_sections_slug_uq')
      .on(t.slug)
      .where(sql`${t.isActive}`),
    /** Al massimo una Sezione attiva per slot diverso da `none` (ADR-40 § Decisione). */
    uniqueIndex('global_sections_layout_slot_uq')
      .on(t.layoutSlot)
      .where(sql`${t.layoutSlot} != 'none' and ${t.isActive}`),
    index('global_sections_layout_slot_idx').on(t.layoutSlot),
  ],
);

// ─── PUBLIC PAGEVIEW DAILY ───────────────────────────────────────────────────
// Aggregato anonimo prodotto dal consumer SSR: nessun IP, cookie, user-agent o
// identificatore personale. Le righe oltre 24 mesi vengono soft-deleted.
export const publicPageviewDailyEntity = pgTable(
  'public_pageview_daily',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    eventDate: date('event_date', { mode: 'string' }).notNull(),
    pagePath: varchar('page_path', { length: 2048 }).notNull(),
    visits: integer('visits').notNull().default(0),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    uniqueIndex('public_pageview_daily_guid_idx').on(t.guid),
    uniqueIndex('public_pageview_daily_date_path_uq').on(t.eventDate, t.pagePath),
    index('public_pageview_daily_date_idx').on(t.eventDate, t.isActive),
    index('public_pageview_daily_path_idx').on(t.pagePath),
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

export const pagesRelations = relations(pageEntity, ({ one, many }) => ({
  parent: one(pageEntity, {
    fields: [pageEntity.parentId],
    references: [pageEntity.id],
    relationName: 'pageHierarchy',
  }),
  children: many(pageEntity, { relationName: 'pageHierarchy' }),
  revisions: many(pageRevisionEntity),
  publishedRevision: one(pageRevisionEntity, {
    fields: [pageEntity.publishedRevisionId],
    references: [pageRevisionEntity.id],
    relationName: 'publishedRevision',
  }),
  author: one(userEntity, {
    fields: [pageEntity.createdBy],
    references: [userEntity.id],
  }),
  updatedByUser: one(userEntity, {
    fields: [pageEntity.updatedBy],
    references: [userEntity.id],
  }),
}));

export const pageRevisionsRelations = relations(pageRevisionEntity, ({ one }) => ({
  page: one(pageEntity, {
    fields: [pageRevisionEntity.pageId],
    references: [pageEntity.id],
  }),
  author: one(userEntity, {
    fields: [pageRevisionEntity.createdBy],
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

export const globalSectionsRelations = relations(globalSectionEntity, ({ one }) => ({
  createdByUser: one(userEntity, {
    fields: [globalSectionEntity.createdBy],
    references: [userEntity.id],
  }),
  updatedByUser: one(userEntity, {
    fields: [globalSectionEntity.updatedBy],
    references: [userEntity.id],
  }),
}));

export const publicPageviewDailyRelations = relations(publicPageviewDailyEntity, ({ one }) => ({
  createdByUser: one(userEntity, {
    fields: [publicPageviewDailyEntity.createdBy],
    references: [userEntity.id],
  }),
  updatedByUser: one(userEntity, {
    fields: [publicPageviewDailyEntity.updatedBy],
    references: [userEntity.id],
  }),
}));
