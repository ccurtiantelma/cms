# Spec — RBAC F2a API REST di ruoli e permessi, assegnazione utenti, `auth/me`, e2e

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvata** · [ ] Rifiutata
> Redatta il 2026-09-24 sul branch `feature/rbac-f1-permessi` (F1 chiusa al commit `33cbbd1`).
>
> **Approvazione**: approvata così com'è, con le assunzioni S11–S23 e le divergenze dal prompt di
> origine elencate in PLAN § "Audit strategico". Firma apposta su richiesta esplicita del prompt di
> implementazione della Fase 2a, che vale anche come richiesta esplicita e circostanziata della
> Documentation Policy per il testo di § "Emendamenti documentali".
>
> Firma: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Feature di riferimento

Nessun file in `docs/ai/features/`: stessa scelta della F1. Il documento di origine è
`docs/ai/adr/ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md` (approvata con modifiche il
2026-09-24), con la F1 già consegnata in
`docs/ai/specs/SPEC-RBAC-F1-schema-seed-cache-guard.md` (approvata, con addendum di chiusura).

L'etichetta "F2a" nasce qui: la F2 di ADR-99 § 11 è divisa in due (S11). Nessun numero `F[N]` di
roadmap è assegnato all'RBAC.

Plan collegato: `docs/ai/plans/PLAN-RBAC-F2a-backend-api.md`.

## ADR applicabili

- `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`: **vincolante**. § Decisione punti 5, 7, 8
  e 10 (solo la parte backend di `GET /auth/me`), § Conformità e § "Decisione umana" (P2, P3, P6).
- `SPEC-RBAC-F1-schema-seed-cache-guard.md`: vincolante per ciò che F2a consuma senza cambiarlo:
  contratto di errore di `RolesService`, assunzioni S1–S10, registro dei permessi, `sync()`
  pubblico.
- `ADR-18-ownership-per-riga.md`: invariata. Nessuna rotta di Pagine/File migra in F2a.
- `ADR-13-gestione-sessioni-dispositivi.md`: invariata. JWT e chiavi `login:*`/`session:*` non
  cambiano.
- `ADR-2-security-baseline.md`: formato `403`, fail-closed, `ValidationPipe` con
  `whitelist`/`forbidNonWhitelisted`.
- `docs/business-rules.md` § "Attori e ruoli" (Admin non gestisce SuperAdmin) e A4 come già
  emendata da ADR-99 (commit `33cbbd1`).
- `docs/constitution.md` § Documentation Policy: `glossary.md` richiede una richiesta esplicita e
  circostanziata; `system-architecture.md` una richiesta esplicita. Il testo esatto degli
  emendamenti è in § "Emendamenti documentali": approvare questa SPEC vale come quella richiesta.

## Outcomes tecnici

A fine F2a:

1. `RolesController` su `api/v1/app/admin`, con 5 rotte: `GET roles`, `POST roles`,
   `PATCH roles/:guid`, `DELETE roles/:guid` e `GET permissions`. Sono le prime rotte reali
   protette da `@Permissions`, e **non** hanno `GuardAdmin` (S16).
2. DTO di input `CreateRoleDto` e `UpdateRoleDto`. DTO di risposta Swagger `RoleResponseDto`,
   `PermissionGroupResponseDto`, `PermissionItemResponseDto`, `UserRoleSummaryDto` e
   `MeResponseDto`.
3. `CreateUserDto`/`UpdateUserDto` estesi in modo additivo con `roleGuids?: string[]`. Sotto
   `app/admin/users` non nasce nessun endpoint nuovo (S13).
4. `AdminService.createUser`/`updateUser` che assegnano i ruoli aggiuntivi in modo atomico con la
   scrittura dell'utente (S17). `GET app/admin/users/:guid` restituisce anche `roles` (S19).
5. `GET auth/me` con `permissions: PermissionCode[]` (S20).
6. Suite `app/backend/test/e2e/roles.e2e-spec.ts` su DB e Redis reali, con `sync()` del seed dopo
   ogni truncate (S22).
7. `docs/openapi.yaml` e `app/frontend/src/types/api.types.ts` rigenerati dagli script, e
   collezione Bruno `bruno/admin/` estesa.
8. `docs/glossary.md` e `docs/system-architecture.md` emendati come da § "Emendamenti
   documentali".

## In scope

- Controller, DTO, annotazioni OpenAPI delle rotte ruoli/permessi.
- Refactor interno di `RolesService.setUserRoles` in validazione e applicazione, per l'atomicità
  con `AdminService` (S17). Il comportamento pubblico di `setUserRoles` non cambia.
- `roleGuids` su creazione e modifica utente; `roles` nel dettaglio utente.
- `permissions` in `GET auth/me`.
- e2e completi delle rotte RBAC, compresi `403`, `409` e la propagazione immediata senza rilogin
  richiesta da ADR-99 § Conformità.
- Rimozione di `roles:read` e `roles:manage` da `NOT_YET_MIGRATED` nel test di registro della F1.
- Emendamenti a glossario e architettura di sistema (testo in questa SPEC).
- Aggiornamento della riga "Auth, Ruoli & Permessi" di `docs/ai/INDEX.md` con questa SPEC e il
  PLAN.

## Out of scope

- **Enforcement `media:*` su `app/files`** (ADR-99 § 11 lo mette in F2): passa a **F2b** (S11).
- Migrazione a `@Permissions` di qualsiasi altra rotta esistente, comprese `app/admin/users*` e
  `audit-log`, che restano su `GuardAdmin`. `users:read`, `users:write`, `users:assign_roles` e
  `audit:read` restano in `NOT_YET_MIGRATED`.
- Divergenze D1/D2 della SPEC F1 (impostazioni): nessuna rotta di `settings` migra.
- `GET app/admin/roles/:guid`: ADR-99 § 7 non lo elenca, e la F3 può usare la lista.
- Frontend (F3): `useAuthStore.permissions`, `useHasPermission`, `<Can>`, rotta `/roles`,
  `PageUsers`. L'unico file frontend che cambia è `api.types.ts`, generato da `openapi:types`.
- `docs/ai/progress-tracker.md`: solo su richiesta esplicita a fine feature.
- Permessi nel JWT, push realtime dei permessi, ADR-90 § 3, file riservati (invariati da ADR-99).

## Vincoli e assunzioni

**Vincoli**:

- Nessuna dipendenza npm nuova, nessuna migrazione DB. Lo schema della F1 basta.
- Prefisso `api/v1/app/admin`, identificazione per `guid` (SPEC F1 S8).
- Formato di errore invariato (`AllExceptionsFilter`: `{ statusCode, message, code, timestamp,
  path }`). Per le eccezioni senza `code` esplicito, `code` è il nome della classe (per esempio
  `ForbiddenException`).
- Nessun test presente su `main` viene modificato. Dei test della F1 si toccano solo le due
  modifiche meccaniche di S21.

**Assunzioni** (continuano la numerazione S1–S10 della F1; ciascuna va approvata):

| # | Assunzione | Motivo |
|---|---|---|
| S11 | La F2 di ADR-99 § 11 si divide in **F2a** (questa SPEC) e **F2b** (enforcement `media:*` su `app/files`). F2a assorbe anche la parte backend di ADR-99 § 10 (`auth/me`, che la SPEC F1 metteva in F3) e glossario/architettura (che la SPEC F1 metteva in F4) | Perimetro richiesto dal prompt di task. È una suddivisione di fase, non una decisione nuova: non serve un'ADR. `app/files` tocca ownership ADR-18 e `files.service.ts`, e merita una SPEC propria |
| S12 | Il catalogo permessi è `GET app/admin/permissions`, **non** `GET app/admin/roles/permissions` come nel prompt | ADR-99 § 7 e SPEC F1 § Registro (riga `roles:read`) fissano `GET permissions`. Si evita anche l'ambiguità con `roles/:guid` |
| S13 | **Nessun `AssignUserRolesDto` e nessun endpoint di assegnazione.** L'assegnazione passa da `roleGuids?: string[]` su `CreateUserDto`/`UpdateUserDto` | ADR-99 § 7: "estendendo in modo additivo `CreateUserDto`/`UpdateUserDto` (`roleIds?`), non con endpoint nuovi". Il campo si chiama `roleGuids` e non `roleIds` perché i ruoli si espongono per `guid` (SPEC F1 S8) |
| S14 | I DTO validano **solo la forma**: tipi, lunghezze, array, unicità e dimensione massima. Registro, codici riservati (S6), anti-escalation e formato di `code` restano in `RolesService` | L'anti-escalation dipende dai permessi del chiamante letti dal DB e un DTO non può applicarla. Registro, riservati e formato duplicati nel DTO renderebbero irraggiungibili via HTTP i codici `INVALID_PERMISSION_CODE`, `RESERVED_PERMISSION` e `INVALID_ROLE_CODE` del contratto F1, sostituiti da un `400` generico |
| S15 | Doppio cancello: `@Permissions` sulla rotta **e** controlli di `RolesService` invariati. Il guard gira prima del service | Difesa in profondità: `RolesService` resta sicuro anche se chiamato da altri punti (per esempio `AdminService`). Effetto sul contratto: un Admin che modifica o elimina un ruolo di sistema riceve il `403` del guard (`roles:manage`), non `SYSTEM_ROLE_READONLY`. Solo il SuperAdmin arriva a quest'ultimo |
| S16 | `RolesController` **non** usa `GuardAdmin`: l'unico cancello è `@Permissions`. Un `User` con un ruolo personalizzato che contiene `roles:read` legge ruoli e catalogo | È il modello di ADR-99 § 5 per le rotte nuove, ed è l'unico modo di verificare in e2e il requisito "200 dopo l'assegnazione senza rilogin" di ADR-99 § Conformità. `roles:manage` resta del solo SuperAdmin (P2, S6) |
| S17 | **Atomicità utente + ruoli.** In `createUser`/`updateUser` tutte le validazioni dei ruoli (permesso `users:assign_roles`, esistenza, S9, anti-escalation S7, target gestibile) avvengono **prima di ogni scrittura**. La scrittura di `users` e quella di `user_roles` avvengono nella stessa transazione. Email di attivazione, invalidazione della cache e audit arrivano dopo il commit. Per farlo, `RolesService` espone `planUserRoles(...)` (solo letture e validazioni, restituisce ruoli aggiunti e rimossi) e `applyUserRoles(tx, userId, plan)`. `setUserRoles` diventa la composizione dei due, con comportamento invariato | Oggi `createUser` inserisce l'utente e accoda l'email senza transazione. Un rifiuto dei ruoli dopo l'insert lascerebbe un utente creato, con email inviata, senza i ruoli richiesti |
| S18 | Semantica di `roleGuids`: assente vuol dire nessuna modifica dei ruoli aggiuntivi. In creazione `[]` equivale ad assente. In modifica `[]` rimuove tutti i ruoli aggiuntivi: serve `users:assign_roles`, ma non c'è controllo di escalation (S7). Un array uguale all'insieme attuale è un no-op, senza invalidazione e senza audit `user.roles.update` | Sostituzione dell'insieme, come `setUserRoles` della F1 |
| S19 | `GET app/admin/users/:guid` restituisce anche `roles: UserRoleSummaryDto[]` (`guid`, `code`, `name`), con i soli ruoli personalizzati di `user_roles`. `GET app/admin/users` (lista) non cambia | Serve al multi-select "Ruoli aggiuntivi" di `PageUsers` (ADR-99 § 10, F3), che usa `fetchUser(guid)`. Il livello base resta `role` |
| S20 | `GET auth/me` aggiunge `permissions: PermissionCode[]`, in ordine alfabetico, da `PermissionsService.getUserPermissions(authInfo.userId)`. In impersonificazione sono i permessi dell'utente impersonato. La composizione avviene in `AuthController.getMe`, non in `AuthService` | Coerente con `authInfo` (ADR-99 § 5). Il costruttore di `AuthService` non cambia, quindi `auth.service.spec.ts` (su `main`) resta intatto |
| S21 | Modifiche ammesse ai test della F1: (a) togliere `roles:read` e `roles:manage` da `NOT_YET_MIGRATED` in `permissions.registry.spec.ts`; (b) aggiungere l'argomento `RolesService` al costruttore di `AdminService` in `admin.service.invalidation.spec.ts`. Nessun'altra | (a) è il meccanismo previsto dalla F1 ("la lista può solo accorciarsi"). (b) è un cablaggio: i test su `main` che costruiscono `AdminService` a mano non esistono |
| S22 | Setup e2e di `roles.e2e-spec.ts`: in `beforeEach`, `truncateAllTables()`, poi `flushTestRedis()`, poi `app.get(PermissionsSeedService).sync()` | Il truncate svuota `roles`/`permissions` (PLAN F1, falla 6). `restart identity` riusa gli `id` utente: senza il flush una chiave `perm:v<hash>:user:1` di un test precedente servirebbe permessi sbagliati fino al TTL |
| S23 | `code` del ruolo è immutabile (`UpdateRoleDto` non lo accetta: `forbidNonWhitelisted` risponde `400`) | SPEC F1, `UpdateRoleInput = Partial<Omit<CreateRoleInput, 'code'>>` |

## Schema DB (Drizzle)

### Tabelle nuove

Nessuna.

### Tabelle modificate

Nessuna. Si usano le 4 tabelle della F1 (`roles`, `permissions`, `role_permissions`, `user_roles`).

## Endpoint API

Tutte le rotte hanno `@ApiTags('Roles')` (tranne quelle utenti e `auth/me`, che restano nei
propri tag) e `@ApiBearerAuth('access-token')`. **Response 401**: `AuthMiddleware`, come ogni
rotta `app/*`.

Ordine dei controlli per le rotte ruoli (in NestJS i guard girano prima delle pipe):
`AuthMiddleware` (401) → `PermissionsGuard` (403) → `ValidationPipe` (400 di forma) →
`RolesService` (404, 400 di dominio, 403 di dominio, 409). Un utente senza permesso che invia un
body non valido riceve quindi `403`, non `400`.

### GET api/v1/app/admin/roles
- **Guard**: `@Permissions('roles:read')`
- **Response 200**: `RoleResponseDto[]`, prima i ruoli di sistema, poi quelli personalizzati in
  ordine di nome (`RolesService.list`)
- **Response 403**: `Permessi insufficienti (richiesto permesso: roles:read).`

### POST api/v1/app/admin/roles
- **Guard**: `@Permissions('roles:manage')` (di fatto solo SuperAdmin: P2 + S6)
- **Request body**: `CreateRoleDto`
- **Response 201**: `{ guid: string }`
- **Response 400**: forma non valida (pipe) · `INVALID_ROLE_CODE` · `INVALID_PERMISSION_CODE` ·
  `RESERVED_PERMISSION` (`roles:manage` nel ruolo: il "blocco S6")
- **Response 403**: permesso mancante (guard) · `PERMISSION_ESCALATION`
- **Response 409**: `ROLE_CODE_DUPLICATE`, anche per i codici dei 4 ruoli di sistema
- **Audit**: `role.create`

### PATCH api/v1/app/admin/roles/:guid
- **Guard**: `@Permissions('roles:manage')`
- **Request body**: `UpdateRoleDto` (almeno un campo; `code` non ammesso, S23)
- **Response 200**: `{ guid: string }`
- **Response 400**: forma non valida · `INVALID_PERMISSION_CODE` · `RESERVED_PERMISSION`
- **Response 403**: permesso mancante (guard) · `SYSTEM_ROLE_READONLY` · `PERMISSION_ESCALATION`
- **Response 404**: `Ruolo non trovato.`
- **Effetto**: se cambiano i permessi, `invalidateRole` dopo il commit, con effetto immediato
  sugli utenti del ruolo
- **Audit**: `role.update`

### DELETE api/v1/app/admin/roles/:guid
- **Guard**: `@Permissions('roles:manage')`
- **Response 204**: nessun corpo (`@HttpCode(HttpStatus.NO_CONTENT)`, come `DELETE app/pages/:guid`)
- **Response 403**: permesso mancante (guard) · `SYSTEM_ROLE_READONLY` · `PERMISSION_ESCALATION`
- **Response 404**: `Ruolo non trovato.`
- **Response 409**: `ROLE_IN_USE` se il ruolo è assegnato ad **almeno un utente, attivo o no**
  (P6). Messaggio: `Il ruolo è assegnato a <n> utenti: rimuovilo prima di eliminarlo.`
- **Audit**: `role.delete`

### GET api/v1/app/admin/permissions
- **Guard**: `@Permissions('roles:read')`
- **Response 200**: `PermissionGroupResponseDto[]`, raggruppati per categoria nell'ordine di
  `PERMISSION_CATEGORIES`, senza categorie vuote (`RolesService.listPermissions`)
- **Response 403**: permesso mancante

### POST api/v1/app/admin/users (modificato, additivo)
- **Guard**: `GuardAdmin`, invariato
- **Request body**: `CreateUserDto` + `roleGuids?: string[]`
- **Response 201**: invariata (`{ guid }`)
- **Nuovi esiti** (solo con `roleGuids` non vuoto): `403` `users:assign_roles` mancante · `403`
  `PERMISSION_ESCALATION` · `404` `Ruolo non trovato.` · `400` `SYSTEM_ROLE_NOT_ASSIGNABLE`. In
  tutti questi casi **nessun utente viene creato e nessuna email viene accodata** (S17)
- **Audit**: `user.create` invariato, più `user.roles.update` se vengono assegnati ruoli

### PATCH api/v1/app/admin/users/:guid (modificato, additivo)
- **Guard**: `GuardAdmin`, invariato
- **Request body**: `UpdateUserDto` + `roleGuids?: string[]` (S18)
- **Response 200**: invariata (`{ guid }`)
- **Nuovi esiti**: come sopra. Un rifiuto dei ruoli lascia invariati **anche** gli altri campi
  (S17)
- **Effetto**: `invalidateUsers([target])` dopo il commit se cambiano `role` (hook F1) o i ruoli
  aggiuntivi. Una sola invalidazione anche se cambiano entrambi
- **Audit**: `user.update` invariato, più `user.roles.update` (added/removed) se l'insieme cambia

### GET api/v1/app/admin/users/:guid (modificato, additivo)
- **Guard**: `GuardAdmin`, invariato
- **Response 200**: campi attuali + `roles: UserRoleSummaryDto[]` (S19)

### GET api/v1/auth/me (modificato, additivo)
- **Guard**: autenticato (invariato)
- **Response 200**: `MeResponseDto` = campi attuali + `permissions: PermissionCode[]` (S20)

## DTO

```typescript
// app/backend/src/admin/roles/dto/create-role.dto.ts
export class CreateRoleDto {
  @ApiProperty({
    description: 'Slug univoco e immutabile del ruolo (minuscole, cifre, underscore; 3–50)',
    example: 'seo_specialist',
  })
  @IsString({ message: 'Il codice deve essere una stringa.' })
  @IsNotEmpty({ message: 'Il codice è obbligatorio.' })
  @MaxLength(50, { message: 'Il codice non può superare i 50 caratteri.' })
  code!: string; // formato fine (ROLE_CODE_PATTERN) verificato da RolesService → INVALID_ROLE_CODE (S14)

  @ApiProperty({ description: 'Nome leggibile', example: 'SEO Specialist' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Descrizione', nullable: true })
  @IsOptional() @IsString() @MaxLength(500)
  description?: string | null;

  @ApiProperty({
    description: 'Codici permesso del registro. Non ammesso: roles:manage (riservato).',
    type: [String],
    example: ['pages:create', 'pages:edit_any'],
  })
  @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true })
  permissionCodes!: string[]; // appartenenza al registro, riservati e anti-escalation: RolesService (S14)
}

// app/backend/src/admin/roles/dto/update-role.dto.ts
// Stessi vincoli, tutti opzionali; `code` assente (S23). Un body vuoto → 400.
export class UpdateRoleDto {
  name?: string;
  description?: string | null;
  permissionCodes?: string[];
}

// app/backend/src/admin/dto/create-user.dto.ts e update-user.dto.ts — campo aggiunto
@ApiPropertyOptional({
  description:
    "Guid dei ruoli personalizzati aggiuntivi (sostituisce l'insieme). Richiede users:assign_roles.",
  type: [String],
})
@IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(50)
@IsString({ each: true }) @Length(16, 16, { each: true })
roleGuids?: string[];
```

Il `400` per il body vuoto di `UpdateRoleDto` è un controllo esplicito nel controller o nel
service (`Nessun campo da aggiornare.`), perché `class-validator` non esprime "almeno uno". Il
dettaglio va all'implementazione, a patto che la risposta sia `400`.

DTO di risposta (solo Swagger, stesso pattern di `SiteTemplateResponseDto`), in
`app/backend/src/admin/roles/dto/role-response.dto.ts`:

| Classe | Campi |
|---|---|
| `RoleResponseDto` | `guid`, `code`, `name`, `description` (nullable), `isSystem`, `level` (nullable), `permissions: string[]`, `createdAt`, `updatedAt` (nullable). Specchio di `RoleView` |
| `PermissionItemResponseDto` | `code`, `description` (nullable) |
| `PermissionGroupResponseDto` | `category` (enum `PERMISSION_CATEGORIES`), `permissions: PermissionItemResponseDto[]` |
| `UserRoleSummaryDto` | `guid`, `code`, `name` |
| `MeResponseDto` (in `app/backend/src/auth/dto/`) | campi di `MeResponse` + `permissions: string[]` |

`MeResponse` in `common/types.ts` acquisisce `permissions: PermissionCode[]`. `MeResponseDto` ne
è la controparte Swagger. Si annotano con `@ApiResponse({ status, description, type })` solo le
rotte di questa SPEC.

## Contratti WebSocket (se applicabile)

Non applicabile. Il frontend rilegge i permessi al successivo `GET auth/me` (ADR-99 §
Conseguenze (e)).

## Emendamenti documentali

Testo proposto. Con l'approvazione di questa SPEC diventa la richiesta esplicita e circostanziata
richiesta dalla Documentation Policy. Nessun'altra riga dei due file viene toccata.

**`docs/glossary.md` § "Termini core — RBAC / Autenticazione"**

- Voce **Ruolo**, testo sostituito: "Livello di privilegio base di un utente, espresso come intero
  (`AppUserRoles`, colonna `users.role`). Numero minore = privilegio maggiore. Resta la soglia
  letta dai guard legacy, dall'ownership (ADR-18) e dalle funzioni di sistema. Ogni livello
  corrisponde a un Ruolo di sistema (ADR-99)."
- Voci nuove, inserite dopo **User**:
  - **Ruolo di sistema**: "Uno dei 4 ruoli seedati (`superadmin`, `admin`, `manager`, `user`,
    `is_system = true`), corrispondente a un livello `AppUserRoles`. I suoi permessi derivano dalla
    matrice di `business-rules.md` § Permessi editoriali e sono in sola lettura (ADR-99 P3)."
  - **Ruolo personalizzato**: "Ruolo creato da API/UI da chi ha `roles:manage` (solo SuperAdmin),
    assegnato in aggiunta al livello base tramite `user_roles`. Può solo aggiungere permessi, mai
    toglierli (ADR-99 § 1)."
  - **Permesso**: "Codice `risorsa:azione` (es. `pages:publish`) definito solo nel registro
    versionato `permissions.registry.ts` e applicato da `@Permissions` sulle rotte. Non si crea da
    UI. Permessi effettivi = permessi del ruolo di sistema ∪ permessi dei ruoli personalizzati
    (ADR-99)."

**`docs/system-architecture.md`**

- Tabella delle superfici, riga "Autorizzazione", colonna amministrativa: "RBAC a soglie di ruolo"
  → "RBAC a soglie di ruolo + permessi granulari (`@Permissions`, ADR-99)".
- § Autenticazione, voce nuova dopo **AuthMiddleware**: "**Permessi granulari (ADR-99)**:
  `PermissionsGuard` risolve i permessi effettivi dell'utente (`authInfo.userId`, anche in
  impersonificazione) da `PermissionsService`, con cache Redis per utente
  `perm:v<hashRegistro>:user:<userId>` (TTL 3600 s), invalidata in modo esplicito al cambio di
  ruoli, permessi di un ruolo, `users.role` o `users.is_active`. Su miss o Redis non pronto legge
  il DB, mai fail-open. I permessi non sono nel JWT. `GET auth/me` li espone come `permissions`
  per la UI, che li usa solo per l'esperienza utente: l'autorità è il backend."
- § "Cache e sessioni — Redis", elenco "Usato per": aggiungere "cache dei permessi effettivi per
  utente (`perm:v<hash>:user:<userId>`, ADR-99)".
- Diagramma della topologia: l'etichetta `Redis\n(solo BullMQ)` è già inesatta prima di ADR-99
  (sessioni, MFA). **Non corretta qui**: fuori dal perimetro richiesto, segnalata nel PLAN.

## Task breakdown

Dettaglio operativo, dipendenze e agenti in `PLAN-RBAC-F2a-backend-api.md`.

- [x] T1: DTO di input e di risposta ruoli/permessi, `roleGuids` sui DTO utente, `MeResponseDto`
- [x] T2: `RolesService`: separazione `planUserRoles`/`applyUserRoles`
- [x] T3: `RolesController` e registrazione in `RolesModule`; `NOT_YET_MIGRATED` aggiornato
- [x] T4: `AdminService`/`AdminController`: `roleGuids` atomico, `roles` nel dettaglio
- [x] T5: `GET auth/me` con `permissions`
- [x] T6: e2e `roles.e2e-spec.ts`
- [x] T7: `openapi:export`/`openapi:types`, collezione Bruno, `INDEX.md`, glossario, architettura
- [x] T8: Verifica globale e non regressione

## Criteri di verifica

**Unit (Jest)**

1. `planUserRoles` non scrive: con un mock DB, nessuna `insert`/`delete` su qualunque esito,
   errori compresi. `setUserRoles` supera invariati tutti i casi di `roles.service.spec.ts` della
   F1.
2. `AdminService.createUser` con `roleGuids` rifiutati (anti-escalation, ruolo di sistema, ruolo
   inesistente, `users:assign_roles` mancante): nessun `insert` su `users`, nessuna email
   accodata, nessun audit. `updateUser` con `roleGuids` rifiutati: nessun `update` su `users`.
3. `AdminService.updateUser` con cambio di `role` **e** di ruoli aggiuntivi: una sola
   `invalidateUsers([id])`, dopo il commit. Con `roleGuids` uguale all'insieme attuale: nessuna
   invalidazione e nessun `user.roles.update`.
4. `AuthController.getMe`: `permissions` ordinati, per `authInfo.userId`.
5. Test di registro F1: con `roles:read`/`roles:manage` tolti da `NOT_YET_MIGRATED` passa, perché
   la scansione statica li trova in `roles.controller.ts`. Rimetterne uno nella lista lo fa
   fallire.

**E2E (`app/backend/test/e2e/roles.e2e-spec.ts`, DB `cms_db_test`, Redis DB #1)**

Setup S22. Utenti creati come in `admin-rebuild-static-site.e2e-spec.ts` (insert diretto, JWT
firmato, chiave `login:` in Redis).

*Lettura*

6. SuperAdmin e Admin: `GET roles` → 200 con i 4 ruoli di sistema (`isSystem: true`, `level`
   5/10/20/30). Il ruolo `admin` contiene `roles:read` e non `roles:manage`.
7. `GET permissions` → 200, gruppi nell'ordine di `PERMISSION_CATEGORIES`, 20 codici totali.
8. Manager e User: `GET roles` e `GET permissions` → 403 con messaggio `…roles:read).`. Senza
   token → 401.

*Scrittura ruoli*

9. SuperAdmin `POST roles` valido → 201. Il ruolo compare in `GET roles`. `audit_log` contiene
   `role.create`.
10. Admin `POST`/`PATCH`/`DELETE roles` → 403 `…roles:manage).` (guard), senza effetti in DB.
11. SuperAdmin `POST roles` con `roles:manage` fra i codici → 400 `RESERVED_PERMISSION` (blocco
    S6). Con un codice inesistente → 400 `INVALID_PERMISSION_CODE`. Con `code` `Bad-Code` → 400
    `INVALID_ROLE_CODE`. Con `code` `admin` o duplicato → 409 `ROLE_CODE_DUPLICATE`. Con un campo
    extra → 400 (pipe).
12. SuperAdmin `PATCH`/`DELETE` di un ruolo di sistema → 403 `SYSTEM_ROLE_READONLY`. `PATCH` con
    `code` → 400. `PATCH`/`DELETE` di un guid inesistente → 404.
13. SuperAdmin `DELETE` di un ruolo personalizzato assegnato a un utente **inattivo** → 409
    `ROLE_IN_USE`, ruolo e `role_permissions` ancora presenti. Dopo la rimozione dell'assegnazione
    → 204, e il ruolo sparisce da `GET roles`. `audit_log` contiene `role.delete`.

*Assegnazione e propagazione immediata (ADR-99 § Conformità)*

14. User → `GET roles` 403. SuperAdmin crea `reviewer` con `roles:read` e lo assegna allo User
    con `PATCH users/:guid { roleGuids: [reviewer] }` → 200. Lo User, **con lo stesso token e
    senza rilogin**, ottiene `GET roles` 200. `GET auth/me` dello User contiene `roles:read`.
15. SuperAdmin `PATCH roles/:guid` che toglie `roles:read` da `reviewer` → lo User riceve di nuovo
    403 senza rilogin (invalidazione per ruolo). Rimessa la voce, poi `PATCH users/:guid {
    roleGuids: [] }` → 403 di nuovo (invalidazione per utente).
16. `GET users/:guid` restituisce `roles` con `reviewer` dopo l'assegnazione, `[]` dopo la
    rimozione.

*Anti-escalation e sicurezza*

17. SuperAdmin crea `media_cleaner` con `media:delete_any`. Admin `POST users` con `roleGuids:
    [media_cleaner]` → 201: l'Admin possiede il codice. L'utente creato ha l'assegnazione, e
    `audit_log` contiene `user.create` e `user.roles.update`.
18. **Anti-escalation sull'assegnazione.** Con il seed attuale l'Admin possiede ogni codice tranne
    `roles:manage`, che S6 esclude dai ruoli personalizzati. Via API un Admin non può quindi
    incontrare un ruolo con permessi che non ha. Il caso si costruisce inserendo via SQL diretto
    `roles:manage` in un ruolo personalizzato `contaminated`, dopo il `sync()`. Admin `PATCH
    users/:guid { roleGuids: [contaminated] }` → 403 `PERMISSION_ESCALATION` che nomina
    `roles:manage`. `user_roles` e gli altri campi del body restano invariati (S17).
19. **Filtro dei riservati nella query** (addendum F1, garanzia 2, finora senza test su DB reale):
    `contaminated` assegnato via SQL a un Admin. L'Admin riceve ancora 403 su `POST roles`, e
    `GET auth/me` non contiene `roles:manage`.
20. Admin `POST users` con `roleGuids` contenente un ruolo di sistema → 400
    `SYSTEM_ROLE_NOT_ASSIGNABLE`, e non esiste nessun utente con quella email (S17). Admin su
    target SuperAdmin con `roleGuids` → 403. Admin `PATCH users/:guid` **senza** `roleGuids` →
    comportamento invariato, nessun `user.roles.update` e `user_roles` intatta.

*`auth/me`*

21. `GET auth/me` di un Manager → `permissions` uguale all'insieme seedato di `manager`, in ordine
    alfabetico. Tutti i campi preesistenti restano presenti.

**Non regressione**

22. `npm test` e `npm run test:e2e` verdi. `git diff main -- app/backend/test` non mostra modifiche
    a file presenti su `main`. I file di test della F1 cambiano solo come da S21.
23. `PublicMediaController`, le rotte `system/*` e `app/files` invariate. `grep "@Permissions("`
    trova solo `roles.controller.ts` fuori da `src/permissions/`.
24. `docs/openapi.yaml` contiene le 5 rotte nuove, `roleGuids`, `roles` e `permissions` di
    `auth/me`. `api.types.ts` rigenerato compila (`npm run build --workspace=app/frontend`).

## Addendum di implementazione (2026-09-24)

Implementata su `feature/rbac-f1-permessi`, un commit per task (T1–T7). Deviazioni emerse
rispetto al testo della SPEC, nessuna delle quali cambia il contratto HTTP:

1. **`MeResponse` non acquisisce `permissions`.** Il tipo è quello restituito da
   `AuthService.getMe`: aggiungergli un campo obbligatorio avrebbe imposto di toccare
   `auth.service.ts`, che il PLAN (T5) vuole invariato. La risposta di `GET auth/me` è il nuovo
   `MeWithPermissionsResponse extends MeResponse` in `common/types.ts`; `MeResponseDto` ne è la
   controparte Swagger, come previsto.
2. **`PermissionsService` è `@Optional()` nel costruttore di `AuthController`.** S20 ha
   considerato `auth.service.spec.ts` ma non `test/e2e/auth.e2e-spec.ts` (su `main`), che monta
   `AuthController` in un `TestingModule` ridotto senza `PermissionsService`: con una dipendenza
   obbligatoria la suite non si avvia più. Nell'app il provider arriva sempre dal modulo globale;
   se mancasse, `getMe` risponde `500` e mai senza permessi (unit test dedicato). Il test di `main`
   resta intatto.
3. **`CreateRoleInput.permissionCodes` è `readonly string[]`**, non `PermissionCode[]`: il body
   HTTP porta stringhe arbitrarie, validate da `RolesService` (`INVALID_PERMISSION_CODE`, S14).
   Nessun cast nel controller.
4. **`updateUser` senza `roleGuids` (o con insieme invariato) resta un singolo `UPDATE` senza
   transazione**, già atomico. La transazione si apre solo quando si scrivono anche i ruoli. Serve
   anche a rispettare S21: il mock di `admin.service.invalidation.spec.ts` non ha `transaction`.
5. **`createUser` apre sempre una transazione** (insert di `users`, più `user_roles` se ci sono
   ruoli), come chiesto dal prompt di implementazione. Con ruoli assegnati invalida anche la
   cache del nuovo utente dopo il commit: è ridondante in produzione, ma innocua.
6. **Il dettaglio di `user.update` nell'audit non contiene più `roleGuids`**, che finisce in
   `user.roles.update` (`added`/`removed`). Senza `roleGuids` il dettaglio è identico a prima.
7. **API di `RolesService` in aggiunta a S17**: `auditUserRoles` (audit `user.roles.update`
   condiviso da `setUserRoles` e `AdminService`) e `listUserRoles` (S19). Il DTO di risposta
   `RoleGuidResponseDto` tipizza il `{ guid }` di `POST`/`PATCH roles`.

**Verifica T8 (2026-09-24)**, con baseline prima di F2a su `33cbbd1`:

- Unit backend: 71 suite, 1146 test verdi (baseline 1123, più 23 nuovi).
- E2E backend: 26 suite, 284 test verdi (baseline 263, più i 21 di `roles.e2e-spec.ts`).
- `nest build` verde. `eslint` pulito sui 20 file `.ts` del backend toccati da F2a. `eslint .`
  riporta 1 errore Prettier **preesistente** in `src/blocks/compiler/value-to-declarations.ts`,
  file non toccato da F2a.
- Build del frontend verde con `api.types.ts` rigenerato. Unit del frontend: 853/857. I 4
  falliti (`PropertyInspector.test.tsx`, `resize-handle.utils.test.ts`) falliscono identici con
  l'`api.types.ts` precedente a F2a: sono preesistenti, e li corregge `edab79f` sul branch editor,
  che non è su `main`.
- Criteri 22–23: nessun test presente su `main` modificato. Test F1 toccati solo come da S21.
  `@Permissions(` fuori da `src/permissions/` solo in `roles.controller.ts`. `app/files` e
  `public-media` invariati.
- Nota d'ambiente: il worktree non ha `app/frontend/node_modules`, che nel checkout principale
  contiene `@mantine/charts` e `@mantine/tiptap`. Build e test del frontend sono stati eseguiti
  con un symlink temporaneo, rimosso subito dopo.

