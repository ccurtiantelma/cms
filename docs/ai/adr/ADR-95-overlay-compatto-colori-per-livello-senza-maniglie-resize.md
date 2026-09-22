# ADR-95 — Overlay di selezione compatto, colori per livello (Sezione/Contenitore/Widget), nessuna maniglia di resize sul box selezionato

## Status
[x] In discussione · [ ] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
In attesa di firma umana (richiesta esplicita ricevuta in sede di task il 2026-09-21 da
marketing@antelmagroup.net; la firma resta da apporre — un'ADR non si auto-approva).

## Contesto
Richiesta esplicita di restyling degli overlay del canvas. Supera parzialmente:
- `ADR-92` § 1 (colori bordo `#2271b1` Container/Sezione, `#a435c0` Widget) e § 3 (barra
  trasparente/verde chiaro, icone nere): ora tre livelli con barra a sfondo pieno e icone bianche.
- `ADR-71` § 3 e `ADR-73` (maniglie di resize trascinabili su `container`): nessuna maniglia di
  resize sul box selezionato. Il `ColumnResizer` fra colonne di una Sezione resta invariato.

## Decisione
1. Nessun `ResizeHandle`/`ContainerResizeHandle` montato: rimossi componenti, `BlockResizeHandles`,
   `generic-resize-handles` e relativi test. Restano `*-resize.utils` e `useContainerWidthResize`
   (applica la larghezza già persistita, `widthStyle`).
2. Barra azioni compatta: pulsanti 20px, icone 13px, padding verticale 0, a filo del bordo
   esterno della cornice (`top/left: -1px`).
3. Colore per livello, identico per barra, cornice e badge hover; testo e icone `#ffffff`:
   Sezione `#7c3aed` (viola) · Contenitore `#ea580c` (arancione) · Widget `#16a34a` (verde).
   Classi/varianti `section` | `container` | `widget` (`BlockSelectionChrome`, `BlockHoverOverlay`).
4. Icone Tabler: `stroke`/`color` bianchi, `fill: none` (un `fill` bianco ne coprirebbe i tratti).
5. `.globalRefBorder` (`#9333ea`) invariato.

## Alternative valutate
| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Solo nascondere le maniglie via CSS | Diff minimo | Codice morto e test su UI invisibile | Scartata |
| `fill: #fff` sulle icone | Letterale | Icone outline riempite | Scartata |

## Conseguenze
Quarto cambio colore dello stesso bordo in pochi round (rischio thrashing già annotato in ADR-92).
Il resize di larghezza/altezza si fa solo dal Property Inspector.

## Conformità
`npx tsc --noEmit` e `npx vitest run src/pages/pages/editor` verdi (430/430, era 449 con i 19 test
delle maniglie rimosse); nessun `[data-testid^='resize-handle']` nel DOM del canvas.
