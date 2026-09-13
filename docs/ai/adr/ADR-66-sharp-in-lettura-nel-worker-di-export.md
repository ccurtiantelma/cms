# ADR-66 — `sharp` in sola lettura di metadati nel worker di export

## Status

[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

**2026-09-13** — approvata da: marketing@antelmagroup.net

## Decisione superata

**ADR-49 § Conformità**, limitatamente alla frase «`sharp` non è mai importato fuori da `app/backend/src/queues/media-queue/`». Il resto di ADR-49 resta in vigore.

---

## Decisione

1. `sharp` è ammesso anche in `app/backend/src/export/export.processor.ts`, **solo** per `metadata()`: nessuna trasformazione, nessuna scrittura di pixel.
2. Ordine di risoluzione delle dimensioni di un `<img>` esportato: preset nominato → `PRESET_DIMENSIONS`; riga `files` con `width`/`height` persistiti (RFC-F09 N2/N4) → quei valori; altrimenti `sharp` sui byte già copiati.
3. Nessun altro modulo fuori da `media-queue/` e da questo worker importa `sharp`.

## Alternative scartate

- **Spostare la lettura in `media-queue/` con un job sincrono**: una coda usata come chiamata di funzione, con latenza e fallimenti in più per leggere un header.
- **Backfill di `width`/`height` e rimozione di `sharp` dall'export**: migrazione di dati che richiede i byte di ogni file storico; resta possibile, non è necessaria per chiudere il gate CLS.
- **Esportare senza dimensioni i file storici**: il gate di ADR-53 § 3 diventerebbe rosso.

## Conseguenze

- Chiude la nota di conformità aperta dal progress tracker il 2026-09-11.
- Con il tempo il ripiego su `sharp` si esaurisce da solo: ogni nuovo upload persiste le dimensioni.
