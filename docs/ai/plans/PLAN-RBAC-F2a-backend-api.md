# Plan — RBAC F2a API REST di ruoli e permessi, assegnazione utenti, `auth/me`, e2e

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvato** · [ ] Rifiutato
> Redatto il 2026-09-24. Prerequisiti di firma:
> - [x] `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`, approvata con modifiche il
>   2026-09-24 (marketing@antelmagroup.net)
> - [x] `SPEC-RBAC-F1-schema-seed-cache-guard.md` e `PLAN-RBAC-F1-…` approvati e implementati
>   (`feature/rbac-f1-permessi`, ultimo commit `33cbbd1`)
> - [x] `SPEC-RBAC-F2a-backend-api.md` approvata, assunzioni S11–S23 incluse
>   (2026-09-24, marketing@antelmagroup.net)
> - [x] Questo PLAN approvato, divergenze 1–7 dell'audit incluse. Branch scelto: si resta su
>   `feature/rbac-f1-permessi` (worktree `.claude/worktrees/rbac-f1`)
>
> Firma PLAN: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Spec di riferimento

`docs/ai/specs/SPEC-RBAC-F2a-backend-api.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate

Le divergenze 1–4 riguardano il prompt di task contro ADR-99 approvata. Per la gerarchia di
`CLAUDE.md` (ADR → spec) la SPEC segue l'ADR. Vanno confermate alla firma.

1. **`GET /roles/permissions` contro `GET permissions`.**
   - Dove: prompt, punto 1; ADR-99 § 7; SPEC F1 § Registro, riga `roles:read`.
   - Problema: il prompt annida il catalogo sotto `roles`, l'ADR lo mette allo stesso livello.
   - Impatto: path diverso nel contratto OpenAPI e nel frontend F3. Scelta: `GET
     app/admin/permissions` (SPEC S12).
2. **`AssignUserRolesDto` contro "nessun endpoint nuovo".**
   - Dove: prompt, punto 2; ADR-99 § 7 ("estendendo in modo additivo `CreateUserDto`/
     `UpdateUserDto` (`roleIds?`), non con endpoint nuovi").
   - Problema: un DTO di assegnazione dedicato presuppone una rotta dedicata, che l'ADR esclude.
   - Impatto: la SPEC non crea `AssignUserRolesDto`, e aggiunge `roleGuids?` ai due DTO utente
     (S13). Il nome è `roleGuids`, non `roleIds`: i ruoli si espongono per `guid` (SPEC F1 S8), e
     un campo "Ids" che accetta guid sarebbe fuorviante. **Punto di firma**: se si preferisce la
     rotta dedicata del prompt, serve prima un'ADR di superamento parziale di ADR-99 § 7.
3. **`roles/:id` contro `roles/:guid`.**
   - Dove: prompt e ADR-99 § 7 (`:id`); SPEC F1 S8 ("l'allineamento del path HTTP è deciso nella
     SPEC F2").
   - Impatto: `:guid`, come `users/:guid` e ogni altra rotta amministrativa.
4. **"Anti-escalation integrata nei DTO".**
   - Dove: prompt, punto 2.
   - Problema: l'anti-escalation dipende dai permessi del chiamante letti dal DB, e un DTO
     `class-validator` non li vede. Duplicare nel DTO anche registro e riservati renderebbe
     irraggiungibili via HTTP i codici d'errore `INVALID_PERMISSION_CODE`/`RESERVED_PERMISSION` del
     contratto F1, sostituiti da un `400` generico della pipe.
   - Impatto: i DTO validano la forma, il service le regole (S14). Il "blocco S6 su
     `roles:manage`" è il `400 RESERVED_PERMISSION` di `RolesService.create`/`update`, esposto
     tale e quale.
5. **La F2 di ADR-99 § 11 includeva l'enforcement su `app/files`, e il prompt lo omette.**
   - Dove: ADR-99 § 11 contro il perimetro del prompt.
   - Impatto: senza una traccia esplicita `media:upload`/`media:delete_any` resterebbero in
     `NOT_YET_MIGRATED` a tempo indeterminato. Rimedio: la F2 si divide in F2a/F2b (S11). La F2b
     richiederà una propria SPEC, perché tocca ownership ADR-18 in `files.service.ts`.
6. **`createUser` non è transazionale: assegnare i ruoli dopo l'insert crea utenti a metà.**
   - Dove: `app/backend/src/admin/admin.service.ts` `createUser` (insert, poi `enqueueEmail`, poi
     audit, senza transazione); `RolesService.setUserRoles` fa le proprie letture e scritture.
   - Problema: chiamare `setUserRoles` dopo l'insert. Un `403 PERMISSION_ESCALATION` o un `400
     SYSTEM_ROLE_NOT_ASSIGNABLE` arriverebbe con l'utente già creato e l'email di attivazione già
     accodata, ma senza i ruoli. Stesso rischio su `updateUser` (campi anagrafici salvati, ruoli
     rifiutati).
   - Impatto: rimedio S17. `planUserRoles` valida senza scrivere, prima di ogni scrittura; poi una
     transazione unica con `applyUserRoles(tx, …)`; email, invalidazione e audit dopo il commit.
7. **I test esistenti che costruiscono i service a mano vincolano dove mettere le dipendenze.**
   - Dove: `test/unit/auth/auth.service.spec.ts` (su `main`) costruisce `new AuthService(4
     argomenti)`; `test/unit/admin/admin.service.invalidation.spec.ts` (F1) costruisce
     `AdminService`.
   - Problema: iniettare `PermissionsService` in `AuthService` obbligherebbe a modificare un test
     di `main`.
   - Impatto: `permissions` di `auth/me` si compongono in `AuthController` (S20). `RolesService`
     entra in `AdminService` con una sola riga di cablaggio nel test F1 (S21b), dichiarata.

### Punti di attenzione (non contraddizioni)

- **Con il seed attuale l'anti-escalation sull'assegnazione non scatta mai via API.** L'Admin ha
  tutti i codici tranne `roles:manage`, che S6 esclude dai ruoli personalizzati. Il controllo
  resta necessario (ADR-99 § 8, e registri futuri con codici non-Admin), ma l'e2e deve costruire
  il caso via SQL (SPEC criterio 18). Lo stesso ruolo "contaminato" copre la garanzia 2
  dell'addendum F1, finora senza test su DB reale (criterio 19).
- **Guard prima delle pipe.** Un utente senza permesso con body non valido riceve `403`, non
  `400`, e un Admin su un ruolo di sistema riceve il `403` del guard, non `SYSTEM_ROLE_READONLY`
  (S15). È voluto: non si rivela nulla a chi non ha il permesso.
- **`truncateAllTables` + `restart identity` riusa gli id utente.** Senza `flushTestRedis()` una
  chiave `perm:v<hash>:user:<id>` sopravvissuta da un test precedente servirebbe permessi
  sbagliati. Setup S22: truncate, flush, `sync()`, in quest'ordine.
- **Etichetta `Redis (solo BullMQ)` nel diagramma di `system-architecture.md`.** È inesatta da
  prima di ADR-99 (sessioni, MFA), ma è fuori dal perimetro dell'emendamento richiesto: segnalata
  e non corretta.

### Rischi architetturali / Over-engineering

- **Componente**: `GET app/admin/roles/:guid`.
  **Rimedio**: non si aggiunge. ADR-99 § 7 non lo elenca, e il drawer della F3 può partire dalla
  lista. `RolesService.findOne` resta disponibile per quando servirà.
- **Componente**: migrare anche `app/admin/users*`/`audit-log` a `@Permissions` "già che ci
  siamo".
  **Rimedio**: non si fa. ADR-99 § 5 vuole migrazioni una per una elencate dalla SPEC. Qui non ce
  ne sono, e il perimetro resta verificabile.
- **Componente**: DTO di risposta per tutto il modulo auth.
  **Rimedio**: solo `MeResponseDto`, perché `auth/me` è l'unica rotta auth toccata e la F3 ne
  deve tipizzare `permissions`.
- **Componente**: transazione distribuita email/DB.
  **Rimedio**: non si introduce. L'email si accoda dopo il commit. Se l'accodamento fallisce,
  l'utente esiste senza email, esattamente come oggi.

---

## Task operativi (max 8, ordinati per dipendenze)

**Branch**: si lavora su `feature/rbac-f1-permessi` (worktree `.claude/worktrees/rbac-f1`) oppure
su un branch `feature/rbac-f2a-api` creato da questo, a scelta di chi firma. Mai sul branch
editor `feat/editor-controlli-griglia-elementor`, che ha modifiche non committate e non correlate.

### T1 — DTO di input e di risposta
- **Output atteso**:
  - `app/backend/src/admin/roles/dto/create-role.dto.ts`, `update-role.dto.ts`,
    `role-response.dto.ts` (`RoleResponseDto`, `PermissionItemResponseDto`,
    `PermissionGroupResponseDto`, `UserRoleSummaryDto`).
  - `app/backend/src/admin/dto/create-user.dto.ts`, `update-user.dto.ts`: `roleGuids?`.
  - `app/backend/src/auth/dto/me-response.dto.ts`; `MeResponse` in
    `app/backend/src/common/types.ts` con `permissions: PermissionCode[]`.
- **Dipendenze**: nessuna.
- **Criterio di Done**: build verde. Ogni proprietà ha `@ApiProperty`/`@ApiPropertyOptional` con
  `description`. Nessuna regola di dominio nei DTO (S14).
- **Agente**: backend-developer

### T2 — `RolesService`: `planUserRoles` / `applyUserRoles`
- **Output atteso**: `app/backend/src/admin/roles/roles.service.ts`. `planUserRoles(target,
  roleGuids, authInfo)` esegue solo letture e validazioni, nello stesso ordine di regole di
  `setUserRoles`. `applyUserRoles(tx, userId, plan)` esegue le sole scritture. `setUserRoles`
  compone i due, e invalidazione e audit restano dove sono. Tipo `UserRolesPlan` in
  `roles.types.ts`.
- **Dipendenze**: nessuna (in parallelo a T1).
- **Criterio di Done**: `roles.service.spec.ts` della F1 verde **senza modifiche**. Test nuovi
  per il criterio 1 della SPEC (`planUserRoles` non scrive mai) in un file nuovo
  `test/unit/admin/roles.service.plan.spec.ts`.
- **Agente**: backend-developer

### T3 — `RolesController`
- **Output atteso**:
  - `app/backend/src/admin/roles/roles.controller.ts` (`@Controller('app/admin')`, 5 rotte della
    SPEC, `@Permissions` per rotta, `@HttpCode(204)` sul `DELETE`, Swagger completo con
    `type` di risposta e ogni status della SPEC).
  - `roles.module.ts`: `controllers: [RolesController]`.
  - `test/unit/permissions/permissions.registry.spec.ts`: `roles:read`/`roles:manage` tolti da
    `NOT_YET_MIGRATED` (S21a).
- **Dipendenze**: T1.
- **Criterio di Done**: build verde. Test di registro verde (criterio 5). Nessuna collisione di
  rotta con `AdminController` (stesso prefisso `app/admin`, path disgiunti). Nessun `GuardAdmin`
  sul controller (S16).
- **Agente**: backend-developer

### T4 — `AdminService`/`AdminController`: `roleGuids` e `roles`
- **Output atteso**:
  - `app/backend/src/admin/admin.service.ts`: `RolesService` iniettato. `createUser`/`updateUser`
    secondo S17/S18, con `planUserRoles` prima di ogni scrittura, transazione unica, poi email,
    invalidazione unica e audit. `findOneUser` con `roles` (S19).
  - `app/backend/src/admin/admin.module.ts`: import di `RolesModule`, se non già presente.
  - `app/backend/src/admin/admin.controller.ts`: Swagger dei nuovi esiti (`403`/`404`/`400`).
  - `test/unit/admin/admin.service.invalidation.spec.ts`: solo l'argomento aggiuntivo del
    costruttore (S21b).
  - `test/unit/admin/admin.service.roles.spec.ts` (nuovo): criteri 2–3 della SPEC.
- **Dipendenze**: T1, T2.
- **Criterio di Done**: unit test verdi. Con `roleGuids` rifiutato, nessun `insert`/`update` su
  `users` e nessuna email (verificato sui mock).
- **Agente**: backend-developer

### T5 — `GET auth/me` con `permissions`
- **Output atteso**: `app/backend/src/auth/auth.controller.ts`, con `PermissionsService`
  iniettato nel controller e `getMe` che compone `authService.getMe(authInfo)` con i permessi
  ordinati, più `@ApiResponse({ status: 200, type: MeResponseDto })`.
  `app/backend/src/auth/auth.service.ts` non cambia. Test nuovo
  `test/unit/auth/auth.controller.me.spec.ts` (criterio 4).
- **Dipendenze**: T1.
- **Criterio di Done**: `auth.service.spec.ts` intatto e verde. Test nuovo verde.
- **Agente**: backend-developer

### T6 — e2e `roles.e2e-spec.ts`
- **Output atteso**: `app/backend/test/e2e/roles.e2e-spec.ts`, con i criteri 6–21 della SPEC.
  Setup S22: `truncateAllTables` → `flushTestRedis` → `app.get(PermissionsSeedService).sync()`.
  Utenti e token come in `admin-rebuild-static-site.e2e-spec.ts`. Ruolo `contaminated` inserito
  via `getTestDb()` per i criteri 18–19.
- **Dipendenze**: T3, T4, T5.
- **Criterio di Done**: suite verde su `cms_db_test`. Ogni rotta della SPEC ha almeno un caso di
  successo e uno di errore. I casi 14–15 usano lo stesso token prima e dopo la modifica (nessun
  rilogin). Nessun helper e2e esistente modificato.
- **Agente**: test-engineer

### T7 — Contratti e documentazione
- **Output atteso**:
  - `npm run openapi:export && npm run openapi:types`, che rigenerano `docs/openapi.yaml` e
    `app/frontend/src/types/api.types.ts`. File generati, mai editati a mano.
  - `bruno/admin/`: `List Roles.yml`, `Create Role.yml`, `Update Role.yml`, `Delete Role.yml`,
    `List Permissions.yml`. `Create User.yml`/`Update User.yml` con `roleGuids` di esempio.
  - `docs/glossary.md`, `docs/system-architecture.md`: **solo** il testo di SPEC § "Emendamenti
    documentali".
  - `docs/ai/INDEX.md`, riga "Auth, Ruoli & Permessi": aggiunta di SPEC e PLAN F2a.
- **Dipendenze**: T3, T4, T5.
- **Criterio di Done**: criterio 24 della SPEC. `git diff` su glossario e architettura limitato
  alle righe elencate nella SPEC. Build del frontend verde con i tipi rigenerati.
- **Agente**: backend-developer per openapi, INDEX e documentazione; test-engineer per Bruno

### T8 — Verifica globale e non regressione
- **Output atteso**: nessun file applicativo, solo il report di esecuzione nel commit o nella PR.
- **Dipendenze**: T1–T7.
- **Criterio di Done**:
  - `npm test` e `npm run test:e2e` verdi (con `app/backend/.env` presente: senza, 8 test
    preesistenti falliscono per il segreto JWT, problema noto e non F2a).
  - `git diff main -- app/backend/test` senza modifiche a file presenti su `main`. File F1 toccati
    solo come S21 (criteri 22–23).
  - `npm run build --workspace=app/backend`, `npm run build --workspace=app/frontend` e
    `npm run lint` passano.
  - `grep -rn "@Permissions(" app/backend/src` trova solo `roles.controller.ts` fuori da
    `src/permissions/`.
- **Agente**: test-engineer

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Escalation tramite `roleGuids` (Admin che si concede o concede ad altri permessi che non ha) | Bassa | Alto | Anti-escalation di `planUserRoles` prima di ogni scrittura (S17). e2e 18 con ruolo contaminato. Doppio cancello (S15) |
| `roles:manage` fuori dal SuperAdmin | Bassa | Alto | Guard `roles:manage`, poi `RESERVED_PERMISSION` (S6), poi pulizia nel seed, poi filtro nella query. e2e 11 e 19 |
| Utente creato a metà (email inviata, ruoli rifiutati) | Media senza S17 | Medio | S17 e unit test del criterio 2 |
| Rotta ruoli raggiungibile senza permesso per errore di cablaggio (decoratore dimenticato) | Bassa | Alto | Test di registro (scansione statica). e2e 8 e 10 su ogni rotta. Guard fail-closed su metadati assenti |
| Cache permessi stantia nei test (id riusati dopo `restart identity`) | Alta senza S22 | Medio (test instabili) | Setup S22 in ordine fisso |
| Permesso revocato ancora attivo (invalidazione mancante su un nuovo percorso di scrittura) | Media | Medio | Invalidazione unica post-commit in `updateUser`. e2e 15 verifica revoca per ruolo e per utente senza rilogin |
| Rottura di test di `main` per nuove dipendenze nei costruttori | Media | Medio | S20 (composizione nel controller), S21 (solo test F1). Criterio 22 |
| Contratto OpenAPI incompleto per la F3 | Media | Basso | DTO di risposta tipizzati. Criterio 24 |
| Deriva documentale (glossario/architettura che dicono ancora "RBAC a soglie") | Certa senza T7 | Medio | Testo esatto in SPEC, approvato con essa |
| `media:*` mai migrati se F2b non parte | Media | Medio | F2b dichiarata (S11). I codici restano visibili in `NOT_YET_MIGRATED` |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] Tutti i task implementati (T1–T8)
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc
- [ ] Nessuna dipendenza npm nuova, nessuna migrazione DB
- [ ] `@Permissions` solo su `RolesController`; `app/files`, `system/*`, `PublicMediaController`
      invariati

### Test
- [ ] Unit test scritti e superati (Jest), criteri 1–5 della SPEC
- [ ] Integration test scritti e superati (Supertest), `roles.e2e-spec.ts`, criteri 6–21
- [ ] Collezioni Bruno create per ogni endpoint nuovo o modificato
- [ ] Mock per servizi esterni (email in coda, `RedisService`/`DbService` negli unit test)
- [ ] Nessun test placeholder (`expect(true).toBe(true)`)
- [ ] Nessun test di `main` modificato; test F1 toccati solo come S21

### Build e qualità
- [ ] `npm run build --workspace=app/backend` superata
- [ ] `npm run build --workspace=app/frontend` superata (con `api.types.ts` rigenerato)
- [ ] Lint superato
- [ ] Code review completata, con attenzione ad atomicità S17, ordine guard/pipe e anti-escalation

### Contratti e documentazione
- [ ] `npm run openapi:export` eseguito
- [ ] `npm run openapi:types` eseguito
- [ ] `docs/glossary.md` e `docs/system-architecture.md` emendati come da SPEC
- [ ] `docs/ai/INDEX.md` aggiornato
- [ ] SPEC aggiornata con un addendum se sono emerse deviazioni durante l'implementazione
- [ ] `docs/ai/progress-tracker.md` aggiornato (su richiesta esplicita, Documentation Policy)

### Commit
- [ ] Commit atomico per task con messaggio Conventional Commits (es. `feat(rbac): T3 — …`)
- [ ] Branch aggiornato (`feature/rbac-f1-permessi` o `feature/rbac-f2a-api`, vedi § Task)
