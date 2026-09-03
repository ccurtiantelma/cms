# RFC-F07 — Motore di generazione JSON-LD / OpenGraph per le Pagine

## Status
[ ] In discussione · [x] Approvato → genera ADR-48 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-09-02

---

## Origine di questa RFC

Un task esterno ha chiesto di implementare un `SeoGraphService` (metodi `generateJsonLd`,
`generateOpenGraphTags`), di estendere `PublicPageDto` con due nuovi campi `jsonLd`/`openGraph`
e di integrarlo in `PublicPagesService.findBySlug()`, etichettando il lavoro come **"Fase
F13-01"**. Verifica fatta prima di scrivere codice:

- **"F13-01" non esiste.** `docs/roadmap.md` elenca F01–F12; non c'è un F13, tantomeno una
  numerazione di sotto-fase `-01`. L'etichetta va trattata come non autorevole — probabilmente
  un riferimento a un piano esterno al repository, non a `docs/`.
- **`PublicPagesService.findBySlug()` non esiste.** Il metodo reale è
  `PublicPagesService.resolveByPath(canonicalPath)` (`app/backend/src/pages/public-pages.service.ts:65`),
  che risolve per segmenti (ADR-24), non per singolo slug. Il task andava quindi già corretto
  sull'unico punto di integrazione che aveva citato con precisione.
- **La decisione che il task avrebbe dovuto citare** è la voce **1.8** di `docs/TODO.md` —
  *"Generazione di sitemap e structured data"*, stato ⏳ **Da fare**, appartenente a F07, mai
  assegnata, senza RFC né ADR. Questo documento copre la parte **structured data / OpenGraph**
  di quella voce (non la sitemap XML, vedi § Fuori scope).
- `CLAUDE.md` § Architecture: *"sitemap e structured data"* è esplicitamente fra le decisioni
  che innescano un ADR obbligatorio. Nessuna ADR sul tema esiste in `docs/ai/adr/` (ADR-1…
  ADR-47 censite). Il task è stato correttamente bloccato prima di scrivere codice.

Questa RFC non implementa nulla: porta la decisione a firma umana, riusando quanto già
approvato in `docs/business-rules.md` § SEO/§ GEO e verificando la compatibilità con l'ultima
ADR architetturale approvata (ADR-45, un giorno prima di questo task).

---

## Cosa è già deciso (non è materia di questa RFC)

A differenza di molte decisioni aperte del progetto, qui il **contratto di dominio esiste già
per iscritto** — non va inventato, va solo costruito il generatore che lo popola:

- `docs/business-rules.md` § SEO (righe 217-226): la Pagina possiede già `metaTitle`,
  `metaDescription`, `canonicalUrl`, `robots` (`robotsIndex`/`robotsFollow`),
  `ogTitle`/`ogDescription`/`ogImage` con fallback dichiarati (`metaTitle`, `metaDescription`,
  immagine di copertina), e **`structuredData`**: *"JSON-LD generato dal sistema in base al
  template, estendibile a mano. Deve restare JSON-LD valido."*
- `docs/business-rules.md` § GEO (righe 247-255): `faq` è *"esposto anche come JSON-LD
  `FAQPage`"* — non è una domanda aperta, è già una regola approvata. Il generatore di questa
  RFC copre quindi **anche** `FAQPage`, non solo il tipo di pagina principale (risponde al
  punto 4 del task originale).
- `docs/glossary.md:42`: structured data è *"generata dal sistema in base al template ed
  estendibile a mano"* — stesso testo, conferma che "sistema" e "mano" sono due sorgenti che
  **coesistono**, non alternative.
- Il codice attuale (`app/backend/src/pages/dto/page-seo.dto.ts:82-87`) ha già
  `PageSeoDto.structuredData: Record<string, unknown>` con commento esplicito: *"JSON-LD esteso
  a mano, OLTRE a quello generato dal sistema"* — il campo che ospiterà l'output di questa
  feature esiste da F01, semplicemente non è mai stato scritto da nessun generatore.

Quello che manca è **solo** il generatore e **dove/quando** gira — questo è l'oggetto reale
della RFC.

---

## Vincolo nuovo, non visto dal task originale: ADR-45 (approvata il giorno prima)

Il task ragionava implicitamente contro un modello dove `PublicPagesService.resolveByPath()` è
il percorso che serve un visitatore anonimo reale, con Redis come cache di quella risposta
(ADR-23). Quel modello è stato **superato** il 2026-09-01 da **ADR-45**
(`docs/ai/adr/ADR-45-ssg-export-architecture.md`, da RFC-44, "ADR Reinterpretate/Superate:
ADR-22, ADR-23"):

- Il traffico pubblico anonimo di produzione è servito da **file HTML statici** su
  filesystem/CDN, non da NestJS a runtime.
- `app/public-site` non è più il server del traffico pubblico: resta **draft preview** per i
  redattori e **worker di rendering interno** per il job di export (`StaticExportModule`),
  raggiunto da NestJS via chiamate HTTP interne loopback.
- Di conseguenza, oggi `PublicPagesService.resolveByPath()` — e la cache Redis che vi sta sopra
  (`PublicPageCacheService`, ADR-23) — non rispondono più a un visitatore reale: rispondono
  solo alla preview di un redattore o, indirettamente, al job di export durante la compilazione
  statica (una chiamata per pagina pubblicata, non una per visita).

**Conseguenza diretta per questa RFC**: la preoccupazione originale del task — "calcolare a
ogni richiesta pubblica è costoso e non cacheabile in modo sensato" — si applica molto meno
dopo ADR-45, perché quella rotta non riceve più traffico pubblico ad alto volume. Questo
**allenta**, ma non elimina, la spinta verso il calcolo a publish-time: resta comunque il
vincolo costituzionale della Revisione immutabile (regola 3) e la constatazione che
`business-rules.md` descrive lo `structuredData` di sistema come qualcosa che si **genera**
(un'azione, non una vista) e poi si **estende a mano** (un'operazione successiva su un dato
fermo) — semantica più vicina a "scritto una volta" che a "ricalcolato ogni volta che qualcuno
guarda".

Nota collaterale, non decidibile qui: `CLAUDE.md` § Decisioni aperte descrive ancora la
caching pubblica come chiusa da ADR-23 senza menzionare che ADR-45 la reinterpreta. Stessa
osservazione già fatta da `RFC-F09-media-transform-pipeline.md` per la pipeline media — un
disallineamento documentale reale, non un'invenzione di questa RFC, segnalato ma non corretto
(non è materia di questo task).

---

## Soluzione proposta

Ogni punto (S1–S8) richiede firma separata, stesso modello già in uso in
`RFC-F09-media-transform-pipeline.md` (M1–M8).

### S1 — Dove e quando si genera: publish-time vs read-time

Opzioni:

- **S1a — Publish-time, dentro `PagesService.publishTransactionally()`.** Il generatore gira
  subito dopo `const sanitizedSeo = this.treeSanitizer.sanitizeTree(row.draftSeo);`
  (`pages.service.ts:648`), arricchisce `sanitizedSeo.structuredData` (merge, vedi S3) e le
  chiavi OG mancanti, **prima** dell'`INSERT` in `pageRevisionEntity` due righe sotto. Il
  risultato entra nello snapshot immutabile della Revisione, esattamente come il contenuto
  sanitizzato. `PublicPageDto.seo` (già `revision.seo` pari pari, `public-pages.service.ts:109`)
  lo espone senza alcuna modifica alla forma del DTO.
- **S1b — Read-time, dentro `PublicPagesService.resolveByPath()`.** Il generatore gira a ogni
  risoluzione (prima o dopo il livello di cache Redis), usando `revision.seo` (manuale) +
  `revision.title`/`slug`/`content` + `page.locale`/`publishedAt` + impostazioni correnti del
  sito, senza persistere nulla. Con ADR-45 il costo per-richiesta è quasi irrilevante (poche
  chiamate: preview + export), ma introduce un problema di **staleness della cache**: se il
  generatore dipende da `app_settings` (es. nome del publisher, vedi S7) e quelle impostazioni
  cambiano, le chiavi già in `PublicPageCacheService` restano con il JSON-LD vecchio finché non
  scatta un evento di pagina (pubblicazione/spubblicazione/archiviazione/cambio slug — ADR-23
  § 4): un cambio di sole impostazioni **non** è fra questi eventi oggi. Esiste un precedente
  per "impostazioni cambiate → rigenerazione globale" (`SettingsService.updateTheme()` chiama
  `exportService.enqueueFullSiteExport()`), ma estendere quel pattern a un'ipotetica modifica
  di identità del sito è una decisione a sé, non presa qui.

**Raccomandazione**: **S1a**. Coerente con:
1. Regola costituzionale 3 (Revisione immutabile) — il JSON-LD generato diventa parte dello
   snapshot, non un valore che può cambiare sotto la stessa Revisione già pubblicata.
2. Il testo letterale di `business-rules.md`:226 (*"generato... estendibile a mano"*, un'azione
   seguita da un'altra, non una vista sempre ricalcolata).
3. Zero rischio di staleness di cache: non c'è nulla da invalidare oltre a quanto ADR-23 già
   invalida, perché il dato non dipende da uno stato che cambia fuori da un evento di pagina.
4. Riusa la pipeline sanitize→persist già presente, senza toccare `PublicPagesService` né la
   forma di `PublicPageDto`.

Costo dichiarato di S1a: se la logica di generazione cambia in futuro (nuovo template, nuovo
criterio di `@type`), le Revisioni già pubblicate **non si aggiornano** finché non vengono
ripubblicate — comportamento identico a ogni altra modifica di logica di dominio applicata a
uno snapshot immutabile, non un difetto di questa proposta.

### S2 — Collocazione del servizio nel modulo `pages`

Il task originale assumeva `pages/seo/seo-graph.service.ts` (sottocartella `seo/`). Verificato
contro la struttura reale di `app/backend/src/pages/`: gli unici file non-`dto/` in
sottocartella sono `blueprints/page-blueprints.registry.ts` e `diff/block-diff-engine.service.ts`
— due eccezioni puntuali, non la norma. Il resto (`public-page-cache.service.ts`,
`public-path.util.ts`, `slug.util.ts`, `content-tree.ts`, `pages.state-machine.ts`) vive **flat**
sotto `pages/`.

**Raccomandazione**: `app/backend/src/pages/seo-graph.service.ts` (flat, stesso livello di
`public-page-cache.service.ts`), registrato in `pages.module.ts` e iniettato in `PagesService`
(coerente con S1a — è lì che serve). Non è una scelta bloccante: se in sede di spec emergesse
più di un file (es. builder separato per `FAQPage`), una sottocartella `pages/seo/` seguirebbe
comunque il precedente di `diff/` — dettaglio di spec, non di questa RFC.

Nomi metodo: il task proponeva `generateJsonLd`/`generateOpenGraphTags`. Ragionevoli come punto
di partenza, ma la loro **forma di ritorno** dipende da S3/S4 sotto — non fissata qui.

### S3 — Riuso dei campi esistenti: nessun campo nuovo su `PublicPageDto`

Il task chiedeva di estendere `PublicPageDto` con `jsonLd`/`openGraph` come campi paralleli a
`seo`. Verificato contro il contratto esistente: `PublicPageDto.seo` è già `revision.seo` per
intero (`public-pages.service.ts:109`), e `revision.seo` ha già la forma di `PageSeoDto`:
`structuredData` (JSON-LD manuale, per estenderlo) e `ogTitle`/`ogDescription`/`ogImage` (OG
già previsti, con fallback dichiarati in business-rules.md:225).

Aggiungere `jsonLd`/`openGraph` come campi **paralleli** a `seo` significherebbe avere due
posti che descrivono la stessa cosa (`seo.structuredData` vs `jsonLd`, `seo.ogTitle` vs dentro
`openGraph`) — viola `constitution.md` Principle 2 (*"vietato duplicare... contratti API"*).

**Raccomandazione**:
- Il JSON-LD generato dal sistema **confluisce dentro** `seo.structuredData` (merge con
  l'eventuale estensione manuale, vedi sotto) — nessun campo nuovo.
- I valori OG (`ogTitle`/`ogDescription`/`ogImage`) restano gli stessi tre campi già in
  `PageSeoDto`: "generarli" qui significa applicare il fallback già descritto in
  `business-rules.md`:225 (a `metaTitle`/`metaDescription`/immagine di copertina) quando vuoti,
  scritto nello snapshot a publish-time (S1a) invece che lasciato a un fallback calcolato altrove
  e mai persistito.
- Gli **altri** tag OpenGraph richiesti da un head HTML completo (`og:type`, `og:url`,
  `og:site_name`, `og:locale`) **non** corrispondono a nessun campo di `PageSeoDto` oggi, e
  buona parte di essi (`url` = percorso pubblico risolto, `site_name` = impostazione globale non
  ancora esistente, vedi S7) si presta meglio a essere assemblata al momento del rendering HTML
  in `app/public-site`, non generata/persistita dal backend — vedi S4.

Il merge fra JSON-LD generato e `structuredData` manuale non è specificato da nessun documento
esistente (nessuna business rule descrive **come** i due si combinano, solo che entrambi
esistono): è una decisione di dettaglio da fissare in spec, non in questa RFC — ma va segnalata
esplicitamente come punto aperto (vedi § Decisione umana).

### S4 — Confine fra "dato SEO" (backend) e "tag HTML" (frontend/public-site)

Punto non sollevato dal task originale, ma necessario per rispettare `constitution.md`
Principle 7 (*"il backend non renderizza mai HTML... nessuna logica di presentazione può
entrare nel backend"*):

- **JSON-LD** è un oggetto dati (`@context`/`@type`/proprietà), coerente con essere generato e
  persistito lato backend (S1a) ed esposto via `seo.structuredData` — l'emissione del tag
  `<script type="application/ld+json">` che lo incapsula nell'HTML resta comunque
  responsabilità del renderer in `app/public-site` (frontend-developer, ADR-22 § 5), non del
  backend: il backend produce il JSON, mai il markup.
- **OpenGraph "tags"** (nome del task) sono per definizione elementi `<meta property="og:...">`
  — markup HTML, non dati di dominio. I *valori* (`ogTitle`/`ogDescription`/`ogImage`) sono
  legittimamente backend (S3); l'**assemblaggio in tag `<meta>`**, incluse le proprietà che non
  hanno una fonte dati backend propria (`og:url`, `og:type`, `og:site_name`, `og:locale` — i
  primi due calcolabili dal solo `PublicPageDto` già esistente, gli ultimi due da S5/S7), è
  lavoro del renderer `app/public-site`, non un metodo `generateOpenGraphTags()` nel backend.

**Raccomandazione**: la parte backend di questa RFC (`SeoGraphService`, se S1a è confermato)
produce **solo** l'oggetto JSON-LD scritto in `seo.structuredData` — non un metodo che genera
"tag" OG. Il compito di assemblare gli elementi `<meta>` OG completi (valori esistenti + `url`/
`type`/`site_name`/`locale` calcolati) è un task **frontend-developer** su `app/public-site`,
conseguente a questa RFC ma non descritto qui nel dettaglio (fuori dal perimetro di un
Orchestrator che non decide markup). Questo ridimensiona lo scope del task originale, che
assumeva tutto il lavoro concentrato in un unico servizio backend.

### S5 — Criterio per `@type` (`WebPage` vs `Article` vs altro)

Il task menzionava entrambi senza fissare un criterio. Verificato: **non esiste alcun concetto
di "tipo di contenuto"/"template" persistito per riga** su `pages` che possa guidare la scelta —
`page-blueprints.registry.ts` è solo un elenco di alberi di blocchi iniziali usati alla
creazione (`CreatePageDto.templateSlug`), non un campo che sopravvive sulla riga. Questo è
coerente con la regola costituzionale 1: *"non esiste un tipo 'post' privilegiato"*. Inferire
`Article` da "ha una data di pubblicazione significativa" è debole: **ogni** Pagina pubblicata
ha un `publishedAt` (F01), quindi quel criterio selezionerebbe sempre `Article`, mai `WebPage`.

**Raccomandazione**: `@type: "WebPage"` sempre, come unico tipo per l'MVP di questa feature.
Un criterio di scelta `Article`/`BlogPosting` richiederebbe un concetto di "tipo di pagina"
che oggi non esiste sullo schema — introdurlo per questa sola feature sarebbe esattamente
l'over-engineering che l'Orchestrator deve segnalare (un campo nuovo, una migrazione, per
un caso che business-rules.md non descrive). Resta **decisione umana esplicita**, non
assunta da questa RFC.

### S6 — `FAQPage` co-generata da `faq`

Non è una domanda aperta (business-rules.md § GEO lo dichiara già): quando `seo.faq` non è
vuoto, il generatore produce **anche** un blocco `FAQPage` (`@graph` insieme a `WebPage`, o due
`<script>` distinti — dettaglio di spec, non bloccante qui). Stesso servizio di S1/S2, stesso
momento di generazione (S1a).

### S7 — `publisher`/`og:site_name`: nessuna impostazione di sito esiste oggi

Verificato in `app/backend/src/settings/settings.service.ts`: le uniche chiavi di
`app_settings` esistenti sono `theme`, `multilingual.locales`, `global_tokens`. **Non esiste**
alcuna riga "identità del sito" (nome, logo, URL organizzazione) utilizzabile come fallback per
`publisher` (Schema.org) o `og:site_name`.

Opzioni:
- **S7a — Omettere `publisher`/`og:site_name` dal primo taglio.** Il JSON-LD resta comunque
  valido (`publisher` non è obbligatorio per `WebPage`); nessuna dipendenza nuova, nessuna
  decisione aggiuntiva da approvare ora.
  - **S7b — Aggiungere una nuova chiave `app_settings` (`site.identity` o simile) con
  nome/logo/URL**, stesso pattern key-value già in uso (nessuna migrazione di schema, solo un
  nuovo DTO + endpoint Admin, stesso schema di `updateTheme`/`updateMultilingualConfig`). Non
  decidibile qui: introduce un nuovo pannello di impostazioni, fuori dal perimetro stretto di
  "generare JSON-LD" — merita una propria riga in `docs/TODO.md`, non un'aggiunta implicita a
  questa RFC.

**Raccomandazione**: **S7a** per il primo taglio, con S7b segnalato come dipendenza naturale ma
esplicitamente rinviato.

### S8 — `hreflang`/alternate linguistiche: fuori scope

Il task non le menzionava esplicitamente ma `structuredData`/OG a volte le include indirettamente
(`og:locale:alternate`). `business-rules.md` § SEO 3 le tratta come meccanismo a sé (alternate
`hreflang`, non JSON-LD), dipendente dai gruppi di traduzione (F05). Il primitivo
`page.locale`/`translationGroupId` esiste già in schema e viene già usato da
`PublicPagesService`/ADR-24 per la risoluzione — ma l'elenco delle **traduzioni pubblicate
sorelle** di una Pagina non è oggi calcolato da nessun servizio pubblico. Questa RFC **non**
lo introduce: resta dentro il perimetro proprio di F05/F07 hreflang, non di JSON-LD/OpenGraph.

---

## Proposta raccomandata (riepilogo)

Generazione **a publish-time** (S1a), dentro `PagesService.publishTransactionally()`, da un
nuovo `app/backend/src/pages/seo-graph.service.ts` (S2, flat, coerente con la struttura del
modulo), che produce **solo dati** (mai markup, S4): arricchisce `seo.structuredData` con un
oggetto `WebPage` (S5, nessun criterio `Article` per ora) più, se `faq` è popolato, un blocco
`FAQPage` (S6, già richiesto da business-rules.md), e valorizza i fallback OG già previsti da
`PageSeoDto` (S3, nessun campo nuovo su `PublicPageDto`). Nessuna dipendenza da un'impostazione
di identità del sito che oggi non esiste (S7a — `publisher`/`og:site_name` omessi per ora).
`hreflang` resta fuori scope (S8). L'assemblaggio dei tag `<meta>` OG completi in HTML è un
task frontend-developer su `app/public-site`, non backend.

Questa proposta **non è auto-approvata**: ogni punto (S1–S8) richiede firma separata.

---

## Alternative valutate

- **Read-time in `PublicPagesService` (S1b), come impliciva il task originale.** Non scartata
  per costo (ADR-45 lo rende economico), ma per la tensione con l'invalidazione per evento
  (ADR-23 § 4) nel momento in cui il generatore dipendesse da impostazioni globali (S7):
  introdurrebbe una classe di staleness che oggi non esiste, per un guadagno (freschezza) che
  la Revisione immutabile non richiede.
- **`SeoGraphService` come produttore anche dei tag HTML OG** (come chiedeva il task,
  `generateOpenGraphTags`). Scartata come responsabilità backend: viola Principle 7
  (Headless by Default). I *valori* restano backend, l'*assemblaggio in markup* è
  `app/public-site`.
- **Campi `jsonLd`/`openGraph` nuovi su `PublicPageDto`.** Scartata (S3): duplica
  `seo.structuredData`/`seo.ogTitle` già esistenti, viola Single Source of Truth.
- **Criterio automatico `Article` per pagine con data di pubblicazione.** Scartata (S5):
  ogni Pagina ha `publishedAt`, il criterio non discriminerebbe mai nulla; richiederebbe
  comunque un concetto di "tipo di pagina" che non esiste, fuori scope per questa feature.

---

## Impatto

**Se S1–S8 vengono firmati nella forma raccomandata:**

- **Backend.** Nuovo `app/backend/src/pages/seo-graph.service.ts`, iniettato in
  `PagesService`, invocato dentro `publishTransactionally()` prima dell'`INSERT` della
  Revisione. Nessuna modifica a `PublicPageDto`, nessuna modifica a `PublicPagesService`,
  nessuna migrazione DB (il campo `structuredData` esiste già come `jsonb` dentro
  `page_revisions.seo`/`pages.draft_seo`). `openapi:export`/`types` non necessari se nessun DTO
  cambia forma — da verificare in spec se il merge di S3 introduce un sotto-tipo tipizzato al
  posto di `Record<string, unknown>` per `structuredData` (dettaglio di spec).
- **Frontend (`app/public-site`).** Task separato, conseguente: assemblare `<script
  type="application/ld+json">` da `seo.structuredData` e i `<meta property="og:...">` completi
  (valori esistenti + `url`/`type`/`locale` calcolabili, `site_name` rinviato da S7). Non
  descritto in dettaglio da questa RFC (Orchestrator non decide markup).
- **Contratti.** Nessun endpoint nuovo/modificato nella forma raccomandata: `PublicPageDto`
  resta invariato, `PageSeoDto.structuredData` resta lo stesso campo, solo il suo contenuto a
  publish-time cambia (prima vuoto/solo manuale, ora anche generato).

**Se S1 sceglie S1b invece di S1a**: impatto su `PublicPagesService`/`PublicPageCacheService`
invece che su `PagesService`, e la questione di S7b (staleness da impostazioni) torna
bloccante prima di poter usare qualunque dato non derivato dalla sola Revisione.

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Merge fra JSON-LD generato e `structuredData` manuale non specificato, implementato in modo incoerente (es. sovrascrittura silenziosa dell'estensione manuale) | Media | Medio | La spec deve fissare l'algoritmo di merge esplicitamente prima del plan; criterio di Done: un test verifica che un `structuredData` manuale preesistente sopravviva alla generazione di sistema |
| `@type: WebPage` fisso percepito come limitazione quando servirà `Article`/`BlogPosting` (F08/blog-like content) | Bassa ora, media dopo F08 | Basso | Nessuna azione preventiva: introdurre il concetto di "tipo di pagina" è un task a sé quando servirà davvero, non ora (evita over-engineering) |
| Il task frontend conseguente (assemblaggio tag HTML in `app/public-site`) viene dimenticato perché questa RFC copre solo la metà backend | Media | Medio | § Impatto lo dichiara esplicitamente come task separato; va tracciato in `docs/TODO.md` insieme alla firma di questa RFC, non implicitamente incluso |
| S7a (nessun `publisher`/`og:site_name`) percepito come "feature incompleta" da chi validerà il JSON-LD con strumenti esterni (Google Rich Results Test) | Media | Basso | JSON-LD resta valido senza `publisher` per `WebPage`; se il test di validazione esterno lo richiede, è il segnale per firmare S7b, non per inventare un valore placeholder ora |

---

## Fuori scope (dichiarato)

- **Sitemap XML** (`docs/TODO.md` voce 1.8, seconda metà) — decisione distinta, non trattata
  qui: genera un file/endpoint diverso, con proprie regole di invalidazione (`robots` per
  pagina, `hreflang` fra traduzioni) che non condividono la sede di persistenza di questa RFC.
- **`llms.txt`** (F08, GEO) — stessa osservazione, meccanismo di esposizione separato.
- **`robots.txt` globale** — impostazione di sito, non per-Pagina.

---

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Punti firmati, tutti nella forma raccomandata:**

- [x] **S1** — Generazione a publish-time dentro `PagesService.publishTransactionally()` (S1a)
- [x] **S2** — Collocazione flat `pages/seo-graph.service.ts` (non la sottocartella `pages/seo/`
  ipotizzata dal task esterno)
- [x] **S3** — Nessun campo nuovo su `PublicPageDto`: il JSON-LD generato confluisce in
  `seo.structuredData`. Algoritmo di merge fissato in ADR-48 (non lasciato a un'ulteriore spec):
  le chiavi già presenti nell'estensione manuale vincono sempre, il generato riempie solo le
  chiavi mancanti — nessuna sovrascrittura silenziosa dell'estensione manuale. I fallback OG
  restano `ogTitle`/`ogDescription`/`ogImage` già esistenti su `PageSeoDto`.
- [x] **S4** — Il backend produce solo dati (JSON-LD + valori OG), mai markup `<script>`/`<meta>`:
  l'assemblaggio HTML resta task frontend-developer su `app/public-site`, conseguente ma separato
  (non coperto da questo task)
- [x] **S5** — `@type: "WebPage"` sempre per l'MVP, nessun criterio `Article`
- [x] **S6** — `FAQPage` co-generata da `seo.faq` (campo SEO, **non** un blocco nell'albero di
  contenuto — il task esterno assumeva erroneamente uno scan di blocchi FAQ, corretto in fase di
  implementazione)
- [x] **S7** — S7a: nessun `publisher`/`og:site_name` in questo taglio (nessuna chiave
  `app_settings` per l'identità del sito esiste oggi)
- [x] **S8** — `hreflang`/alternate linguistiche restano fuori scope di questa RFC

**Note**: Il task esterno che ha originato questa RFC (F13-01) proponeva anche l'estensione di
`PublicPageDto`/`PublicPagesService.findBySlug()` e uno scan di "blocchi FAQ" nell'albero di
contenuto: nessuno dei due esiste nel contratto reale e nessuno dei due è stato implementato —
l'implementazione segue la forma raccomandata da questa RFC, non la richiesta esterna originale.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-02

**Azione successiva**: [x] Genera ADR-48 (registrazione compatta: generazione a publish-time,
collocazione del servizio, confine dati/markup, `@type` fisso `WebPage`, merge non distruttivo
con `structuredData` manuale, FAQ da `seo.faq`) · [ ] Archivio
