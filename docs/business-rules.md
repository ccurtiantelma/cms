# Business Rules — Starter Kit

> Regole di dominio. Nessuna AI le modifica. Priorità: dopo Constitution.
> Questo file contiene SOLO le regole delle feature core ereditate (auth/RBAC/profilo/audit).
> Non contiene business rules verticali: quelle appartengono al progetto che eredita lo
> starter-kit e vanno aggiunte nella sezione sottostante.

## Regole di dominio — DA COMPILARE PER IL PROGETTO

> Questa sezione è vuota nello starter-kit. Il progetto verticale aggiunge qui le proprie
> regole di dominio (entità, stati, workflow, calcoli specifici del business), con lo
> stesso livello di dettaglio delle sezioni core sottostanti.

---

## Attori e ruoli

| Ruolo | Valore enum | Accesso |
|---|---|---|
| SuperAdmin | 5 | Accesso globale, bypassa il filtro scope, unico ruolo che può impersonare altri utenti ed eseguire seed/reset demo |
| Admin | 10 | Gestisce utenti e audit log; non può creare/vedere/gestire utenti con ruolo SuperAdmin |
| Manager | 20 | Soglia intermedia (`GuardManager`) — nessun modulo core dello starter-kit la usa oltre alla soglia stessa; disponibile per i moduli del progetto verticale |
| User | 30 | Utente operativo di base, nessun privilegio amministrativo |

Numero minore = privilegio maggiore. I guard (`GuardSuperAdmin`, `GuardAdmin`,
`GuardManager`) confrontano con `<=` la soglia richiesta, tranne dove serve un match
esatto (es. impersonificazione, funzioni di sistema: solo `role === AppUserRoles.SuperAdmin`).

---

## Scope / filtro multi-tenant

`Utils.applyScopeFilter(authInfo, elevatedThreshold = AppUserRoles.Admin)` restituisce:
- `null` se `authInfo.role <= elevatedThreshold` (vede tutto)
- `authInfo.scopeId` altrimenti (filtra ai soli dati del proprio scope)

Il campo `scopeId` su `users` è generico e nullable nello starter-kit — non ha valori
enum predefiniti né significato di dominio: il progetto verticale decide cosa
rappresenta (filiale, ufficio, cliente...) e dove applicare il filtro sulle proprie
tabelle. Applicazione **obbligatoria** su ogni query multi-tenant/multi-sede aggiunta
dal progetto verticale.

---

## Sicurezza password

Hashing: **bcrypt** (cost 12), sale generato internamente per ogni hash — mai password
in chiaro nel DB. Gli hash sono auto-identificanti (`$2b$…`). Il pattern di migrazione
trasparente di hash legacy al primo login riuscito (senza reset di massa, mantenendo il
formato legacy in verifica finché non tutti gli utenti sono migrati) è documentato come
raccomandazione in `docs/ai/adr/ADR-2-security-baseline.md` per progetti verticali che
importano utenti da un sistema legacy — non applicato di default nello starter-kit,
che non ha dati legacy propri.

### Password policy (NIST/OWASP)

- Minimo 12 caratteri
- Almeno 3 delle 4 categorie: maiuscole, minuscole, numeri, simboli
- Niente requisiti di "complessità arcana" aggiuntivi — la lunghezza conta più dei simboli
- Componente UI riusabile: indicatore di forza (barra colorata + etichetta) e generatore
  automatico di password conformi, usati in: creazione utente (Admin), imposta password
  (attivazione/recupero), cambio password (profilo utente)

---

## MFA (Multi-Factor Authentication)

- Opzionale per utente — mai obbligatorio per default
- TOTP (RFC 6238), libreria `otplib`; QR code generato con `qrcode`
- Flusso: `auth/mfa-setup` genera segreto+QR (non persiste ancora) → utente verifica un
  codice → `auth/mfa-enable` persiste `totpSecret`+`isMfaEnabled = true`
- `auth/mfa-disable` richiede un codice valido per disattivare
- Al reset MFA da Admin (`app/admin/users/:guid/reset-mfa`): `isMfaEnabled = false`,
  `totpSecret = null` — l'utente dovrà rifare il setup se vuole riattivarla
- Login con `isMfaEnabled = true`: dopo credenziali corrette, risposta
  `{ mfaRequired: true, tmpToken }` invece dell'access token; `auth/mfa-verify` con
  `tmpToken` + codice completa il login

---

## Autenticazione estesa — Attivazione e recupero password

### Attivazione account (account creato da Admin)

1. Admin crea utente in `app/admin/users` — se prevista l'email di attivazione:
   `pwdSet = false`, viene generato `actionToken` con `actionTokenExpiresAt`, email
   inviata via coda BullMQ con link `/activate?token=...`
2. In alternativa l'Admin può impostare direttamente una password (`pwdSet = true`),
   l'utente può accedere subito
3. Finché `pwdSet = false`, il login è bloccato con messaggio chiaro
   ("Account non attivato, controlla la tua email")
4. Pagina `/activate?token=...`: valida token e scadenza, form "Imposta la tua
   password" con indicatore forza, al submit (`auth/activate`): `pwdSet = true`,
   token invalidato, redirect a login
5. `auth/request-activation` (Admin+) permette di reinviare l'email di attivazione

### Recupero password ("Password dimenticata?")

1. Link in login → form con campo email (`auth/forgot-password`)
2. **Sempre** risposta di successo generica, indipendentemente dal fatto che l'email
   esista o meno — anti user-enumeration (mai rivelare se un indirizzo è registrato)
3. Se l'email esiste: genera `actionToken` (stesso campo di attivazione, riutilizzato),
   scadenza breve, invia email con link `/reset-password?token=...`
4. Pagina `/reset-password?token=...`: stessa UI di "imposta password"
   dell'attivazione, submit su `auth/reset-password`

---

## Pagina Profilo Utente

Ogni utente autenticato accede a `/profile` con:

- Dati anagrafici: nome e cognome modificabili in self-service da qualsiasi ruolo
  autenticato (`PATCH auth/me`); email in sola lettura lato profilo (modificabile solo
  da Admin via gestione utenti — resta anche l'identificativo di login)
- Cambio password (`PATCH auth/change-password`, richiede password attuale + nuova con
  indicatore forza)
- Gestione MFA: attiva/disattiva/rigenera il proprio MFA (setup QR code)
- Preferenza tema: Sistema (default) / Chiaro / Scuro — salvata in `localStorage`
  (chiave `color_scheme`), non nel DB

---

## Tema chiaro/scuro

- Mantine `colorScheme`: `auto` (default, segue preferenza sistema operativo) /
  `light` / `dark`
- Preferenza utente in `localStorage` (chiave `color_scheme`), letta da
  `ColorSchemeScript` in `index.html` per evitare flash del tema sbagliato al
  caricamento
- Ogni colore custom aggiunto in `theme.ts` dal progetto verticale deve essere
  verificato in entrambe le modalità

---

## Impersonificazione utente (SuperAdmin only)

- Solo un utente con ruolo `SuperAdmin` (match esatto, `GuardSuperAdmin`) può
  impersonare un altro utente, e non può impersonare un altro `SuperAdmin`
- `POST auth/impersonate/:guid`: backend genera un access token per l'utente target
  con claim aggiuntivo `impersonatedBy: <superAdminId>` — **nessun refresh token**
  viene generato durante l'impersonificazione (sessione limitata alla durata
  dell'access token)
- Frontend mostra un banner fisso: "Stai visualizzando come [nome] — Termina
  impersonificazione"
- `POST auth/end-impersonation` richiede `authInfo.impersonatedBy` presente nel
  token corrente, ripristina token normali (con refresh) per il SuperAdmin originale
- Ogni azione eseguita durante l'impersonificazione viene registrata in `audit_log`
  con sia `userId` (l'utente impersonato, autore formale dell'azione) sia
  `impersonatedBy` (il SuperAdmin reale)

---

## Audit Log

Tabella `audit_log` registra azioni critiche per tracciabilità (non un log esaustivo
di ogni CRUD — quello è già coperto da `createdBy`/`updatedBy` su ogni tabella):

- Login / logout
- Impersonificazione iniziata / terminata
- Creazione / modifica / disattivazione utenti
- Reset MFA
- Operazioni di sistema (`seed-demo` / `reset-demo`)
- Ogni azione eseguita durante l'impersonificazione (sempre, indipendentemente dal tipo)

Ogni riga registra: `userId`, `impersonatedBy` (nullable), `action`, `entity`/`entityId`
(nullable), `details` (nullable), `ip`, `createdAt`. Consultabile da Admin+ via
`GET app/admin/audit-log` (paginato, filtri `userId`, `action`, `dateFrom`, `dateTo`).

---

## Funzioni di sistema (solo SuperAdmin)

- `POST app/admin/system/seed-demo`: popola il database con dati demo minimi (un
  utente per ruolo). Operazione idempotente.
- `POST app/admin/system/reset-demo`: wipe transazionale FK-safe di tutti i dati
  applicativi, mantenendo solo l'utente SuperAdmin. Operazione distruttiva e
  irreversibile — richiede conferma esplicita in UI.
- Entrambe richiedono `role === AppUserRoles.SuperAdmin` (controllo esatto, non
  `<=`), guard dedicato `GuardSuperAdmin`.

---

## Tour guidato e help contestuale

- Al primo accesso parte un tour guidato che evidenzia gli elementi chiave della UI
  (sidebar di navigazione, dashboard, azioni principali)
- Il tour è interrompibile in ogni momento ("Salta tour"); la scelta (completato o
  saltato) viene salvata in `localStorage`
- Pulsante di help fisso nell'header: riapre il tour generale; su pagine con help
  contestuale specifico (definito dal progetto verticale) apre un pannello con
  suggerimenti relativi alla pagina corrente
- Il tour NON blocca l'uso dell'app — è sempre sovrapposto e disattivabile, mai un
  passaggio obbligatorio
