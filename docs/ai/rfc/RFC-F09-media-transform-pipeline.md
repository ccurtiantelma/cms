# RFC-F09 — Pipeline di trasformazione media: ritaglio non distruttivo e focal point

## Status
[x] In discussione · [ ] Approvato → genera ADR-[N] · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-02

---

## Origine di questa RFC

Un task esterno ha chiesto di implementare ritaglio (`crop`) non distruttivo + focal point
per le immagini dentro `PublicMediaService` (`app/backend/src/files/public-media/public-media.service.ts`),
citando una **"ADR-35 Extension"**. Verifica fatta prima di scrivere codice:

- **ADR-35** (`docs/ai/adr/ADR-35-elenco-file-e-protezione-referenziale-media.md`, approvata
  il 2026-08-25) non contiene nulla su crop, focal point o trasformazione immagine. Decide
  due cose diverse: `GET app/files` senza ownership per riga (deroga a ADR-18) e `DELETE
  api/v1/app/files/:guid` che rifiuta con `409` la cancellazione di un file referenziato da
  un blocco `mediaRef` di una pagina `published`. Il riferimento del task esterno è
  **inventato** — non esiste una "estensione" di ADR-35 in nessun documento di `docs/`.
- La decisione che il task avrebbe dovuto citare, se esistesse, è la **voce 1.6 di
  `docs/TODO.md`** — *"Pipeline di trasformazione media e trattamento SVG"* — stato ⏳ **Da
  fare**, appartenente a F09, mai assegnata, senza RFC né ADR. Questo documento è quella RFC.

Il task è stato correttamente bloccato prima di scrivere codice (`CLAUDE.md` § Divieti
assoluti: *"inventare endpoint, tabelle, DTO, tipi di blocco o business rules non
documentate"*; § Architecture Policy: la pipeline di trasformazione media innesca
obbligatoriamente un ADR). Questa RFC non implementa nulla: porta la decisione a firma
umana, con le alternative e i punti di conflitto reali con quanto già approvato.

---

## Problema

Il blocco `image` (ADR-21) e il flusso di upload media (ADR-8, ADR-27, ADR-35) coprono oggi
solo la lettura **verbatim** di un'immagine per `guid`: un byte stream immutabile, senza
alcuna trasformazione server-side. Manca:

1. Un modo per produrre **varianti ritagliate/ridimensionate** di un'immagine senza toccare
   l'originale (richiesto da `business-rules.md` § Media 3, mai costruito: *"le varianti
   dimensionali delle immagini sono generate in modo asincrono (coda BullMQ) e non bloccano
   l'upload"*).
2. Un modo per un editor di dichiarare **dove sta il soggetto** di un'immagine (focal point),
   così che un ritaglio automatico a rapporto fisso (es. per una card 16:9) non tagli fuori
   la parte importante.
3. Una scelta di **formato di output** (`webp`/`avif` a parità di qualità pesano meno di
   `jpeg`/`png`), oggi assente: la rotta pubblica serve sempre i byte così come sono stati
   caricati.

La richiesta originale (non vincolante, riportata solo come contesto) proponeva di
risolvere tutto e tre in un colpo solo, dentro `PublicMediaService`, con query param
opzionali su `GET api/v1/public/media/:guid` (`w`, `h`, `cropX/Y/W/H`, `focalX/Y`, `format`)
elaborati sincronamente con `sharp` a ogni richiesta.

Questa RFC verifica se quel disegno è compatibile con quanto **già approvato**, e propone
un percorso alternativo dove non lo è — senza deciderlo da sola.

---

## Vincolo nuovo, non visto dal task originale: ADR-45 (approvata il giorno prima di questa RFC)

Il task esterno ragionava contro un'architettura che **non è più quella attuale**. Il
2026-09-01 — un giorno prima di questa RFC — è stata approvata **ADR-45** (`docs/ai/adr/
ADR-45-ssg-export-architecture.md`, da RFC-44), che riassegna il ruolo di
`app/public-site` e, per estensione, del traffico pubblico verso i media:

- La superficie pubblica di produzione diventa **static-only**: le pagine pubblicate sono
  compilate in HTML statico su filesystem e servite da Nginx/CDN, non da NestJS a runtime.
- `app/public-site` cessa di essere il servitore del traffico pubblico di produzione: resta
  ambiente di **draft preview** per i redattori e **worker di rendering interno** per il job
  di export (`StaticExportModule`).
- **RFC-44 § Decisione 6** (media): il job di export, per ogni `mediaRef` risolto nell'albero
  pubblicato, **copia i byte** nell'adapter di destinazione sotto un percorso stabile
  (`/assets/media/<guid>.<ext>`) e riscrive l'URL come percorso statico relativo — *"nessuna
  estensione al registro media... puro consumo di ciò che ADR-21/ADR-27 già espongono"*.
  Nessuna trasformazione è prevista in quella copia: è un byte-copy 1:1 dello stesso
  meccanismo di risoluzione usato da `GET public/media/:guid`.

**Conseguenza diretta per questa RFC**: `PublicMediaController`/`PublicMediaService` non
sono più, dopo ADR-45, il percorso che serve un visitatore reale in produzione. Il traffico
pubblico anonimo va ai file statici copiati da Nginx/CDN. Aggiungere query param di
trasformazione sincrona a un endpoint che il traffico pubblico di produzione non raggiunge
più risolverebbe un problema nell'ambiente sbagliato: servirebbe solo alla preview interna
(porta 55000) o a un consumer futuro non ancora identificato. Qualunque decisione presa qui
deve dichiarare esplicitamente **dove** vive la trasformazione: prima della copia statica
(a monte, nel job di export o all'upload) o dopo (un endpoint runtime dedicato, il cui unico
pubblico realistico oggi è la preview, non il sito pubblico).

Questo non era visibile al task originale — ADR-45 non esisteva quando quel task è stato
formulato, a giudicare dal riferimento a "ADR-35 Extension" — ma va riconciliato ora, non
ignorato: è esattamente il tipo di collisione documentale che questa RFC deve portare a
firma.

---

## Soluzione proposta

Segue una serie di decisioni, ciascuna con opzioni e raccomandazione, **nessuna presa
unilateralmente**: vanno firmate singolarmente in fondo al documento, come già praticato in
`RFC-F09-media-library.md` (N1–N7 → ADR-35).

### M1 — Riaprire la decisione "niente `sharp`" di RFC-F09?

`RFC-F09-media-library.md` (righe 248-250) aveva scartato `sharp`/`image-size` per due
motivi: dipendenza nuova soggetta ad approvazione umana, e binari nativi che complicano il
`Dockerfile`. Quella decisione riguardava però un problema più piccolo — leggere `width`/
`height` dagli **header** del file, senza decodificarlo — risolto scrivendo in casa un
lettore di offset fissi (`raster-mime-sniffer.ts`, esteso da `readRasterDimensions`, N2 di
RFC-F09, non ancora firmata).

Ritaglio, ridimensionamento e riconversione di formato sono un problema diverso: richiedono
**decodificare, ricampionare e ricodificare** i pixel, cosa che nessun lettore di header può
fare. Non esiste un modo "scritto in casa, senza dipendenze" per farlo bene — ricampionare
un'immagine a mano in TypeScript puro è più rischioso (qualità, performance, memory-safety
su input non fidato) che usare una libreria matura.

Opzioni:

- **A — `sharp`** (binding nativo su libvips). Argomento a favore: è lo standard de facto in
  Node, API matura, supporta crop/resize/webp/avif/jpeg/png nativamente. Argomento contro
  (invariato da RFC-F09): binari nativi per architettura, immagine Docker più pesante,
  superficie di build aggiuntiva da mantenere allineata a Node 20 LTS. **Con ADR-45**,
  l'argomento contro si attenua se `sharp` vive **solo nel worker BullMQ del backend**
  (che già esiste, gira già Node 20, non è esposto al pubblico) e non nel runtime che
  risponde a richieste anonime — che con ADR-45 in produzione non è nemmeno più `app/
  public-site`/`PublicMediaService`, ma il job di export stesso.
- **B — Altro binding nativo equivalente** (es. wrapper diretto di libvips diverso da
  `sharp`, o un binding su un'altra libreria di decodifica). Stesso ordine di problemi di A,
  nessun vantaggio dichiarato rispetto a `sharp` che è il più maturo e diffuso: non
  raccomandata come alternativa autonoma, solo come nota che l'opzione esiste.
- **C — Servizio esterno di image processing** (es. API di trasformazione immagini a
  pagamento, o CDN con transform-on-fetch tipo imgproxy/Cloudflare Images). Rimuove i binari
  nativi dal backend, ma introduce un **provider esterno**: nuova voce di costo, nuovo posto
  dove i byte delle immagini (potenzialmente contenuto editoriale non ancora pubblicato, se
  usato anche in preview) transitano fuori dall'infrastruttura del progetto, nuova ADR
  dedicata per credenziali/SLA/data residency (`CLAUDE.md` § Ask first: *"provider esterni
  (LLM, captcha, CDN)"*). Non decidibile in questa RFC senza input umano su budget e
  tolleranza a un secondo luogo dove i media esistono.
- **D — Nessuna trasformazione pixel-level: solo varianti preset fisse pre-generate**, senza
  crop arbitrario continuo né riconversione di formato onnicomprensiva. Riduce lo scope
  dell'intera feature (vedi M6 sotto per il dettaglio) ma non richiede necessariamente una
  libreria di encoding: se i preset sono pochi e il ritaglio è sempre agli stessi rapporti,
  resta comunque necessaria una qualche capacità di ricampionamento — quindi anche D dipende
  da A o C per l'implementazione, cambia solo la superficie di parametri esposti, non se
  serve una libreria.

**Raccomandazione**: **A**, confinata al worker BullMQ esistente (mai nel path di risposta a
una richiesta HTTP pubblica), che è l'unico posto dove ADR-45 non ha già spostato il
traffico pubblico altrove. Resta comunque una **nuova dipendenza npm pesante**, che
`CLAUDE.md` elenca esplicitamente tra le decisioni che richiedono ADR + approvazione umana:
non è implementabile senza firma esplicita su questo punto, indipendentemente da quanto
sia motivata.

### M2 — Sincrono on-request vs asincrono pre-generato

`business-rules.md` riga 298 è già scritta e approvata: *"le varianti dimensionali delle
immagini sono generate in modo asincrono (coda BullMQ) e non bloccano l'upload"*. Il design
del task originale (query param elaborati **sincronamente a ogni richiesta**) contraddice
questa regola già in vigore — non è un'area grigia, è un conflitto diretto con una business
rule approvata (`docs/business-rules.md`, non un'ADR, ma comunque sopra RFC nella gerarchia
EAIDOS: *"Constitution → Business Rules → Glossary → ... → RFC → ADR"*).

Trade-off reali, non teorici:

- **Combinatoria dei parametri.** `w`, `h`, `cropX/Y/W/H`, `focalX/Y`, `format` come query
  param liberi generano uno spazio di varianti **illimitato** per lo stesso `guid`. Non è
  cacheabile in modo sensato (ogni combinazione è una chiave diversa), e trasformare a ogni
  richiesta senza cache è un costo CPU per visita — esattamente il tipo di carico che ADR-45
  ha appena eliminato dal percorso pubblico spostandolo a file statici.
- **Latenza alla prima richiesta.** Anche con una cache di risultato dietro le quinte, la
  prima richiesta di ogni combinazione paga il costo di decodifica/ricodifica in linea con
  la risposta HTTP — un pattern che l'architettura ADR-45 ha deliberatamente rimosso dal
  runtime pubblico (TTFB < 15ms dichiarato in ADR-45 § Conseguenze, irraggiungibile se il
  file va prima trasformato).
- **Compatibilità con l'export statico.** RFC-44 § Decisione 6 copia byte 1:1, un file per
  `guid`. Se la trasformazione resta query-param libera, l'export non sa **quali**
  combinazioni pre-generare: o le ignora (e il sito statico non ha mai crop/focal, la
  feature esiste solo in un ambiente che il pubblico non vede), o l'export dovrebbe
  enumerare un insieme finito di combinazioni — che è di fatto un ritorno ai preset fissi.

**Raccomandazione**: **asincrono, con un insieme finito e nominato di preset** (non crop
continuo arbitrario), generato via BullMQ — coerente con `business-rules.md`:298 così com'è
scritta oggi, e l'unico disegno compatibile per costruzione con la copia-byte di RFC-44 § 6:
l'export copia N file per `guid` (uno per preset) invece di uno solo, senza dover
trasformare nulla lui stesso. Dettaglio dei preset in M6.

### M3 — Conciliazione con l'immutabilità `guid → byte` di ADR-27 § 5

ADR-27 § 5 (approvata, non modificabile) fissa: *"il legame `guid` → byte è immutabile...
se un giorno esistesse un 'sostituisci file' a parità di `guid`, questo paragrafo cadrebbe:
quella funzione richiede una nuova firma proprio per questo"*. Una variante trasformata
(preset o crop) **è** un byte stream diverso per lo stesso `guid` sulla stessa rotta, se
esposta come query param su `public/media/:guid`. Questo tocca esattamente il presupposto
che ADR-27 § 5 dichiara di dover essere riaperto con una nuova firma.

Due modi per non toccare ADR-27 § 5:

- **M3a — Identificatore diverso per variante, non query param sullo stesso URL.** Ogni
  preset diventa una risorsa propria con la propria chiave (es. `guid` + nome preset
  concatenati in un percorso distinto, tipo `public/media/:guid/:preset`, o un secondo
  `guid` dedicato alla riga-variante in `files`). `GET public/media/:guid` resta **esattamente**
  quello che ADR-27 descrive: un solo byte stream immutabile per quel `guid`. L'invariante
  di ADR-27 § 5 **non viene toccato**, perché la regola parla di quella rotta con quel
  identificatore, non del concetto di "immagine" in astratto. Non serve superare ADR-27: una
  nuova ADR **complementare** (non `Superseded da`) descrive la rotta/risorsa aggiuntiva.
- **M3b — Query param sulla stessa rotta, cache-key diversa per parametri (hash).** Il task
  originale implicitamente proponeva questo. Richiede modificare il comportamento descritto
  da ADR-27 § 5 per quella rotta (`guid` smette di implicare un solo byte stream): **questo
  sì** richiederebbe superare ADR-27 con una nuova ADR che dichiari `Superseded da ADR-XXX`
  su quel paragrafo — un'azione che `CLAUDE.md` permette solo con firma umana esplicita e
  che complica ogni ragionamento futuro su quella rotta (due firme, vecchia e nuova, da
  leggere insieme).

**Raccomandazione**: **M3a**. Non richiede toccare (né superare) ADR-27, riusa la sua
verifica MIME-dai-byte e il suo 404 uniforme, ed è l'unica delle due compatibile con la
copia-byte-1:1 di RFC-44 § 6 (M3b non avrebbe un URL stabile da copiare in export, dato che
la query string non sopravvive a un file statico su disco).

### M4 — Focal point: query param stateless o persistito per riga?

Il task originale trattava `focalX`/`focalY` come parametro di query, calcolato/passato a
ogni richiesta, senza persistenza. Verifica contro le business rules esistenti:

- `business-rules.md` § Media 2: *"ogni Media conserva metadati editoriali propri: testo
  alternativo, didascalia, crediti"* — il focal point è concettualmente **lo stesso tipo di
  dato**: una decisione editoriale su *quell'immagine*, presa una volta da chi la carica o la
  cura, non un parametro che chi consuma l'immagine reinventa a ogni chiamata.
- Un focal point stateless via query param significa che **chiunque conosca il `guid`** può
  passare qualunque `focalX`/`focalY` a piacere: nessuna validazione contro il contenuto
  reale dell'immagine è possibile (il server non sa se il soggetto è davvero lì), e la stessa
  immagine può essere ritagliata in modi diversi da chiamanti diversi — la stessa
  esplosione combinatoria di M2, applicata anche a un dato che dovrebbe essere una proprietà
  fissa della risorsa.
- Un focal point stateless è anche l'opposto dell'obiettivo dichiarato "riusabile
  dall'editor": se non si salva, l'editor deve reimpostarlo ogni volta che l'immagine viene
  usata in un punto nuovo del sito, e due usi della stessa immagine possono avere focal point
  diversi senza che nessuno lo veda come incoerenza.

**Raccomandazione**: **persistito per riga** — due colonne nullable su `files`
(`focalX`/`focalY`, percentuale 0-100, default applicativo 50/50 se `null`), nello stesso
spirito delle colonne `width`/`height` già proposte da RFC-F09 (N2, **non ancora firmata**).
Questo è **schema DB nuovo**, soggetto a `CLAUDE.md` § Ask first come le altre migrazioni:
va firmato **separatamente** da N2, non implicitamente incluso. Impostabile da un editor
solo attraverso una UI di selezione punto-su-immagine — che oggi non esiste: il
`MediaLibraryModal` proposto da RFC-F09 § 5 non è stato costruito (T3–T6 del relativo Plan
non eseguiti). Questa RFC **dipende quindi da lavoro F09 non ancora fatto**, non solo da
un'ADR: non c'è oggi un posto nell'interfaccia dove un redattore possa impostare un focal
point, a prescindere da come lo si persista.

### M5 — Formati di output (`webp`/`jpeg`/`png`/`avif`)

Dipende interamente dall'esito di M1: nessuna conversione di formato è possibile senza una
libreria di encoding (nessuna delle librerie "scritte in casa" del progetto — il rilevatore
di firme MIME — sa scrivere pixel, solo leggerli). Se M1 approva `sharp` nel worker, i
quattro formati richiesti sono supportati nativamente senza ulteriori dipendenze. Se M1
sceglie C (servizio esterno), il set di formati dipende dal provider scelto — fuori scope di
questa RFC finché quella scelta non è firmata.

### M6 — Preset proposti (dettaglio di M2)

Un insieme finito e nominato, non un continuo arbitrario:

| Preset | Rapporto | Uso previsto |
|---|---|---|
| `thumbnail` | 1:1 | Griglia della Media Library (RFC-F09 § 5, non ancora costruita) |
| `card` | 16:9 | Blocchi di anteprima/card nel sito pubblico |
| `hero` | 21:9 o 2:1 (da confermare) | Immagini di apertura pagina |
| `og` | 1.91:1 | Open Graph / condivisione social (F07/F08) |

Ogni preset applica, al ricampionamento, il focal point persistito (M4) come centro del
ritaglio quando presente, altrimenti 50/50. Formato di output per preset: `webp` di default
(coerente con la scelta implicita del task originale), con fallback `jpeg` se il client non
lo accetta — decisione di dettaglio, non bloccante per questa firma, rimandabile alla spec.
Questa tabella è una **proposta di partenza**, non definitiva: il numero e i rapporti dei
preset sono una scelta di prodotto, non solo tecnica, e vanno confermati o corretti in sede
di firma.

### M7 — SVG

Nessuna azione: **resta fuori scope**, come già stabilito da ADR-27 § 4 (SVG rifiutato dalla
rotta pubblica senza eccezioni configurabili, rimandato alla stessa voce 1.6 che questa RFC
in parte chiude). Nulla in questa proposta lo tocca, né lo sblocca implicitamente: un SVG
continua a non essere raster e continua a non superare `detectRasterMimeType`.

### M8 — Non-distruttività

Non è un punto di conflitto: ogni opzione qui proposta (M1 A/preset via worker, M3a
identificatore separato) produce per costruzione un **file derivato nuovo**, mai una
riscrittura di `storageKey` sulla riga originale. L'unico modo di violare la non
distruttività sarebbe implementare un "sostituisci file a parità di `guid`" — che è
esplicitamente il caso che ADR-27 § 5 dichiara di non coprire e di richiedere una firma a
sé. Nessuna proposta qui lo introduce.

---

## Proposta raccomandata (riepilogo)

Trasformazione confinata al **worker BullMQ** del backend (mai nel path di una richiesta
pubblica, coerente con ADR-45), con `sharp` come dipendenza (M1-A), un **insieme finito di
preset nominati** invece di crop continuo arbitrario (M2 + M6), un **identificatore di
risorsa distinto per variante** invece di query param sulla rotta esistente (M3a, non tocca
ADR-27), **focal point persistito per riga** su `files` con due nuove colonne nullable (M4,
migrazione a sé, non implicita in N2), nessuna azione su SVG (M7) e nessuna riscrittura
distruttiva dell'originale (M8). Il risultato è consumabile 1:1 dal job di export di RFC-44
§ 6 come N file statici per `guid` invece di uno, senza che l'export debba trasformare
nulla lui stesso.

Questa proposta **non è auto-approvata**: ogni punto (M1–M6) richiede firma separata, come
da modello già in uso in `RFC-F09-media-library.md` (N1–N7).

---

## Alternative valutate

- **Query param di trasformazione sincrona su `GET public/media/:guid`, come da task
  originale.** Scartata come design principale: contraddice `business-rules.md`:298 (async
  già approvato), riapre M1 senza confinare `sharp` a un contesto interno, e soprattutto
  risolve il problema nel controller sbagliato dopo ADR-45 — quella rotta non è più il
  percorso del traffico pubblico di produzione.
- **Trasformazione via CDN/servizio esterno (imgproxy, Cloudflare Images, provider
  equivalente) davanti a Nginx.** Non scartata in assoluto (è l'opzione C di M1), ma non
  decidibile qui: nuovo provider esterno, nuova ADR dedicata, costi e data residency da
  discutere con l'umano prima di qualunque valutazione tecnica.
- **Crop lato client, prima dell'upload, nessuna trasformazione server.** La più semplice e
  a rischio più basso — nessuna dipendenza nuova, nessun worker, nessuna migrazione. Scartata
  come **unica** soluzione perché non produce le varianti multi-preset richieste da
  `business-rules.md`:298 né un focal point riusabile su usi diversi della stessa immagine
  (un ritaglio fatto una volta all'upload non si adatta a un rapporto diverso in un contesto
  diverso). Resta un candidato legittimo per un MVP ulteriormente ridotto, se l'umano
  giudicasse anche i preset un livello di scope non necessario ora: va segnalato come rischio
  di **sotto**-ingegnerizzazione solo se si scarta la richiesta di riuso multi-contesto, non
  è la lettura di default.
- **Focal point stateless via query param**, come da task originale. Scartata (M4): non
  riusabile, non validabile, e in conflitto con il trattamento di alt/didascalia/crediti già
  approvato come metadato persistito per riga.
- **Query param con cache-key ad hash sulla stessa rotta di ADR-27 (M3b).** Scartata a favore
  di M3a: richiederebbe superare ADR-27 § 5 e non produce un URL stabile copiabile
  dall'export statico di RFC-44.

---

## Impatto

**Se M1–M6 vengono firmati nella forma raccomandata:**

- **Backend.** Nuovo processor BullMQ (accanto a quelli già esistenti in
  `app/backend/src/queues/`) che genera i preset all'upload di un file `entity =
  'page-media'` (o on-demand al primo utilizzo — dettaglio di plan, non di questa RFC). Nuova
  dipendenza `sharp` in `app/backend/package.json` (Ask first, voce a sé). Due colonne
  nullable su `files` (`focalX`, `focalY`) — migrazione separata da N2 di RFC-F09. Una rotta
  nuova (o un'estensione di `public/media`) per servire ogni variante con il proprio
  identificatore stabile (M3a) — dettaglio esatto (path vs. guid dedicato) da fissare in
  spec, non deciso qui.
- **Frontend.** Il `MediaLibraryModal` di RFC-F09 § 5 (non costruito) diventa il posto
  naturale dove aggiungere un selettore di focal point — questa RFC non lo costruisce, ma
  ne registra la dipendenza: senza quella UI, i campi `focalX`/`focalY` sono scrivibili solo
  via API, come già oggi accade per i breakpoint `tablet`/`mobile` dello stile responsive
  (debito noto, `docs/TODO.md` § Prossimo passo consigliato).
- **Sito pubblico / export statico.** RFC-44 § Decisione 6 va estesa: invece di un file per
  `guid`, il job di export copia un file per `guid` **più uno per ogni preset generato** —
  un cambiamento localizzato a quella singola decisione, non un redesign dell'export.
- **Contratti.** `openapi:export` + `openapi:types` per qualunque rotta nuova/modificata.

**Se M1 non viene firmato** (nessuna libreria di trasformazione approvata): questa RFC non è
implementabile nella forma proposta. L'unica alternativa percorribile senza dipendenza nuova
resta il crop lato client pre-upload (vedi Alternative), che non copre multi-preset né focal
point riusabile.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| `sharp` non approvato (dipendenza pesante, binari nativi) | Media | Alto | Degrado a crop client-side pre-upload, oppure attesa di un provider esterno (M1-C) da valutare a parte |
| Focal point implementato senza la UI di selezione (`MediaLibraryModal` non costruito) | Alta se si procede senza aspettare RFC-F09 §5 | Medio | Le colonne restano scrivibili solo via API finché la UI non esiste — stesso pattern già accettato per i breakpoint responsive, non bloccante ma da dichiarare |
| Preset scelti in astratto non coincidono con i reali usi dei blocchi (card/hero/og) quando F07/F08 saranno costruite | Media | Medio | Tabella M6 è dichiarata "proposta di partenza": rivedere al momento di F07/F08 se i rapporti non coincidono |
| L'estensione di RFC-44 § Decisione 6 (N file invece di 1 per guid) non viene coordinata con chi implementerà lo `StaticExportModule` | Bassa | Medio | Questa RFC registra esplicitamente l'impatto su RFC-44 § 6: va letta insieme a chi pianifica l'implementazione dell'export, non isolatamente |
| Query string di preset scambiate per query param liberi in fase di implementazione (si ricade in M3b senza accorgersene) | Bassa | Alto (tocca ADR-27 non dichiaratamente) | Il criterio di Done della spec/plan deve verificare esplicitamente che `GET public/media/:guid` risponda **sempre** con lo stesso identico byte stream indipendentemente da eventuali query string, invariato da questa feature |

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti firmati, tutti nella forma raccomandata:**

- [x] **M1** — `sharp`, confinata al worker BullMQ backend (opzione A).
- [x] **M2** — Asincrono/pre-generato via BullMQ con insieme finito di preset.
- [x] **M3** — Identificatore di risorsa distinto per variante, ADR-27 § 5 non toccato (M3a).
- [x] **M4** — Focal point persistito per riga su `files` (migrazione a sé, separata da N2 di
  RFC-F09).
- [x] **M5** — Formati di output: `webp`/`jpeg`/`png`/`avif`.
- [x] **M6** — Preset di partenza: `thumbnail`/`card`/`hero`/`og` come da tabella (rapporti
  confermati come proposta di partenza, rivedibili in sede F07/F08).
- [x] **M7** — SVG fuori scope, nessuna modifica ad ADR-27 § 4.
- [x] **M8** — Non-distruttività confermata, nessuna azione richiesta.

**Note**: Approvazione raccolta in sessione Claude Code (task "Fase F11-01 / ADR-49"), a fronte
del blocco descritto in apertura di questo documento. Verifica tecnica emersa in fase di
generazione dell'ADR: `files.id` nello schema reale è `serial` (intero), non `uuid` — la colonna
`parentFileId` va tipizzata `integer` con FK su `files.id`, non `uuid`. Dettaglio riportato in
ADR-49, non altera nessuno degli 8 punti firmati qui.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-02

**Azione successiva**: [x] Genera ADR-49 · [ ] Archivio
