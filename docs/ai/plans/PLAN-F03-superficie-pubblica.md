# Plan — F03 Superficie pubblica di lettura

## Spec di riferimento
`docs/ai/specs/SPEC-F03-superficie-pubblica.md` — **residuo di T1**, non esiste ancora. Non
blocca T2: le tre ADR firmate fissano già payload, forma canonica del percorso e contratto
d'errore.

## ADR di riferimento
`ADR-22` (consumer HTML), `ADR-23` (caching), `ADR-24` (routing) — **tutte e tre approvate il
2026-08-17**. ADR-23 è stata firmata con una correzione al § 6: un `DEL` fallito non produce
più `500`, ma `200` più un job BullMQ di invalidazione con retry e un audit che elenca le
chiavi. Il gate delle firme è caduto: da T2 in poi i task sono eseguibili.

---

## Il percorso che F03 deve chiudere

> **Una pagina pubblicata è visibile in un browser e leggibile da un crawler.**

Ogni task sotto dichiara a quale tratto di quel percorso serve. Se un task non serve a quel
percorso non entra in F03: SEO (F07), GEO e `llms.txt` (F08), sitemap, redirect, multilingua
(F05), media risolti (F09), form (F10) sono **fuori**, e ciascuno ha la sua feature.

---

## Audit strategico

### Falle logiche / Contraddizioni rilevate

| Dove | Problema | Impatto a runtime | Stato |
|---|---|---|---|
| `business-rules.md` § Slug regola 4 vs roadmap F07 | La proposta automatica di `301` al cambio slug non ha una tabella su cui scrivere: `redirects` è prevista, non approvata, e i redirect sono di F07 | Cambiare lo slug di una pagina pubblicata rompe la sua URL senza rete | Dichiarato in ADR-24 § 6, **non si implementa in F03** |
| `business-rules.md` § Cache regola 4 ("l'invalidazione fa parte della transazione") | Redis non partecipa alla transazione Postgres: l'invalidazione transazionale non è realizzabile alla lettera | Preso alla lettera, il requisito è insoddisfacibile e verrebbe silenziosamente degradato a best effort | Sciolto in ADR-23 § 4/6: `DEL` post-commit sincrono, nessuna TTL; il fallimento del `DEL` non ribalta la transazione ma diventa un job BullMQ ritentabile |
| ADR-21 § 3.7 | Rinviava esplicitamente a questa ADR se l'esito di una migrazione fallita sia cacheabile | Un `404` da albero rotto cacheato sopravvivrebbe al deploy che lo corregge | Chiuso in ADR-23 § 8: nessun negative caching |
| PLAN-F01 § B.3 | Prevedeva la **duplicazione** dei componenti di blocco al secondo consumer | Due implementazioni dell'invariante di escaping `plainText`, un solo test: XSS stored alla prima deriva | Chiuso in ADR-22 § 3: alias di build, una sola copia |
| `CLAUDE.md` § Ruoli | Nessun ruolo può scrivere in `app/public-site` — stesso problema che B.3 aveva rilevato per `app/blocks` | Il workspace non è assegnabile a nessun agente | Chiuso: `CLAUDE.md` § Ruoli emendata il 2026-08-17 — `app/public-site` al frontend-developer (confine verificabile: niente DB, ORM, code, auth), config di root al backend-developer |
| Nessun rate limit sulla superficie pubblica | `ThrottlerModule` ha un solo throttler, `auth` | Superficie anonima ad alto volume senza alcun limite | Dentro T2 |

### Rischi architetturali / Over-engineering

- **Il rischio principale è il terzo processo.** `app/public-site` porta un Dockerfile, un job
  CI, un health check e una superficie di deploy in più. Il rimedio è tenerlo minuscolo e
  senza stato (ADR-22 § 1/6): `node:http`, `fetch`, `renderToStaticMarkup`. Se in F03 quel
  workspace acquisisce una cache, un router, uno stato o una dipendenza, il rimedio ha fallito.
- **Secondo rischio: la cache.** Tutto il repertorio (tag-set, `SCAN`, TTL a scaglioni,
  stale-while-revalidate) è disponibile e nessuna parte serve a un sito aziendale di poche
  pagine. ADR-23 ammette **un** metodo nuovo in `RedisService`. Un secondo metodo è il segnale
  che si sta progettando per un traffico che non esiste.
- **Terzo rischio, introdotto dalla correzione ad ADR-23 § 6**: la coda di invalidazione è un
  percorso di recupero che nessuno guarda finché non serve. Un job che esaurisce i retry
  lascia contenuto stantio online e l'unico segnale è l'audit con le chiavi. Il rimedio non è
  più codice: è che T4 verifichi il ricorso alla coda (`DEL` fallito → `200` + job accodato)
  invece di assumerlo, e che il fallimento definitivo resti visibile nei log.
- **Rischio dichiarato e accettato**: gli Error Boundary non girano in SSR (ADR-22 § 2). La
  tenuta del pubblico dipende interamente dal rifiuto a monte dell'albero non servibile — T4 e
  T6 lo verificano, non lo assumono.

---

## Task operativi (7 — il tetto è 8)

### T1 — Firme e spec — ✅ **chiuso il 2026-08-17, tranne la spec**
- **Serve al percorso**: nulla si costruisce sopra decisioni non firmate; è il gate, non un tratto.
- **Output atteso**: firma di `ADR-22`/`ADR-23`/`ADR-24`; emendamento a `CLAUDE.md` § Ruoli per il perimetro `app/public-site`; `docs/ai/specs/SPEC-F03-superficie-pubblica.md` (forma del payload pubblico, forma canonica del percorso, limiti del rate limit, contratto d'errore `404`/`308`/`500`).
- **Fatto**: tre ADR marcate `Approvata` con data 2026-08-17 e firma `ccurti`; ADR-23 § 6 corretta in fase di firma (`200` + job BullMQ al posto del `500`); `CLAUDE.md` § Ruoli emendata — `app/public-site` al frontend-developer con il confine verificabile di ADR-22 § 5, config di root (Dockerfile, `docker-compose.yml`, CI, script root) al backend-developer; voci 1.3/1.5/1.9 di `docs/TODO.md` chiuse.
- **Residuo**: `SPEC-F03-superficie-pubblica.md` non è ancora redatta. Non blocca T2 — le tre ADR fissano già payload, forma canonica e contratto d'errore — ma va scritta e approvata prima della chiusura di F03.
- **Dipendenze**: nessuna.
- **Criterio di Done**: tre ADR con status `Approvata` e data ✅; `CLAUDE.md` emendata ✅; spec approvata da ccurti ⏳.
- **Agente**: orchestrator (redazione spec) + **firma umana**.

### T2 — Superficie pubblica di lettura (backend)
- **Serve al percorso**: è il tratto "una pagina pubblicata esiste come dato raggiungibile senza autenticazione".
- **Output atteso**: `app/backend/src/pages/public-pages.controller.ts` (`api/v1/public/pages`), risoluzione iterativa per `(locale, path)` con lettura della Revisione pubblicata (ADR-24 § 1/2), migrazione + validazione dell'albero, `404` uniforme (§ 3), canonicalizzazione `308` (§ 4), home su `/` (§ 7); `dto/public-page.dto.ts`; esclusione di `public/*` dal middleware JWT in `app.module.ts`; secondo throttler `public` dedicato; `openapi:export` + `openapi:types`.
- **Dipendenze**: T1.
- **Criterio di Done**: `GET api/v1/public/pages?path=/chi-siamo` restituisce la revisione pubblicata senza JWT; ogni stato diverso da `published` dà `404`; `openapi.yaml` e `api.types.ts` rigenerati senza drift.
- **Agente**: backend-developer.

### T3 — Cache e invalidazione (backend)
- **Serve al percorso**: è ciò che rende il tratto di T2 servibile alle latenze dell'NFR e che impedisce a una pagina archiviata di restare visibile.
- **Output atteso**: `RedisService.delMany()`; token di registro `{reg}` calcolato all'avvio (ADR-23 § 2); lettura/scrittura della chiave in `PublicPagesService` con fallback su database se Redis è irraggiungibile (§ 7); `DEL` post-commit nei percorsi di `pages.service.ts` che toccano pubblicazione, archiviazione, slug e soft delete, con calcolo dei discendenti da `parentId` (§ 4/5); **coda BullMQ di invalidazione** (§ 6) — il `DEL` fallito con Redis raggiungibile accoda un job con le chiavi, retry e backoff esponenziale, l'operazione risponde comunque `200`, e un audit elenca le chiavi; se anche l'accodamento fallisce restano l'audit e un log `error` con le chiavi.
- **Dipendenze**: T2.
- **Criterio di Done**: seconda richiesta servita da cache; archiviazione seguita da `404` immediato; cambio di slug di un genitore invalida anche i discendenti; Redis spento → il contenuto si serve comunque dal database; `DEL` fallito → la pubblicazione risponde `200`, il job è in coda e l'audit contiene le chiavi. **Nessun percorso di scrittura risponde `5xx` per un guasto di cache.**
- **Agente**: backend-developer.

### T4 — Test della superficie pubblica e della cache
- **Serve al percorso**: dimostra che *solo* il pubblicato è visibile — il tratto che, se sbagliato, pubblica bozze.
- **Output atteso**: e2e Supertest per i cinque stati → `404`, revisione servita al posto della bozza, `308` di canonicalizzazione, `404` su albero non migrabile, invalidazione dopo pubblicazione/archiviazione/cambio slug con discendenti, rate limit pubblico, degradazione con Redis assente, **`DEL` fallito con Redis raggiungibile → `200` + job accodato + audit con le chiavi, e nessuna Revisione in più**; collezione `bruno/public/*.yml`.
- **Dipendenze**: T3.
- **Criterio di Done**: suite verde nel gate `backend-e2e`; ogni endpoint nuovo ha il suo file Bruno.
- **Agente**: test-engineer.

### T5 — `app/public-site` (SSR)
- **Serve al percorso**: è il tratto "è HTML in un browser, ed è testo per un crawler che non esegue JS".
- **Output atteso**: workspace `app/public-site` (`package.json`, `tsconfig`, `vite.config.ts` con `resolve.alias` verso `app/frontend/src/components/blocks/`); server `node:http`; `renderToStaticMarkup`; documento HTML con CSS emesso dalla build SSR; pagine `404`/`500`; endpoint di health; nessuna dipendenza nuova nel lockfile.
- **Dipendenze**: T2 (il contratto del payload), non T4.
- **Criterio di Done**: `curl` di una pagina pubblicata restituisce HTML completo con il testo dei blocchi; `grep '<script'` sull'output non trova nulla; `npm ci` non aggiunge pacchetti.
- **Agente**: frontend-developer (perimetro esteso da T1).

### T6 — Invariante di escaping e test di rendering
- **Serve al percorso**: è la sicurezza del tratto di T5 — l'invariante bloccante che ADR-21 ha lasciato in eredità a questa feature.
- **Output atteso**: test che renderizza un albero con `<script>`, `"` e `&` in `heading.text`, `button.label`, `image.alt` e asserisce sull'**HTML prodotto** da `renderToStaticMarkup`; controllo che `dangerouslySetInnerHTML` compaia esattamente una volta in `components/blocks/`; test che un blocco che solleva produce `500` e mai HTML parziale.
- **Dipendenze**: T5.
- **Criterio di Done**: entrambi i controlli sono gate di CI e falliscono se rimossi o aggirati.
- **Agente**: test-engineer.

### T7 — Distribuzione e chiusura
- **Serve al percorso**: il percorso non è chiuso finché esiste solo sulla macchina di sviluppo.
- **Output atteso**: `app/public-site/Dockerfile`, servizio in `docker-compose`, job CI (lint + test + build) per il terzo workspace, script root (`dev`, `build`, `clean`), health check; verifica end-to-end manuale: pubblicare una pagina dall'admin e leggerla via `curl` senza JavaScript.
- **Dipendenze**: T4, T6.
- **Criterio di Done**: CI verde su tutti i job, immagine che parte, pagina pubblicata leggibile da `curl`; `docs/TODO.md` (voci 1.3/1.5/1.9, 2.3) e `docs/roadmap.md` aggiornati **solo su richiesta umana esplicita**.
- **Agente**: backend-developer per Docker/CI e script di root (proprietà confermata in T1 ed emendata in `CLAUDE.md` § Ruoli il 2026-08-17), frontend-developer per il workspace `app/public-site`.

---

## Matrice dei rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| `plainText` interpolato senza escaping in un renderer futuro | Bassa oggi, alta nel tempo | **Alto** (XSS stored) | T6: asserzione sull'HTML prodotto + unicità di `dangerouslySetInnerHTML`, entrambi gate CI |
| Deriva fra componenti admin e pubblici | Annullata | Alto | ADR-22 § 3: una sola copia, condivisa per alias |
| Invalidazione mancata → contenuto archiviato ancora online | Media | Alto | ADR-23 § 4/6 + T4 (test esplicito per archiviazione e discendenti) |
| Job di invalidazione esaurisce i retry: stantio online senza che nessuno se ne accorga | Bassa | Alto | ADR-23 § 6: audit con l'elenco delle chiavi + log `error`; T4 verifica il ricorso alla coda. Il monitoraggio della coda `failed` è la sola difesa residua |
| Cache stantia dopo un deploy che cambia le migrazioni | Media | Medio | Token di registro nel prefisso (ADR-23 § 2) |
| URL rotte al cambio di slug | Media | Medio | Nessuna mitigazione tecnica in F03: vincolo procedurale dichiarato (ADR-24 § 6), risolto da F07 |
| Il terzo processo cresce oltre il suo scopo | Media | Medio | Confine verificabile in ADR-22 § 5: niente DB, ORM, code, auth, stato |
| `app/public-site` non lintato/testato perché i job CI enumerano i workspace a mano | Alta se dimenticato | Medio | T7, già rilevato in PLAN-F01 § A.7 |

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] Sette task chiusi
- [ ] Nessun `any` senza commento, nessun `console.log`, JSDoc sulle funzioni pubbliche
- [ ] Nessun pacchetto nuovo nel lockfile
- [ ] Un solo metodo nuovo in `RedisService`
- [ ] Una sola coda nuova (invalidazione), usata solo come ricorso di un `DEL` fallito

### Test
- [ ] E2E Supertest e collezioni Bruno per ogni endpoint nuovo
- [ ] Gli 8 scenari di dominio di `CLAUDE.md` § Testing applicabili a F03 coperti
- [ ] Invariante di escaping verificata sull'HTML prodotto
- [ ] Nessun test placeholder

### Contratti e documentazione
- [ ] `openapi:export` + `openapi:types` eseguiti, gate `openapi-sync` verde
- [x] Tre ADR firmate e datate (2026-08-17)
- [ ] `SPEC-F03-superficie-pubblica.md` redatta e approvata
- [x] `CLAUDE.md` § Ruoli emendata per `app/public-site` e per la config di root
- [ ] `docs/TODO.md` e `docs/roadmap.md` aggiornati **solo su richiesta umana esplicita**
