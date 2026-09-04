# ADR-53 — Architettura Air-Gapped SSG (Static Site Generation) Zero-DB e disaccoppiamento totale della superficie pubblica

## Status
[ ] In discussione · [x] **Approvata** (ACCEPTED) · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
**2026-09-04**, firmata dall'umano in sede di task (stesso pattern di autorizzazione di
ADR-38/47/50/51/52).

## RFC di riferimento
`docs/ai/rfc/RFC-44-static-site-export-engine.md` (motore di export), esteso qui alla
consegna edge e all'air-gap.

## ADR superate da questa decisione
ADR-22 (Consumer HTML pubblico) · ADR-23 (Caching e invalidazione pubblica) ·
ADR-24 (Routing e risoluzione degli slug).
**ADR-45 non è superata**: questa ADR ne è il completamento. ADR-45 ha reso statico il
*rendering*; ADR-53 rende air-gapped la *consegna* e chiude il superamento formale delle tre
ADR che ADR-45 aveva soltanto reinterpretato.

## Numerazione
Il task che ha originato questa ADR chiedeva il numero **31**, già assegnato a
`ADR-31-layout-colonne-section.md` (approvata il 2026-08-23). Una ADR approvata non si
riscrive: la decisione prende il primo numero libero, **53**.

---

## Contesto & problema

ADR-22 fissava un SSR a richiesta in `app/public-site` (porta 55000, `node:http` +
`renderToStaticMarkup`), alimentato a runtime da `api/v1/public/*`; ADR-23 ne accelerava le
letture con una cache Redis invalidata per evento; ADR-24 risolveva lo slug iterativamente per
segmenti con query sul database a ogni richiesta non cacheata.

L'impianto funziona ma tiene in piedi, sul percorso del traffico anonimo, tre dipendenze che un
CMS enterprise non deve avere: un runtime Node esposto, un'API di lettura raggiungibile e —
dietro di essa — PostgreSQL. Ne discendono una superficie DoS reale (ogni miss di cache è una
catena di query indicizzate), un accoppiamento di disponibilità (l'API giù significa sito giù) e
un profilo prestazionale che dipende dalla temperatura della cache invece che dall'infrastruttura.

ADR-45 ha già spostato il rendering a publish-time. Resta da recidere ciò che ADR-45 non ha
dichiarato: che la macchina che serve il pubblico **non possiede alcuna rotta di rete** verso il
piano di gestione, e che la consegna avviene su uno storage distribuito e non su un filesystem
condiviso con il backend.

---

## Decisione

1. **Build-on-Publish (SSG puro).** Ogni pubblicazione, ripubblicazione, archiviazione, cambio
   di slug o di genitore emette un evento asincrono su BullMQ (coda `static-export`, già
   istituita da ADR-45). Un worker di build compila l'albero blocchi `jsonb` della Revisione
   pubblicata in markup HTML5 semantico. La compilazione è l'unico momento in cui il contenuto
   attraversa il confine fra piano di gestione e superficie pubblica.

2. **Zero-JS client-side e CSS critico inlined.** Il CSS necessario al rendering sopra la piega
   è iniettato nel `<head>` del file statico; il resto è servito come foglio esterno con
   fingerprint immutabile. I blocchi statici non caricano framework runtime né script di
   hydration: il markup prodotto è terminale. Ne segue, come già in ADR-22 § 2, che gli Error
   Boundary non proteggono la superficie pubblica — un albero non servibile è respinto a monte
   (ADR-21 § 3.7) e non produce mai un file.

3. **Pipeline media ottimizzata, CLS = 0.** Le varianti sono prodotte asincronamente dal worker
   `sharp` di ADR-49 nei formati AVIF e WebP, con fallback raster, ed esposte in `srcset`
   multi-risoluzione. Ogni `<img>` emesso porta `width`, `height` e `aspect-ratio` calcolati a
   build-time dai metadati reali del file, più un segnaposto inline (BlurHash o SVG di
   dimensione trascurabile): il layout shift è azzerato per costruzione, non per configurazione.
   L'insieme dei preset resta quello finito e nominato di ADR-49 — questa ADR ne aggiunge la
   dichiarazione dei formati e degli attributi dimensionali, non un crop continuo arbitrario.

4. **Air-gapped edge delivery.** I file `.html` e gli asset sono sincronizzati verso uno storage
   distribuito (CDN edge, bucket S3-compatibile o volume Nginx isolato). La macchina che serve il
   pubblico **non possiede connessioni di rete verso PostgreSQL, Redis o il backend NestJS**:
   l'unico flusso è push, dal worker di build allo storage, mai pull dalla superficie pubblica.
   L'air-gap è una proprietà dell'infrastruttura, verificabile come regola di rete, non una
   convenzione applicativa.

5. **Preview Mode: `app/public-site` è un motore di anteprima, non un server di produzione.**
   Il microservizio sulla porta 55000 è ridimensionato al solo rendering di bozze e WYSIWYG per
   il Page Builder, protetto dal token di ADR-25 (JWT dedicato, `purpose: 'page-preview'`,
   emissione audit-logged) e raggiungibile solo dal perimetro admin. Non serve mai traffico
   anonimo e non espone contenuto pubblicato.

6. **SEO e metadati pre-compilati nel file statico.** OpenGraph e JSON-LD Schema.org sono
   generati a publish-time dal `SeoGraphService` di ADR-48 e serializzati dentro l'HTML;
   `sitemap.xml` e `robots.txt` sono rigenerati dallo stesso job e sincronizzati sull'edge.
   Nessun metadato è calcolato a runtime, perché a runtime non c'è più nulla che calcoli.

7. **Invariante di escaping ereditata e non negoziabile.** Il vincolo di ADR-21/ADR-22 § 7
   resta in vigore e si sposta di verifica: ogni `plainText` è escapato nell'**HTML prodotto dal
   job di export**, asserito su file generato come gate di CI, non sul componente React.

---

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Mantenere l'SSR di ADR-22 con cache Redis (ADR-23) | Invalidazione entro 5s già progettata | Runtime Node, API e DB restano sul percorso del traffico anonimo | Non elimina la superficie d'attacco, che è il problema |
| SSG solo su filesystem locale (ADR-45 senza § 4) | Nessuna infrastruttura nuova | Il volume è condiviso con il piano di gestione: l'air-gap resta dichiarativo | Superata da questa ADR, che ne è l'estensione |
| ISR / rigenerazione on-demand a runtime | Prima richiesta sempre servita | Reintroduce un runtime che interroga l'API: l'air-gap decade | Contraddice la decisione |
| Reverse proxy con cache HTML davanti all'SSR | Cambio minimo | Due cache e due invalidazioni (ADR-22 § 6), origine ancora viva | Sposta il problema, non lo toglie |
| Risoluzione slug dinamica mantenuta via API (ADR-24) | Nessuna mappa da generare | Richiede il DB in lettura sul pubblico | Sostituita dalla mappa di rotte pre-compilata |
| Hydration parziale (islands) per i blocchi interattivi | Interattività nativa | Reintroduce JS e un bundle da versionare sul pubblico | Ogni isola futura resta una decisione a sé, come già in ADR-22 |

---

## Conseguenze

- **Sicurezza**: la superficie pubblica non ha database, API, sessioni né runtime applicativo.
  Il vettore DoS verso PostgreSQL sparisce; una compromissione dell'edge espone file già
  pubblici e nient'altro.
- **Prestazioni**: TTFB determinato dallo storage edge e non dalla temperatura di una cache; il
  percorso freddo, che ADR-23 imponeva di misurare a ogni rilascio, cessa di esistere.
- **Latenza di pubblicazione**: si paga in cambio. La pubblicazione non è più visibile
  nell'istante del commit ma al termine del job di build e della sincronizzazione. L'NFR di
  invalidazione entro 5 secondi va riletto come "build + sync entro 5 secondi" e misurato lì; un
  job che esaurisce i retry lascia il sito su contenuto precedente — mai su contenuto errato, ma
  stantio, e va monitorato con la stessa serietà con cui ADR-23 § 6 monitorava i `DEL` falliti.
- **Redis** resta esclusivamente backend di BullMQ. Nessuna chiave `public:*`, nessun token di
  registro nella chiave, nessuna TTL da governare.
- **Rebuild di massa**: un cambio di tema, di impostazioni globali o un incremento di `v` nel
  registro dei blocchi non invalida chiavi ma rigenera file. Il fan-out `enqueueFullSiteExport`
  di ADR-45 diventa un'operazione con costo proporzionale al numero di pagine, da schedulare e
  osservare, non un `DEL` istantaneo.
- **Rollback**: coerente con ADR-21, un rollback del backend che abbassi `v` esige la
  rigenerazione dei file statici; l'edge conserva l'output precedente finché non viene
  sovrascritto, il che rende il rollback possibile ma esplicito.
- **Redirect**: il debito di ADR-24 § 6 non è sanato qui. Cambiare lo slug di una pagina
  pubblicata continua a rompere la vecchia URL; la differenza è che ora il `404` è servito
  dall'edge e la pulizia del file orfano è responsabilità del job di sync.
- **Nessuna modifica allo schema PostgreSQL** è richiesta da questa ADR.

---

## Conformità

- Nessun processo sulla macchina pubblica apre una connessione verso PostgreSQL, Redis o
  NestJS: verificabile come regola di rete/firewall, non come code review.
- `app/public-site` non riceve traffico anonimo: ogni sua rotta richiede il token di anteprima
  di ADR-25.
- Ogni file `.html` prodotto contiene i metadati OpenGraph/JSON-LD generati a build-time; nessun
  metadato è calcolato a runtime.
- Ogni `<img>` nel markup prodotto porta `width`, `height` e `srcset`; un'immagine senza
  dimensioni intrinseche fa fallire il gate di CI.
- Il test di escaping di ADR-22 § 7 gira sull'output del job di export, non sul renderer.
- Nessuna chiave Redis con prefisso `public:` viene scritta o letta.
