# Spec — F04e "Super Elementor": canvas isolato, ponte di stato, overlay a valore libero

## Status
[ ] In discussione · [x] **Approvata, vincolante** · [ ] Superseded

> Redatta esclusivamente sulle decisioni firmate in `docs/ai/rfc/RFC-F04e-super-elementor.md`
> § "Decisione umana" (2026-09-14) e sulle ADR di superamento che ne discendono
> (`ADR-70-canvas-iframe-isolation-zustand-sync.md`, `ADR-71-resize-handles-unita-dinamiche.md`).
> A differenza di `SPEC-F04-grid-responsive-engine.md` (as-built, a valle
> dell'implementazione), questa spec è **prescrittiva**: nulla di quanto descritto nei §1-3 è
> ancora implementato. §4 e §5 documentano invece superficie e modello già esistenti,
> confermati status quo dalla Decisione 3 e dalla Decisione 5 dell'RFC.
>
> **Aggiornamento 2026-09-14 (ADR-72)**: `ADR-72-canvas-iframe-portal-bridge.md`, approvata in
> pari data, supera `ADR-70` § "Decisione" punti 1 e 3 — il gate di spike imposto da `ADR-70` §
> 4 è superato con esito positivo (4/4 test Playwright, verificato in sede di firma). §1 e
> §3.3/3.5 sotto sono stati riscritti di conseguenza per il pattern `ReactDOM.createPortal`
> (nessun secondo `ReactDOM.createRoot()`, nessun `IframeBridgeSensor`). §2 (ponte di stato
> Zustand) **non è toccato**: `ADR-72` § "Decisione" punto 4 conferma invariati i punti 2, 5 e 6
> di `ADR-70` § "Decisione", non riaperti da questa revisione.

## Feature di riferimento
`docs/roadmap.md` § F04 (Editor visivo). Nessun `docs/ai/features/F04e-*.md` dedicato: la
feature discende direttamente da `RFC-F04e-super-elementor.md`, come già avvenuto per
`SPEC-F04-grid-responsive-engine.md`.

## ADR applicabili

- `ADR-72-canvas-iframe-portal-bridge.md` — **approvata 2026-09-14**: supera `ADR-70` §
  "Decisione" punti 1 e 3. Canvas montato via `ReactDOM.createPortal` nello stesso albero React
  del documento padre (nessun secondo `ReactDOM.createRoot()`, nessun secondo entry point),
  nessun `Sensor` custom — `measuring.droppable/draggable.measure` di `DndContext` traduce il
  rettangolo dei nodi portati nell'iframe nel sistema di riferimento del documento la cui
  coordinata di puntatore è attiva.
- `ADR-70-canvas-iframe-isolation-zustand-sync.md` — **approvata 2026-09-14, storica**: canvas
  in iframe same-origin, store Zustand esposto per riferimento via `contentWindow`. §
  "Decisione" punti 1 e 3 (secondo `createRoot`, Sensor custom) sono superati da `ADR-72`; punti
  2 (store Zustand), 5 (isolamento CSS) e 6 (nessuna nuova dipendenza npm) restano vincolanti
  identici, non riaperti.
- `ADR-71-resize-handles-unita-dinamiche.md` — **approvata 2026-09-14**: maniglie di resize su
  props `unitValue` (px/%), nessun `kind` nuovo, `min`/`max` obbligatori per prop.
- `ADR-54-editor-isolato-rotta-studio.md` — rotta `/studio/:id`, invariata: l'iframe vive
  dentro `LayoutStudio`, non sostituisce la rotta.
- `ADR-42-tema-veste-il-sito-non-la-chrome-admin.md` § 5/6 — scoping CSS via variabili su
  classe radice, scheme chiaro forzato: si applica anche al documento dell'iframe.
- `ADR-32-navigator-editor-fullscreen.md` § 5 (vecchia numerazione) — vincolo di antenato
  comune per `DndContext`: superato solo per il ramo canvas-in-iframe da ADR-70, invariato per
  il resto della shell.
- `ADR-28-libreria-drag-and-drop.md` — `dnd-kit`, `moveNodeToAction`, `canDropInto`, stato di
  drag fuori dallo store: invariati, riusati dal Sensor custom di ADR-70.
- `ADR-17-state-management-zustand.md` — store singleton di modulo: invariato, esposto (non
  duplicato) al secondo contesto JS.
- `ADR-38-espansione-schema-stile-libero-parita-elementor.md` § 2 — `kind: 'unitValue'`,
  infrastruttura riusata da ADR-71.
- `ADR-39-blocco-container-flex-grid-nesting-ricorsivo.md`, `ADR-41-container-spaziatura-per-lato.md`
  — modello `container` flex/nesting ricorsivo: confermato status quo (Decisione 3 dell'RFC).
- `ADR-29-proprieta-di-stile-per-breakpoint.md` — chiavi `default`/`tablet`/`mobile`, soglie
  CSS: confermate invariate (Decisione 5 dell'RFC).
- `ADR-30-metadati-editor-registro.md` — `meta.props` obbligatorio per ogni prop nuova di
  ADR-71.

## Outcomes tecnici

Al termine dell'implementazione di questa spec esistono, nel frontend (`app/frontend`, nessun
impatto su `app/public-site` — questa spec è editor-only): un iframe same-origin che ospita il
canvas dei blocchi con un proprio entry point React, uno store Zustand esposto per riferimento
al contesto dell'iframe senza serializzazione, un `IframeBridgeSensor` che estende `dnd-kit`
per far funzionare il `DndContext` unico del documento padre attraverso il confine
dell'iframe, e maniglie di resize trascinabili su nuove props `unitValue` (`styleWidth`,
`styleHeight`, margini per lato) su `container`/`image`. Nessuna tabella nuova, nessun
endpoint nuovo: tutto il round vive nel bundle frontend e nello schema dei blocchi già
esistente (nuove props opzionali, nessun incremento di `v`).

## In scope

- Contratto dell'iframe same-origin e ciclo di caricamento del canvas (§ 1).
- Protocollo di sincronizzazione diretta dello store Zustand via `contentWindow` (§ 2).
- Modello ad albero Container/Widget per `@dnd-kit`, incluso il bridging cross-documento (§ 3).
- Overlay fluttuanti esistenti + maniglie di resize a valore dinamico px/% (§ 4).
- Mappa dei metadati di stile e regola di cascata per i breakpoint responsive, come
  riferimento vincolante per le nuove props (§ 5).

## Out of scope

- Qualunque tipo di blocco nuovo (`Row`, `Column`): la Decisione 3 dell'RFC conferma il
  modello `section`/`container` esistente, nessuna ADR lo apre.
- Rinominare la chiave `default` in `desktop` o introdurre soglie a 1024px: la Decisione 5
  dell'RFC conferma le soglie CSS esistenti (tablet ≤768px, mobile ≤480px).
- `unitValue` responsive (per-breakpoint): fuori scope per limite tecnico dichiarato in
  ADR-39 § 3, non riaperto da ADR-71.
- Unità `em`/`rem`/`vw`/`vh` pilotabili da maniglia: solo `px`/`%` (ADR-71 § 2).
- Iframe cross-origin, Shadow DOM: entrambe le alternative non selezionate nella firma umana.
- Un secondo `ReactDOM.createRoot()` per il canvas e un `IframeBridgeSensor` custom: previsti da
  `ADR-70` § "Decisione" punti 1 e 3, superati da `ADR-72` — non vengono scritti.

## Vincoli e assunzioni

1. **Same-origin non negoziabile.** L'`src` dell'iframe del canvas serve sempre dalla stessa
   origin dell'app admin. Nessuna configurazione futura deve permettere un URL con
   host/scheme/porta diversi senza riaprire ADR-70 da zero.
2. **Nessuna nuova dipendenza npm** (né `immer` né librerie di bridging iframe): il protocollo
   usa solo API standard del browser e l'API pubblica di `Sensor` di `dnd-kit` già installato.
3. **Un solo `DndContext`**, montato nel documento padre (`FullScreenEditorLayout`, invariato
   da ADR-32 § 1/5 vecchia numerazione). Il canvas in iframe non monta un secondo `DndContext`.
4. **Un solo store Zustand**, singleton nel documento padre. L'iframe non crea una seconda
   istanza né una copia — la legge per riferimento.
5. **`unitValue` resta con `min`/`max`/`units` obbligatori per prop** (ADR-38 § 2, confermato
   da ADR-71 § 2): "valore libero" nel titolo di quest'area copre la libertà dal token
   discreto, mai dal range dichiarato.
6. **Il gate di spike di `ADR-70` § 4 è superato con esito positivo** (`ADR-72`, 4/4 test
   Playwright verificati in sede di firma, 2026-09-14): i task del breakdown (§ Task breakdown)
   possono procedere. Resta comunque vincolante, non un dettaglio lasciato al momento della
   scrittura del codice, l'obbligo architetturale di `ADR-72` § "Decisione" punto 3 (funzione di
   misura cross-frame per `measuring.droppable/draggable.measure`) — si veda § 3.3.

---

## 1. Contratto dell'iframe same-origin e montaggio del Canvas via `createPortal`

> Riscritto per `ADR-72-canvas-iframe-portal-bridge.md` (supera `ADR-70` § "Decisione" punto 1).
> Nessun secondo `ReactDOM.createRoot()`, nessun secondo entry point/bundle Vite.

### 1.1 Struttura DOM

`LayoutStudio` (`/studio/:id`, ADR-54) monta, al posto dell'attuale `EditorCanvas` diretto, un
elemento `<iframe>` con un documento minimale e vuoto, mai un `src` verso un secondo entry point:

```html
<iframe
  id="cms-canvas-frame"
  srcDoc="<!doctype html><html><body><div id=&quot;canvas-root&quot;></div></body></html>"
  title="Canvas dei blocchi"
></iframe>
```

- `srcDoc` serve un documento same-origin minimale con un solo contenitore vuoto
  (`#canvas-root`) — nessun bundle JS proprio caricato dentro l'iframe: il contenuto viene
  portato dall'albero React del documento padre (§ 1.2).
- Nessun attributo `sandbox`: un `sandbox` senza `allow-same-origin` esplicito degraderebbe
  l'iframe a origin opaca. Se in futuro serve restringere altre capacità, va valutato
  singolarmente contro questo vincolo, non aggiunto per default.
- Dimensioni: `width: 100%; height: 100%` dentro il contenitore canvas esistente di
  `FullScreenEditorLayout`; lo switcher `activeViewport` (ADR-32 § 2 vecchia numerazione)
  continua a governare solo la larghezza del contenitore che ospita l'iframe, mai l'iframe
  stesso a piena area.

### 1.2 Ciclo di montaggio

1. `LayoutStudio` monta l'`<iframe>` con `srcDoc` statico.
2. Sull'evento `load` dell'`<iframe>` (mai prima: `contentDocument` non è affidabile prima di
   questo evento), il documento padre ottiene
   `iframe.contentDocument.getElementById('canvas-root')`.
3. Quel nodo diventa il container di
   `ReactDOM.createPortal(canvasTree, container)`, **dentro lo stesso albero React** già montato
   nel documento padre (figlio di `LayoutStudio`/`FullScreenEditorLayout`) — un solo
   `ReactDOM.createRoot()` per l'intera app, nessun secondo root, nessun bundle separato.
   `canvasTree` è lo stesso componente `EditorBlockWrapper` e discendenti già usati oggi, stesso
   codice sorgente, non duplicato.
4. Se il container non è raggiungibile al `load` (caso limite, stesso documento `srcDoc` sempre
   same-origin per costruzione): il canvas mostra uno stato di errore esplicito, mai un canvas
   vuoto silenzioso — coerente con la regola generale "mai overwrite/stato silenzioso" già in
   vigore per l'editor (ADR-54 § "Alternative scartate").

### 1.3 Isolamento CSS ereditato

Il documento dell'iframe applica lo stesso meccanismo di ADR-42 § 5: `generateThemeCss` riceve
come `selector` la radice del documento iframe (es. `:root` di quel documento, essendo un
documento dedicato non serve più scopare su una classe), scheme chiaro forzato (ADR-42 § 6).
Il CSS Module dei blocchi (`style-tokens.module.css`, alias `@blocks`) è importato dal bundle
`studio-canvas.entry.tsx` esattamente come oggi da `EditorCanvas` — stesso file, stesso
contratto di classi, nessuna duplicazione di foglio stile.

---

## 2. Protocollo di sincronizzazione diretta dello store Zustand

### 2.1 Scambio all'evento `load`

```typescript
// LayoutStudio.tsx, handler onLoad dell'<iframe>
function handleCanvasFrameLoad(frame: HTMLIFrameElement) {
  const canvasWindow = frame.contentWindow as CanvasWindow | null;
  if (!canvasWindow) {
    setCanvasBridgeError('unreachable');
    return;
  }
  canvasWindow.__CMS_EDITOR_STORE__ = useBlockEditorStore;
  canvasWindow.__CMS_EDITOR_BRIDGE_READY__ = true;
}
```

- `useBlockEditorStore` è la **stessa** funzione hook/istanza già esportata da
  `app/frontend/src/hooks/useBlockEditorStore.ts` (ADR-17): non viene creata una seconda
  definizione, viene esposta quella esistente.
- `__CMS_EDITOR_STORE__`/`__CMS_EDITOR_BRIDGE_READY__` sono le uniche due proprietà globali
  introdotte su `contentWindow`, dichiarate in un file di tipi dedicato
  (`studio-canvas-bridge.types.ts`) — nessuna proprietà `window` aggiuntiva senza passare da lì.

### 2.2 Lettura lato canvas

```typescript
// studio-canvas.entry.tsx
function useCanvasStore<T>(selector: (state: BlockEditorState) => T): T {
  const store = (window as CanvasWindow).__CMS_EDITOR_STORE__;
  if (!store) {
    throw new Error('Canvas montato prima dello scambio col documento padre');
  }
  return store(selector);
}
```

- Stesso vincolo di ADR-17 § "Regole di adozione" punto 2: ogni consumer nel canvas usa un
  selettore mirato, mai il destructuring dell'intero store — la regola di conformità
  esistente (`grep -rnE "const \{[^}]+\} = use[A-Za-z]+Store\(\)"`) si estende a
  `studio-canvas.entry.tsx`.
- Le azioni (`moveNodeToAction`, `updatePropAction`, `addBlockAction`, …) sono lette dallo
  stesso store: chiamarle dal contesto iframe muta l'unica istanza nel documento padre, che
  notifica tutti i consumer (palette, ispettore, navigator) con lo stesso meccanismo di
  sottoscrizione Zustand già in uso — nessun evento cross-documento da orchestrare a mano.

### 2.3 Cosa NON attraversa il confine

- **Nessun valore serializzato.** Non esiste un payload JSON scambiato: l'unico scambio è il
  riferimento alla funzione store, una volta, al caricamento.
- **Nessun `postMessage`** per lo stato dei blocchi. `postMessage` resta disponibile come API
  di piattaforma ma questo protocollo non lo usa per il ponte di stato (lo userebbe solo, se
  mai servisse, per segnali di ciclo di vita come "canvas pronto"/"canvas in errore", fuori
  scope di questa spec).
- **Nessuna copia di `immer`**: gli update restano quelli già esistenti nello store (Zustand
  `set` diretto), nessun cambio al modo in cui le azioni mutano lo stato.

### 2.4 Smontaggio

Allo smontaggio di `LayoutStudio` (uscita da `/studio/:id`), il riferimento su
`contentWindow` sparisce con la distruzione dell'iframe stesso — nessuna pulizia esplicita
richiesta lato store padre, che resta un singleton di modulo invariato (ADR-17).

---

## 3. Modello ad albero dei nodi Container/Widget per `@dnd-kit`

### 3.1 Albero: nessun tipo nuovo

Confermato dalla Decisione 3 dell'RFC: l'albero resta quello già approvato.

- **`section`** — contenitore di primo livello, colonne CSS Grid non indirizzabili per figlio
  (`ADR-31` vecchia numerazione).
- **`container`** — layout flex, nesting ricorsivo via sentinel `children.allow: '*'`
  (ADR-39/41), annidabile in `section`, in un altro `container` o a radice.
- **"Widget"** — gli altri tipi già registrati (`heading`, `richText`, `image`, `button`, e i
  tipi successivi: `accordion`/`carousel`/`tabs`/`form`/altri in
  `app/backend/src/blocks/types/`), foglie o contenitori a seconda del proprio
  `children.allow` dichiarato nel registro.

Nessun tipo `Row` o `Column` con figli assegnati per slot: `container` con
`flexDirection: 'row'` resta l'unico modo di ottenere un layout a riga.

### 3.2 Ammissibilità del drop

Invariato da ADR-28 § 5: un predicato puro `canDropInto(tree, dragId, targetParentId)` compone
il controllo di discendenza di `moveNodeTo` con `canContainType` di
`block-registry.utils.ts`. Il canvas in iframe non introduce una seconda sede per questa
regola — resta l'unica, importata dallo stesso modulo sia dal bundle admin sia dal bundle
`studio-canvas.entry.tsx`.

### 3.3 Bridging di `@dnd-kit` attraverso il confine iframe

> Riscritto per `ADR-72-canvas-iframe-portal-bridge.md` (supera `ADR-70` § "Decisione" punto 3).
> Nessun `Sensor` custom.

Il `DndContext` resta unico, montato in `FullScreenEditorLayout` nel documento padre (vincolo
invariato di ADR-32 § 5 vecchia numerazione per la parte "un solo `DndContext`"). Sorgente
(`WidgetPalette`, nel documento padre) e alcune destinazioni (`EditorBlockWrapper`, portato nel
documento dell'iframe via `createPortal`, § 1.2) non condividono più un `document` fisico, ma
`useDraggable`/`useDroppable` sui nodi portati si registrano comunque con lo stesso
`DndContext`/`InternalContext` del padre per costruzione: il Context React attraversa il confine
del `document` perché la propagazione segue l'albero Fiber, non il documento fisico in cui il
DOM portato finisce (verificato in `PLAN-F04-dnd-iframe-portal-spike.md` § "Risultato" punto 1).
Nessun `IframeBridgeSensor` da scrivere: Chromium recapita nativamente tutti gli eventi
`pointermove`/`pointerup` successivi a un `pointerdown` con bottone premuto al document che ha
ricevuto il `pointerdown` iniziale (cattura implicita del puntatore), indipendentemente da dove
il cursore si trovi visivamente — il `PointerSensor` nativo già montato dal `DndContext` del
padre riceve quindi da solo tutti gli eventi necessari.

**Obbligo architetturale (non un dettaglio implementativo, `ADR-72` § "Decisione" punto 3):** la
prop `measuring` di `DndContext` (`MeasuringConfiguration`, API pubblica di `@dnd-kit/core`, non
un'estensione non documentata) deve sostituire `measuring.droppable.measure` e
`measuring.draggable.measure` con una funzione che:

1. usa `element.getBoundingClientRect()` come base (nessuna reimplementazione della geometria
   nativa);
2. quando l'`ownerDocument` dell'elemento misurato differisce dal documento di riferimento del
   drag attivo, somma (o sottrae, per la direzione opposta) l'offset di
   `iframe.getBoundingClientRect()` prima di restituire il rettangolo;
3. determina il documento di riferimento del drag attivo dall'origine del nodo trascinato (es.
   convenzione `new-block:` già in uso da `WidgetPalette` per i nuovi blocchi), non da uno stato
   globale mutabile fuori dal ciclo di vita del drag.

Senza questa traduzione ogni drag che attraversa il confine iframe↔padre risolve sempre `over:
null` (collisione mai rilevata): il rettangolo dei nodi droppable dentro l'iframe viene misurato
di default nel sistema di riferimento locale dell'iframe, mai tradotto nell'offset del suo
riquadro nella pagina padre, mentre il puntatore arriva con coordinate assolute nel viewport
della pagina padre — due sistemi di riferimento incompatibili confrontati come fossero lo stesso
(causa isolata in `PLAN-F04-dnd-iframe-portal-spike.md` § "Addendum 2", fix verificato con mouse
reale, 4/4 test Playwright, `e2e/tests/spike-dnd-iframe-portal-bridge.spec.ts`). Nessuna nuova
azione né modifica a `moveNodeToAction`/`canDropInto` (§ 3.2).

### 3.4 Linea di inserimento e stato di rifiuto

Invariato da ADR-28 § 6: la linea di inserimento resta uno pseudo-elemento sulla zona di
rilascio, mai un nodo nel DOM dell'albero — vale identico nel documento dell'iframe, nessuna
eccezione introdotta da questa spec.

### 3.5 Gate di spike — superato

Il gate imposto da `ADR-70` § 4 è **superato con esito positivo**: `ADR-72`, firmata 2026-09-14,
formalizza l'esito scritto di `PLAN-F04-dnd-iframe-portal-spike.md` (createPortal + funzione di
misura cross-frame, § 3.3), verificato in sede di firma con 4/4 test Playwright reali (mouse via
CDP). I task di implementazione di § 3.3 possono procedere.

**Rischi residui non coperti da questo gate**, da chiudere nel round di implementazione o con
una spike dedicata separata (`ADR-72` § "Conseguenze"):
- Scroll automatico del canvas durante un drag (`FullScreenEditorLayout.tsx:392,412` ascolta
  `pointermove` su `window`, che non attraversa il confine dell'iframe verso il padre).
- Il sensore da tastiera per il riordino nel canvas è già rotto oggi in produzione,
  indipendentemente da questa spec (`FullScreenEditorLayout.tsx` righe 335-338/513,
  `collisionDetection={pointerWithin}` senza `coordinateGetter` custom) — debito preesistente,
  non introdotto né risolto qui, da registrare in `docs/TODO.md`.
- Scroll/zoom del documento padre durante un drag attivo: solo l'offset statico dell'iframe è
  stato validato con mouse reale.

---

## 4. Overlay fluttuanti e maniglie di ridimensionamento

### 4.1 Continuità (invariato)

Confermato dalla RFC come "continuità, non conflitto": `BlockHoverOverlay.tsx`,
`InlineFloatingToolbar.tsx`, l'action bar generica (drag/seleziona padre/duplica/elimina) e la
linguetta di `section` restano invariati. Con il canvas in iframe, questi componenti React
restano montati **nello stesso documento del contenuto che sormontano** (dentro
`studio-canvas.entry.tsx`), non nel documento padre — un overlay che vive in un documento e
misura elementi nell'altro richiederebbe la stessa traduzione di coordinate di § 3.3, complessità
non giustificata quando l'overlay può semplicemente vivere accanto al contenuto che misura.

### 4.2 Maniglie di resize (ADR-71)

Nuovo controllo `ResizeHandle.tsx`, montato dentro `studio-canvas.entry.tsx` (stesso motivo di
§ 4.1: misura `getBoundingClientRect()` di elementi del proprio documento). Contratto:

```typescript
interface ResizeHandleProps {
  blockId: string;
  propName: 'styleWidth' | 'styleHeight' | 'styleMarginTop' | 'styleMarginBottom'
    | 'styleMarginLeft' | 'styleMarginRight';
  axis: 'horizontal' | 'vertical';
  min: number; // dal PropSpec dichiarato, mai un valore hardcoded nel componente
  max: number;
  units: readonly ['px', '%'];
}
```

- Il componente legge `min`/`max`/`units` dal registro (via lo stesso hook di risoluzione
  `PropSpec` usato da `PropertyInspector.tsx`, ADR-30 § 5), mai da una costante duplicata nel
  componente della maniglia — un solo posto dichiara i limiti (ADR-38 § 2).
- Durante il trascinamento, il delta in pixel del puntatore si converte nell'unità attiva
  della prop: diretto per `px`, relativo a `getBoundingClientRect()` del contenitore padre per
  `%`. Lo stato del delta corrente **non** entra nello store Zustand finché il rilascio non
  avviene (stesso vincolo di ADR-28 § 3 per lo stato di drag).
- Al rilascio, la maniglia chiama `updatePropAction(blockId, propName, { value, unit })` —
  azione esistente, nessuna azione nuova nello store (ADR-71 § 5).
- Clamping: un valore che il trascinamento produce fuori da `[min, max]` viene troncato al
  limite più vicino **prima** di chiamare `updatePropAction` — il validator server-side
  (`block-tree-validator.service.ts`) resta comunque l'autorità finale (ADR-21), questo
  clamping è solo UX, non sostituisce la validazione.

### 4.3 Props coperte in questo round

Da ADR-71 § 3: `styleWidth`/`styleHeight` (nuove, `container`/`image`) e le quattro props di
margine per lato (nuove, sui tipi che già hanno `styleSpaceBefore/After`). Ogni prop dichiara
la propria voce `meta.props` (label, tab `'style'`, ADR-30 § 4) — il test di invariante del
registro si estende naturalmente, deve restare verde.

---

## 5. Mappa dei metadati di stile e override per i breakpoint responsive

### 5.1 Stato confermato, nessuna modifica

Decisione 5 dell'RFC: nessuna modifica alle soglie o alle chiavi esistenti. Riferimento
vincolante (invariato da `ADR-29-proprieta-di-stile-per-breakpoint.md` § 2 e
`SPEC-F04-grid-responsive-engine.md` § 1):

| Chiave envelope | Soglia CSS | Semantica |
|---|---|---|
| `default` | nessuna soglia propria — si applica sopra la soglia `tablet` | **Rappresenta il desktop**: è il valore che vale ovunque non sia sovrascritto da `tablet`/`mobile`. Non viene rinominato `desktop` (ADR-29 § 2: eviterebbe l'apertura a un quarto nome `wide`). |
| `tablet` | `max-width: 768px` | Sovrascrive `default` sotto quella soglia, se presente. |
| `mobile` | `max-width: 480px` | Sovrascrive `tablet`/`default` sotto quella soglia, se presente. |

Questa tabella è la mappa vincolante citata nel task che ha originato questa spec: **non
esiste, e questa spec non introduce, alcun valore numerico "1024px"** associato a "desktop" —
la richiesta originale che lo proponeva è stata verificata contro questa mappa e corretta in
sede di firma (RFC-F04e § "Decisione umana", Decisione 5, nota).

### 5.2 Props di ADR-71 rispetto a questa mappa

Le nuove props `unitValue` (§ 4.3) **non** partecipano a questa mappa: restano scalari, non
`responsive` (ADR-71 § 4, stesso limite tecnico di ADR-39 § 3 — `unitValue` non ha il
modificatore `responsive?: boolean` che `EnumPropSpec` ha da ADR-29 § 3). Una maniglia di
resize scrive quindi lo stesso identico valore indipendentemente dal viewport simulato
nell'editor (`activeViewport`, ADR-32 § 2 vecchia numerazione) — non un gap di questa spec, un
limite già dichiarato ed ereditato.

### 5.3 Cascata (invariata, per riferimento)

Una sola direzione, implementata in un solo punto (le media query di
`style-tokens.module.css`): `mobile` assente ricade su `tablet`; `tablet` assente ricade su
`default`. Il renderer emette una classe per ogni breakpoint **presente nel valore salvato**,
mai solo `default` (ADR-29 Conseguenza) — vale per ogni prop `responsive: true` esistente,
non toccata da questa spec.

---

## Task breakdown

- [x] **T0 — Spike di verifica (gate, non un task di feature)**: superato con esito positivo,
      formalizzato in `ADR-72` (2026-09-14, 4/4 test Playwright verificati in sede di firma).
      Rischi residui non coperti (scroll automatico, sensore da tastiera, scroll/zoom del padre)
      restano aperti, vedi § 3.5.
- [ ] T1 — Frontend: montaggio del canvas nell'iframe via `ReactDOM.createPortal` (§ 1.2),
      nessun secondo entry point/bundle Vite.
- [ ] T2 — Frontend: scambio store al `load` dell'iframe (§ 2.1/2.2), tipi
      `studio-canvas-bridge.types.ts`.
- [ ] T3 — Frontend: funzione di misura cross-frame per `measuring.droppable/draggable.measure`
      di `DndContext` (§ 3.3), integrazione nel `DndContext` esistente di
      `FullScreenEditorLayout` — nessun `Sensor` custom.
- [x] T4 — Frontend: `ResizeHandle.tsx` (§ 4.2), generalizzato accanto alla maniglia esistente
      di `container.styleFlexBasis` (`components/ContainerResizeHandle.tsx`, invariata).
      Verificato già implementato e committato (`160ddd7`, 2026-09-14), firma di registrazione
      in `RFC-63-fase4-sidebar-widget-pannello-proprieta.md` § "Decisione umana" Decisione 3
      (2026-09-14).
- [x] T5 — Backend: nuove props `unitValue` su `container`/`image` e margini per lato (§ 4.3),
      `meta.props` per ciascuna. Verificate presenti in `app/backend/src/blocks/types/*.block.ts`
      (`button`/`container`/`heading`/`section`/`image`/`rich-text`), stesso commit di T4.
- [x] T6 — Frontend: collegare `ResizeHandle.tsx` alle nuove props di T5, via
      `resolveResizePropSpec`/`updateBlockPropsAction` in `EditorBlockWrapper.tsx`. Stesso
      commit di T4/T5.
- [ ] T7 — Test Engineer: copertura Jest/Playwright per bridging cross-iframe (drag da palette
      a canvas, riordino dentro canvas, resize handle), contract test Bruno per le nuove props.

## Criteri di verifica

- Un drag avviato da `WidgetPalette` (documento padre) e rilasciato dentro il canvas
  (documento iframe) inserisce il blocco nella posizione corretta, con la stessa azione
  `addBlockAction` già esistente — nessuna regressione sul percorso attuale (stesso documento).
- Il sensore da tastiera per il riordino resta funzionante con il canvas in iframe (ADR-28 §
  "Conseguenza": è la via di copertura e2e deterministica, non regredibile).
- Una maniglia di resize su `styleWidth`/`styleHeight`/margini scrive un valore dentro
  `[min, max]` dichiarati; un tentativo di trascinamento oltre il limite produce un valore
  clampato, mai un valore fuori range accettato dal validator.
- Nessuna proprietà globale oltre `__CMS_EDITOR_STORE__`/`__CMS_EDITOR_BRIDGE_READY__` compare
  su `contentWindow` dell'iframe (verifica manuale/lint mirato).
- `grep -rn "postMessage"` nel percorso del ponte di stato (`studio-canvas.entry.tsx`,
  `LayoutStudio.tsx`) non deve comparire per lo scambio dei blocchi — solo, se presente,
  per segnali di ciclo di vita fuori scope di questa spec.
- `npm run test` e `tsc --noEmit` senza errori su `app/frontend` dopo ogni task del breakdown.
