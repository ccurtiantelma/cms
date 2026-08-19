# Spec — F03 Superficie pubblica di lettura

## Status

[x] Bozza — **in attesa di approvazione umana** · [ ] Approvata · [ ] Superseded

> Generata su richiesta esplicita dell'umano (deroga puntuale al divieto di scrittura in
> `docs/`, `CLAUDE.md` § Documentation Policy; vale per questo file e si esaurisce con il
> task). T2–T7 di `docs/ai/plans/PLAN-F03-superficie-pubblica.md` erano già chiusi quando
> questa spec è stata scritta: descrive quindi un sistema **già implementato e verificato**,
> non un progetto. È il residuo che teneva F03 non dichiarabile ✅ Done (PLAN-F03 T1).

## Feature di riferimento

**Non esiste** `docs/ai/features/F03-*.md`: F03 nasce da `docs/roadmap.md` § F03 e dal piano
`docs/ai/plans/PLAN-F03-superficie-pubblica.md` (T1–T7). Il piano resta la fonte per la
scomposizione in task: qui non si duplica.

## ADR applicabili

- `ADR-22-consumer-html-pubblico.md` — SSR a richiesta in `app/public-site`, `node:http` +
  `renderToStaticMarkup`, componenti di blocco condivisi con `app/frontend` per alias di
  build, nessun Error Boundary in SSR.
- `ADR-23-caching-invalidazione-pubblica.md` — chiave per percorso col token del registro,
  nessuna TTL, `DEL` post-commit sincrono, `DEL` fallito → `200` + job BullMQ di retry +
  audit, nessun negative caching.
- `ADR-24-routing-risoluzione-slug.md` — risoluzione iterativa per segmenti, `404` uniforme,
  canonicalizzazione `308`, lingua di default senza prefisso, `/` → slug `home`.
- `ADR-21-schema-blocchi-versionamento.md` — eredita l'invariante bloccante "ogni renderer
  escapa `plainText`", verificato qui sull'HTML prodotto da SSR (T6).

## Outcomes tecnici

Al termine di F03 esistono:

- **Backend** (`app/backend/src/pages/`): `public-pages.controller.ts` (`GET
  api/v1/public/pages`), `public-pages.service.ts` (risoluzione + migrazione + validazione +
  lettura/scrittura cache), `public-page-cache.service.ts`, `dto/public-page.dto.ts`,
  `public-path.util.ts` (canonicalizzazione, `HOME_SLUG`, guardrail sui segmenti). Throttler
  `public` dedicato in `app.module.ts`. Coda BullMQ di invalidazione (ricorso, § Cache).
- **Backend, `RedisService`**: un solo metodo nuovo, `delMany(keys: string[])`.
- **Terzo workspace**: `app/public-site` (Node 20, `node:http`, `react-dom/server`,
  `renderToStaticMarkup`), con `Dockerfile`, servizio in `docker-compose.prod.yml`, job CI
  dedicato (lint/test/build), script root (`dev:public-site`, `build:public-site`).
- **Contratto pubblicato**: `docs/openapi.yaml` con `GET public/pages` documentato
  (`openapi:export`/`openapi:types` eseguiti a ogni cambio, F03/T2).

## In scope

- Risoluzione pubblica anonima di una Pagina `published` per `(locale, path)`.
- Cache Redis del payload pubblico risolto, invalidata per evento (mai TTL).
- Rendering HTML server-side senza JavaScript client, dei soli tipi di blocco già
  approvati da ADR-21 (F02).
- Canonicalizzazione del percorso (`308`) e home su `/`.
- Rate limiting proprio della superficie pubblica.

## Out of scope

- SEO/GEO nel `<head>` oltre al `<title>` minimo (F07/F08).
- Sitemap, `robots.txt`, `llms.txt`, redirect da cambio slug (F07).
- Multilingua oltre alla lingua di default senza prefisso (F05).
- Risoluzione di media/immagini (F09) — il tipo `image` è validato ma non risolto a URL
  firmata in questa feature.
- Form di contatto e chatbot (F10/F11), che sull'HTML statico richiedono un'isola a sé
  (ADR-22 § Conseguenza).

## Vincoli e assunzioni

- Stack conforme a `CLAUDE.md`: NestJS/Drizzle/Redis/BullMQ lato backend; `app/public-site`
  è **fuori** dallo stack React/Mantine (nessun JS client, nessun import di Mantine — vincolo
  verificabile di ADR-22 § 5).
- Nessuna dipendenza npm nuova in nessuno dei due workspace (ADR-22 § 1).
- Nessuna colonna e nessuna migrazione nuova: la risoluzione pubblica usa gli indici
  `(locale, parentId, slug)` già creati da F01 (ADR-24 § Conseguenza).

## Contratto — `GET api/v1/public/pages`

- **Guard**: nessuno (superficie anonima); `ThrottlerGuard` sul throttler `public`.
- **Query**: `path` (obbligatorio) — percorso pubblico da risolvere, es. `/chi-siamo` o `/`.
- **Rate limit**: `300` richieste / `60s` per IP (throttler `public`, `app.module.ts`) — unico
  valore in produzione, non differenziato per rotta: la superficie pubblica ha un solo
  endpoint.
- **Response 200**: `PublicPageDto` — `{ title, slug, locale, content: {version, blocks},
  seo }`. Mai campi amministrativi (`guid`, `status`, `version` di lock ottimistico,
  `createdBy`/`updatedBy`). `content` è l'albero della Revisione pubblicata, già migrato alla
  forma corrente.
- **Response 308**: percorso non in forma canonica (maiuscole, slash finale) — header
  `Location` verso `api/v1/public/pages?path=<canonico>`, nessuna lettura dal database.
- **Response 404**: uniforme per ogni caso non servibile — inesistente, `draft`, `review`,
  `scheduled`, `archived`, soft-deleted, albero che fallisce migrazione/validazione in
  lettura. Nessun `code` che distingua i casi (ADR-24 § 3: un `403` confermerebbe
  l'esistenza).
- **Response 400**: `path` assente (`PUBLIC_PAGE_PATH_REQUIRED`).
- **Cache**: chiave `public:{reg}:page:{locale}:{path}`, `{reg}` = token del registro blocchi
  (`computeBlockRegistryToken`). Nessuna TTL. Invalidata (`delMany`) post-commit su
  pubblicazione, ripubblicazione, archiviazione, cambio slug/genitore (con discendenti),
  soft delete di pagina pubblicata. `DEL` fallito con Redis raggiungibile → risposta di
  scrittura comunque `200`, job BullMQ di retry accodato, audit con l'elenco delle chiavi.
  Redis irraggiungibile → lettura dal database, nessun `5xx`.

## DTO

```typescript
export class PublicPageDto {
  title!: string;
  slug!: string;
  locale!: string;
  content!: Record<string, unknown>; // { version, blocks } — forma corrente del registro
  seo!: Record<string, unknown>;
}
```

## Consumer HTML pubblico (`app/public-site`)

- Server `node:http` puro, nessun framework. `GET /<path>` chiama `public/pages`, renderizza
  con `renderToStaticMarkup` (mai `renderToString`: nessuna idratazione, nessun marcatore
  morto).
- Componenti di blocco: stessa copia di `app/frontend/src/components/blocks/`, consumata via
  alias di build (`resolve.alias` Vite + `paths` tsconfig) — nessuna duplicazione, nessun
  pacchetto condiviso.
- **Nessun Error Boundary gira in SSR** (ADR-22 § 2, fatto non intuitivo): un blocco che
  solleva durante il rendering porta via l'intera risposta. La difesa è a monte — l'albero
  non servibile è già respinto da `public-pages.service.ts` prima di raggiungere il renderer.
  Un'eccezione in rendering è quindi un bug, e deve dare `500` pulito, mai una pagina
  mutilata (vedi bug T6 sotto).
- Route non gestite dal contenuto: `/healthz` (200 `ok`), asset CSS con hash (`Cache-Control`
  immutabile), `404`/`500` con documento HTML minimo proprio.
- App stateless, nessuna cache propria: l'unica cache è quella di `public/pages` (ADR-22 §6).

## Invariante di escaping (vincolo ereditato da ADR-21, gate di CI)

Ogni renderer escapa `plainText`. In `app/public-site` l'invariante è mantenuta per
costruzione — `plainText` è interpolato come figlio JSX o valore di attributo, e React
escapa entrambi. `dangerouslySetInnerHTML` compare **esattamente una volta**, in `RichText`,
su HTML già sanitizzato server-side (ADR-20). Due controlli, entrambi gate di CI
(`app/public-site` test suite):

1. Un test che renderizza un albero con `<script>`, `"` e `&` in `heading.text`,
   `button.label`, `image.alt` e asserisce sull'**HTML prodotto**, non sul componente.
2. Un controllo statico che `dangerouslySetInnerHTML` compaia esattamente una volta in
   `components/blocks/`.

## Bug trovati durante T6 (invariante di escaping e test di rendering)

Scrivendo il terzo controllo previsto dal piano — un blocco che solleva durante
`renderToStaticMarkup` deve dare `500` pulito, mai HTML parziale — sono emersi due difetti,
entrambi corretti nello stesso passaggio (2026-08-18):

1. **`res.writeHead(200, ...)` prima di valutare il rendering** (`app/public-site/src/server.ts`,
   caso `'ok'` di `handleRequest`). `renderPageDocument(...)` veniva passato come argomento di
   `res.end(...)`, quindi valutato **dopo** l'invio degli header `200`. Un'eccezione di
   rendering arrivava a header già spediti: il client riceveva `200 OK` con corpo vuoto invece
   di `500` — peggio di una pagina mutilata, perché un "successo" silenzioso e vuoto non
   segnala nulla a un crawler o a un monitor. **Fix**: il rendering è valutato in una variabile
   locale prima di `writeHead`, così un'eccezione interrompe l'handler prima che qualunque
   header sia inviato.
2. **`TS5103` sul job CI `public-site` (typecheck)**: `app/public-site/tsconfig.json` portava
   `"ignoreDeprecations": "6.0"`, valore non valido per `typescript@5.9.3` (la versione
   installata dal lockfile) — l'opzione esiste solo per una finestra di versioni che il
   progetto ha superato. Preesistente a T6/T7, non introdotto da questo lavoro. **Fix**:
   rimossa l'opzione (insieme a `baseUrl`, ridondante con `moduleResolution: "bundler"` e i
   `paths` già relativi); il job `public-site` (lint/test/build/typecheck) è verde.

## Verifica end-to-end manuale (T7, chiusura)

Eseguita il 2026-08-19: pagina `home` creata via `POST app/pages`, blocco `heading` +
`richText` con testo riconoscibile, pubblicata via `POST app/pages/:guid/status`
(`draft → published`, transizione diretta ammessa dalla macchina a stati). Verificato con
`curl` (nessun browser, nessun JavaScript) su `app/public-site` in ascolto:

- L'HTML restituito da `GET /` contiene entrambi i testi dei blocchi, dentro `<main>`.
- `grep '<script'` sull'HTML prodotto non trova nulla — nessun bundle client, nessun
  marcatore di idratazione.
- `GET api/v1/public/pages?path=/` risponde `200` con lo stesso contenuto già migrato/validato,
  senza autenticazione.

Chiude il residuo dichiarato in `docs/ai/progress-tracker.md` § "F03 — T6/T7": la verifica
non era stata eseguita per intero per un conflitto di porte locali con uno stack Docker non
correlato sulla stessa macchina, non per un difetto del sistema.

## Task breakdown

Riferimento: `docs/ai/plans/PLAN-F03-superficie-pubblica.md`, T1–T7. Tutti chiusi. Questa
spec è l'output residuo di T1.

## Criteri di verifica

- `GET api/v1/public/pages?path=/chi-siamo` restituisce la Revisione pubblicata senza JWT;
  ogni stato diverso da `published` dà `404` uniforme.
- Percorso non canonico → `308` verso la forma canonica, senza lettura dal database.
- Seconda richiesta sullo stesso percorso servita da cache; archiviazione seguita da `404`
  immediato; cambio di slug di un genitore invalida anche i discendenti.
- Redis spento → il contenuto si serve comunque dal database, nessun `5xx`; `DEL` fallito con
  Redis raggiungibile → la scrittura risponde comunque `200`, job accodato, audit con le
  chiavi.
- `curl` di una pagina pubblicata restituisce HTML completo col testo dei blocchi; nessun
  `<script>` nell'output; `npm ci` non aggiunge pacchetti.
- Un albero che solleva in rendering dà `500` pulito, mai HTML parziale (bug T6, corretto).
- Invariante di escaping verificata sull'HTML prodotto + unicità di `dangerouslySetInnerHTML`,
  entrambi gate di CI.
