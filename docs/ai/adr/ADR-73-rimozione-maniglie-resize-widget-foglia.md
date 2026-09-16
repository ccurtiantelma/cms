# ADR-73 — Rimozione delle maniglie di resize sui widget foglia (parità Elementor Pro)

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-16 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
Nessuna RFC dedicata. Richiesta diretta del proprietario del progetto ("Uniformazione Visiva
Canvas ed Eliminazione Resize Leaf, Column Handle & Mappatura Inspector Titolo — Elementor Pro
Clone"), punto 1: in Elementor Pro i widget foglia (Titolo, testo, pulsante, immagine) non
mostrano mai maniglie di ridimensionamento trascinabili sul canvas — solo il bounding box
sottile di selezione.

## Contesto

`ADR-71-resize-handles-unita-dinamiche.md` § "Decisione" punto 3 ha approvato maniglie di resize
per `styleMarginTop/Bottom/Left/Right` su `button`/`heading`/`richText`/`image`, e per
`styleWidth`/`styleHeight` su `container`/`image`. Questo copre esattamente i quattro tipi che
il proprietario del progetto ora classifica come "widget foglia" nel confronto diretto con
Elementor Pro, dove tali maniglie non esistono: il ridimensionamento di questi widget avviene
sempre tramite l'ispettore (spaziatura, dimensione font, ecc.), mai per trascinamento diretto sul
canvas.

Questa ADR **non riapre** la parte tecnica di ADR-71 (§ "Decisione" punti 1-2, 4-7): l'infrastruttura
`kind: 'unitValue'`, `min`/`max`/`units` dichiarati per prop, l'assenza di `responsive`, la
sanitizzazione invariata. Restringe soltanto **quali tipi di blocco montano la maniglia
trascinabile** — un cambiamento di linguaggio visivo dell'editor (ADR-71 § "Decisione" punto 5:
"componente di editor, non... schema nuovo"), non un cambiamento di schema: le props
`styleMarginTop/Bottom/Left/Right`/`styleWidth`/`styleHeight` restano dichiarate nel registro,
restano validate/sanitizzate come prima, restano impostabili dall'ispettore (input numerico) —
cambia solo la disponibilità del gesto di trascinamento sul canvas per questi quattro tipi.

## Decisione

1. **`resolveResizePropSpec` (`resize-handle.utils.ts`) restituisce sempre `null` per
   `blockType` in `['heading', 'richText', 'image', 'button']`**, indipendentemente dalla prop
   richiesta — prima di qualunque altro controllo (fail-fast, un solo punto di verità, mai una
   seconda lista duplicata in `EditorBlockWrapper.tsx`). Nessuna maniglia (`ResizeHandle.tsx`) si
   monta più per questi quattro tipi, né per i margini né — per `image` — per `styleWidth`/
   `styleHeight`.
2. **`container` non è incluso nell'esclusione**: non è un widget foglia (ha figli), le sue
   maniglie restano invariate — sia quella esistente di `styleFlexBasis`
   (`ContainerResizeHandle`, `showContainerResizeHandle`), sia `styleWidth`/`styleHeight` via
   `resolveResizePropSpec('container', ...)`.
3. **Nessuna modifica al registro backend** (`app/backend/src/blocks/types/*.block.ts`): le props
   restano dichiarate con lo stesso `kind: 'unitValue'`, `min`/`max`/`units` di ADR-71. Nessuna
   rigenerazione `blocks:export`/`blocks:types` richiesta — cambia solo la logica di rendering
   frontend che decide se montare il componente maniglia.
4. **Il bounding box di selezione dei widget foglia resta invariato**: nessuna maniglia
   sostitutiva, nessun bordo trascinabile alternativo — solo il contorno sottile di selezione già
   esistente (`.wrapper` selezionato in `EditorBlockWrapper.module.css`).

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Rimuovere anche le props dal registro backend | Coerenza "schema riflette esattamente l'UI" | Perde la possibilità di impostare margine/dimensione da input numerico nell'ispettore, non richiesta da nessuna parte del task | Il task chiede di eliminare la maniglia *sul canvas*, non il controllo dall'ispettore |
| Escludere `image` solo per `styleWidth`/`styleHeight` ma non per i margini | Coerenza con "l'immagine ha comunque una dimensione visibile" | Il task classifica esplicitamente Image fra i "widget foglia" senza eccezioni; una regola parziale per un solo tipo complica `resolveResizePropSpec` senza beneficio richiesto | Scartata: uniformità dei quattro tipi, stessa regola per tutti |
| Gate nel componente `EditorBlockWrapper.tsx` invece che in `resolveResizePropSpec` | Nessuna modifica a `resize-handle.utils.ts` | Duplica la lista dei tipi esclusi in un secondo punto (rischio di disallineamento con `ResizeHandle.tsx`, che chiama la stessa funzione) | `resolveResizePropSpec` è già il punto unico di verità richiamato da entrambi i file — un solo punto di esclusione |

## Conseguenze

**Positive**
- Parità visiva con Elementor Pro sui widget foglia, come richiesto.
- Nessuna estensione/rottura di schema, nessuna rigenerazione OpenAPI/tipi, nessun impatto sulla
  persistenza dello store o su undo/redo.
- Un solo punto di modifica (`resolveResizePropSpec`) consumato sia da `EditorBlockWrapper.tsx`
  che da `ResizeHandle.tsx`.

**Negative / costi**
- Chi vuole modificare margine/larghezza/altezza di Titolo, RichText, Pulsante o Immagine deve
  usare l'ispettore (input numerico) — nessuna scorciatoia da canvas per questi quattro tipi, a
  differenza di `container`.
- `ADR-71` § "Decisione" punto 3 resta testualmente inalterato (non riscritto) ma la sua
  applicazione pratica per questi quattro tipi è ora superseded da questa ADR — chi legge ADR-71
  isolatamente deve essere rimandato qui.

## Conformità

1. **Nessuna maniglia renderizzata su `heading`/`richText`/`image`/`button`**: verificabile per
   ispezione — `resolveResizePropSpec` con uno di questi quattro `blockType` restituisce sempre
   `null`, qualunque `propName`. Un test in `resize-handle.utils.test.ts` copre esplicitamente
   questo caso per i quattro tipi.
2. **`container` invariato**: `resolveResizePropSpec('container', 'styleWidth' | 'styleHeight')`
   continua a risolvere dal registro come prima di questa ADR.
3. **Nessuna riga toccata in `app/backend/src/blocks/types/*.block.ts`**: `git diff` di questa
   ADR non deve mostrare modifiche fuori da `app/frontend/`.
