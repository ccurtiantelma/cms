# Spec — RBAC F1 Schema, seed, cache e guard dei permessi granulari

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvata** · [ ] Rifiutata
> Redatta il 2026-09-24 dopo la firma di ADR-99 (stessa data, marketing@antelmagroup.net).
> Nessun file in `app/` va toccato prima dell'approvazione di questa SPEC e del PLAN collegato.
>
> **Approvazione**: approvata così com'è, assunzioni S1–S10 incluse, con conferma esplicita in sede
> di task (scelta "Firmo SPEC+PLAN ora" alla domanda posta in sessione, dopo aver rilevato che il
> prompt di implementazione rimandava a SPEC/PLAN ancora in bozza). Confermati in pari sede: seed
> in `PermissionsSeedService` separato (non in `admin/seed.service.ts`, come proponeva il prompt) e
> `409 ROLE_IN_USE` su qualsiasi assegnazione, non solo verso utenti attivi.
>
> Firma: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Feature di riferimento

Nessun file in `docs/ai/features/` (non richiesto per questo task e non creato: la Documentation
Policy lo riserva a richiesta esplicita). Il documento di origine è
`docs/ai/adr/ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`, approvata con modifiche il
2026-09-24. Vale il § "Decisione umana" in coda all'ADR (P1–P6 risolti, perimetro F1 esteso a
`RolesService`). Nessun numero `F[N]` di roadmap è assegnato all'RBAC: questa SPEC usa
l'etichetta di fase di ADR-99 § 11 ("F1") e non ne inventa uno.

Plan collegato: `docs/ai/plans/PLAN-RBAC-F1-schema-seed-cache-guard.md`.

## ADR applicabili

- `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`: **vincolante**. § Decisione punti 1–6 e 8,
  punto 7 limitatamente alle regole di dominio, § "Decisione umana".
- `ADR-18-ownership-per-riga.md`: D1–D5 invariate, e nessun helper di ownership viene toccato.
- `ADR-13-gestione-sessioni-dispositivi.md`: chiavi Redis `login:*`, `rtk:*`, `session:*`,
  `user-sessions:*` non toccate, e nessun campo nuovo nel JWT.
- `ADR-23-caching-invalidazione-pubblica.md` § 5–6: pattern già in produzione per
  `RedisService.delMany` (chiavi calcolate dal DB, mai `SCAN`/`KEYS`) e `isReady()`. Viene
  riusato, non modificato.
- `ADR-2-security-baseline.md`: formato `403` e fail-closed.
- `docs/business-rules.md` § "Permessi editoriali" (matrice, fonte del seed) e § "Attori e ruoli"
  (regola "Admin non gestisce SuperAdmin", funzioni di sistema a match esatto).

## Outcomes tecnici

A fine F1 nel backend esistono:

1. Quattro tabelle nuove (`roles`, `permissions`, `role_permissions`, `user_roles`) e la
   migrazione `0015_*` generata con `drizzle-kit generate`. `users` resta invariata.
2. Il registro versionato `permissions.registry.ts`, che contiene catalogo dei codici, categorie,
   mappa dei 4 ruoli di sistema e codici riservati.
3. `PermissionsSeedService`, che sincronizza DB ← registro all'avvio in modo idempotente.
4. `PermissionsService`, che risolve i permessi effettivi di un utente con cache Redis
   `perm:v<hash>:user:<userId>` e invalida esplicitamente.
5. Il decoratore `@Permissions(...codes)` e il `PermissionsGuard` (AND, fail-closed). **Nessun
   endpoint esistente viene migrato in F1.**
6. `RolesService`, il service di dominio senza controller: CRUD ruoli personalizzati e
   assegnazione ruoli aggiuntivi, con protezione dei ruoli di sistema, `409 ROLE_IN_USE`,
   anti-escalation e `roles:manage` riservato al solo SuperAdmin.
7. Due hook additivi di invalidazione in `AdminService` (cambio `role`, toggle attivo).
8. Unit test per ognuno dei punti 2–7, test di conformità matrice ↔ seed e test di coerenza del
   registro.

## In scope

- Schema Drizzle e migrazione additiva.
- Registro dei permessi riconciliato endpoint per endpoint (§ "Registro", ADR-99 § 4 lo demanda
  alla SPEC).
- Seed idempotente dei permessi e dei 4 ruoli di sistema (`is_system = true`, sola lettura,
  P3).
- Cache Redis per utente con TTL di sicurezza 3600 s e invalidazione esplicita alle modifiche di
  ruoli personalizzati, permessi di un ruolo, `user_roles`, `users.role` e `users.is_active`.
- `PermissionsGuard` e `@Permissions`, disponibili ma non ancora applicati a rotte reali.
- `RolesService` con le regole di sicurezza: anti-escalation, `roles:manage` riservato,
  ruoli di sistema protetti e `409 ROLE_IN_USE`.
- Audit log delle scritture di `RolesService` tramite `AuditLogService`.

## Out of scope

Tutto ciò che segue passa a F2–F4 di ADR-99 o resta fuori da ADR-99:

- Controller `api/v1/app/admin/roles*` e `permissions`, DTO HTTP, `roleIds` su
  `CreateUserDto`/`UpdateUserDto`, e2e `roles.e2e-spec.ts`, collezione Bruno,
  `openapi:export`/`openapi:types` (**F2**).
- Migrazione di qualsiasi endpoint da `GuardX` a `@Permissions`, compresa `app/files`
  (**F2**).
- `GET /auth/me` con `permissions: string[]`, `useAuthStore`, `useHasPermission`, `<Can>`, rotta
  `/roles`, `PageUsers` (**F3**).
- Aggiornamento di `business-rules.md` A4, constitution, glossary, system-architecture e
  `INDEX.md` (**F4**, su richiesta esplicita: Documentation Policy).
- Permessi negativi o sottrattivi (ADR-99 § 1), ADR-90 § 3 (P5), file riservati e policy MinIO
  (P4, § 9).
- Permessi nel JWT (ADR-99 § 6).
- Funzioni di sistema SuperAdmin (impersonificazione, seed/reset demo, rebuild), che restano su
  `GuardSuperAdmin` e non diventano permessi.

## Vincoli e assunzioni

**Vincoli** (constitution, ADR-99):

- Stack esistente: NestJS, Drizzle, `ioredis` tramite `RedisService`. **Nessuna dipendenza npm
  nuova**; l'hash del registro usa `node:crypto`.
- Convenzioni di `schema.ts`: suffisso `Entity`, `guid char(16)` con `Utils.randomString(16)`,
  timestamp `withTimezone`, FK di audit `restrict`/`restrict`.
- Nessun test RBAC/ownership esistente viene modificato per passare (ADR-99 § Conformità).
- `RedisService` non ha `scan`: le chiavi da invalidare si calcolano sempre dal DB.

**Assunzioni** (dove ADR-99 non fissa il dettaglio; ciascuna è un punto su cui chiedere
l'approvazione della SPEC):

| # | Assunzione | Motivo |
|---|---|---|
| S1 | I permessi effettivi si calcolano da `users.role` **letto dal DB**, non dal JWT | È ciò che rende "immediato" lo strato permessi (ADR-99 § 6). I guard legacy continuano a leggere `authInfo.role` |
| S2 | Utente inesistente o `is_active = false` → insieme vuoto | Fail-closed. L'invalidazione sul toggle attivo mantiene coerente la cache |
| S3 | `hashRegistro` = primi 12 caratteri hex di `sha256` del JSON canonico (chiavi ordinate) di `{ permissions: codici ordinati, systemRoles: mappa code → codici ordinati }` | Cambia solo se cambia il contenuto del registro. Invalidazione automatica al deploy (ADR-99 § 6) |
| S4 | Il seed gira in `OnApplicationBootstrap` di `PermissionsModule`. Un errore (es. tabelle assenti perché `npm run db:migrate` non è stato eseguito) produce un `error` di log esplicito ("eseguire `npm run db:migrate`") ma **non blocca l'avvio**. Il sistema resta fail-closed: senza seed nessun utente ha permessi, quindi ogni rotta `@Permissions` risponde `403` | Due suite e2e esistenti (`settings.e2e-spec.ts`, `global-kit.e2e-spec.ts`) avviano `AppModule` con `DbService` mockato e senza migrazioni. Un avvio bloccante le romperebbe, violando "nessun test esistente modificato". In F1 nessuna rotta usa `@Permissions` |
| S5 | `role_permissions.permission_id` → `onDelete: 'cascade'` | ADR-99 § 2 fissa solo le FK "verso i ruoli" (`restrict`) e "verso users" (`cascade`). Il cascade sul permesso serve al seed per rimuovere un codice uscito dal registro |
| S6 | `roles:manage` è **riservato ai ruoli di sistema**: non può comparire in un ruolo personalizzato (`400`) | Senza questa regola un SuperAdmin potrebbe metterlo in un ruolo custom assegnato a un Admin, e la firma P2 ("solo SuperAdmin") diventerebbe un default aggirabile |
| S7 | In `setUserRoles` l'anti-escalation si applica ai ruoli **aggiunti**. La rimozione richiede solo `users:assign_roles` e la gestibilità del target | Testo letterale di ADR-99 § 8 ("assegnare"). Rimuovere un ruolo riduce i privilegi e non li aumenta |
| S8 | I ruoli si identificano per `guid` nei metodi di `RolesService` (come `users/:guid`). ADR-99 § 7 scrive `roles/:id`: l'allineamento del path HTTP è deciso nella SPEC F2 | Convenzione di tutto il repo (`guid` esposto, `id` interno) |
| S9 | Un ruolo di sistema **non** si assegna via `user_roles` (`400`): il livello base passa solo da `users.role` | Evita la doppia fonte per lo stesso livello |
| S10 | Invalidazione eseguita **dopo il commit** della transazione. Se il `DEL` fallisce l'errore viene loggato e non propagato, con finestra residua ≤ TTL | Redis è anche la session store (ADR-13): con Redis irraggiungibile nessuna richiesta autenticata può arrivare a mutare ruoli. Il rischio resta nella matrice del PLAN |

## Registro dei permessi (riconciliazione di ADR-99 § 4)

Regola di ADR-99 § 3: *un codice esiste nel registro solo se esiste un punto di enforcement.*
Verifica endpoint per endpoint sul codice al 2026-09-24:

| Codice | Categoria | Punto di enforcement oggi (da migrare in F2+) | Ruoli di sistema |
|---|---|---|---|
| `pages:create` | pages | `POST app/pages`, nessun guard (tutti) | user+ |
| `pages:edit_own` | pages | `PATCH app/pages/:guid`, ownership ADR-18 | user+ |
| `pages:edit_any` | pages | `pages.service.ts` `OWNERSHIP_ELEVATED_THRESHOLD = Manager` | manager+ |
| `pages:submit_review` | pages | `POST app/pages/:guid/status` → `review` | user+ |
| `pages:publish` | pages | `POST app/pages/:guid/status` (soglia Manager nel service) | manager+ |
| `pages:restore_revision` | pages | `POST app/pages/:guid/revisions/:revisionGuid/restore`, `GuardManager` | manager+ |
| `pages:delete` | pages | `DELETE app/pages/:guid`, `GuardAdmin` | admin+ |
| `templates:manage` | structure | `app/site-templates/*`, `GuardManager` di classe | manager+ |
| `global_sections:manage` | structure | `app/global-sections/*`, `GuardManager` di classe | manager+ |
| `media:upload` | media | `POST app/files`, nessun guard | user+ |
| `media:delete_any` | media | `files.service.ts` `softDelete` (soglia Admin + ownership) | admin+ |
| `forms:read_submissions` | forms | `GET app/forms/submissions`, `GuardManager` di classe | manager+ |
| `settings:manage_theme` | settings | `PUT app/settings/theme`, **`GuardSuperAdmin`** (vedi divergenza D1) | admin+ |
| `settings:manage_locales` | settings | `PUT app/settings/multilingual`, `GuardAdmin` | admin+ |
| `users:read` | users | `GET app/admin/users`, `GET app/admin/users/:guid`, `GuardAdmin` | admin+ |
| `users:write` | users | `POST`/`PATCH app/admin/users*`, toggle-active, reset-mfa, `GuardAdmin` | admin+ |
| `users:assign_roles` | users | `RolesService.setUserRoles` (F1), `roleIds` sui DTO utente (F2) | admin+ (P2) |
| `roles:read` | users | `GET app/admin/roles`, `GET app/admin/permissions` (F2) | admin+ |
| `roles:manage` | users | `RolesService` create/update/delete (F1), controller (F2). **Riservato** (S6) | **solo superadmin** (P2) |
| `audit:read` | users | `GET app/admin/audit-log`, `GuardAdmin` | admin+ |

**Esclusi dal registro F1**: il catalogo di ADR-99 § 4 li proponeva, ma oggi non hanno un punto di
enforcement. Entreranno con il modulo che li applica:

| Codice proposto | Motivo |
|---|---|
| `forms:manage` | I Moduli si definiscono come blocchi dentro la Pagina (ADR-46). Non esiste un endpoint "definire modulo" separato da `PATCH app/pages/:guid` |
| `settings:manage_redirects` | Nessun modulo Redirect (residuo F07, tabella `redirects` ancora da approvare) |
| `blocks:html_embed` | Nessun blocco HTML/embed soggetto a soglia nel registro blocchi (ADR-78 perimetro `kind: 'html'` non implementato) |
| Menu, chatbot | Nessun modulo (già previsto da ADR-99 § 4 per Menu; F11 chatbot pending) |

**Divergenze matrice ↔ codice**, da risolvere **prima di migrare** l'endpoint relativo, non in F1:

- **D1**: "Gestire tema e risorse globali" è Admin+ in matrice, ma `PUT settings/theme` è
  `GuardSuperAdmin` e `PUT settings/global-kit` è `GuardManager`. Il seed segue la matrice (ADR-99
  § 3). Migrare `PUT theme` a `@Permissions('settings:manage_theme')` **allargherebbe** l'accesso
  ad Admin.
- **D2**: `PUT settings/revisions-retention`, `global-tokens` e `breakpoints` (`GuardAdmin`) non
  hanno una riga di matrice né un codice. Restano su `GuardAdmin` finché non vengono mappati.

**Seed dei ruoli di sistema** (applica P2):

- `user` (level 30): `pages:create`, `pages:edit_own`, `pages:submit_review`, `media:upload`
- `manager` (20): `user` + `pages:edit_any`, `pages:publish`, `pages:restore_revision`,
  `templates:manage`, `global_sections:manage`, `forms:read_submissions`
- `admin` (10): `manager` + `pages:delete`, `media:delete_any`, `settings:manage_theme`,
  `settings:manage_locales`, `users:read`, `users:write`, `users:assign_roles`, `roles:read`,
  `audit:read`
- `superadmin` (5): tutti i codici del registro (`admin` + `roles:manage`), calcolato come "tutti"
  e non come elenco, così un codice nuovo gli arriva senza modifiche alla mappa

## Schema DB (Drizzle)

### Tabelle nuove

```typescript
// app/backend/src/db/schema.ts — sezione nuova "RBAC (ADR-99)"
// import aggiuntivo: primaryKey da 'drizzle-orm/pg-core'

export const roleEntity = pgTable(
  'roles',
  {
    id: serial().notNull().primaryKey(),
    guid: char('guid', { length: 16 })
      .notNull()
      .$defaultFn(() => Utils.randomString(16)),
    /** Slug stabile: `superadmin`/`admin`/`manager`/`user` per i ruoli di sistema. */
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    /** Valore `AppUserRoles` corrispondente; valorizzato solo per i ruoli di sistema. */
    level: integer('level'),
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
    uniqueIndex('roles_code_uq').on(t.code),
    uniqueIndex('roles_guid_uq').on(t.guid),
    uniqueIndex('roles_level_uq').on(t.level).where(sql`${t.level} is not null`),
    check('roles_system_level_ck', sql`(${t.isSystem}) = (${t.level} is not null)`),
  ],
);

export const permissionEntity = pgTable(
  'permissions',
  {
    id: serial().notNull().primaryKey(),
    /** `risorsa:azione`, minuscolo snake_case. Gestito solo dal seed (mai da API). */
    code: varchar('code', { length: 64 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    description: text('description'),
  },
  (t) => [uniqueIndex('permissions_code_uq').on(t.code)],
);

export const rolePermissionEntity = pgTable(
  'role_permissions',
  {
    roleId: integer('role_id')
      .notNull()
      .references(() => roleEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    permissionId: integer('permission_id')
      .notNull()
      .references(() => permissionEntity.id, { onDelete: 'cascade', onUpdate: 'restrict' }), // S5
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index('role_permissions_permission_idx').on(t.permissionId),
  ],
);

export const userRoleEntity = pgTable(
  'user_roles',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => userEntity.id, { onDelete: 'cascade', onUpdate: 'restrict' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleEntity.id, { onDelete: 'restrict', onUpdate: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index('user_roles_role_idx').on(t.roleId), // 409 ROLE_IN_USE e invalidazione per ruolo
  ],
);
```

Scelte rispetto al template:

- Niente `isActive` su `roles`: ADR-99 prevede eliminazione con `409` se assegnato, non soft
  delete.
- `permissions` non ha `guid` né campi di audit perché è gestita dal solo seed e identificata da
  `code`.
- `user_roles` non ha `created_by` perché una FK `restrict` verso `users` bloccherebbe
  `resetDemo`, che elimina gli utenti non SuperAdmin. Il "chi" è in `audit_log`.
- `roles.created_by`/`updated_by` restano `restrict` e non bloccano `resetDemo`: solo chi possiede
  `roles:manage` (SuperAdmin, P2 + S6) scrive ruoli, e `resetDemo` non elimina i SuperAdmin.
- `user_roles.user_id` è `cascade`, quindi `resetDemo` rimuove anche le assegnazioni.

### Tabelle modificate

Nessuna. `users` e `audit_log` restano invariate.

## Endpoint API

**Nessun endpoint nuovo o modificato in F1**, quindi niente `openapi:export`/`openapi:types` in
questa fase. Il contratto di errore che il guard esporrà in F2 è:

- **Response 403** (guard): `ForbiddenException`, stesso formato di `requireRole`, messaggio
  `Permessi insufficienti (richiesto permesso: <codice>).` con il primo codice mancante, nell'ordine
  dichiarato.

Contratto di errore di `RolesService`, esposto via HTTP in F2:

| Condizione | Eccezione | `code` | Messaggio |
|---|---|---|---|
| Ruolo / utente non trovato | `NotFoundException` | — | `Ruolo non trovato.` / `Utente non trovato.` |
| Codice permesso sconosciuto, codice riservato (S6), ruolo di sistema in `setUserRoles` (S9), `code` ruolo malformato | `BadRequestException` | `INVALID_PERMISSION_CODE` · `RESERVED_PERMISSION` · `SYSTEM_ROLE_NOT_ASSIGNABLE` · `INVALID_ROLE_CODE` | testo esplicito |
| Scrittura su ruolo di sistema | `ForbiddenException` | `SYSTEM_ROLE_READONLY` | `I ruoli di sistema sono in sola lettura.` |
| Chiamante senza `roles:manage` / `users:assign_roles` | `ForbiddenException` | — | `Permessi insufficienti (richiesto permesso: <codice>).` |
| Anti-escalation | `ForbiddenException` | `PERMISSION_ESCALATION` | `Non puoi concedere permessi che non possiedi: <codici>.` |
| Target SuperAdmin e chiamante non SuperAdmin | `ForbiddenException` | — | `Non puoi gestire utenti con ruolo SuperAdmin.` (identico ad `AdminService`) |
| `code` ruolo duplicato (`roles_code_uq`) | `ConflictException` | `ROLE_CODE_DUPLICATE` | tramite `db-error.mapper.ts` (nuova voce) |
| Eliminazione di ruolo assegnato | `ConflictException` | `ROLE_IN_USE` | `Il ruolo è assegnato a <n> utenti: rimuovilo prima di eliminarlo.` |

Il `409 ROLE_IN_USE` ha due livelli. Primo, un controllo applicativo (count su `user_roles`).
Secondo, un backstop sul vincolo FK `restrict` (Postgres `23503` su `user_roles.role_id`), mappato
allo stesso `409` per la corsa "assegnazione concorrente fra count e delete".

## DTO

Nessun DTO HTTP in F1. Tipi interni, che diventano DTO `class-validator` in F2:

```typescript
// app/backend/src/permissions/permissions.registry.ts
export const PERMISSION_CATEGORIES = ['pages', 'structure', 'media', 'forms', 'settings', 'users'] as const;

export const PERMISSIONS = [
  { code: 'pages:create', category: 'pages', description: 'Creare una Pagina' },
  // … un elemento per riga della tabella "Registro dei permessi"
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

/** Codici che non possono comparire in un ruolo personalizzato (S6, P2). */
export const SYSTEM_RESERVED_PERMISSIONS: readonly PermissionCode[] = ['roles:manage'];

/** Codice ruolo di sistema → livello `AppUserRoles` → permessi. `superadmin` = tutti. */
export const SYSTEM_ROLES: Readonly<Record<SystemRoleCode, SystemRoleDefinition>>;

// app/backend/src/admin/roles/roles.types.ts
export interface CreateRoleInput {
  code: string;               // /^[a-z][a-z0-9_]{2,49}$/, univoco
  name: string;               // 1..100
  description?: string | null;
  permissionCodes: PermissionCode[];
}
export type UpdateRoleInput = Partial<Omit<CreateRoleInput, 'code'>>; // `code` immutabile
```

`@Permissions(...codes: [PermissionCode, ...PermissionCode[]])` accetta solo `PermissionCode`.
Un codice fuori registro è quindi un errore di compilazione, non solo di test.

## Comportamento dei componenti

### `PermissionsSeedService.sync()` (all'avvio, idempotente, una transazione)

1. Upsert per `code` di tutti i `PERMISSIONS` (aggiorna `category`/`description`).
2. Elimina i `permissions` il cui `code` non è più nel registro (cascade su `role_permissions`,
   S5), con un `warn` che elenca i codici.
3. Upsert per `code` dei 4 ruoli di sistema (`is_system = true`, `level`, `name`).
4. Per ogni ruolo di sistema allinea `role_permissions` all'insieme esatto del registro. Rimuove
   la differenza e inserisce il resto con `onConflictDoNothing`: istanze concorrenti convergono.
5. Rimuove da ogni ruolo personalizzato i codici `SYSTEM_RESERVED_PERMISSIONS`, se presenti per
   modifica manuale del DB.

È pubblico, così il setup e2e di F2 può richiamarlo dopo `truncateAllTables` (vedi PLAN § Rischi).

### `PermissionsService`

- `getUserPermissions(userId): Promise<ReadonlySet<PermissionCode>>`:
  1. Se `redis.isReady()`, `getJson<string[]>(key)`. Un hit restituisce il valore; un errore Redis
     produce un `warn` e si passa al DB.
  2. DB: un'unica query che unisce il ruolo di sistema con `level = users.role` e i ruoli in
     `user_roles`, con `DISTINCT permissions.code`. Utente assente o inattivo → vuoto (S2).
  3. Scrive la cache con TTL 3600 s, a meno che Redis non sia pronto. Un errore in scrittura
     produce un `warn` e non viene propagato.
  - Mai fail-open: un errore DB si propaga e produce un 500. Nessun default permissivo.
- `hasAll(userId, codes)`: `{ ok: boolean; missing: PermissionCode[] }`.
- `invalidateUsers(userIds: number[])`: `delMany` delle chiavi con l'hash corrente.
- `invalidateRole(roleId)`: legge da `user_roles` gli utenti con quel ruolo e chiama
  `invalidateUsers`. Solo per ruoli personalizzati: i ruoli di sistema cambiano solo al deploy e
  li copre l'hash.
- Chiave: `perm:v<hashRegistro>:user:<userId>`, con hash calcolato una sola volta all'avvio del
  modulo (S3).

### `@Permissions(...codes)` e `PermissionsGuard`

- `@Permissions` = `applyDecorators(SetMetadata(PERMISSIONS_KEY, codes), UseGuards(PermissionsGuard))`,
  così il decoratore da solo attiva il guard.
- Il guard legge i metadati con `Reflector.getAllAndOverride` (handler, poi classe).
  `authInfo` assente → `403`. Metadati assenti o vuoti → `403` più un `error` di log
  (configurazione errata, fail-closed).
- Semantica AND; `authInfo.userId` è l'utente impersonato quando c'è impersonificazione, già
  coerente.
- Può convivere con `GuardX` sulla stessa rotta, ma F1 non lo applica a nessuna rotta.
- `PermissionsModule` è `@Global()`, come `RedisModule`/`DbModule`/`CommonModule`, così il guard
  è risolvibile in ogni modulo senza import espliciti.

### `RolesService` (`app/backend/src/admin/roles/`, senza controller)

Ogni metodo riceve `authInfo` e `ip?`. I permessi del chiamante arrivano da
`PermissionsService.getUserPermissions(authInfo.userId)`. Le scritture avvengono in transazione,
seguite da invalidazione post-commit (S10) e audit log.

| Metodo | Regole, nell'ordine | Invalidazione | Audit |
|---|---|---|---|
| `list()` · `findOne(guid)` · `listPermissions()` | nessuna regola di scrittura (in F2 il controller richiede `roles:read`) | — | — |
| `create(input, authInfo)` | chiamante ha `roles:manage` · `code` valido · codici ∈ registro · nessun codice riservato (S6) · codici ⊆ permessi chiamante | nessuna (ruolo nuovo, non assegnato) | `role.create` |
| `update(guid, input, authInfo)` | ruolo esiste · non di sistema (`SYSTEM_ROLE_READONLY`) · `roles:manage` · codici attuali ⊆ chiamante · codici nuovi ∈ registro, non riservati, ⊆ chiamante | `invalidateRole` se cambiano i permessi | `role.update` (before/after dei codici) |
| `delete(guid, authInfo)` | ruolo esiste · non di sistema · `roles:manage` · codici attuali ⊆ chiamante · nessun `user_roles` (`409 ROLE_IN_USE`) · delete `role_permissions` + `roles` in tx | — (nessun utente la aveva) | `role.delete` |
| `setUserRoles(userGuid, roleGuids, authInfo)` | chiamante ha `users:assign_roles` · target esiste · target gestibile (regola SuperAdmin) · ruoli esistono · nessun ruolo di sistema (S9) · per ogni ruolo **aggiunto**: codici ⊆ chiamante (S7) · sostituzione dell'insieme | `invalidateUsers([target])` | `user.roles.update` (added/removed) |

La regola "target SuperAdmin → 403" di `AdminService.assertTargetRoleManageable` viene estratta in
una funzione pura esportata, con lo stesso messaggio, e riusata da entrambi i service.
`AdminService` resta invariato nel comportamento.

### Hook in `AdminService` (additivi)

- `updateUser`: se `dto.role !== undefined` e cambia rispetto al target → `invalidateUsers([id])`
  dopo l'update.
- `toggleActiveUser` → `invalidateUsers([id])` dopo l'update.
- `createUser`, `resetDemo`, `seedDemo`: nessun hook. Un utente nuovo non ha chiavi. Gli id
  `serial` eliminati non vengono riusati e le loro chiavi scadono per TTL.

## Contratti WebSocket (se applicabile)

Non applicabile: nessun push realtime dei permessi (ADR-99 § Conseguenze (e)).

## Task breakdown

Dettaglio operativo, dipendenze e agenti in `PLAN-RBAC-F1-schema-seed-cache-guard.md`.

- [ ] T1: Schema DB: 4 tabelle in `schema.ts` e migrazione `0015_*`
- [ ] T2: Registro permessi, calcolo hash, test di conformità matrice ↔ seed
- [ ] T3: `PermissionsSeedService` e `PermissionsModule`
- [ ] T4: `PermissionsService` (risoluzione, cache, invalidazione)
- [ ] T5: `@Permissions` e `PermissionsGuard`
- [ ] T6: `RolesService` (regole di dominio, `409`, anti-escalation) e voce in `db-error.mapper.ts`
- [ ] T7: Hook di invalidazione in `AdminService` ed estrazione della regola SuperAdmin
- [ ] T8: Verifica globale: suite esistente invariata, build, lint

## Criteri di verifica

Solo unit test (Jest), sotto `app/backend/test/unit/`. Nessun e2e in F1 perché non esiste una rotta
che li eserciti.

**Registro e seed**

1. Tabellare matrice ↔ seed: per ogni riga di `business-rules.md` § "Permessi editoriali" mappata
   a un codice, i 4 ruoli seedati producono esattamente il pattern ✅/❌ della matrice. Le righe
   senza codice (Menu, chatbot, HTML/embed, definire Moduli, Redirect) sono elencate per nome nella
   fixture con motivo. Una riga né mappata né elencata fa fallire il test.
2. `roles:manage` appartiene solo a `superadmin`. `admin` ha `roles:read` e `users:assign_roles`
   (P2).
3. Coerenza del registro: codici univoci, formato `^[a-z_]+:[a-z_]+$`, categoria ∈
   `PERMISSION_CATEGORIES`. Ogni codice usato da un `@Permissions` in `src/**/*.controller.ts` è nel
   registro. Ogni codice del registro è usato da un `@Permissions` **oppure** compare in
   `NOT_YET_MIGRATED` (in F1 tutti). Un codice presente in entrambi fa fallire il test, così la
   lista può solo accorciarsi.
4. L'hash è stabile a registro invariato e cambia se si aggiunge un codice o se cambia la mappa
   di un ruolo di sistema.
5. `sync()` su DB vuoto crea permessi e 4 ruoli. Un secondo `sync()` non produce differenze. Un
   codice rimosso dal registro sparisce, insieme alle sue associazioni. Un codice riservato
   inserito a mano in un ruolo custom viene rimosso. Un errore DB nel bootstrap viene loggato e non
   propagato (S4), e l'utente risolto dopo un seed fallito ha l'insieme vuoto.

**`PermissionsService`**

6. Miss → query DB → `set` con TTL 3600. Hit → nessuna query DB.
7. Redis non pronto → DB, nessuna chiamata a `get`/`set`. `get` che lancia → DB. `set` che
   lancia → il risultato viene comunque restituito.
8. Unione: un utente `User` con un ruolo custom `{media:delete_any}` ha i codici di `user` più
   `media:delete_any`. Un utente inattivo o inesistente ha un insieme vuoto.
9. `invalidateRole` cancella le chiavi di tutti e soli gli utenti con quel ruolo.
   `invalidateUsers([])` non chiama Redis.

**`PermissionsGuard`**

10. Permesso presente → `true`. Assente → `403` con il messaggio del contratto. AND con due
    codici, uno mancante → `403` che nomina il mancante.
11. `authInfo` assente → `403`. Metadati assenti → `403`. Impersonificazione → valuta
    `authInfo.userId`.

**`RolesService`**

12. `create`: happy path con audit e nessuna invalidazione. Senza `roles:manage` (chiamante Admin)
    → `403`. Codice sconosciuto → `400`. `roles:manage` nel ruolo → `400 RESERVED_PERMISSION`.
    `code` duplicato → `409 ROLE_CODE_DUPLICATE`.
13. `update`/`delete` su ruolo di sistema → `403 SYSTEM_ROLE_READONLY`, anche per SuperAdmin.
14. `delete` di ruolo assegnato → `409 ROLE_IN_USE`, senza modifiche in DB. Violazione FK
    simulata → stesso `409`. Ruolo non assegnato → eliminato insieme a `role_permissions`.
15. Anti-escalation su `setUserRoles`: Admin che aggiunge un ruolo contenente un permesso che non
    ha → `403 PERMISSION_ESCALATION` con l'elenco dei codici. Admin che aggiunge un ruolo con
    soli permessi suoi → ok e invalidazione del target. Admin su target SuperAdmin → `403`. Ruolo
    di sistema → `400`. Rimozione di un ruolo → ok senza controllo dei codici (S7).
16. `update` che cambia i permessi → `invalidateRole` chiamato dopo il commit. Un rollback non
    produce invalidazione.

**Non regressione**

17. `AdminService.updateUser` con cambio `role` → `invalidateUsers([id])`. Senza cambio → nessuna
    chiamata. `toggleActiveUser` → invalidazione.
18. Suite unit ed e2e esistenti verdi **senza modifiche ai test esistenti**. Nessun `@Permissions`
    su rotte reali. `PublicMediaController` e le funzioni di sistema invariati.
