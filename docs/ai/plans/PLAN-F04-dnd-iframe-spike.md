# Plan — Spike IframeBridgeSensor (Gate vincolante ADR-70 § 4)

## Esito

**NEGATIVO. Il gate non è superato.** L'architettura descritta in
`ADR-70-canvas-iframe-isolation-zustand-sync.md` § "Decisione" punti 1 e 3 — canvas montato
in un **secondo root React separato** dentro l'iframe, **un solo `DndContext`** nel documento
padre, ponte via `IframeBridgeSensor` — non può funzionare con la superficie pubblica di
`@dnd-kit/core@6.3.1` così com'è installata in questo repo. Non è un problema di latenza, di
tuning, o di un dettaglio implementativo del Sensor: è un vincolo strutturale di React stesso
(propagazione del Context) che nessuna combinazione di API standard del browser aggira.

Per `SPEC-F04-super-elementor.md` § "Vincoli e assunzioni" punto 6 e § "Out of scope" ultimo
punto: **nessun task del breakdown T1-T7 di `SPEC-F04-super-elementor.md` può iniziare**. Questo
piano non formalizza quell'architettura (era il ramo previsto solo in caso di esito positivo) —
registra l'esito, le evidenze, e le opzioni percorribili per l'Orchestratore.

## Riferimenti

- `docs/ai/adr/ADR-70-canvas-iframe-isolation-zustand-sync.md` § "Decisione" punto 4 (il gate)
  e punto 3 (l'architettura verificata).
- `docs/ai/specs/SPEC-F04-super-elementor.md` § 3.3, § 3.5, § "Vincoli e assunzioni" punto 6.
- PoC: `app/frontend/src/spikes/dnd-iframe-bridge/` (`IframeBridgeSensor.ts`,
  `PageSpikeParent.tsx`, `spike-canvas-entry.tsx`), rotta dev `/dev/dnd-iframe-spike`, secondo
  entry Vite `app/frontend/spike-dnd-iframe.html`. Isolato, non linkato dalla navigazione,
  nessun impatto sul flusso di produzione.

## Cosa è stato costruito

Un PoC fedele punto per punto ad ADR-70 § "Decisione" punto 3 e SPEC-F04-super-elementor.md
§ 3.3, con la **stessa configurazione dnd-kit già in produzione** (non una configurazione di
comodo inventata per far funzionare il PoC):

- `PageSpikeParent.tsx` — documento padre: `DndContext` con `sensors = [PointerSensor({
  activationConstraint: { distance: 5 } }), KeyboardSensor(), IframeBridgeSensor]`,
  `collisionDetection={pointerWithin}` — **identica** alla configurazione reale di
  `FullScreenEditorLayout.tsx:335-338,513`. Una tessera `useDraggable` (`PaletteTile`, analoga a
  `WidgetPalette.tsx:80-83`) e una drop-zone di controllo nello stesso documento (baseline: serve
  a dimostrare che l'impalcatura del PoC funziona quando non c'è di mezzo un iframe, prima di
  guardare il caso reale).
- `spike-dnd-iframe.html` + `spike-canvas-entry.tsx` — secondo entry Vite, stessa
  origin/build/dev-server, che monta un **secondo `ReactDOM.createRoot`** (nessun `DndContext`
  locale, come prescritto) con blocchi che usano `useDraggable`/`useDroppable` **esattamente
  come `EditorBlockWrapper.tsx:1099-1124`** (stessa forma di `id`/`data`).
- `IframeBridgeSensor.ts` — implementa quanto pubblicamente esposto da `Sensor<T>`
  (`node_modules/@dnd-kit/core/dist/sensors/types.d.ts`): registra listener nativi
  `pointerdown/pointermove/pointerup` su `iframe.contentWindow.document` dentro `setup()`,
  traduce le coordinate sommando `iframe.getBoundingClientRect()`, e ri-emette un
  `PointerEvent` nativo sul documento padre — l'unica forma di "inoltro" che l'API pubblica di
  dnd-kit permette (vedi commento di testa del file per il dettaglio).

## Metodo di verifica

Avviato `npm run dev` (Vite, porta 55173), navigato con Puppeteer su
`/dev/dnd-iframe-spike`, e simulati con `dispatchEvent`/`PointerEvent` reali sequenze
pointerdown→pointermove→pointerup sia dentro l'iframe (scenario b) sia a cavallo del confine
(scenario a), leggendo lo stato via un log diagnostico esposto su `window.__SPIKE_DND_EVENTS__`
(eventi reali di `DndContext`: `onDragStart`/`onDragEnd`) e `window.__SPIKE_BRIDGE_LOG__`
(eventi catturati/tradotti da `IframeBridgeSensor`).

## Risultato — Scenario (b): riordino interno all'iframe

Pointerdown reale sul nodo `Blocco A` dentro l'iframe, poi 6 pointermove di 6px, poi
pointerup: il log nativo conferma `pointerdown-on-block` (l'evento DOM è arrivato al nodo), e
`IframeBridgeSensor` conferma di aver catturato e tradotto tutti e 3 gli eventi. **Ma
`window.__SPIKE_DND_EVENTS__` resta `[]` — dnd-kit non ha mai riconosciuto l'inizio di un
drag.** Il pannello diagnostico resta su `active: (nessuno)` per l'intera sequenza.

**Scenario (b) fallisce integralmente: non è possibile avviare un drag su un nodo renderizzato
nel root React dell'iframe.**

## Risultato — Scenario (a): drag dalla palette (padre) verso il canvas (iframe)

Pointerdown+pointermove sulla tessera reale della palette (documento padre): `onDragStart` **si
attiva correttamente** (`dragStart active=new-block:spike-demo`), confermando che la
configurazione sensori/collisionDetection del PoC si comporta come quella reale per un drag
che origina nel documento padre. Muovendo poi il puntatore (evento nativo dispatchato sul
documento dell'iframe, come farebbe davvero il browser quando il cursore fisico entra nel
rettangolo dell'iframe) fino al centro di `iframe-canvas-root` e rilasciando lì:

- `IframeBridgeSensor` cattura e traduce correttamente `pointermove`/`pointerup` (coordinate
  verificate: offset dell'iframe sommato in modo esatto).
- **`iframe-canvas-root` (`useDroppable`) resta `isOver=false` per tutta la sequenza** — mai
  una volta `true`, nonostante il puntatore tradotto sia geometricamente dentro quel
  rettangolo.
- **Nessun `onDragEnd` viene mai emesso.** Il drag resta bloccato in stato "attivo" a tempo
  indefinito (`active: new-block:spike-demo` ancora presente dopo il pointerup e dopo un
  ri-render successivo) — non un semplice "drop mancato", uno stato incoerente che in
  produzione lascerebbe l'utente con un `DragOverlay` fantasma e nessun modo di uscirne se non
  Escape/refresh.

**Scenario (a) fallisce anch'esso al momento del drop: un blocco trascinato dalla palette non
può mai essere inserito nel canvas quando il canvas vive in un iframe con questa architettura.**

Nota di metodo: la parte "drag si blocca" usa `dispatchEvent`/`PointerEvent` sintetici, che
**non replicano l'eventuale cattura implicita del puntatore che un browser reale applica a un
vero trascinamento col mouse** (comportamento specifico del motore, non testabile senza
controllo di mouse reale via CDP, non disponibile con gli strumenti di questa sessione). Questo
dettaglio potrebbe attenuare (mai risolvere) l'esito di questo sotto-punto specifico — **non
cambia l'esito del gate**, perché il blocco decisivo (sotto) è indipendente da come arrivano gli
eventi.

## Causa radice (livello codice, non congettura)

`node_modules/@dnd-kit/core/dist/core.esm.js:2545-2558`:

```js
const defaultInternalContext = {
  activatorEvent: null,
  activators: [],
  active: null,
  activeNodeRect: null,
  ariaDescribedById: { draggable: '' },
  dispatch: noop,
  draggableNodes: /*#__PURE__*/ new Map(),
  over: null,
  measureDroppableContainers: noop,
};
const InternalContext = /*#__PURE__*/ createContext(defaultInternalContext);
```

`useDraggable`/`useDroppable` (righe 3387 e seguenti) leggono questo Context con
`useContext(InternalContext)`. Il Context **propaga solo all'interno del proprio albero React
(fiber tree)**, mai fra due `ReactDOM.createRoot()` distinti — è un vincolo dell'architettura
di React, indipendente da same-origin/stesso `window`/stesso modulo JS. Ne consegue,
per costruzione, che ogni `useDraggable`/`useDroppable` eseguito nel root separato dell'iframe
(prescritto da ADR-70 § "Decisione" punto 1, "un entry point React dedicato") riceve sempre
`defaultInternalContext`: `dispatch: noop` (una `useDroppable` che chiama `dispatch(...)` per
registrarsi non registra nulla), `activators: []` (i `listeners` restituiti a un nodo
draggable sono di fatto inerti), `draggableNodes: new Map()` locale e mai condivisa con quella
vera del padre.

L'`IframeBridgeSensor` di ADR-70 § "Decisione" punto 3 può — con sola API standard del
browser — catturare eventi nativi nel documento dell'iframe e tradurne le coordinate (questa
parte **funziona**, confermato sopra). Ma "inoltrarli al protocollo di attivazione che dnd-kit
espone per un Sensor custom" presuppone un protocollo che, ispezionando
`node_modules/@dnd-kit/core/dist/sensors/types.d.ts`, esiste solo come
`Sensor.activators: {eventName, handler}[]` legato a **nodi già registrati in
`draggableNodes` della vera istanza** (`core.esm.js:3177-3202`,
`bindActivatorToSensorInstantiator`). Non esiste, nella superficie pubblica del pacchetto,
un'API imperativa "avvia un drag per questo id" che un Sensor possa invocare da fuori quel
meccanismo. Il gap non è "il Sensor non è stato scritto abbastanza bene" — è che l'API
richiesta per colmarlo non esiste nella libreria già approvata (ADR-28), e scriverla
richiederebbe patchare/forkare `dnd-kit`, esplicitamente escluso da ADR-70 § "Alternative
valutate" ("Fork/patch di dnd-kit... scartata: over-engineering") e dal vincolo "nessuna nuova
dipendenza npm" (che coprirebbe anche un fork interno mantenuto come pseudo-dipendenza).

## Rischio aggiuntivo scoperto, indipendente dal Context (per completezza)

`FullScreenEditorLayout.tsx:392,412`: l'auto-scroll del canvas durante un drag ascolta
`pointermove` nativi direttamente su `window` (non via dnd-kit). Un `<iframe>` è un secondo
browsing context: mentre il puntatore è fisicamente sopra il suo contenuto, gli eventi
`pointermove` non attraversano il confine verso il listener sul `window` del padre (li riceve
il documento dell'iframe, non quello del padre) — stesso fenomeno, causa diversa, dello stesso
problema di fondo. Se mai l'architettura a iframe venisse ripresa, l'auto-scroll andrebbe
ribridgato separatamente da `IframeBridgeSensor`, un costo non contabilizzato in ADR-70/SPEC.

## Sensore da tastiera esistente (uno dei 4 punti richiesti da ADR-70 § 4)

Non ri-testato in questo PoC (irrilevante rispetto al blocco sopra, che impedisce l'avvio
stesso del meccanismo indipendentemente dal sensore usato) ma già accertato per ispezione del
codice esistente: `collisionDetection={pointerWithin}` richiede coordinate del puntatore
(`getEventCoordinates`), che un `KeyboardEvent` non porta mai — `FullScreenEditorLayout.tsx`
non passa un `coordinateGetter` custom a `KeyboardSensor` (riga 337) per compensare. Il
riordino da tastiera nel `DndContext` del canvas **è già rotto oggi, indipendentemente
dall'iframe** (nessun test e2e lo esercita con successo — l'unico helper esistente,
`e2e/tests/helpers/page-editor.ts:600-639` `dragBlockToZone`, non ha oggi alcun chiamante
funzionante). Un'eventuale ripresa di F04e dovrebbe comunque risolvere questo a monte (es.
fallback a `closestCenter` quando `pointerCoordinates` è `null`), a prescindere dall'esito
dell'iframe.

## Cosa NON è il problema (per non sprecare tempo a rivalutarlo)

- **Scroll interno del canvas, resize finestra, zoom browser**: la traduzione di coordinate
  (`iframe.getBoundingClientRect()`, ricalcolato ad ogni evento) è per costruzione coerente con
  resize/zoom/scroll — sono già CSS pixel nel sistema di riferimento corrente. Non sono la causa
  del fallimento e non serve testarli oltre: il blocco è a monte (registrazione droppable/drag
  source), non nella matematica delle coordinate.
- **Same-origin/`contentWindow`**: funziona esattamente come descritto in ADR-70 § 2 (verificato
  di riflesso: `registerIframeBridgeTarget(frame)` e la lettura di `frame.contentWindow.document`
  nel PoC non hanno mai sollevato errori di cross-origin). Il ponte per lo **store Zustand**
  (funzione passata per riferimento via `contentWindow`) non ha lo stesso problema del ponte
  dnd-kit: non dipende dal Context React, è un semplice assegnamento di proprietà su un oggetto
  `window` — ADR-70 § 2 resta valida e non rimessa in discussione da questa spike.

## Opzioni percorribili (per l'Orchestratore, nessuna scelta qui)

1. **Portale React (`ReactDOM.createPortal`) invece di un secondo root/entry point.** Il
   contenuto del canvas resterebbe parte dello **stesso albero React** del padre (stesso
   `DndContext`, stesso Context reale) ma il suo output DOM verrebbe attaccato dentro
   `iframe.contentDocument` via `createPortal(canvasTree, iframeDoc.getElementById('root'))`.
   `useDraggable`/`useDroppable` funzionerebbero senza alcun Sensor custom (nessun bridge di
   coordinate necessario neanche, dato che sarebbe lo stesso `document.addEventListener`
   implicito di React sugli event delegation root — da verificare quale, dato che React 19
   delega gli eventi al container di root, che sarebbe dentro l'iframe: **questo stesso punto
   andrebbe a sua volta spikato**, ma è un'alternativa strutturalmente diversa, non una
   variante del Sensor). Cambia il § 1 e § 3 di SPEC-F04-super-elementor.md, non solo il
   dettaglio implementativo — richiederebbe riaprire ADR-70, non solo questo piano.
2. **Abbandonare l'iframe per l'isolamento del canvas**, tornare allo status quo (ADR-54 +
   ADR-42, "isolamento solo per convenzione CSS") già scartato dalla firma umana su RFC-F04e
   Decisione 1 — riaprirebbe quella decisione, non una scelta tecnica di questo piano.
3. **Iframe solo per l'isolamento CSS/DOM di parti non-drag** (es. anteprima statica), con
   editing/drag-and-drop che restano nel documento padre — cambierebbe il perimetro della
   feature (non più "canvas interattivo isolato"), da rivalutare con l'RFC, non con un piano.

Nessuna di queste tre è una micro-modifica dell'`IframeBridgeSensor`: sono tre riaperture di
decisioni già firmate (RFC-F04e/ADR-70), motivo per cui questo piano si ferma qui invece di
sceglierne una.

## Task breakdown

**Nessuno.** T0 (questa spike) è chiusa con esito negativo. T1-T7 di
`SPEC-F04-super-elementor.md` restano bloccati per costruzione (§ "Vincoli e assunzioni" punto
6) finché una delle opzioni sopra non viene firmata con una nuova ADR o un supersede esplicito
di ADR-70.

## Come riprodurre

```
cd app/frontend && npm run dev
# poi apri http://localhost:55173/dev/dnd-iframe-spike
```

Il pannello diagnostico a destra registra in tempo reale `active`/`over`/eventi nativi
catturati da `IframeBridgeSensor`. Il PoC resta isolato in `src/spikes/dnd-iframe-bridge/` e
nella rotta dev `/dev/dnd-iframe-spike` (mai linkata) — da rimuovere solo dopo che l'esito qui
sopra è stato recepito a valle (nuova ADR o chiusura definitiva del ramo iframe).
