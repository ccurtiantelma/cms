# ADR-100 — Nuove righe solo `container` (niente `section`), prop `width` e "Boxed" alla Elementor (wrapper interno)

## Status
[ ] In discussione · [x] **Approvato** · [ ] Rifiutato · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-26 — approvato da: marketing@antelmagroup.net. Le tre scelte di fondo (Boxed come Elementor, prop `width` con ADR,
pagina demo in bozza via API locale) sono state raccolte con domanda esplicita in sede di task
(2026-09-26, marketing@antelmagroup.net): autorizzano la stesura, non sostituiscono la firma.

## ADR di riferimento (non superate, non modificate)
- `ADR-82-container-unificato-grid-flex.md` — `section` deprecata, `container` v2 unico. Questa ADR
  la **completa** sul lato editor (la finestra "nuova riga" crea ancora `section`) e aggiunge una
  prop allo schema v2 senza cambiarne `v`.
- `ADR-98-griglia-di-pagina-senza-hack-full-bleed.md` (in discussione) — griglia di pagina a 3
  tracce. Questa ADR ne cambia solo la regola dei **root `container` boxed** (§ Decisione punto 4).
- `ADR-21-schema-blocchi-versionamento.md` — una prop opzionale aggiunta non rompe alcun nodo
  esistente: nessun bump di `v`, nessuna migrazione.
- `ADR-34-subtree-insertion-engine-preset-statici.md` — i preset restano sottoalberi statici
  inseriti con `insertSubtreeAction`.

## Contesto
1. **La finestra di struttura crea ancora il modello vecchio.** `SectionStructureModal.tsx`
   (`buildGridSectionSubtree`) inserisce `section` → `container` riga → `container` colonne: un tipo
   deprecato da ADR-82 più un livello superfluo. Elementor Pro (Flexbox Container, 3.6+) crea
   invece un `container` genitore con N `container` figli, nient'altro.
2. **Le colonne non hanno una larghezza.** `container` v2 non dichiara alcuna prop di larghezza
   propria: i preset 33/67, 30/70 ecc. producono 50/50 una volta inseriti (limite dichiarato nel
   commento di `buildCellNode`). La maniglia di resize (`useContainerWidthResize.ts`) punta a
   `styleFlexBasis`, prop che la v2 non ha più: è codice morto.
3. **"Boxed" non segue Elementor.** Oggi `contentWidth: 'boxed'` dà `max-width` all'**intero**
   contenitore, sfondo compreso. In Elementor il contenitore occupa tutta la larghezza del genitore
   (sfondo, bordo, padding a tutta larghezza) e solo un wrapper interno (`.e-con-inner`) è limitato
   alla larghezza boxed.

## Decisione
1. **Nuove righe = solo `container`.** La finestra di struttura non crea più `section` in nessun
   ramo:
   - **Flexbox, 1 colonna** → un `container` (`contentWidth: 'boxed'`).
   - **Flexbox, N colonne** → un `container` genitore (`contentWidth: 'boxed'`, `layout.default:
     {display:'flex', direction:'row', gap}`, `layout.mobile: {direction:'column'}`) con N
     `container` figli (`contentWidth: 'full'`, `width.default` = peso del preset in `%`,
     `width.mobile` = `100%`). I pesi asimmetrici del preset diventano larghezze reali.
   - **Griglia** → un solo `container` `layout.display:'grid'` con `gridTemplateColumns`/`Rows`
     dal preset e una cella `container` vuota per traccia (stesso principio di Elementor Grid).
   - Il `container` inserito dalla palette senza preset resta come oggi.
   `section` resta nel registro solo per leggere le Revisioni esistenti (ADR-82 punto 2, invariato).

2. **Nuova prop `width` su `container` v2** (`kind: 'unitValue'`, `responsive: true`, unità
   `px|%|vw`, `0–4000`, opzionale, nessun default): la larghezza del contenitore stesso nel suo
   genitore (Elementor "Width"). Emissione CSS: `width: <v>; flex: 0 1 auto; max-width: 100%`.
   Senza `width` il comportamento resta quello attuale (colonne di una riga in parti uguali). La
   regola di default `.container[data-default-direction='row'] > .container` passa a
   specificità 0 (`:where`) così la `width` per nodo vince sempre. `CONTAINER_WIDTH_PROP` passa da
   `styleFlexBasis` a `width`: la maniglia di resize esistente torna funzionante, scrivendo sul
   breakpoint attivo. Nessun bump di `v` (prop opzionale additiva, ADR-21).

3. **Boxed alla Elementor.** Un `container` con `contentWidth: 'boxed'` rende:
   ```html
   <div data-canvas-style-id="…" data-content-width="boxed">   <!-- sfondo, bordo, padding, width -->
     <div data-container-inner>                               <!-- max-width boxed + layout flex/grid -->
       …figli…
     </div>
   </div>
   ```
   - L'elemento esterno riceve `background`, `border`, `radius`, `shadow`, `padding`, `margin`,
     `position`, `transform`, `filter`, `opacity`, `minHeight`, `overflow`, `width`.
   - Il wrapper interno riceve `layout` (display, direzione, gap, griglia) con
     `width: 100%; max-width: <boxedWidth | var(--theme-layout-boxed-width)>; margin-inline: auto`.
   - `contentWidth: 'full'`: nessun wrapper, il layout resta sull'elemento esterno (come oggi).
   - Il selettore del layout diventa `[data-canvas-style-id="<id>"] > [data-container-inner]` per i
     boxed; `generateCanvasCss.ts` (canvas e SSR pubblico, ADR-97) e il compilatore di riferimento
     backend `to-css.ts` si allineano allo stesso modo.
   - Nell'editor, drop zone, segnaposto vuoto e resize delle colonne operano sui figli del wrapper
     interno (il wrapper è trasparente per l'albero dati: **non è un nodo**, non va in JSON).

4. **Root boxed a tutta larghezza.** Nella griglia di pagina di ADR-98 anche un root `container`
   boxed occupa `grid-column: 1 / -1` (il suo sfondo raggiunge i bordi come in Elementor); il suo
   wrapper interno prende `max-width: min(<boxed>, 100% - Rientro sx - Rientro dx)`. Blocchi radice
   che non sono `container` (e le `section` legacy) restano nella traccia centrale.

5. **Default dei contenitori annidati = `full`.** I `container` creati dentro un altro `container`
   (preset o palette) nascono con `contentWidth: 'full'`, come in Elementor. Il default di schema
   (`'boxed'`) resta invariato: vale per i contenitori radice.

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Lasciare Boxed come oggi (`max-width` sull'intero contenitore) | Nessun cambio di rendering | Diverge da Elementor, sfondo di un boxed mai a tutta larghezza | Scartata dall'utente in sede di task |
| Solo struttura nuova, niente `width` | Nessun cambio di schema | Colonne asimmetriche impossibili, maniglia di resize morta | Scartata dall'utente in sede di task |
| `width` come peso `fr`/`flex-grow` invece di `unitValue` | Somma sempre a 100% | Non è il modello Elementor (`%`/`px`), non si può fissare una colonna in `px` | Meno espressivo, non allineato al riferimento |
| Wrapper interno come nodo reale dell'albero | Selezionabile nel Navigatore | Un livello in più nel JSON: è proprio il difetto da eliminare | Contraddice il punto 1 |

## Conseguenze
- **Cambio visivo sulle pagine esistenti:** un `container` boxed con sfondo/bordo mostra ora lo
  sfondo a tutta larghezza del genitore (e, se radice, del documento), con il contenuto ancora
  limitato. Nessun dato cambia: si torna indietro solo revertendo il codice.
- Le colonne create dai vecchi preset (`container` boxed dentro una riga) guadagnano un wrapper
  interno ma restano visivamente uguali (sono più strette della larghezza boxed).
- `section` legacy: nessun cambiamento.
- Nuova prop nello schema → `npm run openapi:export && npm run openapi:types`.
- Il Navigatore e il breadcrumb non mostrano il wrapper interno (non è un nodo).

## Conformità
- Test della finestra di struttura: nessun preset produce un nodo `section`; "2 colonne 33/67"
  produce un genitore flex row con due figli `width.default` `33%`/`67%` e `width.mobile` `100%`.
- Test `Container`: `boxed` → wrapper `[data-container-inner]` presente; `full` → assente.
- Test `generateCanvasCss`: il `layout` di un boxed è emesso su `> [data-container-inner]`,
  `background`/`padding` sull'elemento esterno; `width` emette `width`/`flex`/`max-width`.
- Test validatore backend: `width` accetta `{value:33, unit:'%'}` per breakpoint, rifiuta unità
  fuori elenco e valori oltre `4000`.
- Controllo nel browser (Chromium): root boxed con sfondo arriva ai bordi, contenuto centrato alla
  larghezza boxed, nessuno scroll orizzontale.

## Decisione umana
**Esito**: [x] Approvato così com'è · [ ] Approvato con modifiche (vedi note) · [ ] Rifiutato ·
[ ] Rinviato

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-26

**Note**: Nessuna.
