# Plan — RBAC F2b Frontend: permessi in `useAuthStore`, `useHasPermission`/`<Can>`, pagina Ruoli, ruoli aggiuntivi in `PageUsers`

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvato** · [ ] Rifiutato
> Redatto il 2026-09-24. Prerequisiti di firma:
> - [x] `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`, approvata con modifiche il
>   2026-09-24 (marketing@antelmagroup.net)
> - [x] `SPEC-RBAC-F2a-backend-api.md` e `PLAN-RBAC-F2a-backend-api.md` approvati e implementati
>   (`feature/rbac-f1-permessi`, ultimo commit `f1099b7`)
> - [x] `SPEC-RBAC-F2b-frontend-ui.md` approvata, assunzioni S24–S38 incluse
>   (2026-09-24, marketing@antelmagroup.net)
> - [x] Questo PLAN approvato, divergenze 1–8 dell'audit incluse. Branch scelto: si resta su
>   `feature/rbac-f1-permessi` (worktree `.claude/worktrees/rbac-f1`)
>
> Firma PLAN: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Spec di riferimento

`docs/ai/specs/SPEC-RBAC-F2b-frontend-ui.md`

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate

Le divergenze 1–5 riguardano il prompt di task contro ADR-99 approvata o contro il codice. Per la
gerarchia di `CLAUDE.md` (ADR → spec) la SPEC segue l'ADR. Vanno confermate alla firma.

1. **Etichetta "F2b" già assegnata.**
   - Dove: nomi dei file richiesti dal prompt; SPEC F2a S11 e PLAN F2a divergenza 5.
   - Problema: la SPEC F2a, approvata, chiama "F2b" l'enforcement `media:*` su `app/files`. Il
     prompt chiama "F2b" il frontend, cioè la F3 di ADR-99 § 11.
   - Impatto: due fasi con lo stesso nome, e il rischio che l'enforcement `media:*` sparisca dai
     radar. Scelta: nomi dei file come da prompt, e l'enforcement media diventa **F2c** (SPEC S24).
     La SPEC F2a non si riscrive. **Punto di firma**: alla firma serve una riga in `INDEX.md`
     (dominio "Auth, Ruoli & Permessi") che registri la ridenominazione, su richiesta esplicita.
2. **`/admin/roles` contro `/roles`.**
   - Dove: prompt, punto 2; ADR-99 § 10 ("Rotta `/roles` (non `/admin/roles`: coerente con
     `/users`)").
   - Impatto: rotta `/roles` (S31). Il file resta dove lo chiede il prompt,
     `src/pages/admin/PageRoles.tsx`, accanto a `PageUsers.tsx`.
3. **"Sostituzione della Select statica del singolo ruolo".**
   - Dove: prompt, punto 3; ADR-99 § 10 ("`PageUsers` **mantiene** il select del livello base
     (`role`) e aggiunge un multi-select").
   - Problema: il livello base non è un ruolo assegnabile via `roleGuids`. Il backend risponde
     `400 SYSTEM_ROLE_NOT_ASSIGNABLE` se `roleGuids` contiene un ruolo di sistema, e `users.role`
     resta la fonte di guard a soglia, ownership ADR-18 e impersonificazione.
   - Impatto: sostituendo il select non si potrebbe più cambiare il livello di un utente. Scelta:
     select invariato più `MultiSelect` "Ruoli aggiuntivi" (S38). **Punto di firma**: sostituirlo
     davvero richiede prima un'ADR che superi il modello additivo (ADR-99 P1).
4. **Categorie "Pagine, Media, Utenti, Impostazioni".**
   - Dove: prompt, punto 2; registro backend `PERMISSION_CATEGORIES`.
   - Problema: le categorie reali sono 6 (`pages`, `structure`, `media`, `forms`, `settings`,
     `users`), su 20 codici. Una matrice a 4 categorie codificate nasconderebbe `templates:manage`,
     `global_sections:manage` e `forms:read_submissions`.
   - Impatto: matrice alimentata da `GET permissions`, con le sole etichette mappate nel frontend
     (S33).
5. **"Store Zustand/`useAuth`" e scrittura dei ruoli per l'"Amministratore".**
   - Dove: prompt, punti 1–2.
   - Problema: lo store è `useAuthStore` in `hooks/useAuth.ts` (non c'è un hook `useAuth`
     separato). E `roles:manage` è del **solo SuperAdmin** (ADR-99 P2): l'Admin legge ma non scrive.
   - Impatto: pagina in sola lettura per l'Admin (S32).

Falle del codice attuale, rilevate leggendo il frontend e non segnalate dal prompt:

6. **Dopo il login i permessi non si caricherebbero mai.**
   - Dove: `hooks/useAuth.ts` (`initStarted` rende `init()` no-op dopo il primo mount);
     `pages/auth/PageLogin.tsx` (dopo `login()` fa `navigate()` in SPA, senza ricaricare).
   - Problema: se l'utente apre `/login` senza token, `init()` è già consumato. Dopo il login
     nessuno chiama `GET /auth/me` e `permissions` resterebbe `null` fino al primo reload.
   - Impatto: nel percorso più comune la pagina Ruoli e il multi-select sarebbero invisibili. Rimedio:
     `login()` chiama `refreshPermissions()` (S26). Impersonificazione e uscita ricaricano la
     pagina con `window.location.href` e passano già da `init()`.
7. **Redirect prematuro con utente in cache.**
   - Dove: `useAuthStore.user` è inizializzato da `localStorage` (`getStoredUser()`), quindi le
     rotte si montano prima che `GET /auth/me` risponda.
   - Impatto: un guard che leggesse "permesso assente" durante il caricamento rimanderebbe alla
     dashboard un utente autorizzato che ricarica `/roles`. Rimedio: `permissions: null` come stato
     distinto, con loader (S25, S28).
8. **Tipi generati non affidabili per due campi.**
   - Dove: `api.types.ts`, `CreateRoleDto.description` e `UpdateRoleDto.description` tipizzati
     `Record<string, never> | null`; la risposta di `GET app/admin/users/:guid` non ha uno schema
     per `roles`.
   - Impatto: usare i tipi generati renderebbe impossibile inviare una descrizione senza cast.
     Rimedio: tipi scritti a mano sul contratto della SPEC F2a (S36). **Debito dichiarato**: la
     correzione vera è un `@ApiPropertyOptional({ type: String, nullable: true })` nei due DTO
     backend, seguito da `openapi:export`/`openapi:types`. Da fare in un task backend separato (o in
     F2c), non qui: questa fase non tocca `app/backend`.

Altri punti da conoscere prima di implementare:

- **Doppio toast sui `403` di dominio.** L'interceptor mostra "Permessi insufficienti" su ogni
  `403`, e la pagina aggiunge il messaggio specifico di `PERMISSION_ESCALATION` o
  `SYSTEM_ROLE_READONLY`. Si accetta (S37): con la UI di S32–S34 questi `403` sono raggiungibili
  solo con dati stantii (per esempio un permesso revocato in un'altra scheda).
- **`PageUsers` in modifica usa la riga della lista** (`openEdit(record: UserListItem)`), che non
  contiene `roles`. Serve `fetchUser(guid)` all'apertura (S38), con un loader nel campo.
- **Anti-escalation lato UI oggi quasi inerte.** Con il seed attuale l'Admin possiede tutti i
  codici tranne `roles:manage`, che nessun ruolo personalizzato può contenere, e il SuperAdmin li
  possiede tutti. Le opzioni o checkbox disabilitate per "permesso non posseduto" non compaiono con
  gli utenti reali di oggi. Restano (sono una funzione pura di una riga, S33/S38) perché il
  catalogo crescerà con F2c e i moduli futuri. I test le coprono con dati costruiti.

### Rischi architetturali / Over-engineering

- **Componente**: una union `PermissionCode` con tutti i 20 codici del registro backend.
  - **Rimedio**: union dei soli 3 codici letti dalla UI (S29). Il catalogo della matrice arriva
    dall'API. Una copia completa andrebbe tenuta allineata a mano senza nessun test che la
    confronti col registro.
- **Componente**: `<Can>` con modalità `mode="hide" | "disable"` e `cloneElement` per iniettare
  `disabled`.
  - **Rimedio**: `children` come funzione `(allowed) => ReactNode` (S30). È esplicito e non dipende
    dalla forma del figlio.
- **Componente**: estendere `ResponsiveTable` con azioni `disabled` e tooltip per i ruoli di
  sistema.
  - **Rimedio**: azioni `hidden` più "Visualizza" (S32). Un'estensione del componente condiviso
    tocca le 9 pagine che lo usano per un caso solo.
- **Componente**: cache dei ruoli o del catalogo in uno store Zustand globale.
  - **Rimedio**: stato locale della pagina o del drawer. Due consumer, liste piccole, nessuna
    condivisione fra pagine.
- **Componente**: refresh automatico dei permessi su ogni `403`.
  - **Rimedio**: fuori perimetro (ADR-99 § Conseguenze (e)). Toccherebbe l'interceptor, e ogni
    `403` legittimo produrrebbe una `GET /auth/me` sotto rate-limit.

---

## Task operativi (max 8, ordinati per dipendenze)

Convenzioni comuni a tutti i task: nessun file di `app/backend/`, `bruno/`, `docs/openapi.yaml` o
`api.types.ts` modificato; ogni task consegna i propri test; un commit per task (Conventional
Commits, prefisso `feat(rbac-ui)` o `test(rbac-ui)`).

**Prerequisito d'ambiente**: il worktree non ha `app/frontend/node_modules`, dove il checkout
principale tiene `@mantine/charts` e `@mantine/tiptap`. Per build e test del frontend si usa un
symlink temporaneo `app/frontend/node_modules → /var/www/cms/app/frontend/node_modules`, da
rimuovere subito dopo (stesso rimedio della T8 di F2a). Il symlink non va mai committato.

### T1 — `useAuthStore`: `permissions`, `refreshPermissions`, caricamento post-login
- **Output atteso**:
  - `app/frontend/src/hooks/useAuth.ts`: `permissions: string[] | null` (iniziale `null`);
    `init()` lo valorizza dalla risposta; `refreshPermissions()` con promise condivisa in volo,
    `[]` in caso di errore; `login()` chiama `refreshPermissions()` senza attenderla; `logout()`
    lo azzera (S25–S26). JSDoc sul nuovo campo e sulla nuova azione.
  - `app/frontend/src/types/auth.types.ts`: `MeResponse.permissions: string[]`.
  - `app/frontend/src/hooks/useAuth.test.ts` (nuovo): criteri 1–4 della SPEC.
- **Dipendenze**: nessuna
- **Criterio di Done**: criteri 1–4 verdi. `PagePages.test.tsx` e `PagePageDetail.test.tsx`
  verdi senza modifiche. `PageLogin.tsx` non cambia: la chiamata vive in `login()`.
- **Agente**: frontend-developer

### T2 — `useHasPermission`, `<Can>`, `RequirePermission`, `permission` nella navigazione
- **Output atteso**:
  - `app/frontend/src/hooks/useHasPermission.ts` (S27) e `app/frontend/src/components/Can.tsx`
    (S30).
  - `app/frontend/src/App.tsx`: `RequirePermission` accanto a `RequireRole` (S28). La rotta
    `/roles` **non** viene ancora aggiunta.
  - `app/frontend/src/config/navigation.ts`: campo `permission?: PermissionCode` in
    `NavigationItem`, e funzione pura esportata `isNavigationItemVisible(item, role, permissions)`
    (AND fra `roles` e `permission`, S31). `app/frontend/src/layouts/LayoutProtected.tsx` usa la
    funzione al posto del filtro inline, con comportamento identico per le voci esistenti.
  - `app/frontend/src/types/roles.types.ts`: per ora solo `PermissionCode` (S29); il resto in T3.
  - Test nuovi: `hooks/useHasPermission.test.ts`, `components/Can.test.tsx`,
    `config/navigation.test.ts` (tabellare: 4 ruoli × voci esistenti, più il caso `permission`) e
    un test di `RequirePermission` (criteri 5–8). `RequirePermission` va esportato per il test, o
    spostato in `components/RequirePermission.tsx` se l'export da `App.tsx` rompe il fast refresh
    di Vite. Scelta all'implementatore, dichiarata nell'addendum.
- **Dipendenze**: T1
- **Criterio di Done**: criteri 5–8 verdi. La sidebar mostra le stesse voci di prima per i 4
  ruoli (verifica tabellare).
- **Agente**: frontend-developer

### T3 — Tipi, service ruoli, `getErrorCode`, mappatura errori
- **Output atteso**:
  - `app/frontend/src/types/roles.types.ts`: tipi completi di SPEC § DTO, con
    `RESERVED_PERMISSIONS` e `PERMISSION_CATEGORY_LABELS`.
  - `app/frontend/src/services/roles.service.ts`: 5 funzioni, path `app/admin/roles` e
    `app/admin/permissions` sull'istanza `api` esistente, JSDoc con metodo, path e permesso.
  - `app/frontend/src/utils/api.utils.ts`: `getErrorCode(err)`.
  - `app/frontend/src/utils/roles-errors.utils.ts`: `roleErrorMessage(err, fallback)` →
    `{ message, field?: 'code' } | null`, con `null` per i `403` senza codice di dominio (S37).
  - Test nuovi: `utils/api.utils.test.ts` (solo `getErrorCode`) e
    `utils/roles-errors.utils.test.ts` (un caso per ognuno degli 8 codici, più `403` generico e
    codice sconosciuto).
- **Dipendenze**: T2 (per `PermissionCode` in `roles.types.ts`)
- **Criterio di Done**: test verdi; `tsc` del frontend pulito; nessun import da `api.types.ts` per
  `description` dei ruoli.
- **Agente**: frontend-developer

### T4 — Utility e componente della matrice dei permessi
- **Output atteso**:
  - `app/frontend/src/utils/permission-matrix.utils.ts`: `isSelectable`, `categoryState`,
    `toggleCategory`, `isRoleAssignable` (S33–S34, S38), funzioni pure con JSDoc.
  - `app/frontend/src/pages/admin/PermissionMatrix.tsx`: props `groups`, `value`, `onChange`,
    `callerPermissions`, `readOnly`. Un blocco per categoria con checkbox di gruppo
    (`indeterminate`), checkbox per permesso, tooltip sui non selezionabili e contatore dei
    selezionati. Stile con CSS Module, se serve (`PermissionMatrix.module.css`).
  - Test nuovi: `utils/permission-matrix.utils.test.ts` (criteri 9–11) e
    `pages/admin/PermissionMatrix.test.tsx` (criterio 12).
- **Dipendenze**: T3
- **Criterio di Done**: criteri 9–12 verdi. Con i 20 codici reali (fixture copiata da una risposta
  di `GET permissions`) "Seleziona tutti" su Utenti produce 5 codici, non 6.
- **Agente**: frontend-developer

### T5 — `PageRoles`, drawer ruolo, rotta `/roles` e voce di navigazione
- **Output atteso**:
  - `app/frontend/src/pages/admin/RoleFormDrawer.tsx`: modalità `create`/`edit`/`view`, `useForm`
    con le validazioni di S35, differenza dei campi per il `PATCH`, uso di `PermissionMatrix`.
  - `app/frontend/src/pages/admin/PageRoles.tsx`: tabella, azioni per S32, `ConfirmModal` di
    eliminazione, gestione errori con `roleErrorMessage`, `refreshPermissions()` dopo ogni
    scrittura, catalogo caricato una volta e ricaricato su `INVALID_PERMISSION_CODE`.
  - `app/frontend/src/App.tsx`: rotta lazy `roles` protetta da
    `RequirePermission permission="roles:read"`.
  - `app/frontend/src/config/navigation.ts`: voce "Ruoli", `/roles`, `IconShieldLock`,
    `permission: 'roles:read'`, subito dopo "Utenti".
  - Test nuovi: `pages/admin/PageRoles.test.tsx` e `pages/admin/RoleFormDrawer.test.tsx`
    (criteri 13–18), con `roles.service` mockato e lo store impostato via `setState`.
- **Dipendenze**: T2, T3, T4
- **Criterio di Done**: criteri 13–18 verdi. Verifica manuale su backend locale (`npm run dev`)
  con SuperAdmin (creazione, modifica, eliminazione, `409` con un ruolo assegnato) e Admin (sola
  lettura), annotata nell'addendum.
- **Agente**: frontend-developer

### T6 — `PageUsers`: multi-select dei ruoli aggiuntivi
- **Output atteso**:
  - `app/frontend/src/services/admin.service.ts`: `UserDetail.roles: UserRoleSummary[]`,
    `roleGuids?: string[]` in `CreateUserRequest`/`UpdateUserRequest`.
  - `app/frontend/src/pages/admin/PageUsers.tsx`: `MultiSelect` "Ruoli aggiuntivi" in `<Can>`
    (S38); `fetchRoles` all'apertura del drawer se permesso; `fetchUser(guid)` in modifica;
    `roleGuids` nel payload solo se cambiato; errori di dominio via `roleErrorMessage`;
    `refreshPermissions()` se il bersaglio è l'utente corrente. `Select` "Ruolo", colonne, azioni
    di riga, impersonificazione e audit log restano invariati.
  - Test nuovo: `pages/admin/PageUsers.test.tsx` (criteri 19–25), con `admin.service`,
    `roles.service` e `auth.service` mockati.
- **Dipendenze**: T3, T4 (per `isRoleAssignable`). Indipendente da T5.
- **Criterio di Done**: criteri 19–25 verdi. Verifica manuale: un Admin assegna un ruolo
  personalizzato con `roles:read` a uno User; lo User, dopo un reload, vede la voce "Ruoli" e la
  pagina in sola lettura (ADR-99 § Conformità, lato UI).
- **Agente**: frontend-developer

### T7 — Verifica globale, non regressione, addendum SPEC
- **Output atteso**:
  - Esecuzione di `npm run test --workspace=app/frontend`, `npm run build --workspace=app/frontend`
    e `eslint` sui file toccati, con baseline registrata su `f1099b7` **prima** di T1.
  - Controllo del criterio 28 (`git diff f1099b7 -- app/backend docs/openapi.yaml
    app/frontend/src/types/api.types.ts bruno` vuoto).
  - `docs/ai/specs/SPEC-RBAC-F2b-frontend-ui.md` § "Addendum di implementazione": deviazioni,
    numeri dei test contro la baseline ed esito delle verifiche manuali di T5/T6. Checkbox del Task
    breakdown aggiornate.
  - Proposta di riga per `docs/ai/INDEX.md` (SPEC/PLAN F2b e ridenominazione F2c), **consegnata
    come testo** e non scritta sul file senza richiesta esplicita.
- **Dipendenze**: T1–T6
- **Criterio di Done**: criteri 26–28 verdi, o scostamenti documentati come preesistenti con la
  prova (stesso esito sulla baseline). Symlink `node_modules` rimosso.
- **Agente**: test-engineer

Parallelismo possibile: T5 e T6 dopo T4. Tutto il resto è sequenziale.

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Permessi mai caricati dopo il login in SPA (falla 6) | Alta senza T1 | Alto | `login()` → `refreshPermissions()`; criterio 2 |
| Redirect da `/roles` alla dashboard durante il caricamento (falla 7) | Media | Medio | `permissions: null` distinto da `[]`, loader in `RequirePermission`; criterio 7 |
| "Seleziona tutti" su Utenti include `roles:manage` → `400` | Alta con un'implementazione ingenua | Medio | `toggleCategory` esclude i non selezionabili; criterio 11 e verifica con 20 codici reali in T4 |
| Un ruolo modificato perde in silenzio un codice non selezionabile | Bassa | Alto | `toggleCategory` preserva i non selezionabili; criterio 11 |
| `PATCH` utente invia `roleGuids` non toccati → audit spurio o `403` per chi non ha il permesso | Media | Medio | Invio solo se cambiato; criterio 21 |
| Regressione della sidebar per i 4 ruoli esistenti dopo il refactor del filtro | Bassa | Medio | `isNavigationItemVisible` più test tabellare; criterio 8 |
| Divergenza fra `RESERVED_PERMISSIONS` frontend e `SYSTEM_RESERVED_PERMISSIONS` backend | Bassa | Basso | Il backend resta l'autorità (`400 RESERVED_PERMISSION` gestito, S37); commento incrociato nel codice |
| Permessi stantii nella UI dopo una modifica fatta da altri | Media | Basso | Dichiarato (ADR-99 (e)); il backend rifiuta con `403`; reload o prossimo login |
| Tipi manuali che divergono dal contratto F2a | Bassa | Medio | Debito dichiarato (falla 8); correzione backend e rigenerazione in un task separato |
| Build/test del frontend falliti nel worktree per `node_modules` assenti | Alta | Basso | Symlink temporaneo documentato; baseline presa nello stesso ambiente |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] Tutti i task implementati
- [ ] Nessun `any` TypeScript senza commento
- [ ] Nessun `console.log` rimasto
- [ ] Ogni funzione pubblica con JSDoc
- [ ] Solo Mantine v7 e `@tabler/icons-react`; chiamate HTTP solo da `src/services/`

### Test
- [ ] Unit test scritti e superati (Vitest: store, hook, `<Can>`, utility, mappatura errori)
- [ ] Integration test dei componenti scritti e superati (Vitest + Testing Library: matrice,
      drawer, `PageRoles`, `PageUsers`)
- [ ] Collezioni Bruno: **non applicabile** (nessun endpoint nuovo o modificato)
- [ ] Mock per servizi esterni: service Axios mockati, nessuna chiamata HTTP reale
- [ ] Nessun test placeholder (`expect(true).toBe(true)`)
- [ ] E2E Playwright: **fuori perimetro**, raccomandato come follow-up (`e2e/tests/roles.spec.ts`:
      SuperAdmin crea un ruolo e lo assegna, l'utente vede `/roles` dopo il reload)

### Build e qualità
- [ ] `npm run build --workspace=app/backend`: **non applicabile** (backend non toccato; criterio 28)
- [ ] `npm run build --workspace=app/frontend` superata
- [ ] Lint superato sui file toccati
- [ ] Code review completata

### Contratti e documentazione
- [ ] `npm run openapi:export` / `openapi:types`: **non applicabile** (nessun endpoint cambiato)
- [ ] Spec aggiornata con l'addendum di implementazione (T7)
- [ ] `docs/ai/INDEX.md`: riga proposta come testo, scritta solo su richiesta esplicita
- [ ] `docs/ai/progress-tracker.md` aggiornato solo su richiesta esplicita a fine feature

### Commit
- [ ] Commit atomico per task con messaggio Conventional Commits
- [ ] Branch `feature/rbac-f1-permessi` aggiornato (nessun branch nuovo, come F1/F2a)
