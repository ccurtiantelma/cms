# ADR-32 — Editor a schermo intero, Navigator e sidebar widget

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-08-24 — approvato da: marketing@antelmagroup.net

---

## Decisione

1. **`FullScreenEditorLayout` sostituisce la chrome standard solo sulla scheda "Contenuto"
   del dettaglio Pagina**, `position: fixed; inset: 0`, nessuna rotta nuova. Tre colonne:
   sidebar widget/proprietà, canvas, pannello struttura apribile/chiudibile.
2. **Viewport switcher (desktop/tablet/mobile)** come stato di chrome (`activeViewport`),
   governa solo la larghezza del contenitore di anteprima nel canvas admin — mai l'albero,
   mai i breakpoint effettivi del rendering pubblico (quelli restano CSS, ADR-29 § 3). Prima
   superficie che rende visibili i valori `tablet`/`mobile` già salvabili via API.
3. **`EditorStructureNavigator`** legge l'albero dallo store (`useShallow`), zero stato
   duplicato; selezione per nome, utile quando un blocco è fuori dalla viewport simulata.
4. **`WidgetPalette`**: drag & drop verso il canvas con id sintetico `new-block:<type>`
   (mai un nodo reale); `canDropInto` accetta un `dragType` di riserva per l'ammissibilità di
   un tipo non ancora nell'albero. Il rilascio chiama la `addBlockAction` già esistente —
   **nessuna azione nuova nello store**, un secondo ingresso alla stessa funzione del
   click-to-add di `BlockPalette`.
5. **`DndContext` si sposta da `EditorCanvas` a `FullScreenEditorLayout`**: sorgente
   (`WidgetPalette`) e destinazioni (`EditorBlockWrapper`) sono fratelli nel layout a tre
   colonne, serve un antenato comune per condividere il contesto.
6. **`activeViewport`/`isStructurePanelOpen`/`activeSidebarTab` sono stato di chrome**, mai
   inviati al backend né persistiti nella bozza; si azzerano ad ogni `initTree` come il resto
   dello stato di editing.
7. **Annidamento di `section` resta fuori scope, senza data.** Nessuna guardia `MAX_DEPTH`
   introdotta; `canDropInto` resta invariato su questo punto.

## Alternative scartate

- **`Modal`/`Drawer` Mantine per lo schermo intero** — portal-based, niente controllo
  pixel-preciso sulle tre colonne fisse (stesso problema già risolto per il WYSIWYG, ADR-26).
- **Navigator con stato duplicato** — richiederebbe sincronizzare due rappresentazioni
  dello stesso albero; legge lo store direttamente invece.
- **`DndContext` dentro `EditorCanvas`** — sidebar e canvas sono fratelli, non annidati:
  `useDraggable`/`useDroppable` non funzionano senza antenato comune che ospiti il contesto.
- **Azione nuova nello store per il drop dalla palette** — la `addBlockAction` esistente
  basta; il drag è solo un secondo modo di invocarla.
- **Includere l'annidamento di `section` in questo round** — allargherebbe lo scope oltre
  quanto autorizzato a voce; resta debito di governance a sé.

## Conseguenza

Nessuna dipendenza npm nuova, nessuna migrazione, nessun endpoint nuovo, nessun campo
persistito nuovo: solo stato di chrome lato client, costruito su `dnd-kit`/Zustand/Mantine
già approvati. Chiude lo scarto "anteprima responsiva assente" segnalato in
`PLAN-F04c-editor-maturo.md` § A.5. Il vincolo che lascia in eredità: chi vorrà l'annidamento
di `section` dovrà scrivere la guardia `MAX_DEPTH` che oggi non esiste da nessuna parte —
`canDropInto` la cerca già nel punto giusto (RFC-F04c § A.3) ma non la applica.
