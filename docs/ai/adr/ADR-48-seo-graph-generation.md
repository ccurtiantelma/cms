# ADR-48 — Generazione JSON-LD/OpenGraph a publish-time (SeoGraphService)

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-02 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-F07-seo-graph-generation.md`

## Contesto
`business-rules.md` § SEO/§ GEO già dichiara il contratto (`PageSeoDto.structuredData`
"generato dal sistema... estendibile a mano", `faq` "esposto anche come JSON-LD `FAQPage`") ma
nessun generatore lo popola mai: `structuredData` resta vuoto finché un redattore non lo scrive
a mano. Un task esterno ("F13-01", etichetta non presente in `docs/roadmap.md`) chiedeva
un'implementazione che assumeva contratti inesistenti (`PublicPagesService.findBySlug()`, nuovi
campi `jsonLd`/`openGraph` su `PublicPageDto`, un tipo di blocco "FAQ" nell'albero di contenuto).
RFC-F07 verifica il contratto reale e corregge queste assunzioni prima della firma.

## Decisione
`SeoGraphService.generateSeoMetadata(pageTitle, contentTree, existingSeo): PageSeoDto`, nuovo
file **flat** `app/backend/src/pages/seo-graph.service.ts` (stesso livello di
`public-page-cache.service.ts`), iniettato in `PagesService` e invocato dentro
`publishTransactionally()` subito dopo `treeSanitizer.sanitizeTree(row.draftSeo)` e prima
dell'`INSERT` della Revisione — il risultato arricchito è ciò che viene scritto in
`pageRevisionEntity.seo` (snapshot immutabile). `pages.draftSeo` non viene toccato: bozza e
pubblicato restano indipendenti (modello di contenuto, regola 4).

Il servizio produce **solo dati**, mai markup: un oggetto JSON-LD (`@type: "WebPage"` fisso,
nessun criterio `Article` — nessun concetto di "tipo di pagina" esiste sullo schema) più, quando
`existingSeo.faq` non è vuoto, un'entità `FAQPage` (`mainEntity` di `Question`/`Answer`),
combinate in `@graph`. La FAQ è letta da `existingSeo.faq` (campo `PageSeoDto`, già esistente) —
**non** da uno scan dell'albero di blocchi: non esiste un tipo di blocco FAQ nel registro
ADR-21, e questa ADR non ne introduce uno.

Merge non distruttivo: `structuredData = { ...generato, ...manuale }` — ogni chiave già presente
nell'estensione manuale (`existingSeo.structuredData` pre-esistente) vince sempre; il generato
riempie solo le chiavi assenti. Nessuna sovrascrittura silenziosa dell'estensione manuale.

Fallback OpenGraph, applicati solo se il campo è vuoto: `ogTitle` ← `metaTitle` ← `pageTitle`;
`ogDescription` ← `metaDescription`. `ogImage` **non** ha fallback in questo taglio: non esiste
oggi alcun campo "immagine di copertina" sullo schema `pages` a cui attingere (gap fra
`business-rules.md`:225 e lo schema reale, non colmato da questa ADR — richiederebbe una colonna
nuova, fuori perimetro).

Nessuna modifica a `PublicPageDto` né a `PublicPagesService.resolveByPath()`: `PublicPageDto.seo`
è già `revision.seo` per intero, quindi il dato arricchito è esposto senza cambi di forma.
`publisher`/`og:site_name` omessi (nessuna impostazione "identità del sito" esiste in
`app_settings`). `hreflang` fuori scope.

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Read-time in `PublicPagesService.resolveByPath()` | Sempre fresco rispetto a impostazioni globali | Introduce staleness di cache non coperta da ADR-23 § 4; in tensione con la Revisione immutabile (regola 3) | Scartata (RFC-F07 S1) |
| Campi `jsonLd`/`openGraph` nuovi su `PublicPageDto` | Separazione esplicita generato/manuale | Duplica `seo.structuredData`/`seo.ogTitle` già esistenti, viola Single Source of Truth | Scartata (RFC-F07 S3) |
| FAQ da un tipo di blocco `faq` nell'albero di contenuto | Coerente con l'assunzione del task esterno | Nessun tipo simile esiste nel registro ADR-21; introdurlo qui aggirerebbe la firma richiesta per un sesto tipo | Scartata — la FAQ è già un campo SEO (`business-rules.md` § GEO) |
| Merge che sovrascrive `structuredData` manuale col generato | Più semplice da implementare | Perdita silenziosa di un'estensione manuale già scritta da un redattore | Scartata: viola "nessuna sovrascrittura silenziosa" (CLAUDE.md § Error handling) |

## Conseguenze
- Le Revisioni pubblicate prima di questa ADR non hanno `structuredData` di sistema: non si
  aggiornano retroattivamente, solo una ripubblicazione lo genera (coerente con l'immutabilità
  della Revisione).
- Un cambio futuro dell'algoritmo di generazione (nuovo template, nuovo criterio di `@type`) non
  tocca le Revisioni già pubblicate, stesso comportamento di ogni altra modifica di logica di
  dominio applicata a uno snapshot immutabile.
- L'assemblaggio dei tag `<script type="application/ld+json">`/`<meta property="og:...">` in
  `app/public-site` resta un task separato, non coperto da questa ADR.
- Un futuro campo "immagine di copertina" o "identità del sito" (`publisher`/`og:site_name`)
  richiede una propria decisione (schema/`app_settings`), non assunta qui.

## Conformità
- `SeoGraphService` non importa né produce stringhe HTML/markup — solo oggetti JSON serializzabili.
- Test: un `structuredData` manuale pre-esistente sopravvive intatto alla generazione di sistema
  (nessuna chiave sovrascritta); `FAQPage` co-generata solo quando `seo.faq` non è vuoto; nessuna
  lettura di `contentTree` per la FAQ (verificabile passando un `contentTree` vuoto/irrilevante
  senza che l'esito cambi).
- Nessuna modifica a `PublicPageDto`, `PublicPagesService`, `pages.draftSeo` o allo schema DB.
