# RFC-32 — Editor a schermo intero, Navigator e sidebar widget

## Status
[ ] In discussione · [x] **Approvato** → genera ADR-32 · [ ] Rifiutato

## Proposto da
AI Orchestrator · Data: 2026-08-24

## Problema

`RFC-F04c-editor-maturo.md` § Decisione 4 aveva rinviato in blocco a un round **F04d**, mai
formalizzato, quattro capacità: colonne, annidamento di `section`, navigator, schermo intero.
`ADR-31-layout-colonne-section.md` (approvata il 2026-08-23) ha già staccato le colonne da
quel blocco. Nel frattempo, fuori da qualunque RFC/PLAN scritto, sono stati implementati e
lasciati non committati: `FullScreenEditorLayout.tsx` (chrome a piena finestra con viewport
switcher desktop/tablet/mobile e sidebar widget a sinistra), `EditorStructureNavigator.tsx`
(albero navigabile a destra) e `sidebar/WidgetPalette.tsx` (palette di blocchi trascinabile
nel canvas via `dnd-kit`, oltre al click-to-add già esistente). Questa RFC formalizza quel
lavoro già scritto, con l'autorizzazione data a voce dall'umano nella sessione del
2026-08-24 — la stessa in cui è stata firmata `ADR-26` (WYSIWYG). **Annidamento di `section`
resta fuori**: nessun codice lo tocca (`canDropInto`/`MAX_DEPTH` in `block-registry.utils.ts`
sono invariati, "irraggiungibile" resta vero), e non è coperto da questa RFC.

## Soluzione proposta

1. **Schermo intero come chrome sostitutiva, non una rotta nuova.** `FullScreenEditorLayout`
   sostituisce `LayoutProtected` solo per la scheda "Contenuto" del dettaglio Pagina, con
   `position: fixed; inset: 0`. Nessuna modifica al routing (`pages/:guid` resta l'unica
   rotta). Tre colonne: sidebar widget/proprietà a sinistra, canvas al centro, pannello
   struttura a destra (apribile/chiudibile).
2. **Viewport switcher (desktop/tablet/mobile)** come stato di chrome (`activeViewport` in
   `useBlockEditorStore`), non di contenuto: cambia solo la larghezza del contenitore di
   anteprima nel canvas admin, non tocca l'albero né i breakpoint effettivi del rendering
   pubblico (quelli restano CSS, ADR-29 § 3). È la prima superficie che rende visibili in
   admin i valori `tablet`/`mobile` salvati dalle props responsive di ADR-29/ADR-31 — chiudeva
   uno scarto esplicitamente dichiarato aperto in `PLAN-F04c-editor-maturo.md` § A.5.
3. **Navigator** (`EditorStructureNavigator`) legge l'albero dallo store via `useShallow`,
   nessuno stato duplicato; selezione per nome invece che dal canvas, utile quando un blocco è
   fuori dalla viewport simulata corrente.
4. **Sidebar widget con drag & drop verso il canvas** (`WidgetPalette`): sorgente di drag con
   id sintetico `new-block:<type>` (mai un nodo reale dell'albero); `canDropInto` accetta un
   `dragType` di riserva per valutare l'ammissibilità di un tipo che non esiste ancora
   nell'albero. Il rilascio chiama la stessa `addBlockAction` già usata dal click-to-add di
   `BlockPalette` — **nessuna azione nuova nello store**, un secondo modo di invocare quella
   esistente.
5. **`DndContext` si sposta da `EditorCanvas` a `FullScreenEditorLayout`**: la sorgente
   (`WidgetPalette`, nella sidebar) e le destinazioni (`EditorBlockWrapper`, nel canvas) sono
   ora fratelli, non l'una discendente dell'altra — serve un antenato comune per condividere
   l'istanza.
6. **Stato di chrome, mai stato di Pagina**: `activeViewport`, `isStructurePanelOpen`,
   `activeSidebarTab` vivono nello store Zustand come i campi di editing esistenti, ma non
   sono mai inviati al backend né persistiti nella bozza — si azzerano ad ogni `initTree`
   come il resto dello stato di editing.

## Alternative valutate

- **Overlay con `Modal`/`Drawer` Mantine per lo schermo intero** — scartata: un `Modal` è
  portal-based e non offre il controllo pixel-preciso sulle tre colonne fisse che questa
  chrome richiede (stesso problema già incontrato e risolto per il WYSIWYG, ADR-26).
- **Navigator come stato duplicato del canvas** — scartata: avrebbe richiesto sincronizzare
  due rappresentazioni dello stesso albero; il navigator legge lo store direttamente.
  **`DndContext` lasciato dentro `EditorCanvas`** — scartata: la sidebar widget e il canvas
  sono fratelli nel layout a tre colonne, non annidati; `useDraggable`/`useDroppable` non
  funzionerebbero fra rami diversi senza un antenato comune che ospiti il contesto.
- **Una `moveNodeToAction`/azione nuova per il drop dalla palette** — scartata: la stessa
  `addBlockAction` già validata e testata basta, il drag è solo un secondo ingresso.
- **Includere l'annidamento di `section` in questo round** — scartata: nessuna guardia di
  `MAX_DEPTH` esiste ancora, e introdurla insieme a tre capacità già scritte avrebbe
  allargato lo scope oltre quanto autorizzato a voce in questa sessione. Resta debito di
  governance separato.

## Impatto

Nessuna dipendenza npm nuova (tutto costruito su `dnd-kit`/Zustand/Mantine già approvati).
Nessuna migrazione, nessun endpoint nuovo, nessun campo persistito nuovo — solo stato di
chrome lato client. Chiude lo scarto "anteprima responsiva assente" di `PLAN-F04c-editor-
maturo.md` § A.5. Lascia navigabile da subito i valori `tablet`/`mobile` scritti solo via
API/import finché l'ispettore non avrà controlli dedicati per quei due breakpoint (limite
ancora dichiarato, non risolto da questa RFC).

## Rischi

Il rischio principale è documentale, non tecnico: questo lavoro è stato scritto prima della
sua RFC, esattamente il pattern che `ADR-31 § 8` aveva già segnalato come debito aperto. Il
rischio tecnico più concreto è lo stato di chrome che sopravvive per errore a un cambio di
Pagina (es. `activeSidebarTab` che resta su "Proprietà" con un nodo selezionato che non
esiste più nella Pagina appena caricata) — mitigato dal fatto che `initTree` azzera
`selectedId`, e `activeSidebarTab` segue `selectNode` che already lo riporta a `'widgets'`
quando `selectedId` torna `null`.

## Decisione umana

**Esito**: [x] Approvato · [ ] Rifiutato · [ ] Modificato

**Note**: Autorizzazione data a voce in sessione, contestualmente alla firma di ADR-26.
Copre Navigator, schermo intero (incl. viewport switcher) e sidebar widget con drag & drop.
Annidamento di `section` resta esplicitamente fuori, senza data.

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-08-24

**Azione successiva**: [x] Genera ADR-32 · [ ] Archivio
