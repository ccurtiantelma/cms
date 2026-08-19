# Plan — Anteprima di una bozza non pubblicata

## Riferimenti

`docs/ai/adr/ADR-25-anteprima-bozza-non-pubblicata.md` (**in discussione, non firmata**) ·
`docs/ai/adr/ADR-24-routing-risoluzione-slug.md` (rotta separata, mai fusa col routing per
slug) · `docs/ai/adr/ADR-22-consumer-html-pubblico.md` (SSR, `renderToStaticMarkup`,
componenti blocco condivisi) · `docs/TODO.md` § 1.10

> Prodotto dall'Orchestrator su richiesta esplicita. Nessuna dipendenza nuova, nessuna
> modifica a `schema.ts` (il token è stateless, nessuna tabella).

---

## Task operativi (max 8, ordinati per dipendenze)

**T1 è bloccante e richiede firma umana: nessun task successivo può iniziare senza di essa.**

### T1 — Firma di ADR-25
- **Agente**: orchestrator (già prodotta) + firma umana
- **Output**: ADR-25 approvata
- **Dipendenze**: nessuna
- **Done**: decisione approvata così com'è o con correzioni firmate; nessun task successivo
  parte prima

### T2 — Backend: emissione del token di anteprima
- **Agente**: backend-developer
- **Output**: `app/backend/src/pages/` — endpoint `POST app/pages/:guid/preview-token`,
  DTO risposta `{ token, expiresAt }`, segreto dedicato in `AppConstants` (mai
  `process.env` diretto)
- **Dipendenze**: T1
- **Done**: stessa guard RBAC + check di ownership già in vigore per la modifica della
  pagina (autore → solo proprie bozze); JWT con claim `pageGuid`/`purpose:
  'page-preview'`/`exp` a 15 minuti, firmato con segreto separato da access/refresh; nessun
  refresh endpoint; emissione audit-logged; `openapi:export` + `openapi:types` eseguiti

### T3 — Backend: endpoint di lettura dedicato `preview/`
- **Agente**: backend-developer
- **Output**: nuovo modulo/controller `api/v1/preview/pages/:token` (non `app/`, non
  `public/`)
- **Dipendenze**: T2
- **Done**: verifica firma+scadenza+`purpose` prima di ogni lettura; legge
  `pages.draftContent` per il `pageGuid` del claim attraverso la pipeline di lettura F02
  (migrazione + validazione, stesso path usato per le revisioni); nessuna cache Redis;
  token invalido/scaduto, pagina inesistente o soft-eliminata → **404 uniforme**, mai
  `401`/`403`; token mai loggato per intero; `openapi:export` + `openapi:types` eseguiti

### T4 — public-site: rotta di anteprima + gate noindex
- **Agente**: frontend-developer (ambito `app/public-site` consentito da ADR-22 § 5)
- **Output**: `app/public-site/src/server.ts` — nuova rotta (es. `/__preview/:token`),
  separata dal routing per slug di ADR-24
- **Dipendenze**: T3
- **Done**: chiama `preview/pages/:token`, renderizza con lo stesso `renderToStaticMarkup`
  e gli stessi componenti blocco di F03; **ogni** risposta porta sempre
  `X-Robots-Tag: noindex, nofollow, noarchive` e `<meta name="robots"
  content="noindex,nofollow">`, senza eccezioni; 404 pulito su token invalido/scaduto;
  nessuna riga aggiunta a `robots.txt`/futura `sitemap.xml`; invariante di escaping
  ereditata da ADR-21/ADR-22 verificata anche su questa rotta

### T5 — Frontend admin: pulsante "Anteprima" nel dettaglio Pagina
- **Agente**: frontend-developer
- **Output**: `app/frontend/src/pages/pages/PagePageDetail.tsx`, nuovo metodo in
  `src/services/pages.service.ts`
- **Dipendenze**: T2
- **Done**: pulsante che chiama il nuovo endpoint e apre l'URL di anteprima
  (`{PUBLIC_SITE_URL}/__preview/:token`) in una nuova scheda; notification su errore
  (try/catch, coerente con gli altri service); nessuna persistenza del token oltre
  l'apertura; nessun elemento Mantine importato fuori dalla chrome admin

### T6 — Copertura di test
- **Agente**: test-engineer
- **Output**: `app/backend/test/unit/pages/preview-token.spec.ts`,
  `app/backend/test/e2e/pages-preview.e2e-spec.ts`, `bruno/pages/*.yml` (due nuovi
  endpoint), `e2e/tests/page-preview.spec.ts`
- **Dipendenze**: T4, T5
- **Done**: unit sulla verifica del token (scadenza, `purpose` errato, firma invalida);
  integration — RBAC/ownership sull'emissione, 404 uniforme su token scaduto/invalido/
  pagina inesistente/soft-eliminata (mai 401/403), draft modificato dopo l'emissione del
  token resta leggibile fino a scadenza (lettura live, non snapshot); e2e Playwright —
  genera anteprima dal dettaglio, apre l'URL, verifica header `X-Robots-Tag` e meta
  `robots` sulla risposta, verifica che il contenuto pubblicato reale non cambi;
  happy path + 1 errore + 1 RBAC per endpoint nuovo; suite verde in CI

---

## Rischi e over-engineering da non commettere

| Rischio | Mitigazione |
|---|---|
| Token che diventa un meccanismo di "draft mode" generale (cookie, sessione) | Vietato da ADR-25 § "Alternative scartate": un token per pagina, stateless, senza enable/disable |
| Endpoint `preview/` che finisce per riusare la cache pubblica | T3 lo esclude esplicitamente: nessuna chiave Redis, ogni lettura è fresca |
| Rotta di anteprima che converge col routing per slug in `app/public-site` | T4 la tiene su un path dedicato e separato, mai dentro la risoluzione iterativa di ADR-24 |
| Snapshot del contenuto al momento del token (storage in più, scadenza da gestire) | Scartato in ADR-25: lettura live del draft, coerente con l'ownership già in vigore |
| Token loggato per intero in caso di errore | T3/T4 impongono log solo del prefisso, stesso trattamento di password/secret |

## Fuori scope, dichiarato

Revoca anticipata di un token già emesso (nessuna tabella di stato, il token scade da solo)
· notifica a chi ha ricevuto un link quando la bozza cambia · limite al numero di token
attivi per pagina · qualunque forma di "condivisione" oltre l'apertura diretta dell'URL
(niente email, niente scadenza configurabile dall'utente) · sitemap/`llms.txt` (F07/F08, fuori
perimetro per costruzione: leggono solo `published`).

---

## Definition of Done — Checklist globale

### Implementazione
- [ ] T2–T5 implementati, nessun `any` senza commento, nessun `console.log`
- [ ] Segreto del token in `AppConstants`, mai `process.env` diretto

### Test
- [ ] Unit + integration + Bruno per i due endpoint nuovi
- [ ] E2E Playwright sul criterio di Done

### Build e qualità
- [ ] `npm run build --workspace=app/backend` e `--workspace=app/frontend` verdi
- [ ] `npm run build --workspace=app/public-site` verde
- [ ] Lint superato

### Contratti e documentazione
- [ ] `openapi:export` + `openapi:types` eseguiti dopo T2 e T3
- [ ] `docs/ai/progress-tracker.md` e `docs/TODO.md` aggiornati a chiusura, su richiesta
      esplicita
