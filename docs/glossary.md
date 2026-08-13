# Glossario — CMS

> Dizionario dei termini usati nel progetto. Priorità: dopo Business Rules.
> Se un termine non è qui e non è in `docs/business-rules.md`, non esiste: va
> definito prima di essere usato in una spec o nel codice.
>
> Ultima revisione: 2026-08-13 — aggiunta la sezione di dominio del CMS a pagine.

---

## Termini di dominio — Contenuto

| Termine | Significato |
|---|---|
| **Pagina** | Unità di contenuto pubblicabile e l'entità centrale del CMS. Ha un titolo, uno slug, una lingua, uno stato, un albero di Blocchi e metadati SEO/GEO propri. Non esiste un tipo "post" separato: ogni tipologia di contenuto è una Pagina. |
| **Blocco** | Nodo dell'albero di contenuto di una Pagina. Ha un `type` registrato, un oggetto `props` validato contro lo schema di quel tipo, e figli eventuali. È il mattone che l'editor visivo manipola. |
| **Registro dei tipi di blocco** | Elenco autoritativo dei `type` di Blocco esistenti, con il relativo schema di validazione e le regole di annidamento. Un `type` fuori dal registro non è salvabile. |
| **Albero di contenuto** | Struttura JSON gerarchica dei Blocchi di una Pagina, persistita in colonna `jsonb`. È il contenuto: non esiste una versione HTML canonica salvata a database. |
| **Sezione globale** | Gruppo di Blocchi riusabile e referenziato (non copiato) da più Pagine: header, footer, call to action. Modificarla si riflette ovunque sia usata. |
| **Template** | Struttura di partenza riusabile per creare nuove Pagine. A differenza della Sezione globale, il Template viene copiato alla creazione e da quel momento la Pagina è indipendente. |
| **Revisione** | Snapshot immutabile del contenuto e dei metadati di una Pagina a un dato momento, creato a ogni pubblicazione. Non si modifica e non si cancella. |
| **Bozza di lavoro** | Versione modificabile di una Pagina, distinta da ciò che il pubblico vede. Modificare una Pagina pubblicata alimenta la bozza, non il pubblicato. |
| **Ripristino** | Creazione di una nuova bozza a partire da una Revisione passata. Non riscrive la storia: per tornare online serve una nuova pubblicazione. |
| **Stato** | Fase del ciclo di vita di una Pagina: `draft`, `review`, `scheduled`, `published`, `archived`. Le transizioni ammesse sono elencate in `docs/business-rules.md`. |
| **Pubblicazione** | Transizione a `published`. Crea una Revisione, valorizza `publishedAt` e invalida la cache pubblica delle risorse coinvolte. |
| **Programmazione** | Pubblicazione differita a una data futura (`scheduled`), eseguita da un repeatable job BullMQ. |
| **Archiviazione** | Ritiro di una Pagina dalla pubblicazione, conservandola. Reversibile. Diversa dal soft delete. |

---

## Termini di dominio — URL, SEO e GEO

| Termine | Significato |
|---|---|
| **Slug** | Segmento di URL leggibile che identifica una Pagina, unico per combinazione (locale, genitore). È l'identificatore pubblico del contenuto: l'`id` numerico non compare mai in URL. |
| **Percorso (path)** | Concatenazione degli slug degli antenati di una Pagina più il proprio (`/servizi/consulenza/aziende`). |
| **Redirect** | Regola di reindirizzamento `301`/`302` da un vecchio percorso a uno nuovo, proposta automaticamente al cambio di slug di una Pagina pubblicata. |
| **SEO** | *Search Engine Optimization*. Insieme dei metadati che governano come la Pagina viene indicizzata e presentata dai motori di ricerca tradizionali. |
| **GEO** | *Generative Engine Optimization*. Insieme dei metadati che rendono la Pagina correttamente riassumibile e citabile dai motori di risposta generativi (assistenti AI, AI Overviews). **Non** significa geolocalizzazione in questo progetto. |
| **Canonical** | URL considerata autorevole per un contenuto raggiungibile da più percorsi, per evitare contenuto duplicato agli occhi dei motori di ricerca. |
| **`robots` (per pagina)** | Direttive di indicizzazione della singola Pagina: `index`/`noindex`, `follow`/`nofollow`. |
| **Structured data (JSON-LD)** | Descrizione semantica della Pagina in formato JSON-LD, generata dal sistema in base al template ed estendibile a mano. |
| **`hreflang`** | Dichiarazione delle versioni linguistiche alternative di una Pagina, generata dal gruppo di traduzione. `x-default` punta alla lingua di default. |
| **Sitemap** | Indice XML delle sole Pagine pubblicate e indicizzabili, generato dinamicamente. |
| **`aiSummary`** | Riassunto autosufficiente della Pagina, scritto per essere citato da un motore generativo. |
| **`keyFacts`** | Affermazioni brevi e verificabili estratte dalla Pagina (dati, prezzi, condizioni), riusate da GEO e chatbot. |
| **`aiPolicy`** | Consenso o divieto all'uso del contenuto della Pagina da parte dei crawler AI. Una Pagina che nega il consenso non compare in `llms.txt`. |
| **`llms.txt`** | File generato che elenca le Pagine pubblicate consentite all'uso AI, con percorso e `aiSummary`. |

---

## Termini di dominio — Multilingua

| Termine | Significato |
|---|---|
| **Locale** | Lingua/varietà linguistica gestita dal sito, in forma `lingua-REGIONE` (es. `it-IT`, `en-GB`). |
| **Lingua di default** | Locale usato come riferimento del sito e come `x-default` negli `hreflang`. Impostazione globale. |
| **Gruppo di traduzione** | Legame che collega le Pagine che sono lo stesso contenuto in lingue diverse. Al massimo una Pagina per Locale dentro un gruppo. |
| **Traduzione** | Pagina autonoma appartenente a un gruppo di traduzione: ha slug, metadati e stato di pubblicazione propri, non è un campo affiancato di un'altra Pagina. |
| **Fallback di lingua** | Comportamento quando una Pagina non esiste nella lingua richiesta. In questo CMS **non è automatico**: la risposta pubblica è `404`, per non generare contenuto duplicato. |

---

## Termini di dominio — Media, moduli, navigazione, chatbot

| Termine | Significato |
|---|---|
| **Media** | Risorsa binaria (immagine, documento, video) con metadati editoriali: testo alternativo, didascalia, crediti. Poggia sul `FilesModule` esistente. |
| **Testo alternativo (alt)** | Descrizione testuale di un'immagine, obbligatoria per le immagini usate nei Blocchi di contenuto. Requisito di accessibilità, non opzione estetica. |
| **Variante** | Versione derivata di un Media (es. ridimensionamento immagine), generata in modo asincrono via coda BullMQ. |
| **Modulo di contatto** | Definizione riusabile di un form pubblicabile in Pagina: campi, tipi, obbligatorietà, regole di validazione, destinatari delle notifiche. |
| **Invio (submission)** | Singola compilazione ricevuta da un Modulo di contatto. Persistito prima di qualsiasi notifica email. Contiene dati personali. |
| **Honeypot** | Campo nascosto di un form che un utente reale non compila mai: se valorizzato, l'invio è trattato come spam. |
| **Menu** | Albero ordinato di voci di navigazione, per Locale. Una voce che punta a una Pagina non più pubblicata viene nascosta, mai lasciata come link rotto. |
| **Chatbot** | Assistente conversazionale integrato che risponde esclusivamente sulla base dei contenuti pubblicati del sito. Opt-in, disattivato di default. |
| **Prompt injection** | Tentativo di un utente di sovrascrivere le istruzioni di sistema del chatbot tramite il proprio messaggio. Ogni input utente è trattato come non fidato. |

---

## Termini di architettura

| Termine | Significato |
|---|---|
| **Headless** | Il backend espone contenuto via API e non renderizza mai HTML di pagina. Il rendering è responsabilità del consumer. |
| **Superficie pubblica** | Endpoint `api/v1/public/*`: anonimi, in sola lettura, cacheabili, limitati ai contenuti `published`. |
| **Superficie amministrativa** | Endpoint `api/v1/app/*`: autenticati, sotto RBAC, mai cacheati. |
| **Invalidazione per evento** | Strategia di cache in cui le chiavi vengono invalidate esplicitamente dall'evento che cambia il contenuto (pubblicazione, archiviazione, cambio slug), non lasciate scadere per TTL. |
| **Controllo ottimistico** | Meccanismo che respinge con `409` un salvataggio basato su una versione ormai superata del contenuto, invece di sovrascrivere in silenzio. |
| **Sanitizzazione** | Rimozione server-side, prima della persistenza, di tag, attributi e URL pericolosi dal rich text prodotto dall'editor. |
| **Versione di schema del blocco** | Numero che identifica la forma delle `props` di un tipo di Blocco. Cambiarla richiede una migrazione dei contenuti già salvati. |

---

## Termini core — RBAC / Autenticazione

| Termine | Significato |
|---|---|
| **Ruolo** | Livello di privilegio assegnato a un utente, espresso come intero (`AppUserRoles`). Numero minore = privilegio maggiore. |
| **SuperAdmin** | Ruolo massimo (`5`). Unico abilitato a impersonare altri utenti, eseguire seed/reset demo, usare il blocco HTML/embed. |
| **Admin** | Ruolo (`10`). Gestisce utenti, audit log, impostazioni del sito, lingue, tema e redirect. Non può creare/gestire SuperAdmin. |
| **Manager** | Ruolo (`20`). Profilo editoriale con potere di pubblicazione: crea, modifica e pubblica Pagine, gestisce Menu, Template e Moduli. |
| **User** | Ruolo base (`30`). Autore: scrive e modifica le proprie bozze, non pubblica. |
| **Scope / tenant** | Perimetro dati di un utente. Campo `scopeId` nullable su `users`, applicato con `Utils.applyScopeFilter(authInfo)`. Non usato dal dominio CMS finché resta mono-sito. |
| **Guid** | Identificativo pubblico a 16 caratteri esadecimali usato nelle URL amministrative al posto dell'`id` numerico sequenziale. |
| **Soft delete** | Disattivazione logica di un record (`isActive = false`) invece di cancellazione fisica. Obbligatorio su entità anagrafiche e di contenuto. |
| **MFA / TOTP** | Autenticazione a due fattori basata su codice temporaneo (RFC 6238), compatibile con app authenticator standard. |
| **Impersonificazione** | Un SuperAdmin opera "vestendo" l'identità di un altro utente per assistenza/debug, tracciata nel JWT (`impersonatedBy`) e nell'audit log. |
| **Audit log** | Registro delle azioni sensibili (chi, cosa, quando, da quale IP), consultabile da Admin+. |
| **Access token** | JWT di breve durata (default 15 minuti) usato per autenticare le richieste API. |
| **Refresh token (rtk)** | Token opaco di lunga durata (default 7 giorni), veicolato in cookie httpOnly firmato, con rotation ad ogni utilizzo. |
| **Allowlist di sessione** | Chiave Redis (`login:${accessToken}`) che rende un access token effettivamente valido finché non scade o viene revocato al logout. |
| **Sessione / dispositivo** | Identificativo opaco stabile (`session:${sessionId}` in Redis) che rappresenta un dispositivo collegato per tutta la durata del refresh token, revocabile dal profilo utente. |
