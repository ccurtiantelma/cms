# ADR-99 — RBAC dinamico: ruoli personalizzati e permessi granulari, in strato additivo sopra le soglie `AppUserRoles`

## Status

[ ] In discussione · [x] **Approvata** (con modifiche, vedi "Decisione umana") · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

2026-09-24 — approvata da: marketing@antelmagroup.net, conferma esplicita in sede di task (scelta
"Firmo ora + SPEC/PLAN" alla domanda posta in sessione, dopo aver rilevato che il prompt ricevuto
dichiarava l'ADR "firmata" mentre il file era ancora "In discussione"). Stesso pattern di
autorizzazione di ADR-91/92/94/96/97. Punti aperti P1–P6 risolti in "Decisione umana" in coda.

Redazione originale: scelta "Prima ADR, poi codice" (2026-09-24, marketing@antelmagroup.net).

Firma: marketing@antelmagroup.net · Data: 2026-09-24 · Firmatario: marketing@antelmagroup.net

## RFC di riferimento

Nessuna RFC dedicata. Origine: richiesta di task del 2026-09-24 ("RBAC con permessi granulari e
dinamici", gestibili via API e UI). Il prompt di origine partiva da premesse non corrispondenti al
repo (enum `UserRole` ADMIN/EDITOR/USER, prefisso `/admin/*`, cache "legata alla sessione"): le
correzioni sono in § Contesto e prevalgono sul prompt.

## ADR e regole di riferimento

**Superate parzialmente da questa ADR, se firmata** (le decisioni operative restano valide):

- `docs/business-rules.md` **A4** (2026-08-17, ccurti): "nessun ruolo nuovo". Questa ADR è la
  riapertura esplicita di A4 con un fatto nuovo (richiesta di ruoli/permessi gestibili da UI senza
  modifiche al codice). Resta valida la mappatura 4 soglie → permessi editoriali, che diventa il
  **seed dei ruoli di sistema**.
- `docs/constitution.md` § "Base tecnica già presente" e § "Security Policy — Security by Design"
  (voce Autorizzazione): "RBAC a soglie". Diventa "RBAC a soglie + permessi granulari" (testo in "Documenti da aggiornare").
- `ADR-18-ownership-per-riga.md` § "Alternative valutate", riga "Nuovi ruoli editoriali": scartata
  *per A4*, motivo che questa ADR rimuove. **D1–D5 di ADR-18 restano integralmente vigenti**
  (ownership per riga nel service, `hasElevatedRowAccess`, soglie di elevazione).

**Non modificate, in relazione:**

- `ADR-90-custom-fonts-code-e-role-manager.md` § 3 (in discussione): `editorProfile` è un profilo
  **restrittivo** dentro `User`/`Manager`; questa ADR è **additiva**. Sono ortogonali; la sorte di
  § 3 è il punto aperto P5.
- `ADR-13-gestione-sessioni-dispositivi.md`: chiavi Redis `login:${token}`, `session:${id}`,
  `user-sessions:${userId}` — non toccate.
- `ADR-8-storage-abstraction-files.md`: MinIO è solo un endpoint S3-compatibile dietro
  `StorageDriver`; nessun accesso diretto del client al bucket.
- `ADR-17-state-management-zustand.md`: lo store `useAuthStore` resta il punto d'ingresso frontend.
- `constitution.md` Principio 8 (superficie pubblica ≠ amministrativa).

## Contesto

Stato reale del codice (verificato 2026-09-24):

- Il ruolo è un intero `users.role` (`AppUserRoles`: SuperAdmin 5, Admin 10, Manager 20, User 30;
  numero minore = privilegio maggiore). Non esistono `UserRole`, EDITOR, tabelle `roles`/`permissions`.
- Il ruolo è nel payload JWT (`role`) e in `login:${token}`; access token 15 min. Un cambio ruolo
  oggi si propaga solo al refresh successivo.
- I guard sono `requireRole(minRole)` a soglia (`GuardSuperAdmin`/`GuardAdmin`/`GuardManager`,
  `auth/guard.ts`), ~50 occorrenze in 15 file. In più: soglie nei service (`pages.service.ts`,
  `files.service.ts`, `settings.service.ts`, `admin.service.ts`), `common/ownership.ts` (ADR-18) e
  `Utils.applyScopeFilter`.
- Il frontend filtra per soglia: `roles: AppUserRoles[]` in `config/navigation.ts`, allow-list in
  `App.tsx`, 28 righe con riferimenti al ruolo in `PageUsers.tsx`.
- Superfici: API amministrativa `api/v1/app/*` (es. `app/admin`, `app/files`); frontend senza
  prefisso `/admin` (`/users`, `/pages`). `PublicMediaController` è `public/media`, anonimo, solo
  `ThrottlerGuard`.
- `files` non ha colonne di visibilità: il concetto di "file riservato" oggi non esiste.
- Funzioni di sistema (impersonificazione, seed/reset demo, rebuild sito) sono SuperAdmin a **match
  esatto**, non a soglia (`business-rules.md` § Attori e ruoli).

## Decisione

1. **Modello a due strati, additivo.** `users.role` **resta invariato** e resta l'unica fonte per: i
   guard a soglia esistenti, l'ownership ADR-18, `applyScopeFilter`, l'impersonificazione e la
   visibilità dei SuperAdmin. Sopra si aggiunge lo strato permessi. Permessi effettivi di un utente =
   permessi del ruolo di sistema corrispondente a `users.role` **∪** permessi dei ruoli in
   `user_roles`. Solo unione: **nessun permesso negativo** e nessuna sottrazione (una restrizione
   dentro una soglia è il caso di ADR-90 § 3, non di questa ADR).
2. **Schema** (`app/backend/src/db/schema.ts`, migrazione additiva con `drizzle-kit generate`, out
   `src/db/migrations`; nessuna colonna modificata su `users`):
   - `roles`: `id`, `code` (unique), `name`, `description`, `is_system`, `level` (integer nullable:
     valorizzato solo per i 4 ruoli di sistema, uguale al valore `AppUserRoles`), timestamp e
     `created_by`/`updated_by` come le altre entità.
   - `permissions`: `id`, `code` (unique, formato `risorsa:azione` minuscolo snake_case),
     `category`, `description`.
   - `role_permissions` (`role_id`, `permission_id`, PK composta) e `user_roles` (`user_id`,
     `role_id`, PK composta), FK con `onDelete: 'restrict'` verso i ruoli e `cascade` verso `users`.
3. **Registro permessi come codice.** `permissions.registry.ts` (versionato) è la fonte; un seed
   idempotente all'avvio fa upsert per `code` di `permissions` e dei 4 ruoli di sistema
   (`superadmin`, `admin`, `manager`, `user`, `is_system = true`) con le associazioni derivate dalla
   matrice di `business-rules.md` § Permessi editoriali. **I permessi non si creano da API/UI**: un
   permesso senza un punto di enforcement non fa nulla. Regola: un codice esiste nel registro solo
   se almeno un endpoint lo applica (verificato da test, vedi Conformità).
4. **Catalogo iniziale proposto** (da riconciliare endpoint per endpoint nella SPEC; sostituisce i
   codici incoerenti del prompt di origine):

   | Categoria | Codici | Riga della matrice / origine |
   |---|---|---|
   | Pagine | `pages:create` · `pages:edit_own` · `pages:edit_any` · `pages:submit_review` · `pages:publish` · `pages:restore_revision` · `pages:delete` | righe Pagina (publish = pubblicare/programmare/archiviare) |
   | Struttura | `templates:manage` · `global_sections:manage` | "Gestire Menu, Template, Sezioni globali" (Menu: nessun modulo oggi, il codice arriva col modulo) |
   | Media | `media:upload` · `media:delete_any` | upload = tutti; eliminare Media di altri = Admin+ (l'autore elimina i propri: ownership `files.service.ts`) |
   | Moduli | `forms:manage` · `forms:read_submissions` | definire Moduli; leggere Invii (dati personali) |
   | Impostazioni | `settings:manage_theme` · `settings:manage_locales` · `settings:manage_redirects` | tema/risorse globali, Locale, Redirect |
   | Blocchi | `blocks:html_embed` | solo SuperAdmin oggi |
   | Utenti | `users:read` · `users:write` · `users:assign_roles` · `roles:read` · `roles:manage` · `audit:read` | `app/admin/users*`, `audit-log` (oggi `GuardAdmin`) |

   Seed dei ruoli di sistema: `user` ⊇ {`pages:create`, `pages:edit_own`, `pages:submit_review`,
   `media:upload`}; `manager` = `user` + {`pages:edit_any`, `pages:publish`,
   `pages:restore_revision`, `templates:manage`, `global_sections:manage`, `forms:manage`,
   `forms:read_submissions`}; `admin` = `manager` + {`pages:delete`, `media:delete_any`,
   `settings:*`, `users:*`, `roles:*`, `audit:read`}; `superadmin` = tutti (incluso
   `blocks:html_embed`), ri-sincronizzato a ogni avvio. **I permessi dei ruoli di sistema sono di
   sola lettura** (P3): la matrice di business-rules resta la verità.
5. **Enforcement.** Decoratore `@Permissions(...codes)` + `PermissionsGuard` (semantica AND).
   Convive con `GuardX`: gli endpoint migrano **uno per uno**, solo quelli elencati dalla SPEC. Le
   funzioni di sistema SuperAdmin (impersonificazione, seed/reset demo, rebuild) **restano su
   `GuardSuperAdmin` a match esatto e non diventano permessi**. `403` con lo stesso formato dei guard
   esistenti (messaggio: `Permessi insufficienti (richiesto permesso: <codice>).`). In
   impersonificazione `authInfo.userId` è l'utente impersonato, quindi si valutano i suoi permessi
   (comportamento già coerente con `authInfo`).
6. **Cache Redis per utente, non per sessione.** Chiave `perm:v<hashRegistro>:user:<userId>` →
   `codes[]`, TTL di sicurezza (1 h), letta dal guard; su miss o Redis non pronto
   (`RedisService.isReady()`) si legge dal DB (mai fail-open). Non si lega a `login:${token}`/
   `session:${id}`: quelle chiavi ruotano a ogni refresh e sono N per dispositivo, mentre i ruoli
   cambiano indipendentemente. Invalidazione con `del`/`delMany` (il servizio Redis non ha `scan`):
   al cambio di `user_roles`, `users.role` o dei permessi di un ruolo si leggono dal DB gli utenti
   interessati e se ne cancella la chiave. Il `hashRegistro` nel nome chiave invalida da solo le
   cache quando un deploy cambia il seed. **Il JWT non cambia** (nessun permesso nel token: sarebbe
   stantio fino a 15 min e non revocabile). Conseguenza dichiarata: i permessi hanno effetto
   immediato; la soglia `users.role` letta dai guard legacy resta ≤15 min come oggi.
7. **API** (modulo `app/backend/src/admin/roles/`, prefisso `api/v1/app/admin/*`, coerente con
   `app/admin/users`): `GET roles` · `POST roles` · `PATCH roles/:id` · `DELETE roles/:id` ·
   `GET permissions` (raggruppati per categoria, sola lettura). Assegnazione ai ruoli sugli utenti
   estendendo in modo additivo `CreateUserDto`/`UpdateUserDto` (`roleIds?`), non con endpoint nuovi.
   `DELETE` di un ruolo `is_system` → `403`; di un ruolo assegnato ad almeno un utente → `409`
   `ROLE_IN_USE` (P6). Ogni scrittura è registrata in `audit_log` (`AuditLogService`).
8. **Anti-escalation.** Un attore può inserire in un ruolo o assegnare a un utente **solo permessi
   che possiede**; modificare/eliminare un ruolo richiede di possederne tutti i permessi attuali.
   Restano le regole esistenti (Admin non gestisce SuperAdmin).
9. **Storage/MinIO.** I permessi `media:*` si applicano ai soli endpoint di `app/files` (unico
   accessore al bucket tramite `StorageDriver`); `PublicMediaController` **non** riceve controlli di
   permesso (Principio 8, superficie anonima e cacheabile). Le policy/IAM del bucket MinIO sono
   fuori scopo. "Lettura di file riservati" **non è implementabile** senza un concetto di visibilità
   sui file: fuori da questa ADR (P4).
10. **Frontend.** Rotta `/roles` (non `/admin/roles`: coerente con `/users`), voce di navigazione
    con `permission` accanto a `roles`. `GET /auth/me` restituisce anche `permissions: string[]`,
    salvate in `useAuthStore`. Hook `useHasPermission(code)` e componente `<Can permission="...">`
    sono **solo UX**: l'autorità è il backend. `PageUsers` **mantiene** il select del livello base
    (`role`) e aggiunge un multi-select "Ruoli aggiuntivi" alimentato da `GET roles`. Matrice a
    checkbox raggruppata per categoria con "Seleziona tutti" per categoria nel drawer Crea/Modifica.
11. **Consegna a fasi** (una SPEC e un PLAN saranno generati *dopo* la firma): F1 schema+seed+registro+
    servizio+cache+guard con unit test; F2 API ruoli/permessi, assegnazione utenti, enforcement su
    `app/files`, e2e `roles.e2e-spec.ts`; F3 frontend; F4 documentazione e `openapi:export`/
    `openapi:types`. Nessuna fase modifica il comportamento delle rotte non migrate.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **Strato additivo sopra `users.role` (scelta)** | Zero regressioni su guard, ownership, JWT, test esistenti; migrazione incrementale; ruoli di sistema = matrice già firmata | Due fonti di verità transitorie (soglia + permessi); il seed deve restare allineato alle soglie | — |
| Sostituzione totale: eliminare `users.role`, tutto su `user_roles` | Modello unico | Riscrive ~50 guard, ADR-18, `applyScopeFilter`, JWT, impersonificazione, `PageUsers` e tutti i test RBAC in un colpo | Rischio di regressione sproporzionato; resta possibile come fase successiva con ADR propria (P1) |
| Ruoli custom come nuove soglie numeriche (21, 22, …) | Nessuna tabella | Rompe l'invariante `<=` (già scartata da ADR-90) | Ruolo orizzontale forzato su scala verticale |
| Solo `editorProfile` (ADR-90 § 3) | Già progettata, piccola | Non offre matrice permessi né gestione da UI | Non copre la richiesta; resta complementare (P5) |
| Permessi nel JWT | Nessuna lettura per request | Stantii ≤15 min, token più grande, non revocabili | Contraddice l'invalidazione immediata richiesta |
| Cache legata alla sessione (come nel prompt) | Semplice da immaginare | N copie per dispositivo, chiavi ruotano a ogni refresh | Invalidazione costosa e fragile: cache per utente |
| Permessi creabili da UI | Massima flessibilità | Un permesso senza enforcement è inerte e ingannevole | Registro nel codice, un permesso = un enforcement |
| Controlli `media:*` anche su `PublicMediaController` | Copertura "totale" | Viola il Principio 8, rompe cache/anonimato | Superficie pubblica esclusa |

## Conseguenze

- **Positive**: ruoli tipo "SEO Specialist"/"Media Manager"/"Content Reviewer" creabili senza
  deploy, come `User` + ruolo aggiuntivo; nessun test esistente cambia; una lettura Redis per
  richiesta protetta.
- **Negative / debito dichiarato**: (a) finché la migrazione dei guard non è completa coesistono
  soglie e permessi; (b) un ruolo aggiuntivo **non può restringere** un utente sotto la sua soglia
  (serve ADR-90 § 3); (c) la promozione a ruolo più alto resta effetto-refresh per i guard legacy;
  (d) nuovo perimetro di sicurezza: escalation di privilegi è il rischio principale, mitigato dal
  punto 8 e da test dedicati; (e) l'utente vede la UI aggiornata solo al prossimo `GET /auth/me`
  (nessun push realtime: fuori scopo).
- Il grafo dei documenti va riallineato (vedi sotto): finché non è fatto, constitution e A4 dicono
  ancora "nessun ruolo nuovo".

## Punti aperti — da decidere alla firma

| # | Punto | Raccomandazione |
|---|---|---|
| P1 | Modello additivo (questa ADR) o sostituzione totale di `users.role` | Additivo ora; sostituzione eventuale in una ADR successiva |
| P2 | `roles:manage`/`users:assign_roles` di default ad Admin+ o solo SuperAdmin | Admin+, protetto dall'anti-escalation (il prompt parla di "Amministratore") |
| P3 | Permessi dei ruoli di sistema modificabili da UI | No, sola lettura |
| P4 | "File riservati": serve un concetto di visibilità su `files` (oggi assente) | Fuori da questa ADR; decisione di prodotto separata |
| P5 | Sorte di ADR-90 § 3 (`editorProfile`) | Mantenerla come complemento restrittivo, decisione a chi firma |
| P6 | Eliminazione di un ruolo assegnato: `409` o rimozione a cascata | `409 ROLE_IN_USE`, nessuna perdita silenziosa di permessi |

## Documenti da aggiornare dopo la firma

Non modificati da questa ADR (Documentation Policy: constitution/business-rules/glossary/
system-architecture solo a richiesta esplicita e circostanziata; ADR approvate mai):

- `docs/business-rules.md`: annotare A4 come "riaperta da ADR-99" e aggiungere la nota che la matrice
  è il seed dei ruoli di sistema.
- `docs/constitution.md`: § Base tecnica e § "Security Policy — Security by Design" (Autorizzazione)
  → "RBAC a soglie + permessi granulari".
- `docs/glossary.md`: "Ruolo personalizzato", "Permesso", "Ruolo di sistema".
- `docs/system-architecture.md`: tabella stack (Autorizzazione) e flusso auth (cache permessi).
- `docs/ai/INDEX.md`: nuova riga di dominio "Auth, Ruoli & Permessi" (oggi assente) e nota di
  superamento parziale di ADR-18, sul modello di ADR-73/ADR-71.
- `docs/ai/progress-tracker.md`, `openapi.yaml` (script), collezione Bruno.

## Conformità

- Test tabellare: i 4 ruoli di sistema seedati riproducono ogni riga della matrice
  `business-rules.md` § Permessi editoriali (4 ruoli × righe), fallisce se seed e matrice divergono.
- Test di registro: ogni codice del registro è usato da almeno un `@Permissions`, e ogni
  `@Permissions` usa un codice del registro.
- `PermissionsGuard`: unit test (permesso presente/assente, AND multiplo, cache hit/miss, Redis
  non pronto → DB, invalidazione). Service ruoli: unit test (system protetto, `409`, anti-escalation).
- `app/backend/test/e2e/roles.e2e-spec.ts`: `403` per utente privo del permesso, `200` dopo
  l'assegnazione del ruolo **senza rilogin**, `403` di nuovo dopo la rimozione.
- Suite esistente invariata: nessun test RBAC/ownership esistente viene modificato per passare.
- `npm run openapi:export && npm run openapi:types` dopo ogni endpoint; `PublicMediaController`
  senza `@Permissions`; funzioni SuperAdmin ancora su `GuardSuperAdmin`.

## Decisione umana

**Esito**: [ ] Approvato così com'è · [x] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-24

**Risoluzione dei punti aperti**:

| # | Esito |
|---|---|
| P1 | Modello **additivo** (raccomandazione accolta). |
| P2 | **Modificata**: `roles:manage` riservato al **solo SuperAdmin** (non Admin+). `users:assign_roles` resta **Admin+**, soggetto all'anti-escalation del punto 8. Di conseguenza il seed del ruolo di sistema `admin` (§ Decisione punto 4) contiene `roles:read` ma **non** `roles:manage`. |
| P3 | Permessi dei ruoli di sistema **in sola lettura** (raccomandazione accolta). |
| P4 | "File riservati" fuori da questa ADR (raccomandazione accolta). |
| P5 | ADR-90 § 3 non toccata da questa firma: resta "In discussione" come complemento restrittivo. |
| P6 | Eliminazione di un ruolo assegnato → **`409 ROLE_IN_USE`** (raccomandazione accolta). |

**Modifica al punto 11 (consegna a fasi)**: la F1 include, oltre a schema+seed+registro+servizio+
cache+guard, il **service di dominio dei ruoli** (`RolesService`) con le regole del punto 7 sul ruolo
di sistema protetto e sul `409 ROLE_IN_USE` e l'anti-escalation del punto 8, coperte da unit test,
**senza controller né DTO HTTP**. Controller, DTO, `roleIds` su `CreateUserDto`/`UpdateUserDto`,
enforcement su `app/files`, e2e e `openapi:*` restano in F2. SPEC e PLAN della F1:
`docs/ai/specs/SPEC-RBAC-F1-schema-seed-cache-guard.md` ·
`docs/ai/plans/PLAN-RBAC-F1-schema-seed-cache-guard.md` (da approvare prima dell'implementazione).

**Note**: la firma non aggiorna da sola i documenti elencati in "Documenti da aggiornare dopo la
firma" (Documentation Policy): `business-rules.md` A4, constitution, glossary, system-architecture e
`INDEX.md` restano da riallineare su richiesta esplicita.
