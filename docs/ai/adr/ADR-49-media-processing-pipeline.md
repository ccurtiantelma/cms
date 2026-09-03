# ADR-49 — Pipeline di trasformazione media asincrona (focal point, varianti, formati)

## Status
[x] Approvato · [ ] In discussione · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-02 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-F09-media-transform-pipeline.md` (M1–M8, tutti firmati nella forma
raccomandata)

## Contesto
`business-rules.md` § Media 3 richiede varianti dimensionali generate in modo asincrono via
BullMQ, mai bloccanti sull'upload — regola già approvata, mai implementata. Un focal point per
immagine (dove sta il soggetto, per un crop automatico che non lo tagli fuori) non esiste. Un
task esterno proponeva di risolvere tutto con query param di trasformazione sincrona su
`GET public/media/:guid`, in conflitto diretto con la business rule e con l'immutabilità
`guid → byte` di ADR-27 § 5. Post-ADR-45 (SSG), quella rotta non è più il percorso del
traffico pubblico di produzione: il traffico anonimo va a file statici copiati dal job di
export, non trasformati on-request.

## Decisione
Trasformazione confinata al **worker BullMQ** (`MediaQueueModule`/`MediaProcessor` in
`app/backend/src/queues/media-queue/`), mai nel path di una richiesta HTTP pubblica. `sharp`
è approvata come nuova dipendenza npm, usata solo lì.

Il job estrae il file sorgente, ispeziona i metadati con `sharp`, sanitizza le coordinate di
crop (`cropX + cropW <= width`, `cropY + cropH <= height`, altrimenti errore gestito — mai un
crop silenzioso fuori bounds) e applica `.extract()` se il crop è fornito, altrimenti un
resize centrato sul focal point. L'output è sempre riconvertito (`webp` di default; `jpeg`/
`png`/`avif` supportati secondo preset/richiesta) e salvato come **file derivato nuovo**: una
riga propria in `files`, mai una riscrittura di `storageKey` sull'originale (non-distruttività,
M8). La riga derivata porta `parentFileId` verso l'originale — identificatore di risorsa
distinto per variante (M3a): ogni preset è una risorsa propria con il proprio `guid`, non un
query param su `GET public/media/:guid`. Quella rotta continua a rispondere sempre con lo
stesso identico byte stream per lo stesso `guid`, indipendentemente da eventuali query string:
ADR-27 § 5 non viene toccato, non serve superarlo.

Generazione **asincrona e pre-generata** con un insieme finito di preset nominati — mai crop
continuo arbitrario a runtime (M2): `thumbnail` (1:1), `card` (16:9), `hero` (21:9/2:1, da
confermare in sede F07/F08), `og` (1.91:1). La tabella preset è una proposta di partenza,
rivedibile quando F07/F08 useranno davvero questi rapporti.

Focal point persistito per riga su `files`: due nuove colonne `focalX`/`focalY` (percentuale
0–100, centro immagine di default). Scelta implementativa: `integer NOT NULL DEFAULT 50`
anziché nullable con fallback applicativo — stesso comportamento (default 50/50), meno
un `null`-check a ogni lettura. Ogni preset applica il focal point come centro del ritaglio
quando presente sulla riga sorgente, altrimenti 50/50.

**Correzione tecnica rispetto al task esterno che ha originato questa ADR**: `files.id` nello
schema reale è `serial` (intero), non `uuid`. `parentFileId` è quindi `integer` con FK su
`files.id`, non `uuid`. La FK segue la convenzione di default della sezione Database di
`CLAUDE.md` — `{onDelete:'restrict', onUpdate:'restrict'}` — non `cascade`: coerente con il
`DELETE` fisico vietato in tutto il progetto (soft-delete obbligatorio), un `onDelete:'cascade'`
non avrebbe comunque mai occasione di attivarsi e introdurrebbe un comportamento non conforme
alla regola generale senza alcun beneficio.

SVG resta fuori scope (M7): nessuna modifica ad ADR-27 § 4, un SVG continua a non superare
`detectRasterMimeType` e quindi non entra in questa pipeline.

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Query param di trasformazione sincrona su `GET public/media/:guid` (proposta originale) | Nessuna nuova risorsa/rotta | Contraddice `business-rules.md`:298 (async già approvato), tocca ADR-27 § 5, risolve il problema nel controller sbagliato dopo ADR-45 | Scartata (RFC-F09 M2/M3) |
| Query param con cache-key ad hash sulla rotta esistente (M3b) | Un solo endpoint | Richiede superare ADR-27 § 5 con `Superseded da`, nessun URL stabile copiabile dall'export statico (RFC-44 § 6) | Scartata a favore di M3a |
| Focal point stateless via query param | Nessuna migrazione | Non validabile, non riusabile fra usi diversi della stessa immagine, incoerente col trattamento di alt/didascalia/crediti già persistiti per riga | Scartata (RFC-F09 M4) |
| Servizio esterno di image processing (imgproxy, Cloudflare Images, ecc.) | Nessun binario nativo nel backend | Nuovo provider esterno, nuova ADR dedicata su costi/data residency, un secondo luogo dove transitano i byte delle immagini | Non decisa qui — resta un'opzione futura, non scelta come default (RFC-F09 M1-C) |
| `parentFileId` come `uuid` (come da task esterno) | — | `files.id` reale è `serial`: riferimento a un tipo di colonna inesistente | Corretta in questa ADR |

## Conseguenze
- Nuova dipendenza npm pesante (`sharp`, binari nativi per architettura) confinata al worker
  BullMQ del backend: impatto sul Dockerfile/immagine di build, mai sul runtime che risponde
  a richieste pubbliche.
- Due colonne nuove su `files` (`focalX`, `focalY`) e una FK ricorsiva (`parentFileId`):
  migrazione Drizzle a sé, approvata da questa ADR, separata da ogni altra migrazione di
  `files` non ancora firmata.
- Il `MediaLibraryModal` che permetterebbe a un redattore di impostare il focal point da UI
  non esiste ancora (dipendenza F09 non costruita): finché non c'è, `focalX`/`focalY` sono
  scrivibili solo via API — stesso debito già accettato per i breakpoint responsive.
- L'estensione del job di export statico (RFC-44 § Decisione 6) per copiare anche le varianti
  preset, non solo il file originale per `guid`, resta un task a sé: questa ADR ne registra
  l'impatto ma non lo implementa.
- Un cambio futuro dei rapporti preset (M6) non richiede una nuova ADR se resta all'interno
  dell'insieme finito e nominato già stabilito qui; un sesto preset o un crop continuo
  arbitrario sì.

## Conformità
- `sharp` non è mai importato fuori da `app/backend/src/queues/media-queue/`.
- Nessuna trasformazione pixel-level nel path di risposta di un controller (admin o pubblico).
- `GET public/media/:guid` risponde sempre con lo stesso identico byte stream, invariato da
  questa ADR, indipendentemente da query string.
- Ogni variante generata è una riga `files` nuova con `parentFileId` valorizzato; l'originale
  non viene mai riscritto (`storageKey` invariato).
- Crop fuori bounds rispetto alle dimensioni reali dell'immagine → errore gestito, mai un
  crop silenzioso o un'eccezione non normalizzata.
