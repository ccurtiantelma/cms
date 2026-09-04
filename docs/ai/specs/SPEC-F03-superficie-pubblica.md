# Spec — F03 Superficie pubblica di lettura (Architettura Air-Gapped SSG — ADR-53)

## Status

[x] Bozza — **in attesa di approvazione umana** · [ ] Approvata · [ ] Superseded

> Generata su richiesta esplicita dell'umano (2026-09-04), deroga puntuale al divieto di
> scrittura in `docs/` (`CLAUDE.md` § Documentation Policy): vale per questo file e si
> esaurisce col task. Sostituisce integralmente la versione precedente della spec (allineata
> ad ADR-22/23/24, SSR a richiesta + cache Redis), superata da **ADR-53**.
>
> Questa spec descrive un sistema **in parte già implementato** (l'export statico di
> ADR-45, la generazione dati SEO di ADR-48, la pipeline media di ADR-49, l'anteprima di
> ADR-25) e **in parte da costruire** per la piena conformità ad ADR-53 (consegna edge
> air-gapped, assemblaggio SEO/media nel file esportato, CLS = 0, sitemap/robots.txt). La
> distinzione fra le due parti è dichiarata sezione per sezione — non è un progetto su
> territorio vergine, e trattarla come tale duplicherebbe codice già in
> `app/backend/src/export/`, `app/backend/src/pages/seo-graph.service.ts` e
> `app/backend/src/queues/media-queue/`.

## Feature di riferimento

**Non esiste** `docs/ai/features/F03-*.md`: F03 nasce da `docs/roadmap.md` § F03 e dal piano
`docs/ai/plans/PLAN-F03-superficie-pubblica.md`. Il piano resta la fonte per la scomposizione
in task.

## ADR applicabili

- **`ADR-53-air-gapped-ssg-zero-db.md`** — decisione corrente e vincolante: Build-on-Publish,
  zero-JS/CSS critico inline, media CLS = 0, consegna edge air-gapped (push, mai pull),
  `app/public-site` motore di sola anteprima, SEO/metadati pre-compilati nel file statico.
  Supera ADR-22/ADR-23/ADR-24. Non supera ADR-45, di cui è il completamento.
- `ADR-45-ssg-export-architecture.md` — **non superata**: fissa che `app/backend` non
  importa mai `react`/`react-dom/server` (Decisione 1/4), che l'export è orchestrato dalla
  coda BullMQ `static-export` (Decisioni 2/3/4), il tombstone su uscita da `published`
  (Decisione 5) e il riuso della risoluzione media di ADR-27 (Decisione 6). ADR-53 vi si
  appoggia senza riscriverla.
- `ADR-48-seo-graph-generation.md` — `SeoGraphService` genera JSON-LD/OpenGraph come dati
  dentro `PageSeoDto`/`revision.seo` a publish-time. Non assembla markup: quel compito è
  dentro il perimetro di questa spec (§ SEO & Edge Delivery), dichiarato "task separato" già
  in ADR-48 § Conseguenze.
- `ADR-49-media-processing-pipeline.md` — pipeline `sharp` nel worker `media-queue`, preset
  nominati, focal point, non-distruttività. La sua estensione al job di export ("copiare
  anche le varianti preset, non solo il file originale") è dichiarata in ADR-49 § Conseguenze
  come "task a sé": è dentro questa spec (§ Performance & Assets).
- `ADR-25-anteprima-bozza-non-pubblicata.md` — token JWT dedicato (`purpose: 'page-preview'`),
  prefisso `preview/pages/:token`, rotta `/__preview/:token` in `app/public-site`, nessuna
  cache, `X-Robots-Tag` bloccante. ADR-53 § 5 ne fa il solo traffico ammesso su
  `app/public-site`.
- `ADR-21-schema-blocchi-versionamento.md` — eredita l'invariante bloccante "ogni renderer
  escapa `plainText`"; ADR-53 § 7 sposta il punto di verifica sull'HTML **prodotto dal job di
  export**, non più sul componente né sulla risposta SSR.
- `ADR-22`/`ADR-23`/`ADR-24` — **superseded da ADR-53** (vedi header di ciascun file): restano
  record storico. Quanto ne sopravvive (forma canonica del percorso, `404` uniforme, lingua di
  default senza prefisso, nomi riservati) è ereditato come vincolo sulla **forma dell'output**,
  non più come comportamento a tempo di richiesta.

## Stato reale all'apertura di questa spec (2026-09-04)

| Componente | Stato | Dove |
|---|---|---|
| Coda BullMQ `static-export`, job `page`/`tombstone`/`full-site` | ✅ Implementato (ADR-45) | `app/backend/src/export/` |
| Scrittura file statico su filesystem locale (`AppConstants.staticExportPath`) | ✅ Implementato — è il `LocalFolderDeployer` di ADR-45 § Decisione 8 | `export.processor.ts` |
| Rendering HTML via chiamata HTTP interna a `app/public-site` (mai import React in NestJS) | ✅ Implementato | `export.processor.ts::exportPage` |
| Copia byte del media originale referenziato, riscrittura `src` relativo | ✅ Implementato — copia il **solo file sorgente**, non le varianti preset | `export.processor.ts::syncMediaAndRewriteHtml` |
| Tombstone del file statico su uscita da `published` | ✅ Implementato | `export.processor.ts::tombstonePage` |
| `SeoGraphService` — JSON-LD/OpenGraph come **dati** in `revision.seo` | ✅ Implementato (ADR-48) | `app/backend/src/pages/seo-graph.service.ts` |
| Assemblaggio di `<script type="application/ld+json">`/`<meta property="og:...">` nel documento HTML | ❌ **Non implementato** — `App.tsx` non legge mai `page.seo` (commento esplicito nel file: "fuori dal perimetro di F03") | `app/public-site/src/App.tsx` |
| Pipeline `sharp`: preset nominati, focal point, non-distruttività | ✅ Implementato (ADR-49) | `app/backend/src/queues/media-queue/` |
| Output multi-formato (AVIF oltre a WebP) | ❌ **Non implementato** — l'unico formato di output è `webp` fisso (`media.processor.ts`, `pipeline.webp({quality:80})`) | `media.processor.ts` |
| `width`/`height`/`srcset` sull'`<img>` esportato | ❌ **Non implementato** — nessuna colonna di dimensioni su `files`, nessun `srcset` emesso | — |
| CSS critico inline nel `<head>` | ❌ **Non implementato** — il foglio dei blocchi è sempre un `<link rel="stylesheet">` esterno; solo le variabili di tema (`ThemeStyleTag`) sono inline | `app/public-site/src/App.tsx` |
| `sitemap.xml`/`robots.txt` | ❌ **Non implementato** — nessun modulo li genera | — |
| Adapter di consegna verso storage edge/CDN (S3, bucket, volume Nginx isolato) | ❌ **Non implementato** — esiste solo la scrittura su filesystem locale condiviso col backend | — |
| Regola di rete air-gap (nessuna rotta da `app/public-site` verso Postgres/Redis/NestJS in produzione) | ⚠️ **Proprietà d'infrastruttura, non verificata da codice** — `app/public-site` chiama comunque `api/v1/public/pages` a runtime per servire l'anteprima (ADR-25), quindi non è air-gapped di per sé: lo diventa quando la rete di produzione lo isola dal traffico anonimo (ADR-53 § Conformità) | infra/deploy |
| Anteprima con token dedicato, `X-Robots-Tag` bloccante | ✅ Implementato (ADR-25) | `app/public-site/src/server.ts` |

Questa tabella è la base di `PLAN-F03-superficie-pubblica.md` § Task: ogni riga ❌ è un task
nuovo, ogni riga ✅ è un vincolo di non-regressione da verificare, non da ricostruire.

## In scope

- **Preview Engine**: `app/public-site` come unico esecutore di anteprima (bozza/WYSIWYG),
  raggiungibile solo con JWT `purpose: 'page-preview'` (ADR-25).
- **Static Export Worker**: compilazione asincrona dell'albero blocchi `jsonb` della
  Revisione pubblicata in HTML5 semantico terminale, via coda BullMQ `static-export`.
- CSS critico (above-the-fold) inline nel `<head>` del file statico; nessun hydration
  script o runtime JS lato client per i blocchi.
- Generazione asincrona di varianti immagine AVIF/WebP multi-risoluzione con `srcset` e
  attributi dimensionali (`width`, `height`, `aspect-ratio`) per CLS = 0.
- Serializzazione a build-time di JSON-LD/OpenGraph (`SeoGraphService`) nel documento HTML.
- Rigenerazione di `sitemap.xml`/`robots.txt` sull'evento di pubblicazione.
- Contratto dell'adapter di consegna PUSH verso storage isolato/CDN edge.
- Air-gap di rete: nessuna connessione dalla superficie pubblica verso PostgreSQL, Redis o
  il backend NestJS.

## Out of scope

- Redirect da cambio slug (debito dichiarato, ereditato da ADR-24 § 6, non sanato da ADR-53).
- Multilingua oltre alla lingua di default senza prefisso (F05).
- Form di contatto e chatbot (F10/F11): restano isole JS a sé, fuori dal "zero-JS" dei blocchi
  statici — `formScriptHref` (F10-04) è l'esempio già esistente di isola dichiarata, non
  un'eccezione silenziosa.
- Implementazione di `S3Deployer`/`CloudflarePagesDeployer` concreti: solo l'interfaccia
  dell'adapter (ADR-45 § Decisione 8, ereditata da ADR-53 § 4). Attivare un provider esterno
  reale richiede una propria ADR con approvazione umana (credenziali, costi, data residency).
- Potatura delle Revisioni (decisione aperta, rinviata da ADR-19, non tocca questa spec).

## Vincoli e assunzioni

- Nessuna modifica a `schema.ts` (confermato da ADR-45 § Conseguenze e non contraddetto da
  ADR-53 § Conseguenze).
- Nessuna dipendenza npm pesante nuova oltre `sharp`, già approvata da ADR-49. Un client per
  lo storage edge (es. SDK S3) entra solo quando un'ADR dedicata approva il provider concreto.
- `app/backend` non importa mai `react`/`react-dom/server` (ADR-45 § Decisione 1, ereditato).
- Redis resta solo backend BullMQ per questa superficie: nessuna chiave `public:*` (ADR-53 §
  Conseguenze).

---

## 1 — Preview Engine (`app/public-site`, porta 55000)

`app/public-site` **non serve traffico pubblico di produzione**. È ridotto a motore di
rendering per due soli consumer, entrambi già implementati:

1. **Il processor di export** (`export.processor.ts::exportPage`), che lo chiama via HTTP
   interno sulla rete Docker per ottenere l'HTML da scrivere su file — non è "anteprima" in
   senso editoriale, è l'unico rendering engine del sistema (ADR-45 § Decisione 1).
2. **L'anteprima editoriale** (`/__preview/:token`, ADR-25): JWT firmato con segreto
   dedicato, claim `{ pageGuid, purpose: 'page-preview', exp }`, scadenza 15 minuti non
   rinnovabile, letto da `pages.draftContent` (mai da `public/`). Ogni risposta porta
   `X-Robots-Tag: noindex, nofollow, noarchive` e il meta `robots` equivalente, senza
   eccezioni.

**Vincolo di rete (ADR-53 § 5/Conformità)**: nessuna rotta di `app/public-site` è raggiungibile
dal traffico anonimo in produzione. L'unica rotta ammessa dal perimetro pubblico (dietro
autenticazione admin, non anonima) è quella di anteprima; la rotta per slug (`GET /<path>`,
ADR-24) resta necessaria come **contratto interno** per il processor di export, ma non deve
comparire in alcuna configurazione di reverse proxy esposta a Internet. Verificabile come
regola di rete/firewall (elenco allowlist IP sorgente = solo la rete interna Docker del
processor di export), non come code review applicativa.

## 2 — Static Export Worker (backend NestJS/BullMQ)

**Baseline già implementata (ADR-45), nessuna modifica di contratto richiesta da ADR-53**:

- Modulo `app/backend/src/export/` (`ExportModule`, `ExportService`, `ExportProcessor`,
  `ManifestService`), coda BullMQ `static-export`.
- `ExportService` accoda tre tipi di job: `enqueuePageExport` (priorità 1, 5 tentativi,
  backoff esponenziale — stessa SLA di 5s ereditata da NFR), `enqueuePageTombstone` (stessa
  priorità/retry), `enqueueFullSiteExport` (priorità 20, batch con `staticExportFullSiteBatchSize`,
  mai lo stesso worker pool della SLA a 5s).
- Trigger: gli stessi call-site che oggi invalidano `PublicPageCacheService` in
  `pages.service.ts::changeStatus` (transizioni a/da `published`), `settings.service.ts`
  (tema → full-site), `global-sections` (sezione globale → full-site limitato alle Pagine
  referenzianti). Nessun `EventEmitter2` nuovo (ADR-45 § Decisione 3, RFC-44 già motiva lo
  scarto di un bus di eventi per un solo consumer).
- `ExportProcessor.exportPage`: chiama `app/public-site` via `fetch` interno, riscrive i
  riferimenti media (`data-media-ref`) in percorsi relativi statici, scrive il file con
  `writeFileAtomic` (scrittura su path temporaneo + `rename`, mai un file parzialmente
  scritto leggibile), aggiorna `manifest.json` con hash e timestamp.
- `ExportProcessor.tombstonePage`: rimozione fisica del file (`rm force:true`), mai una
  cancellazione logica — un file rimasto raggiungibile da Nginx a backend spento violerebbe
  l'invariante "pagina non pubblicata mai raggiungibile" in modo più grave del `404`
  dinamico (ADR-45 § Decisione 5).
- Manifest su filesystem (`manifest.json`), mai una tabella nuova (ADR-45 § Decisione 2): è
  cache derivata e ricostruibile con un full-site rebuild, la verità resta
  `page_revisions`/`pages.publishedRevisionId`.

**Delta richiesto da ADR-53**: nessuno sul contratto del worker. Il delta è tutto a valle
(§ 3, § 4) e a monte (§ 4, adapter di consegna): il worker continua a scrivere l'HTML già
prodotto, ma quell'HTML deve portare CSS critico inline, `<img>` con dimensioni e varianti, e
i metadati SEO — compiti del renderer (`app/public-site`) e del processor (riscrittura media),
non del contratto della coda.

## 3 — Performance & Assets (CLS = 0, zero-JS, CSS critico)

### 3.1 — Zero-JS client-side (invariato, già rispettato)

`app/public-site` renderizza con `renderToStaticMarkup`, mai `renderToString`: nessun
marcatore di idratazione, nessun bundle client per i blocchi. Le uniche isole JS ammesse sono
quelle dichiarate a parte (`formScriptHref` di F10), mai un'aggiunta silenziosa. Un blocco che
solleva durante il rendering non produce mai un file (ADR-21 § 3.7): l'albero non servibile è
respinto a monte, coerente con "gli Error Boundary non proteggono la superficie pubblica"
(ADR-22 § 2, ereditato da ADR-53 § 2).

### 3.2 — CSS critico inline (delta da costruire)

**Stato attuale**: il foglio CSS dei blocchi è sempre un `<link rel="stylesheet" href={cssHref}>`
esterno (`App.tsx`); solo le variabili di tema (`ThemeStyleTag`) sono inline. Nessuna
estrazione di "critical CSS" esiste.

**Contratto richiesto**: il CSS necessario al rendering sopra la piega (blocchi nel primo
viewport, tipicamente `section`/`heading`/`richText`/`image` di apertura pagina) va iniettato
come `<style>` inline nel `<head>`, prima di ogni `<link>`. Il resto del foglio CSS Modules
resta un file esterno con fingerprint immutabile (`Cache-Control: public, max-age=31536000,
immutable`, già il pattern per gli asset con hash citato in `PLAN-F03` originale § T5). La
soglia "sopra la piega" non richiede un motore di analisi layout a runtime: si può derivare a
build-time dai blocchi che compaiono per primi nell'albero della Pagina (stesso principio già
usato per `ThemeStyleTag`, che inietta senza misurare nulla). L'implementazione concreta
(estrazione per selettore usato dai primi N blocchi vs. l'intero foglio dei blocchi cortissimo
per una pagina piccola) è demandata al task, non a questa spec: il contratto è "above-the-fold
inline, resto esterno immutabile", non un algoritmo specifico.

### 3.3 — Media: AVIF/WebP multi-risoluzione, CLS = 0 (delta da costruire)

**Stato attuale**: `media.processor.ts` produce **solo** `webp` (hardcoded,
`pipeline.webp({quality:80})`); nessuna colonna di dimensioni persistita su `files` oltre
`focalX`/`focalY`; l'export copia il singolo file sorgente per `guid`, non le varianti preset
(gap già dichiarato in ADR-49 § Conseguenze).

**Contratto richiesto**:
- Il worker `media-queue` (ADR-49) produce, per ogni variante richiesta, sia `webp` sia
  `avif` come righe `files` derivate distinte (stesso pattern `parentFileId` già esistente:
  un `mimeType` diverso è già oggi motivo di riga nuova, non di sovrascrittura). Nessun
  crop/formato aggiuntivo oltre l'insieme finito di preset di ADR-49 § M6.
  raster continuo arbitrario.
- Le dimensioni reali (`width`/`height` in pixel) della variante generata sono note al
  worker (`sharp` le legge già, `outputMetadata.width/height` è già loggato ma non
  persistito): vanno esposte al job di export, non ricalcolate lì.
- Il job di export, per ogni `<img data-media-ref="guid">` risolvibile, copia **tutte** le
  varianti pubbliche del `guid` (non solo l'originale) e riscrive il tag con `srcset`
  (risoluzioni multiple), `width`, `height` e `aspect-ratio` (calcolato da `width`/`height`,
  mai un valore indovinato) più un segnaposto a basso costo (BlurHash o SVG trascurabile) come
  `background`/`placeholder`. Un'immagine priva di `width`/`height` intrinseci nel markup
  esportato fa fallire il gate di CI (ADR-53 § Conformità).
- SVG resta escluso da questa pipeline (ADR-27 § 4/ADR-49 § M7, invariato): non genera
  varianti, non entra in `srcset`.

## 4 — SEO & Edge Delivery

### 4.1 — SEO pre-compilato (delta da costruire)

**Stato attuale**: `SeoGraphService` (ADR-48) scrive `structuredData`/OpenGraph già dentro
`revision.seo` a publish-time — il **dato** esiste. Nessun componente lo assembla in markup:
`App.tsx` non legge mai `page.seo`.

**Contratto richiesto**: il documento HTML prodotto da `app/public-site` include, dentro
`<head>`, `<meta property="og:...">` per ogni chiave OpenGraph presente in `page.seo` e un
unico `<script type="application/ld+json">` col contenuto di `page.seo.structuredData` (già
il `@graph` combinato `WebPage`/`FAQPage` di ADR-48). Nessuna generazione a runtime: il dato è
già quello scritto nella Revisione, il compito è solo serializzarlo — coerente con ADR-53 § 6
("nessun metadato è calcolato a runtime, perché a runtime non c'è più nulla che calcoli").
`<title>` resta quello già presente (`page.title`); `<link rel="canonical">` usa il percorso
canonico già calcolato da `canonicalizePublicPath` (ADR-24 § 4, ereditato).

### 4.2 — `sitemap.xml`/`robots.txt` (delta da costruire)

**Contratto richiesto** (emendato su richiesta esplicita per la per-page freshness — vedi
delta sotto): `ExportProcessor::exportPage`/`tombstonePage` rigenerano `sitemap.xml` (una
`<url>` per Pagina `published`, stesso algoritmo di enumerazione già scritto in
`ExportProcessor::resolvePublishedPageLocations`) e `robots.txt` (statico, derivato da
`app_settings` se esiste un campo di configurazione, altrimenti un default conservativo
`Allow: /`) a ogni evento di singola pagina — pubblicazione, depubblicazione/archiviazione,
cambio slug, cambio genitore — oltre che a fine full-site rebuild. Entrambi i file sono
scritti nella cartella radice dell'export e sincronizzati verso l'edge come ogni altro asset.
Nessuna pagina di anteprima vi compare (ADR-25 § 4, ereditato: il generatore legge solo
`published` per costruzione).

**Delta rispetto alla decisione originale**: la prima stesura di questo contratto limitava la
rigenerazione ai soli trigger di full-site rebuild, per non pagare un'enumerazione
O(catalogo) ad ogni pubblicazione isolata. Il costo O(catalogo) per evento resta reale ed è
stato accettato esplicitamente (freshness immediata della sitemap preferita al risparmio di
query); resta però evitato il moltiplicatore O(catalogo²) sul fan-out di un full-site rebuild
stesso — `ExportProcessor::exportFullSite` enumera una sola volta e i job di singola pagina
che genera (`skipSitemapRegeneration: true` in `PageExportJobData`) non rigenerano la propria
copia.

### 4.3 — Adapter di consegna edge (delta da costruire)

**Stato attuale**: `ExportProcessor` scrive solo su filesystem locale
(`AppConstants.staticExportPath`) — è il `LocalFolderDeployer` implicito di ADR-45 § Decisione
8, mai formalizzato come interfaccia.

**Contratto richiesto**: un'interfaccia `StaticSiteDeployer` con due metodi, `write(path:
string, bytes: Buffer | string): Promise<void>` e `remove(path: string): Promise<void>`.
`LocalFolderDeployer` (già di fatto implementato dentro `ExportProcessor`, va solo estratto
dietro l'interfaccia) resta l'unica implementazione **attiva**. Un adapter verso storage
S3-compatibile o CDN edge (`S3Deployer`, `CloudflarePagesDeployer`) resta **dichiarato, non
implementato**, finché un'ADR dedicata non approva il provider concreto (credenziali, costi,
data residency — `CLAUDE.md` § Ask first, "provider esterni"). Il flusso è sempre e solo
**push**: il processor scrive, l'edge non interroga mai né il backend né il database
(ADR-53 § 4). Nessuna implementazione-stub che compili senza essere testabile: se il provider
non è deciso, l'interfaccia resta un contratto TypeScript senza classe concreta oltre
`LocalFolderDeployer`.

## 5 — Invariante di escaping (vincolo ereditato, gate di CI)

Ogni renderer escapa `plainText` (ADR-21, ADR-22 § 7). Con ADR-53 § 7 il punto di verifica si
sposta: il gate di CI asserisce sull'**HTML scritto su file dal job di export**
(`dist/static-site/**/index.html` di test), non più sulla risposta HTTP di `app/public-site` —
la differenza pratica è minima (`app/public-site` produce lo stesso identico HTML che il job
copia), ma il test deve leggere il file esportato per non lasciare un varco fra "quello che il
renderer produce" e "quello che finisce sull'edge" (stesso principio del bug T6 già corretto
in F03: un `res.writeHead` prematuro o una riscrittura post-render non testata possono
introdurre un varco che il test sul solo componente non vede). Resta invariato: un solo
`dangerouslySetInnerHTML` in tutta `components/blocks/`, su HTML già sanitizzato
server-side (ADR-20).

## Criteri di verifica

- Ogni Pagina `published` produce un file `index.html` sotto
  `<staticExportPath>/<locale>/<path>/`; un cambio di stato fuori da `published` rimuove
  fisicamente il file (nessun 404 dinamico necessario, il file non esiste).
- L'HTML esportato contiene `<style>` inline per il CSS above-the-fold e almeno un
  `<link rel="stylesheet">` esterno con fingerprint per il resto.
- Ogni `<img>` nel file esportato porta `width`, `height`, `aspect-ratio` e `srcset` con
  almeno le varianti AVIF/WebP generate dal preset applicabile; un'immagine priva di
  dimensioni fa fallire il gate di CI.
- Il file esportato contiene `<meta property="og:...">` e uno `<script
  type="application/ld+json">` coerenti con `revision.seo`, senza chiamate a runtime.
- `sitemap.xml` elenca esattamente le Pagine `published` al momento dell'ultima
  rigenerazione; nessuna pagina di anteprima o bozza vi compare.
- Nessun processo raggiungibile dalla rete pubblica apre connessioni verso PostgreSQL, Redis
  o NestJS: verificabile a livello di regola di rete/firewall in ambiente di produzione.
- `app/public-site` risponde solo su rotte di anteprima autenticate (token ADR-25) quando
  raggiunto dal perimetro admin; ogni sua risposta di anteprima porta `X-Robots-Tag:
  noindex, nofollow, noarchive`.
- Invariante di escaping verificata sull'HTML **scritto su file** dal job di export, non sulla
  sola risposta di `app/public-site`.
- Nessuna modifica a `schema.ts`; nessuna dipendenza npm pesante nuova oltre `sharp`
  (già approvata) finché un provider edge concreto non è approvato da una propria ADR.
