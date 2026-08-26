# Business Rules — CMS

> Regole di dominio. Priorità: dopo Constitution. Le AI non le modificano di propria
> iniziativa (vedi `docs/constitution.md` → "Documentation Policy").
>
> Ultima revisione: 2026-08-17 — conferma delle assunzioni A2, A3, A4, A5 su richiesta
> esplicita dell'umano. Revisione precedente: 2026-08-13 — sezione di dominio del CMS a
> pagine redatta nell'ambito della ristrutturazione documentale.

---

## Assunzioni dichiarate (da confermare)

Le regole di dominio qui sotto sono state redatte a partire dalla descrizione del
prodotto fornita dall'umano. Dove la descrizione non era univoca è stata presa una
decisione esplicita, elencata qui: **finché non è confermata, resta un'assunzione, non
una regola approvata**.

| # | Assunzione presa | Alternativa scartata | Stato |
|---|---|---|---|
| A1 | **GEO = Generative Engine Optimization** (ottimizzazione per motori di risposta generativi: ChatGPT, Perplexity, AI Overviews) | GEO = geolocalizzazione / geo-targeting dei contenuti per area geografica | ✅ **Confermata** da ccurti il 2026-08-13: "visibilità non sui motori di ricerca ma per l'AI" |
| A2 | Il **contenuto di pagina è un albero di blocchi JSON** validato server-side | Contenuto come HTML salvato dall'editor | ✅ **Confermata** da ccurti il 2026-08-17: è già l'architettura. Allinea lo status all'obbligo costituzionale (Principle 6, `constitution.md` § Modello di contenuto, regola 2) |
| A3 | Le **traduzioni sono righe autonome** legate da un gruppo di traduzione | Traduzioni come colonne/campi affiancati sulla stessa riga | ✅ **Confermata** da ccurti il 2026-08-17. Il legame è la colonna opaca `translationGroupId` (`char(16)`), **non** una tabella `translation_groups` (assunzione S4 di SPEC-F01, confermata nella stessa sede) |
| A4 | Si riusano le **4 soglie di ruolo esistenti** (SuperAdmin/Admin/Manager/User) mappandole sui permessi editoriali | Introdurre nuovi ruoli dedicati (Editor, Autore, Revisore) | ✅ **Confermata con correzione** da ccurti il 2026-08-17: nessun ruolo nuovo, ma le sole soglie non bastano — serve un **controllo di ownership per riga** per la voce "Pagina propria (bozza)". Vedi la nota sotto la tabella dei permessi editoriali e `docs/ai/adr/ADR-18-ownership-per-riga.md` |
| A5 | Il CMS è **mono-sito**: un'unica installazione serve un solo sito, con più lingue | Multi-sito / multi-tenant con più siti nella stessa installazione | ✅ **Confermata** da ccurti il 2026-08-17: mono-sito, più lingue. **Nessuna colonna `siteId`** su alcuna tabella di dominio |
| A6 | Il **chatbot risponde solo su contenuti pubblicati** del sito, non è un assistente generalista | Chatbot generalista con conoscenza esterna | ⏳ Da confermare — non blocca nulla: F11 è l'ultima della fila (`docs/roadmap.md`) |

Stato di avanzamento e decisioni ancora aperte: `docs/TODO.md`.

### Conseguenza di A5 — l'unico punto di innesto del multi-sito

Con A5 confermata il dominio è mono-sito: nessuna tabella di contenuto porta una colonna
di sito e nessuna query di dominio filtra per sito.

Se un giorno servisse il multi-sito, **il punto di innesto previsto è uno solo**:
`Utils.applyScopeFilter(authInfo)` sul campo `scopeId` già presente e nullable su `users`.
Non se ne implementa nulla oggi — nessuna colonna, nessun filtro, nessun parametro
"in previsione". Introdurre lo scaffolding di una feature non richiesta è la definizione
di over-engineering; dichiarare dove entrerebbe costa una riga e non costa migrazioni.

---

# PARTE 1 — Dominio CMS

## Entità di contenuto

| Entità | Ruolo nel dominio |
|---|---|
| **Pagina** | Unità di contenuto pubblicabile. Entità centrale del sistema. |
| **Revisione** | Snapshot immutabile del contenuto di una Pagina a un dato momento. |
| **Blocco** | Nodo dell'albero di contenuto di una Pagina. Ha un `type` registrato e un payload validato. |
| **Template** | Struttura di partenza riusabile per creare nuove Pagine. |
| **Sezione globale** | Gruppo di blocchi condiviso tra più Pagine (header, footer, CTA), modificato in un punto solo. |
| **Locale** | Lingua/varietà linguistica gestita dal sito (es. `it-IT`, `en-GB`). |
| **Gruppo di traduzione** | Legame tra le Pagine che sono la stessa pagina in lingue diverse. |
| **Menu** | Struttura di navigazione ordinata, con voci che puntano a Pagine o URL esterne. |
| **Media** | Risorsa binaria (immagine, documento, video) con i suoi metadati. |
| **Modulo di contatto** | Definizione di un form pubblicabile in pagina. |
| **Invio** | Singola compilazione ricevuta da un Modulo di contatto. |
| **Redirect** | Regola di reindirizzamento da un vecchio percorso a uno nuovo. |

---

## Stati di una Pagina e transizioni

Stati ammessi:

| Stato | Significato | Visibile al pubblico |
|---|---|---|
| `draft` | Bozza in lavorazione | ❌ |
| `review` | In attesa di revisione/approvazione editoriale | ❌ |
| `scheduled` | Approvata, con data di pubblicazione futura | ❌ (fino alla data) |
| `published` | Pubblicata e visibile | ✅ |
| `archived` | Ritirata dalla pubblicazione, conservata | ❌ |

Transizioni **ammesse** (ogni altra transizione è respinta con `400`):

```
draft     → review | scheduled | published
review    → draft | scheduled | published
scheduled → draft | published | archived
published → draft (nuova bozza, il pubblicato resta online)
          | published (ripubblicazione: nuova Revisione, stesso stato)
          | archived
archived  → draft | published
```

Regole:

1. Una Pagina in stato `published` che viene modificata **non cambia stato**: le modifiche
   confluiscono in una **bozza di lavoro** separata. Il pubblico continua a vedere
   l'ultima revisione pubblicata finché non si ripubblica esplicitamente.
2. Il passaggio a `published` crea sempre una nuova **Revisione** immutabile e registra
   `publishedAt` + autore della pubblicazione.
3. Il passaggio a `scheduled` richiede una data futura; la pubblicazione effettiva è
   eseguita da un job schedulato (BullMQ repeatable job — vedi ADR-11, meccanismo
   persistente perché la pubblicazione ha side-effect e non deve duplicarsi tra repliche).
4. `archived` non cancella nulla ed è reversibile. La cancellazione di una Pagina è
   **sempre soft delete** (`isActive = false`); non esiste cancellazione fisica.
5. Depubblicare o archiviare una Pagina che ha URL indicizzate **deve** suggerire la
   creazione di un Redirect: l'operazione è consentita anche senza, ma il sistema avvisa.

---

## Permessi editoriali (mappatura sui ruoli esistenti)

Non vengono introdotti nuovi ruoli: si riusano le soglie esistenti (numero minore =
privilegio maggiore).

| Azione | SuperAdmin (5) | Admin (10) | Manager (20) | User (30) |
|---|---|---|---|---|
| Creare una Pagina | ✅ | ✅ | ✅ | ✅ |
| Modificare una Pagina propria (bozza) | ✅ | ✅ | ✅ | ✅ |
| Modificare una Pagina di altri | ✅ | ✅ | ✅ | ❌ |
| Inviare in revisione (`review`) | ✅ | ✅ | ✅ | ✅ |
| Pubblicare / programmare / archiviare | ✅ | ✅ | ✅ | ❌ |
| Ripristinare una Revisione passata | ✅ | ✅ | ✅ | ❌ |
| Soft delete di una Pagina | ✅ | ✅ | ❌ | ❌ |
| Gestire Menu, Template, Sezioni globali | ✅ | ✅ | ✅ | ❌ |
| Gestire Locale e impostazioni multilingua | ✅ | ✅ | ❌ | ❌ |
| Gestire Media (upload) | ✅ | ✅ | ✅ | ✅ |
| Eliminare Media di altri | ✅ | ✅ | ❌ | ❌ |
| Definire Moduli di contatto | ✅ | ✅ | ✅ | ❌ |
| Leggere gli Invii dei moduli | ✅ | ✅ | ✅ | ❌ |
| Gestire tema e risorse globali | ✅ | ✅ | ❌ | ❌ |
| Configurare il chatbot | ✅ | ✅ | ❌ | ❌ |
| Usare il blocco HTML/embed personalizzato | ✅ | ❌ | ❌ | ❌ |
| Gestire Redirect | ✅ | ✅ | ❌ | ❌ |

Ogni pubblicazione, depubblicazione, archiviazione, ripristino di revisione e soft delete
di una Pagina viene registrato in `audit_log`.

> **Nota su "Pagina propria (bozza)" (A4, correzione del 2026-08-17).** Questa è l'unica
> riga della tabella che **non** è esprimibile come soglia di ruolo: i guard esistenti
> (`GuardSuperAdmin`/`GuardAdmin`/`GuardManager`) confrontano solo `authInfo.role` con una
> soglia e non conoscono la riga. Serve un controllo di **ownership per riga**
> (`createdBy = authInfo.userId` + stato della riga) eseguito nel service, più un predicato
> di filtro negli elenchi paginati. Il pattern è già in produzione in
> `app/backend/src/files/files.service.ts` (`softDelete`). Regole, helper e codici di
> errore sono fissati in `docs/ai/adr/ADR-18-ownership-per-riga.md` — **da firmare prima
> dell'implementazione**.

---

## Blocchi e albero di contenuto

1. Il contenuto di una Pagina è un **albero di Blocchi** serializzato in `jsonb`.
2. Ogni Blocco ha come minimo: un identificativo stabile, un `type`, un oggetto `props`
   e un array `children` (eventualmente vuoto).
3. Ogni `type` esiste nel **registro dei tipi di blocco** con il proprio schema di
   validazione e le regole di annidamento (quali `type` può contenere, quali no).
4. Un albero che contiene un `type` sconosciuto, props non conformi allo schema o un
   annidamento non ammesso viene **respinto integralmente** con `400`: non si salva mai
   un albero parzialmente valido.
5. Ogni schema di blocco ha una **versione**. Un contenuto salvato con una versione
   precedente resta leggibile: i cambiamenti di schema richiedono una migrazione dei
   contenuti esistenti (vincolo costituzionale "il contenuto sopravvive al codice").
6. I campi di rich text dentro le props sono **sanitizzati server-side prima della
   persistenza** contro una allowlist di tag/attributi.
7. Il Blocco HTML/embed personalizzato è riservato al SuperAdmin, tracciato in audit log
   e resta disabilitato finché una ADR dedicata non ne definisce i confini.
8. Una **Sezione globale** è referenziata dai Blocchi, non copiata: modificarla si riflette
   su tutte le Pagine che la usano. La modifica di una Sezione globale invalida la cache
   di tutte le Pagine che la referenziano.

---

## Slug, gerarchia e risoluzione delle URL

1. Ogni Pagina ha uno **slug** e un'eventuale Pagina genitore: il percorso pubblico è la
   concatenazione degli slug degli antenati (`/servizi/consulenza/aziende`).
2. Lo slug è **unico per combinazione (locale, genitore)**. Un tentativo di duplicato
   viene respinto con `409`.
3. Lo slug è generato automaticamente dal titolo alla prima creazione (normalizzazione:
   minuscolo, senza accenti, separatore `-`) e resta **poi modificabile a mano**.
4. Cambiare lo slug di una Pagina già pubblicata **propone automaticamente un Redirect**
   `301` dal vecchio percorso al nuovo. L'editor può rifiutare, ma la proposta è sempre
   mostrata.
5. La risoluzione pubblica avviene per `(locale, percorso)` e restituisce **solo** Pagine
   in stato `published`. Una Pagina non pubblicata risponde `404`, mai `403`: l'endpoint
   pubblico non conferma mai l'esistenza di contenuto non pubblicato.
6. Una Pagina non può essere genitore di se stessa né di un proprio antenato (cicli
   respinti con `400`).
7. Slug riservati (non assegnabili): quelli che collidono con i prefissi tecnici
   dell'applicazione (`api`, `admin`, `public`, `assets`, `_health`).

---

## Revisioni e cronologia

1. Ogni pubblicazione genera una **Revisione immutabile**: snapshot completo di contenuto
   e metadati, con autore e timestamp.
2. Le Revisioni non si modificano e non si cancellano.
3. Il **ripristino** di una Revisione non riscrive la storia: crea una nuova bozza a
   partire dallo snapshot scelto, che va poi ripubblicata.
4. È sempre possibile confrontare due Revisioni (diff strutturale dell'albero blocchi:
   blocchi aggiunti, rimossi, modificati, spostati).
5. Il numero di Revisioni conservate per Pagina è configurabile; la potatura delle
   eccedenti non tocca mai l'ultima Revisione pubblicata.

---

## Editing concorrente

1. Due utenti che aprono la stessa Pagina in editor sono **entrambi ammessi**, ma il
   sistema segnala la presenza dell'altro in tempo reale (Socket.io, `RealtimeModule`).
2. Il salvataggio usa un controllo ottimistico: se la bozza è cambiata dopo il caricamento,
   il salvataggio è respinto con `409` e l'editor mostra il conflitto. **Nessuna
   sovrascrittura silenziosa**, mai.
3. Non è previsto editing collaborativo carattere-per-carattere (CRDT/OT): sarebbe
   over-engineering per l'MVP e richiederebbe una ADR dedicata.

---

## SEO — regole per pagina

Ogni Pagina possiede il proprio blocco di metadati SEO, parte del suo contratto:

| Campo | Regola |
|---|---|
| `metaTitle` | Fallback al titolo della Pagina se vuoto. Lunghezza consigliata ≤ 60 caratteri (avviso, non blocco). |
| `metaDescription` | Lunghezza consigliata ≤ 160 caratteri (avviso, non blocco). |
| `canonicalUrl` | Se vuoto, calcolato dal percorso della Pagina nella propria lingua. |
| `robots` | `index`/`noindex` + `follow`/`nofollow`. Default: `index, follow`. Le Pagine non pubblicate non sono mai esposte, quindi il campo riguarda solo le pubblicate. |
| `ogTitle` / `ogDescription` / `ogImage` | Fallback rispettivamente a `metaTitle`, `metaDescription`, immagine di copertina della Pagina. |
| `structuredData` | JSON-LD generato dal sistema in base al template, estendibile a mano. Deve restare JSON-LD valido. |

Regole di sistema:

1. **Sitemap XML** generata dinamicamente dalle sole Pagine `published` con `robots`
   contenente `index`, con `hreflang` per le traduzioni disponibili.
2. **`robots.txt`** gestito dalle impostazioni globali del sito.
3. Ogni Pagina pubblicata espone gli **alternate `hreflang`** verso le traduzioni
   pubblicate del proprio gruppo di traduzione, più `x-default` sulla lingua di default.
4. Il punteggio/checklist SEO mostrato in editor è **puramente consultivo**: non blocca
   mai la pubblicazione.
5. Un Redirect non può puntare a se stesso, né creare una catena di lunghezza > 1: la
   catena viene compattata automaticamente al momento del salvataggio.

---

## GEO — Generative Engine Optimization

> Assunzione A1. Obiettivo: rendere il contenuto correttamente citabile e riassumibile
> dai motori di risposta generativi, non solo dai crawler tradizionali.

Ogni Pagina possiede, accanto ai metadati SEO:

| Campo | Regola |
|---|---|
| `aiSummary` | Riassunto sintetico e autosufficiente della Pagina, pensato per essere citato da un motore generativo. Compilabile a mano; non generato automaticamente senza consenso esplicito. |
| `keyFacts` | Elenco di affermazioni brevi e verificabili estratte dalla Pagina (dati, prezzi, condizioni, orari). |
| `faq` | Coppie domanda/risposta, esposte anche come JSON-LD `FAQPage`. |
| `entities` | Entità e argomenti trattati dalla Pagina, per esplicitare il contesto semantico. |
| `aiPolicy` | Consenso o divieto all'uso del contenuto da parte dei crawler AI. Default: consentito. |

Regole di sistema:

1. Il sito espone un file **`llms.txt`** generato dalle Pagine pubblicate che consentono
   l'uso AI, con titolo, percorso e `aiSummary`.
2. Le direttive dei crawler AI (`aiPolicy`) sono riflesse sia in `robots.txt` sia nei
   meta della Pagina. Una Pagina con `aiPolicy` negato **non** compare in `llms.txt`.
3. I `keyFacts` e le `faq` alimentano anche la base di conoscenza del chatbot integrato:
   una singola fonte, tre consumi (pagina, motori generativi, chatbot).
4. Nessuna generazione automatica di contenuto SEO/GEO tramite LLM è attiva di default:
   se introdotta, richiede ADR dedicata (costo, provider, trattamento dati).

---

## Multilingua

1. Il sito ha un elenco di **Locale** attivi e una lingua di **default** (impostazione globale).
2. Ogni Pagina appartiene a **un solo** Locale.
3. Le Pagine che rappresentano lo stesso contenuto in lingue diverse condividono un
   **gruppo di traduzione**; dentro un gruppo può esistere al massimo una Pagina per Locale.
4. Ogni traduzione ha **slug, metadati SEO/GEO e stato di pubblicazione propri**: una
   lingua può essere pubblicata e un'altra restare in bozza.
5. Creare una traduzione da una Pagina esistente **copia la struttura dei blocchi** e
   lascia i testi da tradurre: la struttura è condivisa come punto di partenza, non
   sincronizzata per sempre.
6. La cancellazione (soft delete) di una traduzione non tocca le altre lingue del gruppo.
7. Il fallback di lingua è **esplicito, non automatico**: se una Pagina non esiste nella
   lingua richiesta, la risposta pubblica è `404` e la sitemap/hreflang non la dichiara.
   Un fallback silenzioso alla lingua di default produrrebbe contenuto duplicato agli
   occhi dei motori di ricerca.
8. Le stringhe di interfaccia del sito pubblico (etichette, pulsanti) sono gestite
   separatamente dal contenuto delle Pagine.

---

## Media e risorse

1. I Media riusano il `FilesModule` esistente (ADR-8) come livello di storage: nessun
   secondo meccanismo di upload.
2. Ogni Media conserva metadati editoriali propri: **testo alternativo**, didascalia,
   crediti. Il testo alternativo è obbligatorio per le immagini usate nei blocchi di
   contenuto (avviso bloccante in editor, non a database).
3. Le varianti dimensionali delle immagini sono generate in modo asincrono (coda BullMQ)
   e non bloccano l'upload.
4. Un Media referenziato da almeno una Pagina non pubblicata o pubblicata **non può essere
   eliminato**: il sistema mostra dove è usato e richiede prima la rimozione dei riferimenti.
5. MIME type verificato dal contenuto reale, non dall'estensione. SVG trattato come
   contenuto attivo.

---

## Moduli di contatto

1. Un Modulo di contatto è una **definizione di campi** (tipo, etichetta, obbligatorietà,
   regole di validazione), riusabile in più Pagine tramite un blocco dedicato.
2. La validazione è **sempre ripetuta server-side**: la validazione client è solo UX.
3. Ogni Invio viene **persistito** prima di qualsiasi notifica: la ricezione non deve mai
   dipendere dalla riuscita dell'invio email.
4. Le email di notifica partono **esclusivamente dalla coda BullMQ**. I destinatari sono
   definiti nella configurazione del Modulo, **mai** presi da un campo del payload client.
5. Protezioni obbligatorie: rate limiting per IP, honeypot, marca temporale minima di
   compilazione. L'eventuale captcha di terze parti richiede ADR dedicata.
6. Gli Invii contengono dati personali: accesso limitato ai ruoli abilitati, redazione nei
   log, ed esportazione tracciata in audit log. La cancellazione di un Invio è soft delete.
7. Un Modulo con Invii ricevuti non può essere eliminato: solo disattivato.

---

## Menu di navigazione

1. Un Menu è un albero ordinato di voci; ogni voce punta a una Pagina interna o a una URL
   esterna, mai a un `id` numerico.
2. Una voce che punta a una Pagina non più pubblicata viene **nascosta dal sito pubblico**
   e segnalata in area amministrativa: non produce mai un link rotto.
3. I Menu sono per Locale: ogni lingua ha la propria navigazione.

---

## Chatbot integrato

1. Il chatbot risponde **solo** sulla base dei contenuti pubblicati del sito (assunzione A6).
2. Contenuto non pubblicato, bozze e Invii dei moduli non entrano mai nella base di
   conoscenza.
3. Chiavi e configurazione del provider vivono solo lato server, in `AppConstants`. Il
   client non riceve mai una chiave né il prompt di sistema.
4. Ogni input utente è trattato come non fidato (prompt injection): le istruzioni di
   sistema non sono sovrascrivibili dal messaggio dell'utente.
5. Il chatbot è **opt-in** e disattivato di default; l'attivazione richiede ADR dedicata
   che fissi provider, costi, trattamento dei dati conversazionali e ritenzione.
6. Rate limiting obbligatorio sull'endpoint pubblico del chatbot.

---

## Cache e invalidazione del contenuto pubblico

1. Le risposte degli endpoint `public/` sono cacheate in Redis.
2. L'invalidazione è **per evento, non per TTL**: pubblicazione, ripubblicazione,
   archiviazione, cambio slug, modifica di una Sezione globale o di un Menu invalidano
   esplicitamente le chiavi coinvolte.
3. Sitemap e `llms.txt` sono invalidati da qualsiasi cambio di stato di pubblicazione.
4. Un contenuto archiviato non deve mai restare servito dalla cache: l'invalidazione fa
   parte della transazione di archiviazione, non è un'operazione "best effort".

---

# PARTE 2 — Regole core della piattaforma (già implementate)

## Attori e ruoli

| Ruolo | Valore enum | Accesso |
|---|---|---|
| SuperAdmin | 5 | Accesso globale, bypassa il filtro scope, unico ruolo che può impersonare altri utenti ed eseguire seed/reset demo |
| Admin | 10 | Gestisce utenti e audit log; non può creare/vedere/gestire utenti con ruolo SuperAdmin |
| Manager | 20 | Soglia intermedia (`GuardManager`) — nel CMS corrisponde al profilo editoriale con potere di pubblicazione |
| User | 30 | Utente operativo di base, nessun privilegio amministrativo — nel CMS corrisponde all'autore che scrive bozze |

Numero minore = privilegio maggiore. I guard (`GuardSuperAdmin`, `GuardAdmin`,
`GuardManager`) confrontano con `<=` la soglia richiesta, tranne dove serve un match
esatto (es. impersonificazione, funzioni di sistema: solo `role === AppUserRoles.SuperAdmin`).

---

## Scope / filtro multi-tenant

`Utils.applyScopeFilter(authInfo, elevatedThreshold = AppUserRoles.Admin)` restituisce:
- `null` se `authInfo.role <= elevatedThreshold` (vede tutto)
- `authInfo.scopeId` altrimenti (filtra ai soli dati del proprio scope)

Il campo `scopeId` su `users` è generico e nullable. Con **A5 confermata il 2026-08-17**
(CMS mono-sito) il dominio **non lo usa**: nessuna query di dominio del CMS chiama
`applyScopeFilter`, perché non c'è nulla da segmentare.

Questa funzione resta l'**unico punto di innesto previsto** per un eventuale multi-sito
futuro (vedi § "Conseguenza di A5"). Applicazione **obbligatoria** su ogni query che
diventasse multi-tenant.

---

## Sicurezza password

Hashing: **bcrypt** (cost 12), sale generato internamente per ogni hash — mai password
in chiaro nel DB. Gli hash sono auto-identificanti (`$2b$…`). Il pattern di migrazione
trasparente di hash legacy al primo login riuscito è documentato come raccomandazione in
`docs/ai/adr/ADR-2-security-baseline.md` per progetti che importano utenti da un sistema
legacy — non applicato di default.

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
- Sessioni attive: elenco dei dispositivi collegati con possibilità di revoca
- Preferenza tema: Sistema (default) / Chiaro / Scuro — salvata in `localStorage`
  (chiave `color_scheme`), non nel DB

---

## Tema chiaro/scuro

- Mantine `colorScheme`: `auto` (default, segue preferenza sistema operativo) /
  `light` / `dark`
- Preferenza utente in `localStorage` (chiave `color_scheme`), letta da
  `ColorSchemeScript` in `index.html` per evitare flash del tema sbagliato al caricamento
- Ogni colore custom aggiunto in `theme.ts` deve essere verificato in entrambe le modalità
- Il Global Theme Customizer (token semantici persistiti in `app_settings`) è descritto in
  `docs/ai/adr/ADR-4-global-theme-customizer.md`

---

## Impersonificazione utente (SuperAdmin only)

- Solo un utente con ruolo `SuperAdmin` (match esatto, `GuardSuperAdmin`) può impersonare
  un altro utente, e non può impersonare un altro `SuperAdmin`
- `POST auth/impersonate/:guid`: backend genera un access token per l'utente target con
  claim aggiuntivo `impersonatedBy: <superAdminId>` — **nessun refresh token** viene
  generato durante l'impersonificazione (sessione limitata alla durata dell'access token)
- Frontend mostra un banner fisso: "Stai visualizzando come [nome] — Termina
  impersonificazione"
- `POST auth/end-impersonation` richiede `authInfo.impersonatedBy` presente nel token
  corrente, ripristina token normali (con refresh) per il SuperAdmin originale
- Ogni azione eseguita durante l'impersonificazione viene registrata in `audit_log` con
  sia `userId` (l'utente impersonato, autore formale dell'azione) sia `impersonatedBy`
  (il SuperAdmin reale)

---

## Audit Log

Tabella `audit_log` registra azioni critiche per tracciabilità (non un log esaustivo di
ogni CRUD — quello è già coperto da `createdBy`/`updatedBy` su ogni tabella):

- Login / logout
- Impersonificazione iniziata / terminata
- Creazione / modifica / disattivazione utenti
- Reset MFA
- Operazioni di sistema (`seed-demo` / `reset-demo`)
- Ogni azione eseguita durante l'impersonificazione (sempre, indipendentemente dal tipo)
- **Dominio CMS**: pubblicazione, depubblicazione, archiviazione, ripristino di revisione,
  soft delete di una Pagina, uso del blocco HTML/embed, esportazione degli Invii dei moduli

Ogni riga registra: `userId`, `impersonatedBy` (nullable), `action`, `entity`/`entityId`
(nullable), `details` (nullable), `ip`, `createdAt`. Consultabile da Admin+ via
`GET app/admin/audit-log` (paginato, filtri `userId`, `action`, `dateFrom`, `dateTo`).

---

## Notifiche

- Mailbox persistente per-utente (tabella `notifications`), con push realtime via Socket.io
  quando il client è connesso (ADR-12)
- `NotificationsService.notify(targetUserId, input, authorUserId?)` è il building block
  per i moduli di dominio
- Endpoint self-service sotto `app/notifications`, visibilità per singolo utente: il guid
  di un altro utente restituisce `404`, mai `403`

---

## Funzioni di sistema (solo SuperAdmin)

- `POST app/admin/system/seed-demo`: popola il database con dati demo minimi (un utente
  per ruolo). Operazione idempotente.
- `POST app/admin/system/reset-demo`: wipe transazionale FK-safe di tutti i dati
  applicativi, mantenendo solo l'utente SuperAdmin. Operazione distruttiva e irreversibile
  — richiede conferma esplicita in UI.
- Entrambe richiedono `role === AppUserRoles.SuperAdmin` (controllo esatto, non `<=`),
  guard dedicato `GuardSuperAdmin`.

---

## Tour guidato e help contestuale

- Al primo accesso parte un tour guidato che evidenzia gli elementi chiave della UI
- Il tour è interrompibile in ogni momento ("Salta tour"); la scelta viene salvata in
  `localStorage`
- Pulsante di help fisso: riapre il tour generale; su pagine con help contestuale
  specifico apre un pannello con suggerimenti relativi alla pagina corrente
- Il tour NON blocca l'uso dell'app — è sempre sovrapposto e disattivabile
