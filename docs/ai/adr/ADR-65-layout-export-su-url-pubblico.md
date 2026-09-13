# ADR-65 — Layout dell'export statico sull'URL pubblico

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## Decisione superata

**RFC-44 Decisione 2** (ripresa da ADR-45): layout `<locale>/<segmenti>/index.html`. Solo quel punto; il resto di RFC-44/ADR-45 resta in vigore.

---

## Decisione

1. **Il file esportato vive all'URL pubblico canonico**: `/` → `index.html`, `/chi-siamo` → `chi-siamo/index.html`, `/en-gb/about-us` → `en-gb/about-us/index.html`. Lingua di default senza prefisso, altre lingue col prefisso minuscolo, home radice senza segmento proprio (ADR-24 § 4-7, RFC-F05 § 4).
2. **Un solo calcolo**: `composePublicPath(locale, slugPath, defaultLocale)` in `public-path.util.ts`, inverso di `extractLocalePrefix`, usato da `PublicPagesService` (URL e `hreflang`) e da `ExportProcessor` per l'URL chiesto a `public-site`, il file scritto, il tombstone e le `<loc>` della sitemap.
3. **La lingua di default si legge dal registro Locale** (`loadMultilingualConfig`), mai dall'env: è la stessa fonte della risoluzione pubblica.
4. `manifest.json` resta indicizzato per `locale` + percorso di slug: è un registro interno, non un URL.

## Alternative scartate

- **Mantenere `<locale>/...`**: Nginx dovrebbe conoscere a runtime la lingua di default, che vive nel database, contraddicendo l'air-gap di ADR-63.
- **`<locale>/...` più rewrite Nginx generato al deploy**: il default cambia da interfaccia admin senza redeploy.
- **Correggere solo fetch e sitemap**: file e URL resterebbero divergenti, e il piano pubblico non saprebbe servirli.

## Conseguenze

- Corregge un difetto di F03/F05: le Pagine non nella lingua di default erano chieste a `public-site` senza prefisso (404 o lingua sbagliata), la sitemap ne pubblicava URL errati e la home era esportata come `/home`.
- `nginx/static-site.conf` serve con un solo `try_files $uri/index.html`.
- Cambiare la lingua di default sposta gli URL di due lingue: il full-site rebuild riscrive i nuovi percorsi ma non rimuove i file ai percorsi vecchi. Una pulizia dei file orfani va aggiunta prima di rendere quel cambio un'operazione ordinaria.
