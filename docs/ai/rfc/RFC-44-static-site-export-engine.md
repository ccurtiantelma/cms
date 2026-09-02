# RFC-44 — Static Site Export Engine: disaccoppiare il servizio pubblico da Node e dal Database

## Status
[ ] In discussione · [x] Approvato → genera ADR-45 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-01

---

## Problema

Un task esterno chiede un motore SSG (Static Site Generation) che elimini l'esposizione
runtime di Node.js e del Database sul sito pubblico, con TTFB < 15ms, tramite: un
`StaticExportModule` (NestJS/BullMQ) attivato da `PAGE_PUBLISHED`/`PAGE_UNPUBLISHED`/
`THEME_UPDATED`, rendering React in-memory con Critical CSS inline, gestione asset media,
un Deployer Adapter (cartella locale ora, S3/Cloudflare Pages predisposti), invalidazione
incrementale per singola pagina o full-site su cambi di tema, e `app/public-site` (porta
`55000`, confermata in `docker-compose.prod.yml:109`) relegato a server di anteprima per i
redattori.

Il controllo documentale preliminare imposto da `CLAUDE.md` § Anti-hallucination segnala
che **questa non è una feature su territorio vergine**: F03 è chiusa (`progress-tracker.md`
riga 71) e la superficie pubblica esiste già, governata da tre ADR approvate il 2026-08-17
che questa proposta tocca direttamente, non di striscio:

1. **ADR-22 § "Alternative scartate"** ha già esaminato e respinto per nome l'opzione
   "**SSG a build time**", con una motivazione puntuale: *"la pubblicazione diventerebbe un
   trigger di build: incompatibile con l'NFR 'invalidazione entro 5 secondi'... la cache di
   ADR-23 dà già il profilo di servizio di SSG senza pipeline di build"*. Il task esterno
   chiede esattamente l'opzione che l'ADR ha nominato e scartato. Questo non chiude la
   discussione — un'ADR approvata si supera con una nuova ADR, mai riscrivendo la
   precedente — ma impone di rispondere punto per punto al motivo per cui fu scartata,
   sezione "Alternative valutate" più sotto, non di ignorarlo.

2. **`CLAUDE.md` § Divieti assoluti** vieta, senza soglia di tolleranza, *"rendering HTML
   nell'API"*. La stessa ADR-22, alla voce "Alternative scartate", lo applica in modo
   esplicito contro un design quasi identico a quanto il task descrive (*"Rendering dentro
   NestJS — viola il divieto assoluto... e lega la disponibilità del sito a quella
   dell'API"*). Il task chiede che `StaticExportModule` — un modulo NestJS — esegua
   *"Rendering HTML statico in-memory riutilizzando i componenti di resa React"*. Se
   "riutilizzare i componenti React" significa importare `renderToStaticMarkup` dentro
   `app/backend`, è la stessa violazione, non un'eccezione perché il risultato è scritto su
   file invece che restituito come risposta HTTP: il divieto riguarda **dove gira il
   rendering**, non a chi risponde. La § "Soluzione proposta" qui sotto risolve questo senza
   rinunciare all'obiettivo, riusando `app/public-site` come motore di rendering invece di
   duplicarlo dentro NestJS.

3. **ADR-23** ha già costruito l'unica cache del contenuto pubblico (`RedisService`,
   invalidazione sincrona post-commit, nessuna TTL, coda `cache-invalidation-queue` di
   ricorso) e ha già scartato esplicitamente sia la TTL come rete di sicurezza sia
   l'invalidazione asincrona come percorso primario. Un export statico introduce una
   seconda pipeline di "freschezza del contenuto pubblico" parallela alla prima: va deciso
   se le due coesistono con ruoli diversi (proposto sotto) o se la seconda sostituisce la
   prima, perché altrimenti si ottengono due sistemi che rispondono alla stessa domanda con
   garanzie diverse.

4. **ADR-24** ha già l'algoritmo di risoluzione `(locale, percorso) → Pagina`, il `404`
   uniforme e la regola sui redirect assenti (*"non si cambia lo slug di una pagina già
   indicizzata"*, § 6). Un export statico non riscrive quell'algoritmo: lo sposta da
   *tempo di richiesta* a *tempo di build* — distinzione che il testo del task non fa e che
   ha conseguenze dirette sulla point 6 di ADR-24, trattate sotto.

5. **`docs/non-functional-requirements.md` § Performance — superficie pubblica** dichiara
   già dei target misurati e in produzione: *"< 50ms al 95° percentile"* con cache calda,
   *"< 200ms"* con cache fredda, invalidazione entro 5 secondi. Il target del task
   (TTFB < 15ms) non è nel documento normativo: è un obiettivo **nuovo**, più stretto di un
   fattore ~3 rispetto a quanto già misurato e accettato, senza un driver di prodotto
   dichiarato (traffico, SEO, contratto con terzi). Va scritto esplicitamente come nuovo
   target da approvare in `non-functional-requirements.md`, non trattato come se fosse già
   normativo.

**Le premesse del task sono tecnicamente fondate** — servire file statici da Nginx/CDN è
strutturalmente più veloce e più sicuro (nessun processo Node/DB raggiungibile dal
pubblico) di qualunque SSR-per-richiesta, per quanto cachato. Il problema non è l'obiettivo:
è che il task lo formula come se fosse la prima feature sulla superficie pubblica, quando
è la quarta, e le prime tre hanno già preso — per iscritto, con motivazioni — decisioni che
un SSG deve **riconciliare**, non scavalcare.

---

## Soluzione proposta

Otto decisioni, ciascuna ancorata a moduli e file reali del repository. Nessuna tocca
`schema.ts`.

### Decisione 1 — Chi renderizza: `app/public-site` resta l'unico renderer, `StaticExportModule` non importa mai React

`StaticExportModule` vive in `app/backend/src/static-export/` come ogni altro modulo
NestJS, ma il suo unico compito è **orchestrare**: riceve il trigger, arricchisce la coda
BullMQ con l'elenco di percorsi da rigenerare, e — nel processor — ottiene l'HTML già
renderizzato facendo una richiesta HTTP interna a `app/public-site` sulla rete Docker
(esattamente la richiesta che farebbe un visitatore, contro il container che già esiste per
ADR-22), poi scrive il corpo della risposta su disco/adapter. Zero `import` di `react` o
`react-dom/server` in `app/backend`. Questo non è un compromesso rispetto al task: è l'unico
modo di ottenere *"rendering HTML statico... riutilizzando i componenti di resa React del
frontend/public-site"* senza duplicarli (violerebbe ADR-22 § 3, *"un solo componente per
blocco, mai due copie"*) e senza importarli in NestJS (violerebbe il divieto assoluto,
Problema § 2).

`app/public-site` non richiede alcuna rotta nuova per questo: la rotta pubblica per slug
(ADR-24) già restituisce esattamente l'HTML che va scritto su file. Il processor la chiama
come client HTTP, non la reimplementa.

### Decisione 2 — Stato dell'export: manifest sul filesystem, mai una tabella

`"Zero modifiche allo schema PostgreSQL"` è un vincolo del task stesso, ed è anche
`CLAUDE.md` § Ask first (*"schema DB/migrazioni"*, mai senza ADR + approvazione umana). Lo
stato di cui l'export ha bisogno — hash del contenuto esportato per pagina, timestamp
ultimo build, esito — non entra in `app_settings` (che è configurazione, non stato
derivato e rigenerabile) né in una tabella nuova: vive in un `manifest.json` scritto
accanto all'output statico stesso, e nello stato dei job BullMQ già persistito su Redis
(`queue-health.task.ts` lo osserva già per le code esistenti). Se il manifest va perso, si
ricostruisce con un full-site rebuild: è cache derivata, non verità di dominio — la verità
resta `page_revisions`/`pages.publishedRevisionId`.

### Decisione 3 — Trigger: non un bus di eventi nuovo, gli stessi punti che già invalidano la cache di ADR-23

Il task nomina `PAGE_PUBLISHED`/`PAGE_UNPUBLISHED`/`THEME_UPDATED` come se fosse un event
bus esistente: **non lo è**. `app/backend` non ha un `EventEmitter` di dominio — l'unico
precedente comparabile è `changeStatus()` in `pages.service.ts`, che dopo il commit chiama
direttamente `publicPageCache.invalidatePage(...)`/`invalidateLocations(...)` (righe 385,
472, 553, 679). `StaticExportModule` introduce un `StaticExportQueueService` gemello di
`CacheInvalidationQueueService` (stesso pattern, stessa cartella `app/backend/src/queues/`),
chiamato **dagli stessi punti**, non da un evento nuovo:

- `pages.service.ts::changeStatus` (transizione a/da `published`, i quattro call-site sopra)
  → job di export a singola pagina, stesso insieme di percorsi che `invalidateLocations`
  già calcola per lo slug/reparenting (ADR-23 § 4 — "ometterlo lascerebbe stantio il
  payload sotto il vecchio percorso" vale identico qui, con l'aggravante che qui il file
  stantio è raggiungibile *direttamente* da Nginx, senza passare né da API né da cache).
- `settings.service.ts` (salvataggio del tema, ADR-4/ADR-42) → job di **full-site rebuild**.
- `global-sections` (`app/backend/src/global-sections/`) → job di full-site rebuild limitato
  alle Pagine che referenziano la Sezione modificata (stesso principio di "invalidazione a
  cascata" già previsto per F06 in `docs/roadmap.md` riga 108).

Nessun `EventEmitter2` nuovo si introduce per questo: sarebbe un'astrazione in più per tre
chiamate dirette che già esistono come chiamate dirette.

### Decisione 4 — Politica di rebuild: singola pagina sincrona-in-coda con SLA ereditata, full-site solo asincrono e battuto

Rigenerare una pagina è un'operazione dello stesso ordine di costo di una lettura a cache
fredda (< 200ms, NFR già citato): il job di singola pagina è accodato in BullMQ con
priorità alta e concorrenza dedicata, **stessa SLA di invalidazione già normata da NFR**
(< 5 secondi dal commit alla disponibilità del file statico) — non una SLA nuova e non
allentata. Il full-site rebuild (tema, sezione globale) può toccare fino a 10.000 Pagine ×
10 lingue (`non-functional-requirements.md` § Volumi di riferimento) = fino a 100.000
render: va **sempre** asincrono, batched con backpressure (stesso principio già in uso in
`analytics-rollup-queue`), senza SLA di secondi — è un'operazione di minuti, dichiarata
come tale a chi salva il tema, con uno stato di avanzamento osservabile (non specificato qui
nel dettaglio UI, di competenza frontend-developer se questa RFC viene approvata).

### Decisione 5 — Tombstone: rimuovere il file statico è distinto dal soft delete della riga

`CLAUDE.md` § Divieti assoluti vieta il `DELETE` fisico — **sulla riga Postgres**. Un file
statico sotto una web root pubblica non è quella riga: è un artefatto derivato e pubblico,
e lasciarlo raggiungibile dopo che la Pagina è stata spostata a `unpublished`/archiviata/
soft-eliminata violerebbe l'invariante di dominio *"pagina non pubblicata mai raggiungibile"*
(`CLAUDE.md` § Test Engineer, copertura obbligatoria) in un modo più grave del `404`
dinamico attuale: un file rimasto su disco continua a essere servito da Nginx anche se
l'intero backend è giù. Il job di export, su transizione fuori da `published`, **cancella
fisicamente** il file statico (non lo marca, non lo nasconde con una regola Nginx fragile).
Cambio di slug: stessa cosa sul percorso vecchio, coerente con ADR-24 § 6 (*"non si cambia
lo slug di una pagina già indicizzata"* — qui l'assenza di redirect produce un file rimosso,
non un `404` calcolato al volo, ma l'effetto per il visitatore è identico).

### Decisione 6 — Media: riuso di ADR-27, copia bytes invece di riferimento

Il task chiede *"risoluzione GUID e copia dei file ottimizzati"*. Il registro dei media
pubblici esiste già (ADR-27, `GET api/v1/public/media/:guid`, `entity = 'page-media'`,
SVG sempre rifiutato). Il job di export, per ogni `mediaRef` trovato nell'albero
`publishedContent` risolto, chiama la stessa risoluzione GUID → file di
`FilesModule`/`storage abstraction` (ADR-8) usata da quell'endpoint, copia i byte
nell'adapter di destinazione sotto un percorso stabile (`/assets/media/<guid>.<ext>`), e
riscrive l'URL nell'HTML esportato come percorso relativo statico. Nessuna estensione al
registro media, nessun nuovo `kind` di blocco: puro consumo di ciò che ADR-21/ADR-27 già
espongono. Il vincolo "SVG sempre rifiutato" di ADR-27 § 4 si eredita per costruzione,
perché la risoluzione è la stessa.

### Decisione 7 — Critical CSS: già risolto da ADR-42, non serve un meccanismo nuovo

`ThemeStyleTag.tsx` inietta già le variabili CSS del tema come `<style>` inline in ogni
documento renderizzato da `app/public-site` (nota "Tema di installazione → sito pubblicato",
`progress-tracker.md` riga 496 e seguenti), **dopo** il foglio dei blocchi, per vincere la
cascata. Poiché Decisione 1 fa scrivere su file l'HTML già prodotto da quel renderer, il
Critical CSS richiesto dal task è già inline nell'output catturato — non c'è una fase
separata da costruire. L'unico compito nuovo è verificare (test, non codice applicativo) che
la copia su file non perda quell'iniezione.

### Decisione 8 — Deployer Adapter: cartella locale in scope ora, S3/Cloudflare Pages solo predisposti

Coerente con la formulazione del task (*"predisposizione per"*, non "implementazione di"):
un'interfaccia `StaticSiteDeployer` con un solo metodo (`write(path, bytes)` / `remove(path)`)
e un'unica implementazione attiva, `LocalFolderDeployer` (scrive sotto una directory servita
da Nginx via bind mount, stesso pattern già in uso per `FilesModule`). `S3Deployer` e
`CloudflarePagesDeployer` restano **interfacce dichiarate, non implementate**: attivarle
introduce un provider esterno, che `CLAUDE.md` § Ask first blocca senza ADR e approvazione
umana dedicata (credenziali, costi, un secondo luogo dove il contenuto pubblicato esiste).
Questa RFC non li implementa nemmeno come stub che compila: propone solo l'interfaccia,
perché uno stub non testabile darebbe un falso senso di completamento.

---

## Alternative valutate

- **Implementare `StaticExportModule` con `renderToStaticMarkup` importato dentro
  `app/backend`, come il testo del task suggerisce alla lettera.** Scartata: viola il
  divieto assoluto "rendering HTML nell'API", con lo stesso ragionamento che ADR-22 ha già
  scritto per un design equivalente. Nessuna riformulazione del task può aggirarlo senza
  una ADR che riscriva quel divieto — fuori portata di questa RFC e di qualunque RFC AI
  (`CLAUDE.md`: la Constitution e i Divieti assoluti non si toccano di iniziativa AI).
- **Reverse-proxy cache (`nginx proxy_cache` o simile) davanti al renderer SSR esistente,
  invalidato dagli stessi trigger di ADR-23, invece di un export statico completo.** È
  l'evoluzione che ADR-22 § 6 aveva già anticipato per iscritto (*"se un giorno servirà
  cachare l'HTML, il posto è un reverse proxy davanti, invalidato dallo stesso evento"*).
  Rispetto alla proposta: molto meno superficie nuova (nessun modulo, nessun manifest,
  nessuna gestione di tombstone/adapter, l'algoritmo di ADR-24 resta a tempo di richiesta
  senza spostamento concettuale), stesso profilo di latenza a cache calda che questo RFC
  cerca. **Ma non raggiunge l'obiettivo dichiarato dal task**: Node e il Database restano
  nel percorso di richiesta a ogni cache miss (deploy, riavvio, chiave invalidata) e restano
  processi raggiungibili dalla rete pubblica. Se l'obiettivo primario è la **prestazione**,
  questa alternativa costa una frazione della complessità. Se l'obiettivo primario è
  l'**isolamento** (zero Node/DB esposti, superficie d'attacco pubblica ridotta a un web
  server statico), non la raggiunge. Il task dichiara esplicitamente il secondo obiettivo
  ("eliminare l'esposizione runtime"): per questo la proposta principale resta l'export
  completo, ma l'alternativa va segnalata perché è sostanzialmente più economica per un
  obiettivo adiacente e potrebbe essere ciò che serve davvero se l'isolamento non è, in
  pratica, un requisito duro.
- **TTL come rete di sicurezza sui file statici (rigenerazione periodica indipendente dagli
  eventi).** Scartata per lo stesso motivo per cui ADR-23 l'ha già scartata per Redis: *"è
  esattamente ciò che degrada l'invalidazione a best effort"*. Un file statico stantio è
  anzi peggiore di una chiave Redis stantia, perché è raggiungibile anche a backend spento.
- **Rendering statico a *ogni* modifica di bozza, non solo alla pubblicazione.** Scartata:
  romperebbe la regola 4 del modello di contenuto (*"bozza e pubblicato coesistono"*) nel
  modo più diretto possibile — esporrebbe contenuto non pubblicato su un file pubblico. I
  trigger restano `published`/`unpublished`/tema/sezioni globali, mai `draftContent`.
- **Costruire un `EventEmitter2` di dominio generico ora, per avere `PAGE_PUBLISHED` come
  evento reale invece di tre chiamate dirette.** Considerata e scartata per questo round:
  introdurrebbe un'astrazione architetturale nuova (bus di eventi) per servire un solo
  consumer nuovo, quando il pattern già in uso nel repository per lo stesso problema
  (invalidazione post-commit) è la chiamata diretta da `pages.service.ts`. Se un secondo
  consumer di "pubblicazione" comparirà in futuro (es. F11 chatbot, che deve ri-indicizzare
  la knowledge base), la domanda va riaperta allora, non anticipata qui senza un secondo
  bisogno reale.

---

## Impatto

- **Supera parzialmente ADR-22**: § 1 e § 2 restano vere per la sola rotta di anteprima
  (ADR-25, `/__preview/:token`), ma non più per il traffico pubblico anonimo, che smette di
  attraversare `app/public-site` in produzione — servito invece dall'adapter locale/Nginx.
  `app/public-site` **non si elimina**: resta il renderer unico (Decisione 1) e resta
  raggiungibile internamente dal processor di export e, sulla rete pubblica, dai soli
  redattori autenticati per l'anteprima. Serve un'ADR nuova che dichiari esplicitamente
  questa riduzione di perimetro — non una riscrittura di ADR-22, che resta il record storico
  della decisione originale.
- **Non supera ADR-23**, ma ne cambia il consumer primario: la cache Redis smette di servire
  il traffico pubblico anonimo (che ora legge file) e diventa l'accelerazione delle
  richieste che il **processor di export** fa a `api/v1/public/` per costruire ogni pagina —
  stesso meccanismo, pubblico diverso. Va scritto esplicitamente nella ADR conseguente,
  perché altrimenti la sezione "Conseguenza" di ADR-23 (*"il `p95` da misurare... è quello
  del percorso freddo"*) descriverebbe un traffico che non esiste più.
- **Non supera ADR-24**: l'algoritmo di risoluzione e l'invariante del `404` uniforme
  restano gli stessi, ma il punto di applicazione si sposta da tempo di richiesta (Nginx non
  risolve nulla, serve un file o niente) a tempo di build (il job di export applica
  l'algoritmo una volta per pagina). Va reso esplicito che ADR-24 continua a governare
  **come si calcola** un percorso, non più **quando**.
- **`non-functional-requirements.md`**: il target TTFB < 15ms è nuovo, non presente oggi.
  Se questa RFC procede, va aggiunto formalmente (compito umano o AI su richiesta esplicita,
  `CLAUDE.md` § Documentation Policy) accanto ai target esistenti di F03, non in sostituzione
  — i target di cache calda/fredda restano validi per il percorso di anteprima e per il
  processor di export stesso.
- **Ownership dei ruoli**: `StaticExportModule`, la coda BullMQ e la configurazione Nginx di
  root sono territorio Backend Developer (`app/backend/` + config di root, assegnazione già
  dichiarata in `CLAUDE.md` § Ruoli). Qualunque touch-point su `app/public-site` (se emergono
  requisiti di rendering non già coperti dalla rotta esistente) resta Frontend Developer per
  l'estensione di perimetro di ADR-22 § 5. Il lavoro va spezzato per ruolo nel plan
  conseguente, non assegnato a un solo agente.
- **Nessuna migrazione Postgres**: confermato dalle Decisioni 1, 2, 5, 6 — nessuna riga di
  `schema.ts` è toccata da questa proposta.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Finestra di propagazione: fra il commit di pubblicazione e la scrittura del file statico (fino a 5s per Decisione 4) un visitatore può ricevere ancora il file vecchio — regressione rispetto al `DEL` sincrono di ADR-23, che oggi non lascia questa finestra sul percorso cache/DB | Alta, strutturale a qualunque pipeline asincrona | Medio — bozza non pubblicata non è mai esposta (i trigger restano solo su `published`/`unpublished`), il rischio è "vecchio pubblicato" vs "nuovo pubblicato", non "non pubblicato" vs "pubblicato" | SLA di 5s invariata (non allentata), da misurare come NFR nuovo; va dichiarato esplicitamente come trade-off accettato, non nascosto |
| Full-site rebuild su tema/sezione globale con fino a 100.000 render (10.000 Pagine × 10 lingue) satura la coda o il worker | Media, cresce con il catalogo | Alto se non battuto — può ritardare anche i job a singola pagina se condividono worker | Coda/priorità dedicate per singola-pagina vs full-site (Decisione 4), concorrenza e backpressure esplicite, mai lo stesso worker pool del percorso a 5s |
| File statico orfano non rimosso su unpublish/soft-delete/reparenting, raggiungibile da Nginx anche a backend spento | Media se il tombstone non è testato quanto l'export | Alto — viola direttamente l'invariante "pagina non pubblicata mai raggiungibile", più grave del `404` dinamico perché sopravvive a un backend giù | Decisione 5 obbligatoria e testata come gli 8 scenari di dominio di `CLAUDE.md` § Test Engineer, stesso rigore già richiesto per l'invalidazione cache |
| Implementazione che importa `react-dom/server` dentro `app/backend` per "semplicità", aggirando Decisione 1 | Media se non vincolato esplicitamente nell'ADR conseguente | Alto — violazione diretta di un divieto assoluto tolleranza zero | L'ADR conseguente deve vietarlo per nome, non per omissione; gate di CI (grep su `app/backend` per import vietati, stesso pattern del controllo `dangerouslySetInnerHTML` di ADR-22 § 7) |
| S3/Cloudflare Pages attivati senza ADR dedicata, "tanto l'interfaccia c'è già" | Bassa se Decisione 8 è rispettata alla lettera | Alto — provider esterno con credenziali e superficie di costo/compliance senza approvazione | Nessuna implementazione concreta oltre `LocalFolderDeployer` finché non esiste un'ADR propria, coerente con `CLAUDE.md` § Ask first |
| Drift fra ciò che l'anteprima (`app/public-site` live) mostra e ciò che l'export ha effettivamente pubblicato, se i due percorsi divergono nel tempo | Bassa oggi (stesso renderer, Decisione 1), cresce se in futuro l'export introduce trasformazioni proprie (es. minify) non applicate all'anteprima | Medio — un redattore vede in anteprima qualcosa di diverso da ciò che è online | Qualunque trasformazione post-render (minify, riscrittura URL media) va applicata come passo esplicito e testato, mai divergere silenziosamente dall'HTML restituito dalla rotta pubblica esistente |

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti che richiedono una firma esplicita, singolarmente:**

- [x] **N1** — Obiettivo primario: isolamento (zero Node/DB raggiungibili dal pubblico,
  proposta principale di questa RFC) oppure sola prestazione (reverse-proxy cache davanti
  a SSR esistente, alternativa più economica in § Alternative valutate)? Le due non sono la
  stessa scelta con costo diverso: raggiungono obiettivi diversi. — **Confermato: isolamento.**
- [x] **N2** — Se N1 = isolamento: conferma che `StaticExportModule` non importa mai
  `react`/`react-dom/server` in `app/backend` (Decisione 1) e che il rendering resta
  interamente dentro `app/public-site`, raggiunto via chiamata HTTP interna. — **Confermato.**
- [x] **N3** — Conferma della SLA di 5 secondi (invariata da NFR esistente, non allentata)
  per il job di singola pagina, e accettazione esplicita della finestra di propagazione
  come trade-off (Rischi, riga 1) — non un difetto da correggere dopo, una proprietà nota
  del design asincrono. — **Confermato.**
- [x] **N4** — Autorizzazione ad aggiungere il nuovo target TTFB < 15ms a
  `docs/non-functional-requirements.md` come target aggiuntivo (non sostitutivo) dei target
  di F03 già esistenti. — **Autorizzato.**
- [x] **N5** — Deployer: conferma che solo `LocalFolderDeployer` viene implementato ora;
  `S3Deployer`/`CloudflarePagesDeployer` restano interfacce non implementate finché non
  esiste un'ADR dedicata al provider (Decisione 8). — **Confermato.**
- [x] **N6** — Perimetro pubblico di `app/public-site` dopo questa RFC: resta raggiungibile
  dalla rete pubblica solo per l'anteprima autenticata (ADR-25), oppure va ristretto alla
  sola rete interna (raggiungibile solo dal processor di export e, per l'anteprima, dietro
  un livello di rete separato)? Impatta `docker-compose.prod.yml` e la configurazione Nginx.
  — **Confermato: solo anteprima autenticata (ADR-25), nessuna restrizione di rete aggiuntiva
  in questo round.**
- [x] **N7** — Autorizzazione a generare le ADR conseguenti: una per la riduzione di
  perimetro di ADR-22 (§ Impatto), una per la reinterpretazione del consumer di ADR-23, una
  che dichiari esplicitamente che ADR-24 resta valida spostando solo il punto di
  applicazione — oppure un'unica ADR-45 che tratti le tre riconciliazioni insieme, se
  preferito per non frammentare la decisione architetturale. — **Autorizzato: unica ADR-45.**

**Note**: Approvazione raccolta in sessione interattiva (chat) da parte del Project Owner,
non tramite processo di firma separato/out-of-band. Registrato qui a scopo di tracciabilità.

**Approvato da**: Project Owner (Human Sign-Off) · **Data**: 2026-09-01

**Azione successiva**: [x] Genera ADR-45 · [ ] Archivio
