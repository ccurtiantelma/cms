# Spec — RBAC F2b Frontend: permessi in `useAuthStore`, `useHasPermission`/`<Can>`, pagina Ruoli, ruoli aggiuntivi in `PageUsers`

> **Stato**: [ ] Bozza in attesa di approvazione · [x] **Approvata** · [ ] Rifiutata
> Redatta il 2026-09-24 sul branch `feature/rbac-f1-permessi` (F2a chiusa al commit `f1099b7`).
>
> **Approvazione**: approvata così com'è, con le assunzioni S24–S38 e le divergenze dal prompt di
> origine elencate in PLAN § "Audit strategico". Firma apposta su richiesta esplicita del prompt di
> implementazione della Fase 2b, che vale anche come richiesta esplicita della Documentation Policy
> per la riga di `docs/ai/INDEX.md` (SPEC/PLAN F2b e ridenominazione dell'enforcement `media:*` in
> F2c, S24).
>
> Firma: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## Feature di riferimento

Nessun file in `docs/ai/features/`: stessa scelta di F1 e F2a. Il documento di origine è
`docs/ai/adr/ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md` § Decisione punto 10 (frontend),
con il contratto HTTP consegnato da `docs/ai/specs/SPEC-RBAC-F2a-backend-api.md` (approvata e
implementata).

L'etichetta "F2b" di questo documento corrisponde alla **F3** di ADR-99 § 11. Vedi S24: la
SPEC F2a (S11) usava già "F2b" per l'enforcement `media:*` su `app/files`.

Plan collegato: `docs/ai/plans/PLAN-RBAC-F2b-frontend-ui.md`.

## ADR applicabili

- `ADR-99-rbac-dinamico-ruoli-e-permessi-granulari.md`: **vincolante**, § Decisione punto 10
  (rotta `/roles`, voce di navigazione con `permission`, `permissions` in `useAuthStore`,
  `useHasPermission`/`<Can>` "solo UX", `PageUsers` che **mantiene** il select del livello base e
  **aggiunge** il multi-select, matrice a checkbox per categoria con "Seleziona tutti"), punto 8
  (anti-escalation), § Conseguenze (e) (UI aggiornata al successivo `GET /auth/me`), § "Decisione
  umana" P2 (`roles:manage` al solo SuperAdmin) e P3 (ruoli di sistema in sola lettura).
- `SPEC-RBAC-F2a-backend-api.md`: vincolante per il contratto consumato. Rotte e codici d'errore
  di § "Endpoint API", S16 (`RolesController` senza `GuardAdmin`), S18 (semantica di `roleGuids`),
  S19 (`roles` nel dettaglio utente) e S20 (`permissions` in `auth/me`).
- `ADR-17-state-management-zustand.md`: `useAuthStore` resta l'unico punto d'ingresso dello stato
  di autenticazione.
- `docs/constitution.md` § Stack immutabile/Frontend (Mantine v7 esclusivo, `@tabler/icons-react`,
  `useForm`, `notifications.show()`), § Error Handling Policy/Frontend (interceptor Axios
  invariato), § Convenzioni frontend (API solo da `src/services/`, `hooks/` e `types/` flat).

## Outcomes tecnici

Al termine della F2b:

1. `useAuthStore` espone `permissions: string[] | null` e `refreshPermissions()`. I permessi si
   caricano all'avvio (`init`), **dopo ogni login** (password e MFA) e su richiesta.
2. Hook `useHasPermission(code | codes[])` e componente `<Can>` in `src/hooks/` e
   `src/components/`. Guard di rotta `RequirePermission`.
3. `NavigationItem` acquisisce `permission?`. Nuova voce "Ruoli" su `/roles`.
4. Pagina `src/pages/admin/PageRoles.tsx` su `/roles`, con tabella dei ruoli, drawer
   Crea/Modifica/Visualizza, matrice dei permessi per categoria ed eliminazione con conferma.
5. `src/services/roles.service.ts` e `src/types/roles.types.ts` per le 5 rotte F2a
   (`GET/POST roles`, `PATCH/DELETE roles/:guid`, `GET permissions`).
6. `PageUsers` con il multi-select "Ruoli aggiuntivi" (`roleGuids`) accanto al select "Ruolo",
   che resta invariato.
7. Unit e integration test Vitest + Testing Library per tutto quanto sopra.

Nessuna modifica a `app/backend/`, `docs/openapi.yaml`, `api.types.ts` e `bruno/`.

## In scope

- Stato permessi nello store, caricamento post-login, refresh esplicito.
- `useHasPermission`, `<Can>`, `RequirePermission`, filtro della navigazione per permesso.
- Pagina Ruoli completa: lettura per chi ha `roles:read`, scrittura per chi ha `roles:manage`.
- Gestione dei codici d'errore del contratto F2a con messaggi dedicati.
- Multi-select dei ruoli aggiuntivi in creazione e modifica utente.
- Test unitari e di integrazione dei componenti.

## Out of scope

- **Enforcement `media:*` su `app/files`**: la "F2b" di SPEC F2a S11, rinominata **F2c** (S24).
  Richiede una SPEC propria.
- Migrazione di altre rotte o voci di navigazione da `roles: AppUserRoles[]` a `permission`.
  `/users`, `/global-sections`, `/site-templates` e `/theme-editor` restano sulle soglie, come i
  rispettivi guard backend (`GuardAdmin`/`GuardManager`/`GuardSuperAdmin`).
- Colonna "Ruoli aggiuntivi" nella **lista** utenti: `GET app/admin/users` non restituisce
  `roles` (SPEC F2a S19).
- Conteggio degli utenti per ruolo nella tabella dei ruoli: nessuna API lo espone. L'unico conteggio
  disponibile è nel messaggio di `409 ROLE_IN_USE`.
- Push realtime o polling dei permessi, e refresh automatico su `403` (ADR-99 § Conseguenze (e)).
- E2E Playwright in `e2e/`: follow-up raccomandato nel PLAN, non richiesto dal perimetro.
- Correzione del tipo generato di `description` (S36): richiede una modifica backend.
- Modifiche all'interceptor Axios (`services/api.ts`).
- `docs/ai/progress-tracker.md`, `docs/ai/INDEX.md`: solo su richiesta esplicita.

## Vincoli e assunzioni

**Vincoli**:

- Nessuna dipendenza npm nuova. Componenti Mantine v7 già in uso (`Table` via `ResponsiveTable`,
  `FormDrawer`, `ConfirmModal`, `Checkbox`, `MultiSelect`, `Badge`, `Tooltip`), icone
  `@tabler/icons-react`.
- Chiamate HTTP solo da `src/services/roles.service.ts` e `src/services/admin.service.ts`.
- Nessun test esistente viene modificato per passare. `PageUsers`, `useAuth`, `App.tsx`,
  `LayoutProtected` e `navigation.ts` oggi non hanno test: quelli della F2b nascono come file nuovi.
  `PagePages.test.tsx` e `PagePageDetail.test.tsx` impostano `useAuthStore` con `setState`
  parziale: il campo nuovo `permissions` resta al default `null`, e i due file non si toccano.
- Permessi e guard frontend sono **solo UX** (ADR-99 § 10). Ogni scelta di questa SPEC presuppone
  che il backend rifiuti comunque ciò che la UI lascia passare.

**Assunzioni** (continuano la numerazione S1–S23 di F1/F2a; ciascuna va approvata):

| # | Assunzione | Motivo |
|---|---|---|
| S24 | "F2b" indica qui la **F3 di ADR-99 § 11** (frontend). L'enforcement `media:*` su `app/files`, chiamato "F2b" in SPEC F2a S11, diventa **F2c**. La SPEC F2a, approvata, non viene riscritta: la ridenominazione vive qui e nella nota di `INDEX.md` da aggiungere alla firma | Nomi dei file imposti dal prompt di task. Senza questa assunzione due documenti userebbero la stessa etichetta per due fasi diverse |
| S25 | `useAuthStore.permissions: string[] \| null`. `null` = non ancora caricati, `[]` = nessun permesso. **Non** si persiste in `localStorage` (a differenza di `user`), e `logout` lo azzera | I permessi sono solo UX, ma un valore letto da cache locale sarebbe stantio proprio dopo un cambio ruoli. `null` distingue "in caricamento" da "negato" ed evita redirect prematuri (S28) |
| S26 | Punti di caricamento: (a) `init()`, dalla risposta della `GET /auth/me` che fa già; (b) **`login()`**, che dopo aver salvato token e utente chiama `refreshPermissions()`; (c) `refreshPermissions()` pubblico, invocato dopo le mutazioni che possono cambiare i permessi dell'utente corrente (S35, S38). Se `refreshPermissions` fallisce, `permissions` diventa `[]` (UX fail-closed) e la sessione **non** viene chiusa. Richieste concorrenti condividono la stessa promise | **Falla del codice attuale**: `init()` è no-op dopo il primo mount (`initStarted`), e il login da `PageLogin` naviga in SPA senza ricaricare. Senza (b) i permessi resterebbero `null` per tutta la sessione dopo ogni login. La deduplica tiene basso il carico sul rate-limit di `auth/*` citato in `useAuth.ts` |
| S27 | `useHasPermission(code: PermissionCode \| readonly PermissionCode[]): boolean`. Con un array vale la semantica **AND** di `PermissionsGuard`. Restituisce `false` finché `permissions` è `null`. **Nessuna scorciatoia sul ruolo** (il SuperAdmin passa perché la sua lista contiene tutti i codici) | Stessa semantica del backend e una sola fonte di verità per la UI |
| S28 | `RequirePermission({ permission, children })`, in `App.tsx` accanto a `RequireRole`: loader se `permissions` è `null` e c'è un token, redirect a `homePathForRole` se manca il permesso, altrimenti i figli | Con `user` letto da `localStorage` le rotte si montano prima della `GET /auth/me`: un guard che leggesse `false` durante il caricamento rimbalzerebbe l'utente autorizzato alla dashboard |
| S29 | `PermissionCode` nel frontend è una union dei **soli codici letti dalla UI** (`'roles:read' \| 'roles:manage' \| 'users:assign_roles'`), in `src/types/roles.types.ts`, da estendere quando nasce un nuovo consumer. Non si duplica il registro backend | Protegge dai refusi senza creare una seconda copia dei 20 codici del registro da tenere allineata a mano. Il catalogo della matrice arriva da `GET permissions`, non da questa union |
| S30 | `<Can permission children fallback?>`. `children` può essere un nodo (mostrato solo se permesso, altrimenti `fallback`, default `null`) o una funzione `(allowed: boolean) => ReactNode` per **disabilitare** invece di nascondere. Nessun `cloneElement` | Copre "nascondere o disabilitare" senza dipendere dal fatto che il figlio accetti `disabled` |
| S31 | Rotta **`/roles`** (non `/admin/roles`), sotto `LayoutProtected`, protetta da `RequirePermission permission="roles:read"`. Voce di navigazione "Ruoli" (`IconShieldLock`) con `permission: 'roles:read'` e **senza** `roles`. Il filtro della sidebar diventa: `roles` rispettato se presente **e** `permission` rispettato se presente | ADR-99 § 10 e coerenza con `/users`. Senza `roles` un `User` con un ruolo personalizzato contenente `roles:read` vede la pagina, come il backend consente (SPEC F2a S16) |
| S32 | **Scrittura riservata a `roles:manage`**, cioè di fatto al solo SuperAdmin (P2). Senza `roles:manage` (Admin incluso) la pagina è in sola lettura: niente "Nuovo ruolo", e l'unica azione di riga è "Visualizza". I **ruoli di sistema** sono sempre in sola lettura: "Modifica" ed "Elimina" nascoste, "Visualizza" presente, badge "Sistema" con icona lucchetto. "Disabilitare" si realizza nascondendo l'azione, perché `ResponsiveTableAction` supporta solo `hidden` | P2 e P3. Mostrare pulsanti che producono sempre `403` sarebbe un difetto di UX. Estendere `ResponsiveTable` con `disabled` è fuori perimetro |
| S33 | **Matrice dei permessi** alimentata da `GET permissions`: gruppi nell'ordine del backend, etichette di categoria mappate nel frontend (`pages`→Pagine, `structure`→Struttura, `media`→Media, `forms`→Moduli, `settings`→Impostazioni, `users`→Utenti). Una categoria sconosciuta mostra il codice grezzo. Ogni permesso ha checkbox, `description` come etichetta e `code` come testo secondario. Un codice **non selezionabile** ha la checkbox disabilitata con tooltip, per due motivi: è riservato (`roles:manage`, costante frontend `RESERVED_PERMISSIONS` che rispecchia `SYSTEM_RESERVED_PERMISSIONS`) oppure il chiamante non lo possiede (anti-escalation, ADR-99 § 8) | Le categorie reali sono 6, non le 4 del prompt, e il catalogo può crescere: la matrice non va codificata a mano. La duplicazione di `roles:manage` è dichiarata: se diverge, il backend risponde comunque `400 RESERVED_PERMISSION` (S35) |
| S34 | **"Seleziona tutti" per categoria**: checkbox in testa al gruppo, `checked` se tutti i codici selezionabili del gruppo sono selezionati e `indeterminate` se solo alcuni. Un clic seleziona o deseleziona **solo i codici selezionabili**, e i non selezionabili mantengono lo stato che avevano. Una categoria senza codici selezionabili ha la checkbox di gruppo disabilitata | Evita che "Seleziona tutti" su Utenti includa `roles:manage` (→ `400`), e che un ruolo modificato perda in silenzio un codice che il chiamante non può rimettere |
| S35 | **Form ruolo** (`useForm`): `code` solo in creazione, validato lato client con lo stesso pattern di `ROLE_CODE_PATTERN` (`^[a-z][a-z0-9_]{2,49}$`); `name` obbligatorio, massimo 100; `description` opzionale, massimo 500, stringa vuota → `null`; `permissionCodes` può essere vuoto (il backend lo accetta). In modifica il `PATCH` invia **solo i campi cambiati**; se non è cambiato nulla il drawer si chiude senza richiesta (il backend risponderebbe `400` al body vuoto). Dopo ogni scrittura riuscita: toast verde, ricarica della lista e `refreshPermissions()` | Il pattern lato client è solo UX, e il `400 INVALID_ROLE_CODE` resta gestito. Il refresh copre il caso, oggi teorico, di un ruolo assegnato al chiamante stesso |
| S36 | **Tipi locali** in `src/types/roles.types.ts` (`RoleRecord`, `PermissionGroup`, `PermissionItem`, `UserRoleSummary`, `CreateRolePayload`, `UpdateRolePayload`), scritti a mano sul contratto di SPEC F2a e **non** derivati da `api.types.ts` per `description` | Il tipo generato di `CreateRoleDto.description`/`UpdateRoleDto.description` è `Record<string, never> \| null`, un difetto dell'annotazione Swagger di un campo stringa nullable. Anche `roles` del dettaglio utente non ha schema (la risposta è descritta solo a testo). Correzione backend fuori perimetro: debito dichiarato nel PLAN |
| S37 | **Errori.** Nuovo helper `getErrorCode(err): string \| undefined` in `utils/api.utils.ts`, accanto a `getErrorMessage`. Mappatura in `utils/roles-errors.utils.ts`, un messaggio per codice: `RESERVED_PERMISSION`, `ROLE_IN_USE` (usa il messaggio del backend, che contiene il numero di utenti), `ROLE_CODE_DUPLICATE` e `INVALID_ROLE_CODE` (anche come errore del campo `code`), `INVALID_PERMISSION_CODE` (con ricarica del catalogo, che è stantio), `SYSTEM_ROLE_READONLY`, `PERMISSION_ESCALATION`, `SYSTEM_ROLE_NOT_ASSIGNABLE`. Toast rosso via `notifications.show`. Un `403` **senza** codice di dominio (guard) non riceve un secondo toast dalla pagina: basta quello dell'interceptor. Un `404` chiude il drawer e ricarica la lista | L'interceptor mostra già "Permessi insufficienti" su ogni `403` e "Risorsa non trovata" su ogni `404`, e la constitution lo fissa. Per i `403` di dominio il doppio toast (generico + specifico) resta: è accettato e dichiarato, perché toglierlo richiederebbe di toccare l'interceptor |
| S38 | **`PageUsers`**: il `Select` "Ruolo" (livello base, `role`) **resta invariato**. Si aggiunge `MultiSelect` "Ruoli aggiuntivi", avvolto in `<Can permission={['users:assign_roles', 'roles:read']}>`. Le opzioni sono i ruoli di `GET roles` con `isSystem === false` (etichetta `name`, codice come descrizione), caricati una volta all'apertura del drawer. Un'opzione i cui permessi non sono tutti posseduti dal chiamante è disabilitata (anti-escalation, UX). In modifica il drawer chiama `fetchUser(guid)` per precompilare `roles` (oggi usa la riga della lista, che non li contiene), e mostra un loader nel campo. `roleGuids` si invia **solo se l'insieme è cambiato** rispetto al valore iniziale; in creazione solo se non vuoto. Se il bersaglio è l'utente corrente, dopo il salvataggio si chiama `refreshPermissions()`. `UserDetail` acquisisce `roles: UserRoleSummary[]`, `CreateUserRequest`/`UpdateUserRequest` acquisiscono `roleGuids?: string[]` | ADR-99 § 10 ("mantiene il select del livello base e aggiunge un multi-select"). Il prompt chiedeva di sostituirlo, ma il backend rifiuta i ruoli di sistema in `roleGuids` (`SYSTEM_ROLE_NOT_ASSIGNABLE`) e `users.role` resta la fonte dei guard a soglia: senza il select non si potrebbe più cambiare livello. Inviare `roleGuids` solo se cambiato evita audit `user.roles.update` superflui e rispetta S18 |

## Schema DB (Drizzle)

### Tabelle nuove

Nessuna (fase solo frontend).

### Tabelle modificate

Nessuna.

## Endpoint API

Nessun endpoint nuovo o modificato. Endpoint **consumati** (contratto di SPEC F2a, invariato):

| Metodo e path (`api/v1/…`) | Consumer frontend | Permesso backend |
|---|---|---|
| `GET auth/me` → `permissions: string[]` | `useAuthStore.init`, `refreshPermissions` | autenticato |
| `GET app/admin/roles` | `PageRoles`, `PageUsers` (opzioni del multi-select) | `roles:read` |
| `POST app/admin/roles` | drawer ruolo (creazione) | `roles:manage` |
| `PATCH app/admin/roles/:guid` | drawer ruolo (modifica) | `roles:manage` |
| `DELETE app/admin/roles/:guid` → `204` | conferma di eliminazione | `roles:manage` |
| `GET app/admin/permissions` | matrice dei permessi | `roles:read` |
| `GET app/admin/users/:guid` → `roles` | `PageUsers`, apertura in modifica | `GuardAdmin` |
| `POST`/`PATCH app/admin/users[/:guid]` + `roleGuids` | `PageUsers`, salvataggio | `GuardAdmin` + `users:assign_roles` |

## DTO

Nessun DTO backend. Tipi frontend (S36), in `app/frontend/src/types/roles.types.ts`:

```typescript
/** Codici permesso letti dalla UI (S29). Si estende quando nasce un nuovo consumer. */
export type PermissionCode = 'roles:read' | 'roles:manage' | 'users:assign_roles';

/** Specchio di `SYSTEM_RESERVED_PERMISSIONS` (backend): mai selezionabili in un ruolo personalizzato. */
export const RESERVED_PERMISSIONS: readonly string[] = ['roles:manage'];

export type PermissionCategory = 'pages' | 'structure' | 'media' | 'forms' | 'settings' | 'users';

export interface PermissionItem {
  code: string;
  description: string | null;
}

export interface PermissionGroup {
  /** Stringa aperta: una categoria nuova del backend non rompe la UI (S33). */
  category: PermissionCategory | (string & {});
  permissions: PermissionItem[];
}

export interface RoleRecord {
  guid: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Valore `AppUserRoles` per i ruoli di sistema, `null` per i personalizzati. */
  level: number | null;
  permissions: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateRolePayload {
  code: string;
  name: string;
  description?: string | null;
  permissionCodes: string[];
}

/** Almeno un campo (S35); `code` non ammesso (SPEC F2a S23). */
export type UpdateRolePayload = Partial<Omit<CreateRolePayload, 'code'>>;

export interface UserRoleSummary {
  guid: string;
  code: string;
  name: string;
}
```

Firme pubbliche nuove:

```typescript
// src/services/roles.service.ts
export function fetchRoles(): Promise<RoleRecord[]>;
export function fetchPermissionCatalog(): Promise<PermissionGroup[]>;
export function createRole(payload: CreateRolePayload): Promise<{ guid: string }>;
export function updateRole(guid: string, payload: UpdateRolePayload): Promise<{ guid: string }>;
export function deleteRole(guid: string): Promise<void>;

// src/hooks/useAuth.ts — campi aggiunti a AuthStoreState
permissions: string[] | null;
refreshPermissions: () => Promise<void>;

// src/hooks/useHasPermission.ts
export function useHasPermission(code: PermissionCode | readonly PermissionCode[]): boolean;

// src/components/Can.tsx
interface CanProps {
  permission: PermissionCode | readonly PermissionCode[];
  children: ReactNode | ((allowed: boolean) => ReactNode);
  fallback?: ReactNode;
}

// src/utils/api.utils.ts
export function getErrorCode(err: unknown): string | undefined;

// src/utils/permission-matrix.utils.ts (funzioni pure, S33–S34)
export function isSelectable(code: string, callerPermissions: readonly string[]): boolean;
export function categoryState(
  group: PermissionGroup, selected: readonly string[], callerPermissions: readonly string[],
): { checked: boolean; indeterminate: boolean; disabled: boolean };
export function toggleCategory(
  group: PermissionGroup, selected: readonly string[], callerPermissions: readonly string[],
): string[];
export function isRoleAssignable(role: RoleRecord, callerPermissions: readonly string[]): boolean;
```

`MeResponse` (`types/auth.types.ts`) acquisisce `permissions: string[]`.

## Contratti WebSocket (se applicabile)

Non applicabile (ADR-99 § Conseguenze (e)).

## Comportamento UI

### Pagina Ruoli (`/roles`)

- `PageHeader` "Ruoli e permessi". Pulsante "Nuovo ruolo" dentro `<Can permission="roles:manage">`.
- `ResponsiveTable`, senza paginazione né ricerca server (la lista è piccola e l'API non pagina).
  Ordine del backend: prima quelli di sistema, poi i personalizzati per nome. Colonne:
  - **Nome**, con `description` come testo secondario;
  - **Codice**, monospace;
  - **Tipo**: badge "Sistema" con lucchetto, oppure "Personalizzato";
  - **Permessi**: i primi 4 codici come `Badge`, poi "+N" con `Tooltip` che elenca gli altri;
    "Nessun permesso" se la lista è vuota.
- Azioni di riga (S32): "Visualizza" (sistema, o chiamante senza `roles:manage`), "Modifica" ed
  "Elimina" (personalizzato **e** `roles:manage`).
- Stato vuoto dei ruoli personalizzati: i 4 ruoli di sistema ci sono sempre. Sotto la tabella,
  un testo guida invita a crearne uno, visibile solo con `roles:manage`.
- Errore di caricamento: toast più un `Alert` in pagina con un pulsante "Riprova".

### Drawer ruolo (`FormDrawer`)

- Tre modalità: `create`, `edit` e `view` (tutti i campi e la matrice disabilitati, nessun pulsante
  di salvataggio).
- Campi: Codice (solo `create`; in `edit`/`view` è testo in sola lettura), Nome, Descrizione
  (`Textarea`), Matrice permessi.
- Il catalogo si carica all'apertura, una volta per montaggio della pagina, e resta in cache nello
  stato della pagina. Loader nella sezione matrice finché non arriva.
- Un contatore "N permessi selezionati" accanto al titolo della matrice.

### Eliminazione

- `ConfirmModal` con il nome del ruolo. Conferma → `DELETE`. `204`: toast verde e lista ricaricata.
  `409 ROLE_IN_USE`: toast rosso con il messaggio del backend (numero di utenti) e l'indicazione di
  rimuovere prima il ruolo dagli utenti; la modale si chiude e la lista resta invariata.

### `PageUsers`

- Nel drawer, sotto "Ruolo": `MultiSelect` "Ruoli aggiuntivi", `searchable`, `clearable`, con
  descrizione "Permessi aggiuntivi rispetto al ruolo base. Non riducono i permessi del ruolo base."
  (ADR-99 § Conseguenze (b)).
- Nascosto per chi non ha `users:assign_roles` **e** `roles:read` (S38).

## Task breakdown

Dettaglio operativo, dipendenze e agenti in `PLAN-RBAC-F2b-frontend-ui.md`.

- [ ] T1 — `useAuthStore`: `permissions`, `refreshPermissions`, caricamento post-login
- [ ] T2 — `useHasPermission`, `<Can>`, `RequirePermission`, `permission` nella navigazione
- [ ] T3 — Tipi, service ruoli, `getErrorCode`, mappatura errori
- [ ] T4 — Utility e componente della matrice dei permessi
- [ ] T5 — `PageRoles`, drawer ruolo, rotta `/roles` e voce di navigazione
- [ ] T6 — `PageUsers`: multi-select dei ruoli aggiuntivi
- [ ] T7 — Verifica globale, non regressione, addendum SPEC

## Criteri di verifica

Tutti in Vitest + Testing Library (`renderWithProviders`), con i service mockati via `vi.mock`.
Nessuna chiamata HTTP reale.

**Store e autorizzazione**

1. `init()` con `GET /auth/me` riuscita → `permissions` uguale all'array della risposta. Senza
   token → `permissions` resta `null` e `isLoading` diventa `false`.
2. `login(token, user)` → una chiamata a `getMeApi` e `permissions` valorizzati. Con `getMeApi` in
   errore → `permissions: []`, `user` e token intatti.
3. Due `refreshPermissions()` concorrenti → una sola chiamata a `getMeApi`.
4. `logout()` → `permissions: null`.
5. `useHasPermission`: `null` → `false`; codice presente → `true`; assente → `false`; array →
   `true` solo se tutti presenti. Per un SuperAdmin con una lista che non contiene il codice →
   `false` (nessuna scorciatoia di ruolo, S27).
6. `<Can>`: nodo figlio mostrato o nascosto; `fallback` mostrato se negato; funzione figlia
   chiamata con `true`/`false`.
7. `RequirePermission`: loader con `permissions: null` e token presente, redirect a `/dashboard`
   se il permesso manca, figli con il permesso.
8. Filtro della navigazione: la voce "Ruoli" è visibile a un `User` con `roles:read` e nascosta a
   un Admin senza (`roles`/`permission` in AND). Le voci esistenti mantengono la visibilità attuale
   per i 4 ruoli (test tabellare).

**Matrice (funzioni pure e componente)**

9. `isSelectable`: `roles:manage` → `false` anche per chi lo possiede; codice non posseduto →
   `false`; posseduto → `true`.
10. `categoryState`: nessuno, alcuni o tutti i selezionabili → `checked`/`indeterminate` corretti.
    Gruppo con soli codici riservati → `disabled`.
11. `toggleCategory` sul gruppo `users` con chiamante SuperAdmin → tutti i codici **tranne**
    `roles:manage`. Secondo clic → deselezionati. Un codice non selezionabile già presente nel
    ruolo resta in entrambi i passaggi.
12. Componente: 6 gruppi con le etichette italiane; categoria sconosciuta con il codice grezzo;
    checkbox di `roles:manage` disabilitata con tooltip; in `view` tutte disabilitate.

**Pagina Ruoli**

13. Tabella: righe ordinate come nella risposta, badge "Sistema" sui 4 ruoli di sistema, "+N" oltre
    4 permessi.
14. Chiamante SuperAdmin: "Nuovo ruolo" visibile; "Modifica"/"Elimina" solo sui personalizzati,
    "Visualizza" sui ruoli di sistema. Chiamante Admin (`roles:read` senza `roles:manage`): nessun
    "Nuovo ruolo", solo "Visualizza" su tutte le righe.
15. Creazione: il submit invia `{ code, name, description: null, permissionCodes }` con i codici
    selezionati; con `code` `Bad-Code` il form blocca l'invio con errore di campo.
16. Modifica: il `PATCH` contiene solo i campi cambiati e mai `code`; senza modifiche nessuna
    chiamata e il drawer si chiude.
17. Errori: `400 RESERVED_PERMISSION` → toast dedicato; `409 ROLE_CODE_DUPLICATE` → errore sul campo
    Codice; `409 ROLE_IN_USE` su `DELETE` → toast con il messaggio del backend e la riga ancora
    presente; `400 INVALID_PERMISSION_CODE` → catalogo ricaricato; `403` senza codice di dominio →
    nessun toast della pagina (solo l'interceptor, non montato nei test).
18. Dopo ogni scrittura riuscita: `fetchRoles` richiamato e `refreshPermissions` chiamato.

**`PageUsers`**

19. Con `users:assign_roles` e `roles:read`: `MultiSelect` presente, opzioni solo non di sistema. Il
    `Select` "Ruolo" è ancora presente, con le stesse opzioni di prima.
20. Senza uno dei due permessi: `MultiSelect` assente, nessuna chiamata a `fetchRoles`.
21. Modifica: `fetchUser(guid)` chiamato all'apertura e i ruoli precompilati. Salvataggio senza
    toccare il campo → payload **senza** `roleGuids`. Con un ruolo tolto → `roleGuids` con
    l'insieme nuovo. Svuotato → `roleGuids: []`.
22. Creazione con il campo vuoto → payload senza `roleGuids`.
23. Ruolo con un permesso che il chiamante non possiede → opzione disabilitata.
24. Salvataggio dell'utente corrente → `refreshPermissions` chiamato; di un altro utente → no.
25. `400 SYSTEM_ROLE_NOT_ASSIGNABLE`/`403 PERMISSION_ESCALATION` → toast dedicato, drawer aperto.

**Non regressione**

26. `npm run test --workspace=app/frontend` verde, a parità dei 4 falliti preesistenti documentati
    in SPEC F2a § Addendum (`PropertyInspector.test.tsx`, `resize-handle.utils.test.ts`), se
    ancora presenti sul branch. `PagePages.test.tsx`, `PagePageDetail.test.tsx` e
    `ResponsiveTable.test.tsx` passano senza modifiche.
27. `npm run build --workspace=app/frontend` verde. `eslint` pulito sui file toccati.
28. `git diff f1099b7 -- app/backend docs/openapi.yaml app/frontend/src/types/api.types.ts bruno`
    vuoto.
