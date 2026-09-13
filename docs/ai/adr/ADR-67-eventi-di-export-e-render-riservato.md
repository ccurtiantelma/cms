# ADR-67 — Eventi di export al posto della cache pubblica, render riservato al worker

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## Decisione superata

Nessuna ADR in vigore: chiude due punti di **ADR-53 § Conformità** che il codice non rispettava ancora («nessuna chiave Redis `public:`», «`app/public-site` non riceve traffico anonimo»). Il meccanismo di ADR-23 (già superata da ADR-53) esce dal codice.

---

## Decisione

1. **Nessuna cache Redis pubblica.** `PublicPageCacheService` e la coda `cache-invalidation-queue` sono rimossi. `GET api/v1/public/pages` legge sempre dal database: la usano solo il job di export e l'anteprima.
2. **La freschezza del sito è fatta di job `static-export`**, accodati da `PagesService` con i percorsi di `PublicPageLocationService`:
   - pubblicazione → export della Pagina e riesportazione delle traduzioni pubblicate (`hreflang`);
   - uscita da `published` → tombstone della Pagina e riesportazione delle traduzioni pubblicate;
   - cambio di `slug`/genitore o soft delete con almeno una Pagina pubblicata nel sottoalbero → tombstone di ogni percorso pubblicato vecchio più **rebuild completo**, che riscrive i percorsi nuovi e i link dei menu.
3. **Render riservato.** Con `EXPORT_RENDER_SECRET` configurato, `app/public-site` rende una Pagina pubblicata solo a chi presenta `X-Export-Render-Token` (confronto a tempo costante); ogni altra richiesta riceve `404` senza interrogare il backend. `/__preview/:token`, `/healthz` e gli asset restano raggiungibili. Il compose di produzione rende il segreto obbligatorio; vuoto in sviluppo.
4. **I render di export non sono visite**: `public-site` inoltra `X-Export-Render` al backend, e l'ingestione analytics li ignora. La chiamata a `analytics/ingest/pageview`, endpoint rimosso, è eliminata.

## Alternative scartate

- **Tenere la cache Redis "per sicurezza"**: nessun traffico anonimo la legge, resta solo costo e una regola di ADR-53 violata.
- **Rebuild completo anche a ogni transizione di stato**: O(catalogo) a ogni pubblicazione, incompatibile con i 5 secondi dell'NFR.
- **Togliere la porta host a `public-site`**: l'anteprima dal browser dell'editor smetterebbe di funzionare.
- **Blocco sempre attivo, anche in sviluppo**: il sito non sarebbe più navigabile in locale senza export e Nginx.

## Conseguenze

- Coperto da `test/e2e/public-pages-export-events.e2e-spec.ts` e da `app/public-site/test/export-render-gate.spec.ts`. Lo scenario obbligatorio «cache invalidata dopo archiviazione» diventa «file statico rimosso dopo archiviazione».
- **Limite dichiarato**: una transizione di stato non riscrive i menu di navigazione che puntano alla Pagina. Il link si aggiorna al successivo rebuild completo (cambio tema, Sezioni globali, percorsi).
- **Decisione aperta che questa ADR rende visibile**: con il sito statico nessun visitatore raggiunge il backend, quindi le analytics di F12 non raccolgono visite reali. Il metodo di raccolta (pixel, log di Nginx, altro) richiede una decisione propria.
- `EXPORT_RENDER_SECRET` va aggiunto al `.env` di produzione, stesso valore per backend e `public-site`.
