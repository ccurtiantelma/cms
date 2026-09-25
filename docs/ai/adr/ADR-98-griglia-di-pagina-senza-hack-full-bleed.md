# ADR-98 — Griglia di pagina a 3 tracce: eliminazione dell'hack full-bleed `calc(50% - 50vw)`

## Status

[x] **In discussione** · [ ] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione

_In attesa di firma umana._ Scelta dell'opzione "Delta + rimozione hack full-bleed" alla domanda
posta in sede di task (2026-09-24, marketing@antelmagroup.net): autorizza il lavoro, non sostituisce
la firma di questo documento.

Firma: ____________________ · Data: ____________ · Firmatario: marketing@antelmagroup.net

## ADR di riferimento (non superate, non modificate)

- `ADR-82-container-unificato-grid-flex.md` — il modello Container unico (Sezione deprecata,
  migrazione `section → container`) è **già in vigore**: questa ADR non lo tocca.
- `ADR-33-section-boxed-fullwidth-colore-spaziatura.md` § 1 — `contentWidth` `boxed`/`full-width`
  sulla Sezione: la semantica non cambia, cambia solo come il `<section>` esce dalla larghezza
  boxed di pagina.
- Nota storica in `Container.tsx`/`Section.tsx` (rimossa da questo task): l'hack
  `margin-left/right: calc(50% - 50vw)` era una scelta deliberata per evitare `width: 100vw`
  (include la scrollbar verticale ⇒ overflow orizzontale). Questa ADR mantiene quel vincolo.

## Contesto

Un root container `full` doveva coprire la viewport mentre il wrapper di pagina `.pageBoxed`
(`max-width: var(--theme-layout-boxed-width)`, "Pagina boxed" dell'Editor tema) lo limitava. La
soluzione era un margine negativo `calc(50% - 50vw)` sul container/sezione stesso. Difetti:
dipende dal fatto che l'antenato sia centrato nella viewport (falso con "Margine" asimmetrico),
esce dal flusso normale (coordinate drag & drop e stacking meno prevedibili) ed era duplicata in
due componenti.

## Decisione

1. **`<main>` (sito pubblico) e `.blockStack` (canvas) diventano una griglia a 3 tracce**:
   `minmax(<Rientro sx>, 1fr) | minmax(0, <boxed width>) | minmax(<Rientro dx>, 1fr)`. Blocchi
   radice nella traccia centrale; un root `container`/`section` `full` occupa `grid-column: 1 / -1`.
2. **Nessun margine negativo, nessun `100vw`** in `Container.tsx`/`Section.tsx`. I due componenti
   emettono solo `data-content-width="full|boxed"`, consumato dalle regole di
   `app/public-site/src/PageView.css` e `EditorCanvas.module.css` (duplicate per lo stesso
   motivo già documentato per `.pageBoxed`: l'iframe del canvas è un documento isolato). Nel
   canvas l'attributo è scritto anche da `EditorBlockWrapper.tsx` sul wrapper del nodo radice.
3. **`.pageBoxed` perde `max-width`/`margin-inline`/padding orizzontale** (ora tracce della
   griglia); conserva il "Rientro" verticale.
4. **Inspector**: `boxedWidth`/`minHeight` non impostati mostrano un campo vuoto "Auto" invece di
   un `100 px` fittizio (che sembrava un `max-width: 100px`), con azione "Ripristina automatico"
   che rimuove la prop dal nodo. Schema backend invariato (unità `px/%/em/rem/vw` e `px/%/em/rem/vh`).

## Conseguenze

- **Cambio di comportamento visibile ("Rientro" e "Margine")**: il "Rientro" sinistro/destro non è
  più padding *dentro* la larghezza boxed ma gutter minimo *fuori* dalla traccia centrale
  (contenuto boxed = esattamente `boxed width`). Un root `full` ora è largo quanto `<main>`, quindi
  rispetta il "Margine" di `.pageOuter` (prima lo scavalcava fino ai bordi della viewport). Coi
  default di fabbrica (margine 0) nessuna differenza visiva.
- I figli diretti della griglia non collassano più i margini verticali fra loro.
- Nessuna modifica a schema, validatore, migrazioni, export statico o `to-css.ts`.
- Un container `full` annidato (non radice) resta al 100% del genitore, come prima.
- **Non coperto**: e2e su editor (`e2e/`) non eseguito in sede di task, backend non raggiungibile
  dal setup di autenticazione; verificato con test unitari e con un controllo su Chromium del CSS
  reale di `PageView.css` (full 0→viewport senza scroll orizzontale, boxed centrato a 1280px).
