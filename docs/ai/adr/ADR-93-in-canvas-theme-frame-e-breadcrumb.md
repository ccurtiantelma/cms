# ADR-93 — Cornice tema (THEME - HEADER / THEME - FOOTER) e breadcrumb in-canvas nell'editor visivo

## Status
[x] **In discussione** · [ ] Approvata · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
In attesa di firma umana — approvato da: ___________ (data: ___________)

Redatta su richiesta esplicita del task "Polish Visivo, Bonifica Ambiente Test & Quality Gate
(Prompt 6/6)", che nomina questo file. La richiesta autorizza la scrittura del documento, non
ne costituisce l'approvazione: la firma (`marketing@antelmagroup.net`, con data) va apposta
dall'umano, come per ogni ADR (`docs/constitution.md` § Documentation Policy).

## RFC di riferimento
Nessuna. Estende `ADR-72` (canvas nello stesso albero React, iframe via portal), `ADR-91`
(3 colonne fisse) e `ADR-92` (overlay in-canvas e palette 2 colonne).

## Contesto

Il canvas centrale dell'editor (`EditorCanvas.tsx`, montato nel documento iframe di `ADR-72`)
mostrava solo l'albero dei blocchi della pagina. Per parità visiva con Elementor Pro servono due
elementi di orientamento che non fanno parte dell'albero: l'indicazione che sopra e sotto la
pagina esistono header e footer del tema (non modificabili da questo editor) e una barra
gerarchica che mostra dove si trova il blocco selezionato. Entrambi esistono già nel codice
(`CanvasThemeFrame.tsx`, `CanvasThemeFrame.module.css`) senza una decisione che li giustifichi.

## Decisione

1. **Badge di cornice tema.** `ThemeFrameBadge` viene montato da `EditorCanvas.tsx` sopra
   (`area="header"`) e sotto (`area="footer"`) l'albero dei blocchi, con titoli fissi
   `THEME - HEADER` e `THEME - FOOTER`, icona lucchetto e sottotitolo "Tutte le aree".
2. **Decorazione non editabile.** I badge non hanno `EditorBlockWrapper`, nessun id nell'albero
   dei blocchi, `pointer-events: none` e `user-select: none`. Non entrano in selezione,
   drag-and-drop, undo/redo né nel JSON del blocco: non esiste alcuna scrittura sullo store.
3. **Breadcrumb in-canvas.** `CanvasBreadcrumbBar` è montata in calce al canvas: percorso
   "Pagina › … › blocco selezionato" calcolato da `findPath` (`block-tree.utils.ts`) sullo
   store; ogni segmento seleziona il livello corrispondente. Le etichette vengono da
   `BLOCK_TYPES[].meta.label`, con fallback sul nome del tipo.
4. **Geometria.** Barra `position: sticky; bottom: 0`, altezza fissa **28px**, sfondo bianco,
   bordo superiore 1px, scorrimento orizzontale se il percorso eccede la larghezza.
5. **Isolamento CSS (`ADR-70` punto 5, `ADR-72`).** Entrambi i componenti vivono nel documento
   iframe: nessun componente Mantine, solo CSS Modules (caricati con `?inline`) e icone SVG
   Tabler. Nessuna nuova dipendenza npm.
6. **Nessun impatto su dati e pubblico.** Solo chrome dell'editor: nessuna modifica a schema
   blocchi, API, DTO, export statico o rendering pubblico. Header/footer reali del tema non
   sono caricati né renderizzati nell'editor: il badge è un segnaposto, non un'anteprima.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Renderizzare header/footer reali del tema nel canvas | Anteprima fedele | Dipende da Theme Builder (`ADR-88`, non ancora firmata), aumenta il rischio di drag involontari sul contenuto del tema | Fuori perimetro; il badge non impedisce di farlo in futuro |
| Breadcrumb nella toolbar/shell del padre (fuori iframe) | Può usare Mantine | Duplica la sincronizzazione della selezione fra frame; distante dal canvas | Il percorso vive già nello store condiviso, il portal di `ADR-72` lo rende gratis in-canvas |
| Badge come blocchi finti nell'albero | Nessun componente dedicato | Inquinano JSON, undo/redo, navigator e validazione | Viola l'invariante "cornice ≠ contenuto pagina" |

## Conseguenze

- Positive: orientamento immediato (dove sono, cosa è del tema), parità visiva con Elementor.
- Negative: i badge sono testo fisso, non riflettono se il tema ha davvero header/footer;
  quando `ADR-88` sarà firmata andranno collegati o sostituiti da una nuova ADR di superamento.
- La barra sticky sottrae 28px di altezza utile in fondo al canvas.

## Conformità

- `EditorCanvas.test.tsx`: presenza di `theme-frame-header`/`theme-frame-footer` e della barra.
- Nessun `EditorBlockWrapper` né id di albero associati ai badge (`data-theme-frame` soltanto).
- `CanvasThemeFrame.module.css`: `.breadcrumbBar` con `position: sticky` e `height: 28px`.
- Nessun import di `@mantine/*` in `CanvasThemeFrame.tsx`.
