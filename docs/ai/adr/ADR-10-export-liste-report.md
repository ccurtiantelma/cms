# ADR-10 — Export liste/report (Excel + PDF), modulo core `common/export`

## Status
[ ] In discussione · [x] Approvato · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-07-23 — approvato da: ccurti (via chat, incluse le due approvazioni
separate richieste in Conseguenze: dipendenze npm `exceljs`/`pdfkit` e
implementazione).

## RFC di riferimento
Nessuna RFC dedicata. Punto 5 di un'analisi/audit richiesta esplicitamente
dall'umano (stesso audit di ADR-6 = punto 2, ADR-7 = punto 3, ADR-8 = punto 4).

## Contesto

Quasi ogni gestionale che erediterà questo starter-kit avrà liste con export
"Esporta in Excel" e report stampabili in PDF (elenchi clienti, pratiche,
fatture, movimenti). Lo starter-kit attuale non ha nessuna componente per
questo: ogni progetto verticale reinventerebbe da zero la generazione file,
con rischio concreto di implementazioni divergenti (librerie diverse tra
moduli, export che dimentica di applicare lo stesso filtro di scope della
lista JSON corrispondente, fughe di dati fuori dal proprio `scopeId`).

A differenza di `FilesModule` (ADR-8), qui non esiste un'entità di dominio
generica da modellare: l'export dipende sempre da *quali righe e quali colonne*
un modulo verticale vuole esportare, e lo starter-kit non contiene logica di
dominio (CLAUDE.md, identità del progetto). Il building block corretto non è
quindi un endpoint che "genera export di qualcosa", ma una libreria di
rendering condivisa che ogni endpoint lista già esistente richiama, riusando
esattamente la stessa query — e quindi lo stesso `Utils.applyScopeFilter` — già
usata per la risposta JSON paginata (`Pagination<T>`, query param
`?p=&i=&q=&o=&d=`).

## Decisione

Nuovo modulo core `app/backend/src/common/export/`:

```
src/common/export/
├── export.service.ts             (ExportService: toExcelBuffer / toPdfBuffer)
└── export-column.interface.ts    (ExportColumn<T>: { header, key, width? })
```

**Nessun modulo/controller proprio**: `ExportService` è registrato come
provider in `common.module.ts` (già `@Global()`, stesso pattern di
`AuditLogService`), quindi disponibile ovunque senza import espliciti —
niente `export.module.ts` dedicato, sarebbe stato un wrapper inutile attorno
a un unico provider senza dipendenze esterne da configurare (nessun driver
da scegliere come in `FilesModule`/ADR-8).

`ExportService` è consumato dal controller del modulo di dominio verticale
che possiede già l'endpoint lista. Pattern d'uso previsto in un modulo
applicativo:

```ts
@Get()
async list(@Query() query: ListQueryDto, @Query('format') format: 'json' | 'xlsx' | 'pdf' = 'json') {
  const scopeId = Utils.applyScopeFilter(authInfo);       // stesso filtro di sempre
  const rows = await this.service.findRows(query, scopeId); // stessa query di sempre

  if (format === 'json') return new Pagination(rows, total, page, limit);

  const columns: ExportColumn<RowDto>[] = [ /* definite dal modulo verticale */ ];
  const buffer = format === 'xlsx'
    ? await this.exportService.toExcelBuffer(rows, columns)
    : await this.exportService.toPdfBuffer(rows, columns);

  res.setHeader('Content-Type', format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="export.${format}"`);
  res.send(buffer);
}
```

Questo garantisce che l'export **non possa mai** bypassare `applyScopeFilter`:
non esiste una query parallela dedicata all'export, solo un serializzatore
diverso applicato alle righe già filtrate.

**Excel** — libreria `exceljs`: costruisce un `Workbook`/`Worksheet` da
`ExportColumn[]` (intestazioni + larghezze colonna) e dalle righe già
filtrate; per dataset molto grandi supporta anche una modalità streaming
(`WorkbookWriter`), utilizzabile in futuro senza cambiare l'interfaccia
pubblica di `ExportService`.

**PDF** — libreria `pdfkit`: genera un PDF tabellare semplice (intestazione,
righe, interruzione di pagina automatica) direttamente da `ExportColumn[]` e
dalle righe, **senza** rendering HTML/CSS e **senza** browser headless (vedi
Alternative per il confronto con Puppeteer).

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| **`ExportService` riusabile (exceljs + pdfkit) invocato dagli endpoint lista esistenti via `?format=`** (scelta) | Riusa la stessa query/scope filter della lista JSON (impossibile bypassare `applyScopeFilter`), nessuna nuova tabella DB, nessuna nuova variabile d'ambiente, immagine Docker invariata (nessun binario esterno) | Richiede due nuove dipendenze npm (`exceljs`, `pdfkit`, approvazione umana non ancora ottenuta); ogni modulo verticale deve comunque definire le proprie `ExportColumn[]` (non è "gratis") | — |
| Endpoint generico `/app/export?entity=...&query=...` che genera dinamicamente la query di dominio | Apparentemente zero codice lato modulo verticale | Richiederebbe che lo starter-kit conosca schema/tabelle di dominio (viola l'identità "nessuna logica di dominio"); query arbitraria costruita da parametri client = rischio concreto di SQL injection o accesso a tabelle non previste; `applyScopeFilter` andrebbe reimplementato per ogni "entity" invece di riusare la query già scritta e testata dal modulo verticale | Scartato: viola CLAUDE.md e introduce una superficie di attacco non necessaria |
| **Puppeteer** (Chromium headless) per il rendering HTML→PDF invece di `pdfkit` | Riuso di template HTML/CSS esistenti, output pixel-perfect, adatto a layout complessi (loghi, documenti multi-colonna) | Bundla un intero Chromium (~300MB), rompe la runtime image Alpine minimale definita in ADR-6 (richiederebbe installare `chromium` di sistema o passare a un'immagine base diversa); un processo browser per ogni export = costo memoria/CPU non trascurabile e gestione lifecycle (crash/zombie process) da presidiare; superficie d'attacco maggiore (motore di rendering completo esposto lato server) | Rimandato: over-engineering per i report tabellari tipici di un gestionale (liste, elenchi, riepiloghi); da rivalutare con un ADR dedicato (superseding di questo, limitatamente al renderer PDF) solo se un progetto verticale ha un bisogno reale di documenti con layout grafico complesso |
| Generazione asincrona via coda BullMQ dedicata (pattern `email-queue`) invece che sincrona in risposta HTTP | Non blocca la request per export molto grandi | Complessità aggiuntiva (endpoint di stato job, storage temporaneo del file generato, notifica di completamento) non giustificata per l'MVP: lo starter-kit non conosce in anticipo i volumi reali del progetto verticale | Rimandato: il progetto verticale può aggiungere `src/queues/export-queue/` seguendo lo stesso pattern di `email-queue` se i suoi export reali superano dimensioni gestibili in sincrono |

## Conseguenze

- **Positive**: pattern riusabile da ogni progetto verticale per qualunque
  lista/report, senza duplicare la logica di scope-filtering già scritta per
  la risposta JSON; nessuna nuova tabella DB, nessuna nuova variabile
  d'ambiente, nessun impatto sull'immagine Docker di produzione (ADR-6).
- **Negative / attenzione**:
  - `npm audit` post-installazione (stesso spirito di verifica di ADR-9)
    segnala una vulnerabilità moderata transitiva: `exceljs@4.4.0` (ultima
    versione disponibile) dichiara `uuid@^8.3.0`, vulnerabile
    ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
    bounds check mancante in `uuid` v3/v5/v6 quando viene passato un buffer
    esplicito). `npm audit fix --force` risolverebbe solo retrocedendo a
    `exceljs@3.4.0` (breaking change, versione più vecchia e con più
    probabili altri problemi) — non applicato: nessuna versione più recente
    di `exceljs` disponibile ad oggi corregge la dipendenza `uuid`. Da
    monitorare (nuova release `exceljs` che aggiorna `uuid`), non blocca
    l'approvazione: nessun uso di `exceljs`/dipendenze con buffer espliciti
    individuato nel codice della libreria (il pattern vulnerabile richiede un
    argomento `buf` esplicito alle funzioni `uuid` interessate).
  - Ogni modulo di dominio deve comunque scrivere la mappatura
    colonne→dati (`ExportColumn[]`) per Excel/PDF: `ExportService` non può
    indovinarla, resta compito del progetto verticale (coerente con
    l'identità "nessuna logica di dominio" dello starter-kit).
  - Dataset molto grandi (decine di migliaia di righe) generati in sincrono
    possono allungare il tempo di risposta HTTP; se un progetto verticale lo
    incontra, valutare l'export asincrono via coda dedicata (vedi Alternative)
    in un ADR successivo — non implementato ora.
  - `pdfkit` produce PDF tabellari semplici, non rendering HTML/CSS: un
    bisogno futuro di documenti con layout grafico complesso richiederà
    probabilmente un ADR di superseding per introdurre Puppeteer (vedi
    Alternative), con relativo impatto sull'immagine Docker da rivalutare in
    quella sede.
- **Documentazione**: aggiornati `docs/system-architecture.md` (nuova sezione
  "Export liste/report" + tree moduli `common/export/`) e
  `docs/ai/progress-tracker.md`. Nessuna collezione Bruno propria (il modulo
  non ha un endpoint): andrà aggiunta dal **primo modulo di dominio
  verticale** che adotta `?format=xlsx|pdf` sul proprio endpoint lista
  esistente.

## Conformità

- `app/backend/src/common/export/export.service.ts` (`ExportService`:
  `toExcelBuffer`, `toPdfBuffer`), `export-column.interface.ts`
  (`ExportColumn<T>`)
- `app/backend/src/common/common.module.ts` — `ExportService` aggiunto a
  `providers`/`exports` accanto ad `AuditLogService` (nessun
  `export.module.ts` dedicato: un unico provider senza dipendenze esterne da
  configurare non giustificava un modulo a sé, a differenza di
  `FilesModule`/ADR-8 che sceglie tra driver concreti)
- `app/backend/package.json`: nuove dipendenze `exceljs@4.4.0`, `pdfkit`
  (prod), `@types/pdfkit` (dev)
- Nessuna modifica a `app/backend/src/db/schema.ts` (nessuna nuova tabella:
  modulo stateless, genera un buffer per risposta, non persiste nulla)
- Test: `app/backend/test/unit/common/export/export.service.spec.ts` (6
  test, tutti su libreria reale — nessun mock, `ExportService` non ha
  dipendenze): round-trip Excel con `exceljs` (intestazioni in grassetto,
  valori riga, dataset vuoto), PDF con magic bytes `%PDF` (con titolo, celle
  null/undefined, dataset vuoto, dataset che forza un'interruzione di
  pagina) — 6/6 verdi
- Verificato: `npm run build:backend` (✅), `npm run lint:backend` (✅, solo
  warning pre-esistenti su `any` non correlati), `npx jest
  test/unit/common/export` (6/6) e intera suite unit backend (50/50, 11
  suite) — nessuna regressione
- Come riverificare: `npm run build:backend && npm run lint:backend && npx
  jest test/unit/common/export --workspace=app/backend`
