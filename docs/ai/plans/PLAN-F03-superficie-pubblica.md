# Plan — F03 Superficie pubblica di lettura (Architettura Air-Gapped SSG — ADR-53)

## Spec di riferimento
`docs/ai/specs/SPEC-F03-superficie-pubblica.md` — riscritta il 2026-09-04 su ADR-53, con la
tabella "Stato reale" che distingue baseline già implementata da delta da costruire. Questo
piano segue la stessa distinzione: **non riparte da zero**.

## ADR di riferimento
`ADR-53` (decisione corrente) · `ADR-45` (non superata: coda `static-export`, orchestrazione
NestJS senza rendering, tombstone) · `ADR-48` (dati SEO) · `ADR-49` (pipeline media) ·
`ADR-25` (anteprima) · `ADR-21` (escaping) · `ADR-22`/`ADR-23`/`ADR-24` (superseded, record
storico).

---

## Il percorso che F03 deve chiudere

> **Una pagina pubblicata è un file HTML già pronto su uno storage isolato, raggiunto dal
> pubblico senza che nessuna richiesta anonima tocchi il backend, il database o Redis.**

Ogni task sotto dichiara a quale tratto di quel percorso serve. Redirect (F07), multilingua
(F05), form/chatbot come interattività (F10/F11) restano fuori: hanno la loro feature o il
loro debito dichiarato altrove.

---

## Audit strategico

### Cosa esiste già e non va ricostruito

| Componente | ADR | Rischio se ricostruito da zero |
|---|---|---|
| Coda `static-export`, job page/tombstone/full-site, manifest su filesystem | ADR-45 | Duplicazione di `ExportModule`; una seconda coda con lo stesso scopo violerebbe "una sola coda nuova" già rispettato |
| `SeoGraphService` (dati JSON-LD/OG in `revision.seo`) | ADR-48 | Un secondo generatore romperebbe Single Source of Truth (Constitution, Principle 2) |
| Worker `sharp`, preset nominati, focal point, non-distruttività | ADR-49 | Una seconda pipeline media duplicherebbe `MediaProcessor` |
| Token di anteprima, rotta `/__preview/:token`, `X-Robots-Tag` bloccante | ADR-25 | Un secondo meccanismo di anteprima aprirebbe un canale che espone bozze fuori da `public/` |

### Falle logiche / Contraddizioni rilevate

| Dove | Problema | Impatto a runtime | Stato |
|---|---|---|---|
| ADR-53 § 2 ("CSS critico inlined") vs `app/public-site/src/App.tsx` | Il foglio dei blocchi è sempre un `<link>` esterno, mai inline | Nessuna regressione oggi (il contratto CLS/LCP non è ancora verificato), ma la ADR descrive uno stato non ancora raggiunto | Aperto — T2 |
| ADR-53 § 3 ("AVIF... `srcset` multi-risoluzione") vs `media.processor.ts` | L'output è fisso `webp`, nessun `avif`; nessuna colonna dimensioni persistita | Un `<img>` esportato oggi non ha `srcset`/`width`/`height`: CLS non azzerato per costruzione | Aperto — T3 |
| ADR-48 § Conseguenze ("l'assemblaggio... resta un task separato") vs `App.tsx` | `page.seo` non è mai letto dal renderer | Ogni Pagina pubblicata oggi esce senza JSON-LD/OpenGraph nel file statico, nonostante il dato esista | Aperto — T4 |
| ADR-45 § Decisione 8 (deployer) vs `export.processor.ts` | Non esiste un'interfaccia `StaticSiteDeployer`: la scrittura su filesystem è inline nel processor | Nessun bug oggi, ma "air-gap" e "adapter edge" di ADR-53 § 4 non hanno un punto di estensione dichiarato | Aperto — T5 |
| ADR-53 § 4 ("nessuna connessione di rete... verso il backend NestJS") vs comportamento reale di `app/public-site` | Il renderer chiama comunque `api/v1/public/pages` a runtime (necessario per servire l'anteprima, ADR-25) | L'air-gap è oggi solo una proprietà auspicata: senza isolamento di rete a livello infra, `app/public-site` resta un client HTTP verso il backend | Dichiarato in SPEC-F03 § 1, non sanabile da codice applicativo — è configurazione di rete (T6) |
| `non-functional-requirements.md` § Performance pubblica | Descrive ancora "cache calda/fredda" come profilo del traffico pubblico anonimo, che con ADR-53 non esiste più (quel traffico va ai file statici) | Un lettore del NFR assumerebbe ancora un percorso a cache fredda misurabile in produzione | **Non risolto da questo piano**: modificare l'NFR richiede autorizzazione umana esplicita per quel file specifico, non inclusa nella richiesta che ha originato questa revisione — segnalato, non corretto qui |

### Rischi architetturali / Over-engineering

- **Rischio principale, invariato da ADR-45**: il worker di export è già minuscolo e senza
  stato. Il rischio ora è opposto — che T2/T3/T4 (CSS critico, media multi-formato, SEO
  assembly) gonfino `app/public-site` con logica di ottimizzazione che appartiene al build,
  non al renderer. Il rimedio è lo stesso principio di ADR-45 § Decisione 7 (critical CSS "già
  risolto", non serve un meccanismo nuovo): estrarre, non costruire un bundler.
- **Adapter edge (T5)**: l'interfaccia va scritta per due metodi (`write`/`remove`), non per
  un framework di plugin. Un terzo metodo o un sistema di provider dinamici è il segnale che
  si sta anticipando un requisito (S3? Cloudflare?) non ancora approvato da nessuna ADR.
- **Rischio dichiarato e accettato, ereditato da RFC-44**: la finestra di propagazione fra
  commit di pubblicazione e file statico disponibile (fino a 5s) resta. ADR-53 non la
  aggrava né la risolve: il rischio è già mitigato dal fatto che i trigger restano solo
  `published`/`unpublished`, mai `draftContent`.
- **Media (T3) è il task con più superficie nuova**: due formati invece di uno, dimensioni da
  persistere, `srcset` da comporre. Il rimedio è restare dentro l'insieme finito di preset già
  nominato da ADR-49 § M6 — un sesto preset o un crop continuo arbitrario è fuori scope e
  richiede una propria firma.

---

## Task operativi (6 — il tetto è 8)

### T1 — Verifica di non regressione della baseline (ADR-45/48/49/25)
- **Serve al percorso**: prima di aggiungere delta, va confermato che l'esistente si comporta
  come le ADR che lo governano dichiarano — nessuna delle righe ✅ della tabella "Stato reale"
  di SPEC-F03 è mai stata verificata da un test end-to-end dopo l'introduzione di ADR-53.
- **Output atteso**: conferma (test esistenti + lettura mirata, nessuna modifica di codice)
  che: la coda `static-export` accoda/processa correttamente i tre tipi di job; il tombstone
  rimuove fisicamente il file; `SeoGraphService` continua a scrivere `revision.seo` dentro
  `publishTransactionally()`; il worker media produce ancora WebP non distruttivo con focal
  point; la rotta `/__preview/:token` risponde solo con token valido e mai in cache.
- **Dipendenze**: nessuna.
- **Criterio di Done**: nessuna regressione trovata, oppure regressioni trovate e registrate
  come bug a sé (non corrette dentro questo task se fuori dal suo scope).
- **Agente**: test-engineer.

### T2 — CSS critico inline (frontend, `app/public-site`)
- **Serve al percorso**: è il tratto "il file HTML già contiene ciò che serve al primo
  render, senza attendere un secondo foglio esterno per il contenuto sopra la piega".
- **Output atteso**: estrazione del CSS dei blocchi che compaiono nel primo viewport della
  Pagina e iniezione come `<style>` inline in `App.tsx`, **prima** di ogni `<link>`; il resto
  del foglio CSS Modules resta esterno con `Cache-Control` immutabile. Nessuna libreria di
  "critical CSS extraction" a runtime: il calcolo è a build/render time, sugli stessi dati già
  disponibili al renderer (stesso principio di `ThemeStyleTag`, ADR-45 § Decisione 7).
- **Dipendenze**: nessuna (indipendente da T3/T4).
- **Criterio di Done**: il file esportato per una Pagina con più blocchi ha un `<style>`
  inline non vuoto per i blocchi above-the-fold e un `<link>` esterno immutabile per il resto;
  nessuna regressione sul rendering visivo (verifica manuale su almeno un tema personalizzato).
- **Agente**: frontend-developer.

### T3 — Media: AVIF/WebP multi-risoluzione, dimensioni, CLS = 0 (backend, media-queue + export)
- **Serve al percorso**: è il tratto che azzera il layout shift — il requisito CLS = 0 di
  ADR-53 § 3 non è raggiungibile senza dimensioni intrinseche nel markup.
- **Output atteso**: `media.processor.ts` genera, oltre a `webp`, anche `avif` per lo stesso
  preset richiesto (righe `files` derivate distinte, stesso `parentFileId`, coerente con
  ADR-49 § Decisione: nessun crop continuo arbitrario, resta l'insieme finito di preset);
  le dimensioni reali della variante (già note a `sharp`, oggi solo loggate) sono esposte in
  modo che il job di export le legga senza ricalcolarle. `ExportProcessor::syncMediaAndRewriteHtml`
  copia tutte le varianti pubbliche del `guid`, non solo l'originale, e riscrive l'`<img>` con
  `srcset`, `width`, `height`, `aspect-ratio` calcolato dai due precedenti. SVG resta escluso
  (ADR-27 § 4/ADR-49 § M7, invariato).
- **Dipendenze**: nessuna (indipendente da T2/T4), ma logicamente propedeutico a T5 (l'adapter
  di consegna copia anche le varianti nuove).
- **Criterio di Done**: un'immagine referenziata in una Pagina pubblicata produce almeno due
  formati (`webp`+`avif`) copiati sull'export; il tag `<img>` esportato porta `width`,
  `height`, `aspect-ratio`, `srcset`; un `guid` non risolvibile lascia l'`<img>` invariato
  (comportamento attuale, non regredito).
- **Agente**: backend-developer.

### T4 — SEO/JSON-LD/OpenGraph nel documento esportato + sitemap.xml/robots.txt (backend + frontend)
- **Serve al percorso**: è il tratto "il file statico è anche ciò che un crawler/motore
  generativo legge", non solo ciò che un browser mostra.
- **Output atteso**: `App.tsx` (`app/public-site`) legge `page.seo` (già presente nel
  contratto `PublicPageDto`, nessuna modifica di forma) e serializza `<meta
  property="og:...">` + un `<script type="application/ld+json">` col contenuto già generato
  da `SeoGraphService`. `ExportProcessor::exportPage`/`tombstonePage` (stessa coda
  `static-export`) rigenerano `sitemap.xml` (Pagine `published`, stesso algoritmo di
  `resolvePublishedPageLocations`) e `robots.txt` ad ogni evento di singola pagina
  (pubblicazione, depubblicazione, cambio slug/genitore) oltre che a fine full-site rebuild —
  emendato dalla stesura originale ("mai per singola pagina"), che limitava la rigenerazione
  ai soli trigger di rebuild per evitare il costo O(catalogo) per evento; il costo è accettato
  esplicitamente per la freshness immediata, mentre il fan-out di un full-site rebuild resta
  a una sola rigenerazione (`skipSitemapRegeneration` sui job fanned-out, non O(catalogo²)).
  Entrambi i file sono scritti nella radice dell'export.
- **Dipendenze**: nessuna sul dato (già scritto da ADR-48), indipendente da T2/T3.
- **Criterio di Done**: il file esportato di una Pagina con `seo.faq` non vuoto contiene un
  `@graph` con `WebPage`+`FAQPage`; `sitemap.xml` elenca esattamente le Pagine `published` al
  momento della rigenerazione; nessuna pagina di anteprima o bozza compare in nessuno dei due.
- **Agente**: backend-developer (dato + job sitemap/robots) e frontend-developer
  (assemblaggio dei tag in `App.tsx`) — split esplicito, non un solo agente.

### T5 — Adapter di consegna edge e air-gap di rete (backend + infra)
- **Serve al percorso**: è il tratto che rende l'isolamento una proprietà verificabile,
  non un'intenzione scritta in un'ADR.
- **Output atteso**: interfaccia `StaticSiteDeployer` (`write(path, bytes)` /
  `remove(path)`), estratta dalla scrittura oggi inline in `ExportProcessor`;
  `LocalFolderDeployer` come unica implementazione attiva (comportamento equivalente
  all'attuale, dietro l'interfaccia). `S3Deployer`/`CloudflarePagesDeployer` restano
  dichiarati, non implementati, finché un'ADR dedicata non approva un provider concreto
  (`CLAUDE.md` § Ask first). Documentazione della regola di rete air-gap (nessuna rotta PULL
  dalla superficie pubblica verso Postgres/Redis/NestJS) come configurazione di
  deploy/firewall, non come codice applicativo — coerente con `docs/system-architecture.md`
  aggiornato nello stesso task documentale che ha originato questo piano.
- **Dipendenze**: T3 (l'adapter copia anche le varianti media nuove).
- **Criterio di Done**: `ExportProcessor` scrive tramite l'interfaccia, non più con
  `mkdir`/`writeFile`/`rename` inline; nessuna regressione sul comportamento attuale
  (scrittura atomica invariata); nessun provider esterno attivato senza ADR propria.
- **Agente**: backend-developer per l'interfaccia/adapter, orchestrator per l'eventuale RFC
  di un provider edge concreto se il task lo richiede in futuro (fuori da questo piano).

### T6 — Test della superficie pubblica air-gapped
- **Serve al percorso**: dimostra che il file esportato è completo e che l'anteprima non
  fuoriesce mai sul pubblico — gli stessi due rischi già coperti per l'SSR (ADR-22 § 2) ora
  spostati sul file.
- **Output atteso**: test che verificano, sul file scritto da `ExportProcessor` (non sulla
  sola risposta HTTP di `app/public-site`): invariante di escaping su `plainText` (ADR-21,
  spostata da ADR-53 § 7); presenza di `<style>` inline + `<link>` esterno (T2); presenza di
  `srcset`/`width`/`height`/`aspect-ratio` su ogni `<img>` risolvibile (T3); presenza di
  `<script type="application/ld+json">` coerente con `revision.seo` (T4); `sitemap.xml` privo
  di pagine non pubblicate; tombstone che rimuove il file su transizione fuori da `published`
  (non regressione di ADR-45); anteprima (`/__preview/:token`) mai raggiungibile senza token
  valido e sempre con `X-Robots-Tag` bloccante (non regressione di ADR-25).
- **Dipendenze**: T2, T3, T4, T5.
- **Criterio di Done**: suite verde nel gate `backend-e2e`/`public-site` CI; ogni asserzione
  gira sul file prodotto dal job di export, non sul componente React isolato.
- **Agente**: test-engineer.

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| CSS critico inline duplica regole già presenti nel foglio esterno, gonfiando l'HTML | Media | Basso — solo peso pagina, non correttezza | T2: limitare l'estrazione ai soli blocchi above-the-fold, non all'intero foglio |
| Generazione AVIF raddoppia il tempo di elaborazione del worker media senza backpressure dedicata | Media | Medio — coda media già condivisa con altri preset | T3: stessa coda/priorità già esistente, nessuna coda nuova; monitorare `queue-health.task.ts` |
| JSON-LD generato da una Revisione con `structuredData` manuale incompleto produce un `@graph` malformato | Bassa (il merge non distruttivo è già garantito da ADR-48) | Medio — un crawler scarta l'intero blocco `ld+json` se non valido | T4: test che verifica JSON.parse dell'output prima di asserire sul contenuto |
| Adapter `StaticSiteDeployer` introdotto come astrazione ma mai usato da un secondo provider, quindi over-engineering silenzioso | Bassa se limitato a due metodi | Basso | T5: nessuna implementazione oltre `LocalFolderDeployer` finché un'ADR non approva un provider |
| Air-gap dichiarato in documentazione ma non applicato a livello di rete/firewall reale in produzione | Media — è configurazione di deploy, non testabile da CI applicativa | Alto — vanifica l'intero obiettivo di isolamento di ADR-53 | T5: la regola va scritta nella configurazione di deploy (Nginx/firewall) e verificata come checklist di go-live, non solo come test automatico |
| File statico orfano non rimosso (regressione di ADR-45 § Decisione 5) durante il refactor dell'adapter (T5) | Bassa se T5 riusa la stessa logica di `tombstonePage` dietro l'interfaccia | Alto | T6: test di tombstone ripetuto dopo il refactor dell'adapter, non solo prima |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] Sei task chiusi
- [ ] Nessun `any` senza commento, nessun `console.log`, JSDoc sulle funzioni pubbliche
- [ ] Nessuna dipendenza npm pesante nuova oltre `sharp` (già approvata) senza ADR dedicata
- [ ] Nessuna coda BullMQ nuova: `static-export` resta l'unica, riusata per sitemap/robots
- [ ] `app/backend` non importa mai `react`/`react-dom/server` (invariante ADR-45, verificata
      di nuovo dopo ogni task che tocca `export.processor.ts`)

### Test
- [ ] T1 di verifica baseline eseguito prima di ogni delta
- [ ] Ogni asserzione di T6 gira sul file scritto dal job di export, non sul componente isolato
- [ ] Invariante di escaping verificata sull'HTML esportato
- [ ] Nessun test placeholder

### Contratti e documentazione
- [ ] `SPEC-F03-superficie-pubblica.md` riscritta e approvata (questa revisione)
- [ ] `docs/system-architecture.md`, `docs/roadmap.md`, `docs/ai/progress-tracker.md`
      aggiornati nello stesso task documentale che ha originato questa revisione (richiesta
      umana esplicita, non un'iniziativa AI)
- [ ] `docs/non-functional-requirements.md` — segnalato ma **non aggiornato qui**: il profilo
      "cache calda/fredda" della superficie pubblica descrive un traffico che con ADR-53 non
      esiste più; la correzione richiede autorizzazione umana esplicita per quel file
- [ ] Nessuna implementazione di `S3Deployer`/`CloudflarePagesDeployer` senza ADR propria
