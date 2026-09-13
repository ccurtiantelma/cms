# ADR-68 — Contatore delle visite dai log di Nginx

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## Decisione superata

**ADR-67 § 4**, limitatamente al marcatore `X-Export-Render` e all'ingestione dal middleware del backend: non servono più. Il resto di ADR-67 resta in vigore.

---

## Decisione

1. **Le visite si contano dai log di accesso di `nginx-static`.** Solo le richieste servite da `location /` (le Pagine) sono registrate, in JSON, in un file per giorno UTC (`access-AAAA-MM-GG.log`) sul volume `edge_logs`. Asset, redirect e file interni non sono loggati.
2. **Un job BullMQ repeatable** (`edge-log-ingestion-queue`, ogni 5 minuti) legge i file dall'ultima posizione, tiene solo `GET` con `200`/`304` di client umani verso percorsi senza estensione, esclude prefetch e bot noti, e scrive `analytics_events` con l'hash giornaliero dell'IP. `analytics-rollup-queue` aggrega come prima.
3. **L'IP grezzo non sopravvive al giorno dopo**: il file di un giorno concluso è cancellato appena letto. La query string non entra nel percorso.
4. **Idempotenza senza stato critico**: il `guid` dell'evento deriva da file e posizione della riga; la posizione in Redis è solo un'ottimizzazione.
5. `AnalyticsIngestionMiddleware` è rimosso: il backend non vede più visitatori.

## Alternative scartate

- **Pixel verso il backend**: rimette il backend nel percorso di ogni visita e i blocchi pubblicitari lo filtrano.
- **Script nella pagina**: il sito pubblico non ha JavaScript client, e anche questo viene bloccato.
- **Servizio esterno (Google Analytics, Plausible)**: terza parte, costi o banner cookie, dati fuori casa.

## Conseguenze

- Dati con al massimo 5 minuti di ritardo; niente tempo di permanenza o scroll; un bot che si finge browser viene contato.
- In sviluppo `docker compose up -d nginx-static` serve `app/backend/storage/static-site` su `http://localhost:58080` e scrive i log in `app/backend/storage/edge-logs`. I default di `STATIC_EXPORT_PATH` ed `EDGE_ACCESS_LOG_DIR` stanno in `storage/`: `dist/` è svuotata a ogni ricompilazione.
- Il rollup ricalcola solo oggi e ieri: righe più vecchie di un giorno, lette dopo un fermo prolungato, entrano negli eventi ma non nei totali giornalieri già chiusi.
- `check-air-gap.js` verifica il volume condiviso e che la visita a una Pagina finisca nel log e un asset no.
