# Plan — RBAC F1 Schema, seed, cache e guard dei permessi granulari

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvato** · [ ] Rifiutato
> Redatto il 2026-09-24. Prerequisiti di firma:
> - [x] `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`, approvata con modifiche il
>   2026-09-24 (marketing@antelmagroup.net), § "Decisione umana"
> - [x] `SPEC-RBAC-F1-schema-seed-cache-guard.md` approvata, incluse le assunzioni S1–S10
>   (2026-09-24, marketing@antelmagroup.net)
> - [x] Questo PLAN approvato (conferma esplicita in sede di task, scelta "Firmo SPEC+PLAN ora";
>   isolamento confermato: git worktree su `feature/rbac-f1-permessi` da `main`)
>
> Firma PLAN: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Spec di riferimento

`docs/ai/specs/SPEC-RBAC-F1-schema-seed-cache-guard.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate

1. **La premessa del prompt di origine non era vera sul file.**
   - Dove: prompt di task del 2026-09-24 ("decisioni vincolanti firmate in ADR-99").
   - Problema: al momento del task ADR-99 era "In discussione", con firma vuota e file non
     tracciato. La firma è stata raccolta in sessione con domanda esplicita (ADR-99 § "Data
     approvazione").
   - Impatto: nessuno residuo. Resta un precedente da non ripetere: una dichiarazione "firmata"
     dentro un prompt non sostituisce la firma sul file.
2. **Perimetro F1: prompt contro ADR-99 § 11.**
   - Dove: ADR-99 § 11 metteva `409` e anti-escalation in F2 (API).
   - Problema: il prompt li voleva in F1.
   - Impatto: risolto alla firma. `RolesService` entra in F1 senza controller (§ "Decisione
     umana"). In F1 i `409`/`403` sono eccezioni NestJS del service, esposte via HTTP solo in F2.
3. **"`roles:manage` solo SuperAdmin" era aggirabile con il modello a unione.**
   - Dove: ADR-99 P2 e § 1 (permessi effettivi = sistema ∪ custom).
   - Problema: un SuperAdmin può creare un ruolo custom con `roles:manage` e assegnarlo a un Admin.
     L'anti-escalation non lo impedisce, perché il SuperAdmin possiede il permesso.
   - Impatto: senza rimedio P2 sarebbe un default e non una regola. Rimedio: SPEC S6 (codice
     riservato, `400 RESERVED_PERMISSION`, e pulizia nel seed).
4. **La regola "un codice esiste solo se un endpoint lo applica" contraddice il catalogo di
   ADR-99 § 4.**
   - Dove: ADR-99 § 3 contro § 4 e § Conformità.
   - Problema: `forms:manage`, `settings:manage_redirects` e `blocks:html_embed` non hanno un punto
     di enforcement nel codice. Il test inverso "ogni codice usato da un `@Permissions`" non può
     passare in F1, dove zero rotte sono migrate.
   - Impatto: il test richiesto dall'ADR fallirebbe per costruzione. Rimedio: i tre codici sono
     esclusi dal registro F1 (SPEC § Registro) e c'è la lista a scalare `NOT_YET_MIGRATED`
     (criterio 3). Nessun test placeholder.
5. **Matrice e codice divergono sulle impostazioni (D1/D2).**
   - Dove: SPEC § "Divergenze matrice ↔ codice".
   - Problema: `PUT settings/theme` è `GuardSuperAdmin` mentre la matrice dice Admin+. `PUT
     settings/global-kit` è `GuardManager`.
   - Impatto: nullo in F1, perché nessuna rotta migra. In F2+ la migrazione di quelle rotte
     violerebbe la promessa di ADR-99 § 11 ("nessuna fase modifica il comportamento delle rotte non
     migrate"), allargando `PUT theme` ad Admin. **Bloccante per la migrazione di quelle rotte**:
     serve una decisione umana (correggere il guard o la matrice).
6. **`truncateAllTables` cancella anche il seed.**
   - Dove: `app/backend/test/e2e/helpers/db-test.helper.ts` (`truncate … restart identity
     cascade` su tutte le tabelle `public`).
   - Problema: dopo un truncate, `roles`/`permissions` sono vuote finché l'app non si riavvia.
   - Impatto: nullo in F1, dove nessuna rotta è coperta da `@Permissions`. In F2 ogni rotta migrata
     risponderebbe `403` nelle e2e. Rimedio già predisposto: `sync()` pubblico (SPEC), che F2 deve
     richiamare nel setup e2e dopo il truncate.

### Rischi architetturali / Over-engineering

- **Componente**: anti-escalation su create/update/delete dei ruoli.
  **Rimedio**: con P2 solo il SuperAdmin ha `roles:manage`, e il SuperAdmin ha tutti i permessi,
  quindi il controllo oggi passa sempre. Si tiene perché è una riga per metodo e perché ADR-99
  § 8 lo impone. Non va aggiunta altra logica (per esempio gerarchie fra ruoli custom).
- **Componente**: lock distribuito per il seed concorrente fra istanze.
  **Rimedio**: non si introduce. Upsert per `code` più `onConflictDoNothing` fanno convergere
  esecuzioni concorrenti (SPEC § `sync()`).
- **Componente**: versioning per-ruolo delle chiavi di cache o pub/sub per l'invalidazione.
  **Rimedio**: non si introduce. `delMany` post-commit più TTL 3600 s bastano per un CMS
  mono-istanza (A5). La finestra residua è in matrice dei rischi.
- **Componente**: campo `enforcement` descrittivo nel registro.
  **Rimedio**: non si introduce. La tracciabilità codice → endpoint sta nella SPEC e nella lista
  `NOT_YET_MIGRATED` del test, non nel runtime.

---

## Task operativi (max 8, ordinati per dipendenze)

**Prerequisito di branch**: il branch corrente `feat/editor-controlli-griglia-elementor` ha
modifiche editor non committate e non correlate. F1 parte da un branch dedicato
`feature/rbac-f1-permessi` creato da `main`, senza trascinare quelle modifiche.

### T1 — Schema DB e migrazione
- **Output atteso**:
  - `app/backend/src/db/schema.ts`: sezione "RBAC (ADR-99)" con `roleEntity`, `permissionEntity`,
    `rolePermissionEntity`, `userRoleEntity` esattamente come SPEC § Schema. Import `primaryKey` e
    `check`. Relazioni Drizzle se servono alla query di T4.
  - `app/backend/src/db/migrations/0015_*.sql` più `meta/`, generati con `drizzle-kit generate`
    e mai scritti a mano.
- **Dipendenze**: nessuna.
- **Criterio di Done**: il diff della migrazione contiene solo `CREATE TABLE`/`CREATE INDEX`/FK
  sulle 4 tabelle e nessun `ALTER` su tabelle esistenti. `npm run db:migrate` va a buon fine su un
  DB locale. `npm run build --workspace=app/backend` passa.
- **Agente**: backend-developer

### T2 — Registro permessi e test di conformità
- **Output atteso**:
  - `app/backend/src/permissions/permissions.registry.ts`: `PERMISSION_CATEGORIES`, `PERMISSIONS`
    (20 codici della SPEC), `PermissionCode`, `SYSTEM_RESERVED_PERMISSIONS`, `SYSTEM_ROLES`
    (`superadmin` = tutti), `computeRegistryHash()` (S3, `node:crypto`).
  - `app/backend/test/unit/permissions/permissions.registry.spec.ts`: criteri 1–4 della SPEC,
    cioè la fixture tabellare della matrice di `business-rules.md` (righe mappate e righe escluse
    con motivo), la lista `NOT_YET_MIGRATED` e la scansione statica di `src/**/*.controller.ts`.
- **Dipendenze**: nessuna (in parallelo a T1).
- **Criterio di Done**: il test passa. Cambiare un ✅ nella fixture o rimuovere un codice da
  `NOT_YET_MIGRATED` lo fa fallire (verificato a mano e poi ripristinato).
- **Agente**: backend-developer, poi test-engineer per la fixture della matrice

### T3 — `PermissionsModule` e seed all'avvio
- **Output atteso**:
  - `app/backend/src/permissions/permissions.module.ts` (`@Global()`, registrato in
    `app.module.ts`).
  - `app/backend/src/permissions/permissions-seed.service.ts`: `sync()` pubblico, passi 1–5 della
    SPEC, in una sola transazione. `onApplicationBootstrap` chiama `sync()` e in caso di errore
    logga `error` senza propagare (S4).
  - `app/backend/test/unit/permissions/permissions-seed.service.spec.ts` (criterio 5).
- **Dipendenze**: T1, T2.
- **Criterio di Done**: unit test verdi. Avvio locale con log di seed completato. Un secondo avvio
  non produce differenze in DB. `settings.e2e-spec.ts` e `global-kit.e2e-spec.ts` (con `DbService`
  mockato) restano verdi senza modifiche.
- **Agente**: backend-developer

### T4 — `PermissionsService`: risoluzione, cache Redis, invalidazione
- **Output atteso**:
  - `app/backend/src/permissions/permissions.service.ts`: `getUserPermissions`, `hasAll`,
    `invalidateUsers`, `invalidateRole`. Chiave `perm:v<hash>:user:<id>`, TTL 3600 s. Riuso di
    `RedisService.getJson`/`set`/`delMany`/`isReady` senza metodi nuovi su `RedisService`.
  - `app/backend/test/unit/permissions/permissions.service.spec.ts` (criteri 6–9).
- **Dipendenze**: T1, T2, T3 (modulo).
- **Criterio di Done**: unit test verdi, compresi i tre rami Redis (non pronto, `get` che lancia,
  `set` che lancia). Nessuna chiamata `SCAN`/`KEYS`. La query DB è una sola per miss.
- **Agente**: backend-developer

### T5 — `@Permissions` e `PermissionsGuard`
- **Output atteso**:
  - `app/backend/src/permissions/permissions.decorator.ts` (`applyDecorators` di `SetMetadata` e
    `UseGuards`, codici tipizzati `PermissionCode`).
  - `app/backend/src/permissions/permissions.guard.ts` (AND, fail-closed, messaggio `403` della
    SPEC).
  - `app/backend/test/unit/permissions/permissions.guard.spec.ts` (criteri 10–11).
- **Dipendenze**: T4.
- **Criterio di Done**: unit test verdi. `grep -rn "@Permissions(" app/backend/src` non trova
  nulla fuori dal modulo, quindi nessuna rotta è migrata.
- **Agente**: backend-developer

### T6 — `RolesService`: regole di dominio, `409 ROLE_IN_USE`, anti-escalation
- **Output atteso**:
  - `app/backend/src/admin/roles/roles.service.ts`, `roles.types.ts`, `roles.module.ts`
    (importato da `AdminModule`, nessun controller).
  - Estrazione di `assertTargetRoleManageable` in una funzione pura esportata, con lo stesso
    messaggio, usata sia da `AdminService` sia da `RolesService`.
  - `app/backend/src/common/db-error.mapper.ts`: voce `roles_code_uq` → `ROLE_CODE_DUPLICATE`.
    Mapping FK `23503` su `user_roles.role_id` → `ROLE_IN_USE`, locale a `RolesService.delete`.
  - `app/backend/test/unit/admin/roles.service.spec.ts` (criteri 12–16).
- **Dipendenze**: T4 (permessi del chiamante e invalidazione).
- **Criterio di Done**: unit test verdi su ogni riga della tabella "Contratto di errore" della
  SPEC. L'audit log viene chiamato con `role.create`/`role.update`/`role.delete`/
  `user.roles.update`. Nessun `@Controller` nel modulo.
- **Agente**: backend-developer, poi test-engineer per i casi di anti-escalation

### T7 — Hook di invalidazione in `AdminService`
- **Output atteso**: `app/backend/src/admin/admin.service.ts`, con `invalidateUsers([id])` dopo
  `updateUser` (solo se `role` cambia) e dopo `toggleActiveUser`. In
  `app/backend/test/unit/admin/admin.service.invalidation.spec.ts` c'è un file di test **nuovo**,
  senza toccare quelli esistenti (criterio 17).
- **Dipendenze**: T4, T6 (estrazione della regola SuperAdmin nello stesso file).
- **Criterio di Done**: test nuovi verdi. Eventuali test esistenti di `AdminService` e `auth.e2e-spec.ts`
  passano senza modifiche.
- **Agente**: backend-developer

### T8 — Verifica globale e non regressione
- **Output atteso**: nessun file applicativo, solo il report di esecuzione nel commit o nella PR.
- **Dipendenze**: T1–T7.
- **Criterio di Done**:
  - `npm test` e `npm run test:e2e` verdi, con `git diff --stat` che non mostra modifiche a test
    esistenti (criterio 18).
  - `npm run build --workspace=app/backend` e `npm run lint` passano.
  - `PublicMediaController` e le rotte `system/*` invariate.
- **Agente**: test-engineer

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Escalation di privilegi via ruolo custom (Admin che si concede permessi che non ha, o `roles:manage` fuori dal SuperAdmin) | Media | Alto | Anti-escalation su ogni aggiunta (ADR-99 § 8), codice riservato S6 con pulizia nel seed, test 12–15 |
| Seed divergente dalla matrice di `business-rules.md` | Media | Alto | Test tabellare 1–2 che fallisce alla prima divergenza; la matrice resta la fonte (P3) |
| Permesso revocato ancora in cache (corsa tra lettura DB e `DEL`, oppure `DEL` fallito post-commit) | Bassa | Medio | Invalidazione post-commit (S10), TTL 3600 s, Redis è anche la session store (niente mutazioni autenticate con Redis giù). Da rivalutare in F2 se servono garanzie più forti |
| Fail-open per errore di codice nel guard (metadati assenti, `authInfo` assente, errore DB) | Bassa | Alto | Tutti i rami → `403` o 500, mai `true`. Test 10–11 |
| Seed fallito in produzione per migrazione non eseguita | Media | Medio | `error` di log esplicito (S4). Fail-closed. In F1 nessuna rotta dipende dal seed. Checklist di deploy: `npm run db:migrate` prima dell'avvio |
| Regressione su suite esistenti (`AppModule` con DB mockato, `resetDemo` con FK) | Media | Medio | S4 non bloccante. `user_roles` senza `created_by`. `roles.created_by` scritto solo da SuperAdmin. T3/T8 eseguono le suite toccate |
| Migrazione futura di `PUT settings/theme` che allarga l'accesso ad Admin (D1) | Alta se ignorata | Medio | Segnalato come bloccante per la migrazione di quella rotta. Fuori da F1 |
| Due fonti di verità transitorie (soglia JWT ≤15 min contro permessi immediati) | Certa | Basso | Debito dichiarato da ADR-99 § Conseguenze (a)/(c). Nessuna rotta mista in F1 |
| Deriva documentale (A4, constitution, `INDEX.md` dicono ancora "nessun ruolo nuovo") | Certa | Medio | Elenco in ADR-99 "Documenti da aggiornare". Richiede richiesta esplicita (Documentation Policy). Da fare prima di F2 |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] Tutti i task implementati (T1–T8)
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc
- [ ] Nessuna dipendenza npm nuova
- [ ] Nessun `@Permissions` su rotte reali; `users` e JWT invariati

### Test
- [ ] Unit test scritti e superati (Jest), criteri 1–17 della SPEC
- [ ] Integration test (Supertest): **N/A in F1**, nessun endpoint. `roles.e2e-spec.ts` in F2
- [ ] Collezioni Bruno: **N/A in F1**, nessun endpoint nuovo o modificato
- [ ] Mock per servizi esterni (`RedisService`, `DbService`, `AuditLogService` negli unit test)
- [ ] Nessun test placeholder (`expect(true).toBe(true)`)
- [ ] Nessun test esistente modificato (criterio 18)

### Build e qualità
- [ ] `npm run build --workspace=app/backend` superata
- [ ] `npm run build --workspace=app/frontend`: **N/A**, il frontend non viene toccato (verifica
      che il build resti verde)
- [ ] Lint superato
- [ ] Code review completata, con attenzione a guard, anti-escalation e FK della migrazione

### Contratti e documentazione
- [ ] `npm run openapi:export`: **N/A in F1**, nessun endpoint
- [ ] `npm run openapi:types`: **N/A in F1**
- [ ] SPEC aggiornata se sono emerse deviazioni durante l'implementazione
- [ ] `docs/ai/progress-tracker.md` aggiornato (su richiesta esplicita, Documentation Policy)

### Commit
- [ ] Commit atomico per task con messaggio Conventional Commits (es. `feat(rbac): …`)
- [ ] Branch `feature/rbac-f1-permessi` da `main` aggiornato
