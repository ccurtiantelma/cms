# ADR-2 — Security baseline: bcrypt, jti, redazione log, validazione DTO severa, mailer/queue separati

## Status
[x] Approvato

> Nota: queste sono decisioni fondative ereditate da `cima-infortunistica/ADR-2`
> ("Parità di sicurezza auth con OpenBridge") e da `openbridge-backend` (pattern
> `AppConstants` difensivo, `AppLogger` con dedup/rate-limit, mailer/queue separati),
> consolidate in un unico ADR e adattate come baseline di sicurezza dello starter-kit.
> Non sono decisioni aperte a discussione per ogni nuovo progetto verticale: sono
> comportamento di default del boilerplate.

## Data approvazione
2026-07-17 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
Nessuna RFC dedicata nello starter-kit — ereditata da
`docs/ai/rfc/RFC-1-parita-sicurezza-openbridge.md` di `cima-infortunistica` (non
portata come file separato in questo repo).

## Contesto

Lo starter-kit deve partire con una baseline di sicurezza già solida sull'autenticazione
e sul logging, senza che ogni progetto verticale debba riscoprire gli stessi problemi
(hash password deboli, collisioni di sessione, log con dati sensibili, DTO permissivi,
invio email diretto da service, `process.env` letto in modo non difensivo). Questo ADR
consolida le decisioni prese separatamente in `cima-infortunistica` (parità di
sicurezza con OpenBridge) e i pattern già maturi in `openbridge-backend`
(`AppConstants`, `AppLogger`, mailer/queue separati).

## Decisione

### Hashing password — bcrypt (cost 12) + pattern di migrazione trasparente
- Hashing con **bcrypt**, cost factor **12**, tramite `Utils.hashPassword`/
  `Utils.verifyPassword`. Mai password in chiaro nel DB. Gli hash sono
  auto-identificanti (`$2b$…`).
- **Pattern raccomandato per import legacy futuri** (non applicato di default nello
  starter-kit, che non ha dati legacy propri): se un progetto verticale importa utenti
  da un sistema con hash in formato diverso, la migrazione va fatta **in modo
  trasparente al primo login riuscito** (verifica col formato legacy, in caso di match
  ri-hash con bcrypt e persistenza), mai con un reset di massa delle password. Il
  formato legacy resta accettato solo in verifica finché non tutti gli utenti sono
  migrati.

### `jti` nel payload JWT
- Claim `jti = Utils.randomString(16)` aggiunto al payload firmato in
  `AuthService.generateAuthTokens`. Rende ogni access token univoco anche a parità di
  secondo, eliminando le collisioni sulla chiave Redis `login:${token}` (allowlist di
  sessione). Nessun impatto sul transport (`jsonwebtoken` diretto, vedi
  `system-architecture.md`).

### Redazione, deduplicazione e rate limiting dei log
Pattern ereditato da `AppLogger` di `openbridge-backend`, applicato al `WinstonLoggerService`
dello starter-kit:
- **Redazione (`sanitizeLogData`)**: funzione ricorsiva (profondità massima 3, gestione
  array) che sostituisce con `[REDACTED]` i valori delle chiavi contenenti
  (case-insensitive) `password`/`pwd`/`token`/`secret`/`apiKey`/`email`/`phone`. I
  messaggi stringa liberi non vengono alterati.
- **Deduplicazione**: righe di log identiche consecutive entro una finestra di 2s
  vengono silenziate, con una riga di riepilogo (`[DEDUP] ... ripetuto ×N`) emessa alla
  fine dello streak, per evitare flooding dei file di log in caso di errori ripetuti.
- **Rate limiting**: cap massimo di messaggi/secondo (`LOG_MAX_PER_SEC`, default 100),
  i messaggi eccedenti vengono scartati per proteggere I/O e disco.
- Ogni accesso non autorizzato loggato a livello `warn` (vedi `constitution.md` →
  Security Policy).

### `forbidNonWhitelisted: true` nella `ValidationPipe` globale
- Configurato in `main.ts`. I payload con campi non dichiarati nei DTO ricevono `400`
  invece di essere scartati in silenzio — superficie di ingresso più stretta,
  coerente con "Validazione input" di `constitution.md`.

### Mailer e coda email separati (pattern `openbridge-backend`), sopra `AppConstants` hardened
- `src/mailer/` (costruzione/rendering email, wrapping Nodemailer) e
  `src/queues/email-queue/` (coda BullMQ dedicata + processor) restano **moduli
  separati**: il mailer non sa nulla di BullMQ, la coda non sa nulla del contenuto
  delle email. Mai invio email diretto da un service applicativo.
- `AppConstants` letto in modo difensivo: nessun accesso diretto a `process.env` nel
  codice applicativo; ogni valore passa da un helper che rimuove virgolette
  accidentali, valida i range (es. porte 0–65535) e applica un default esplicito e
  sicuro quando la variabile manca — mai un `undefined` silenzioso propagato a runtime.
  Il caricamento del file `.env` ha precedenza esplicita (`.env.test` in `NODE_ENV=test`,
  poi `.env`), senza sovrascrivere variabili già impostate dall'ambiente (utile per CI).

### Scartati (con motivazione)
- **Sanitizzazione input anti-XSS globale** (es. `sanitize-html`): **scartata**. React
  fa auto-escaping in render; un filtro globale in ingresso rischia di corrompere testo
  libero legittimo ed è una nuova dipendenza non necessaria. Un eventuale vettore
  residuo lato output non-React (es. generazione documenti server-side, se introdotta
  da un progetto verticale) va affrontato con escaping mirato in quel punto, non con un
  filtro globale.
- **Blacklist di logout** (`logout:${token}`): **scartata (ridondante)**. Il middleware
  richiede già la presenza di `login:${token}` (allowlist di sessione) e il logout la
  cancella: il token è già rifiutato dopo il logout. Una blacklist aggiungerebbe
  scritture/controlli senza guadagno.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **bcrypt** (scelta) | Battle-tested, nessun parametro di memoria da tarare, parità con `openbridge-backend` | Non memory-hard | — |
| argon2 | Memory-hard, vincitore PHC | Parametri (memoria/parallelismo) da tarare e mantenere; diverge dal pattern già maturo nell'altro progetto gemello | Complessità non giustificata per un boilerplate generico |
| Reset password di massa per import legacy | Semplice, nessuna logica dual-format | UX pessima; carico di supporto | Upgrade trasparente al login è superiore |
| Sanitizzazione anti-XSS globale in ingresso | Difesa in profondità | Nuova dipendenza; rischio su testo libero; React già esegue l'escaping | Intervento mirato nei punti di output non-React è sufficiente |
| Blacklist di logout | Pattern esplicito | Ridondante con l'allowlist Redis già esistente | Nessun guadagno |
| `process.env` letto direttamente nei service | Zero astrazione | Vietato da `constitution.md`; nessuna validazione/default centralizzato | Viola "Divieti assoluti" |

## Conseguenze

- **Positive**: hash password robusti; nessuna collisione di sessione; log privi di
  segreti/PII e resistenti a flooding; superficie di ingresso DTO più stretta; nessun
  invio email accidentale fuori dalla coda; configurazione d'ambiente centralizzata e
  difensiva fin dal primo giorno di ogni progetto verticale.
- **Negative / attenzione**: `bcrypt` è una dipendenza nativa (compilazione) da tenere
  in conto in ambienti di build/deploy minimali. Il pattern di migrazione hash legacy
  introduce logica dual-format da mantenere finché esistono hash nel formato vecchio,
  **se e quando** un progetto verticale importa utenti legacy — nello starter-kit
  puro questa logica non è attiva. `forbidNonWhitelisted: true` è un cambiamento di
  comportamento runtime (payload con campi extra → 400) da tenere presente nello
  sviluppo dei client.

## Conformità

- **bcrypt**: `Utils.hashPassword`/`Utils.verifyPassword` in
  `app/backend/src/common/utils.ts`.
- **jti**: `app/backend/src/auth/auth.service.ts` — claim nel payload firmato.
- **Redazione/dedup/rate-limit log**: `app/backend/src/common/logging/` —
  `sanitizeLogData`, finestra dedup 2s, `LOG_MAX_PER_SEC` da `AppConstants`.
- **`forbidNonWhitelisted`**: `app/backend/src/main.ts` — `ValidationPipe` globale.
- **Mailer/coda separati**: `app/backend/src/mailer/`, `app/backend/src/queues/email-queue/`.
- **`AppConstants` hardened**: `app/backend/src/common/app-constants.ts` — nessun
  `process.env` diretto altrove nel codice applicativo (grep di conformità in CI/review).
