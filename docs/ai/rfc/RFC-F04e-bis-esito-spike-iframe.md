# RFC-F04e-bis — Esito negativo della spike `IframeBridgeSensor`, riapertura di RFC-F04e Decisione 1

## Status
[ ] In discussione · [x] **Approvato** → autorizza Spike T2 (Portale React), nessuna nuova ADR ancora · [ ] Rifiutato

## Proposto da
AI Orchestrator (via sessione interattiva) · Data: 2026-09-14

## Addendum a
`docs/ai/rfc/RFC-F04e-super-elementor.md` — Decisione 1 (Isolamento del canvas) e Decisione 2
(Ponte di stato), esito firmato il 2026-09-14 con opzione (c) "Iframe + ponte di stato,
vincolato a Same-Origin", formalizzata in `docs/ai/adr/ADR-70-canvas-iframe-isolation-zustand-sync.md`.

---

## Problema

`ADR-70-canvas-iframe-isolation-zustand-sync.md` § "Decisione" punto 4 impone, come
"Prerequisito vincolante prima di qualunque task di implementazione", una spike che verifichi
se un `IframeBridgeSensor` custom possa far funzionare `@dnd-kit/core` (v6.3.1, già installato,
ADR-28) attraverso un iframe same-origin, secondo l'architettura descritta al punto 3 della
stessa ADR: canvas montato in un **secondo root React separato** dentro l'iframe, **un solo
`DndContext`** nel documento padre, un Sensor custom come ponte.

Quella spike è stata eseguita — PoC reale in `app/frontend/src/spikes/dnd-iframe-bridge/`,
eseguito con `npm run dev` + Puppeteer (non solo ispezione statica) — e il suo esito completo è
registrato in `docs/ai/plans/PLAN-F04-dnd-iframe-spike.md`. **Esito: negativo, gate non
superato.**

### Cosa ha dimostrato la spike

1. **Scenario riordino interno al canvas** — un drag avviato su un blocco renderizzato nel root
   React separato dell'iframe non viene mai riconosciuto da `dnd-kit`:
   `window.__SPIKE_DND_EVENTS__` resta `[]` per l'intera sequenza pointerdown→pointermove→
   pointerup, nonostante l'evento DOM nativo arrivi correttamente al nodo (log
   `pointerdown-on-block` confermato) e `IframeBridgeSensor` catturi e traduca correttamente le
   coordinate (`PLAN-F04-dnd-iframe-spike.md` § "Risultato — Scenario (b)").
2. **Scenario drag dalla palette (padre) verso il canvas (iframe)** — `onDragStart` si attiva
   correttamente nel documento padre, ma `iframe-canvas-root` (`useDroppable`) resta
   `isOver=false` per tutta la sequenza e **nessun `onDragEnd` viene mai emesso**: il drag resta
   bloccato in stato "attivo" a tempo indefinito, uno stato incoerente che in produzione
   lascerebbe l'utente con un `DragOverlay` fantasma (`PLAN-F04-dnd-iframe-spike.md` §
   "Risultato — Scenario (a)").
3. **Causa radice, a livello di codice, non di tuning**: `useDraggable`/`useDroppable` leggono
   `InternalContext` di `dnd-kit` via `useContext` (`node_modules/@dnd-kit/core/dist/
   core.esm.js:3387` e seguenti). Quel Context **non propaga fra due `ReactDOM.createRoot()`
   distinti** — è un vincolo strutturale di React (propagazione del Context lungo il fiber tree),
   indipendente da same-origin/stesso `window`/stesso modulo JS. Ogni `useDraggable`/
   `useDroppable` eseguito nel root separato dell'iframe riceve sempre
   `defaultInternalContext` (`dispatch: noop`, `activators: []`, `draggableNodes: new Map()`
   locale — `core.esm.js:2545-2558`). Non esiste, nella superficie pubblica del pacchetto, un'API
   imperativa "avvia un drag per questo id" che un Sensor possa invocare da fuori quel
   meccanismo (`core.esm.js:3177-3202`, `bindActivatorToSensorInstantiator` — legato a nodi già
   registrati in `draggableNodes` della vera istanza).

### Conseguenza dichiarata su ADR-70

**`ADR-70-canvas-iframe-isolation-zustand-sync.md` § "Decisione" punto 3 non è implementabile
come scritto.** Non è un problema di come è stato scritto `IframeBridgeSensor`, né di latenza o
di un dettaglio implementativo del Sensor: è un vincolo strutturale di React che nessuna
combinazione di API standard del browser aggira. `IframeBridgeSensor` cattura e traduce
correttamente gli eventi nativi (questa parte funziona, confermata sopra) — ma "inoltrarli al
protocollo di attivazione che dnd-kit espone per un Sensor custom" presuppone un protocollo che
richiede nodi già registrati in un `draggableNodes` che, nel root separato dell'iframe, non è
mai lo stesso Map dell'istanza reale del padre.

Per `docs/constitution.md` § Documentation Policy ("Modificare una ADR già approvata" è un
divieto assoluto), **ADR-70 resta storica e non viene toccata**: registra correttamente il
contesto e il vincolo del 2026-09-14, incluso il proprio gate al punto 4, che ha fatto
esattamente il suo lavoro (ha impedito che si scrivesse codice di feature su un'architettura
non verificata). Quello che serve ora è una decisione su come proseguire, non una correzione del
testo di ADR-70.

Non è invece invalidata da questa spike la parte di ADR-70 relativa al ponte di stato Zustand
(§ "Decisione" punto 2): `PLAN-F04-dnd-iframe-spike.md` § "Cosa NON è il problema" conferma che
l'esposizione dello store per riferimento via `contentWindow` non ha lo stesso problema del ponte
`dnd-kit`, perché non dipende dal Context React ma da un semplice assegnamento di proprietà su
un oggetto `window`. Non è oggetto di questa riapertura.

---

## Soluzione proposta

Due sole opzioni, mutuamente esclusive, sottoposte alla stessa disciplina di firma di
RFC-F04e: nessuna viene scelta da un ruolo AI.

### Opzione (A) — Spike dedicata sul meccanismo "Portale React" prima di qualunque nuova ADR

Sostituire il "secondo root/entry point nell'iframe" prescritto da ADR-70 § "Decisione" punto 1
con un `ReactDOM.createPortal` che mantiene il contenuto del canvas **nello stesso albero React**
del documento padre (stesso `DndContext` reale, stesso `InternalContext` di `dnd-kit`, nessun
Sensor custom necessario per il ponte drag) e ne porta solo l'output DOM dentro
`iframe.contentDocument`, tramite
`createPortal(canvasTree, iframeDoc.getElementById('root'))`.

Questo meccanismo **non è una variante a basso rischio** del Sensor bocciato: sposta il
problema, non lo elimina per definizione. React 19 delega gli eventi nativi al *root container*
passato a `createRoot` (non a `document` come nelle versioni pre-17); se quel root container
resta nel documento padre mentre il contenuto portato vive fisicamente in
`iframe.contentDocument`, resta da verificare se un evento nativo che avviene fisicamente
nell'iframe raggiunga comunque il punto di ascolto del root — è la stessa famiglia di problema
(confine di `document`/browsing context) che ha appena bocciato l'opzione attuale, spostata dal
layer "Context React" al layer "delega eventi DOM nativi".

**Questa opzione richiede quindi una spike propria**, con lo stesso rigore empirico di
`PLAN-F04-dnd-iframe-spike.md` (PoC reale con `npm run dev` + Puppeteer/CDP, non solo lettura di
sorgente), **prima** di scrivere qualunque nuova ADR che formalizzi il meccanismo. Solo un esito
scritto positivo di quella spike autorizzerebbe una ADR di superamento di ADR-70 (numerazione
successiva, es. ADR-72). Cambierebbe `SPEC-F04-super-elementor.md` § 1 e § 3.

### Opzione (B) — Chiudere il ramo iframe, tornare allo status quo

Tornare all'opzione (a) già valutata (e non scelta) in `RFC-F04e-super-elementor.md` §
Decisione 1: nessuna modifica al meccanismo di isolamento del canvas. `ADR-54-editor-isolato-
rotta-studio.md` (rotta `/studio/:id`, un solo documento) + `ADR-42-tema-veste-il-sito-non-la-
chrome-admin.md` § 5 (isolamento CSS via variabili scopate su una classe radice, non via
confine di motore di rendering) restano il meccanismo. `ADR-70` e la parte "canvas in iframe" di
`ADR-71-resize-handles-unita-dinamiche.md` (il collegamento di `ResizeHandle.tsx` a
`studio-canvas.entry.tsx`, § 4.2 di `SPEC-F04-super-elementor.md`) vengono marcate **non
proseguite**: non superate da una nuova ADR (nessun errore da correggere nel loro testo storico
sul punto in cui restano corrette — l'esposizione dello store via `contentWindow` di ADR-70 § 2
è verificata funzionante), semplicemente il ramo di lavoro che ne dipende si ferma qui.

Non richiede alcuna nuova ADR: è un rientro nello status quo già descritto come opzione (a) in
RFC-F04e, il cui limite dichiarato resta "isolamento per convenzione, non per confine di motore
di rendering — nessun incidente concreto lo ha dimostrato" (RFC-F04e § Decisione 1, opzione a).

---

## Alternative valutate (considerate, non sottoposte a firma in questo documento)

- **Restringere l'iframe a parti non-interattive del canvas** (es. anteprima statica), con
  editing/drag-and-drop che restano nel documento padre — menzionata in
  `PLAN-F04-dnd-iframe-spike.md` § "Opzioni percorribili" punto 3. Non è offerta per la firma qui
  perché cambierebbe il perimetro della feature stessa (non più "canvas interattivo isolato" ma
  un ibrido a due motori di rendering per lo stesso albero a seconda dell'interattività) — una
  variazione di questa portata andrebbe valutata con una RFC a sé, non come terza opzione di
  questo addendum.
- **Fork/patch di `dnd-kit` per supporto cross-frame nativo** — già scartata in ADR-70 §
  "Alternative valutate" come over-engineering e in contrasto con il vincolo "nessuna nuova
  dipendenza npm" (che coprirebbe anche un fork interno mantenuto come pseudo-dipendenza); nulla
  di quanto emerso dalla spike cambia quella valutazione.

---

## Impatto

- **Se (A)**: nessun task di implementazione di F04e parte; si apre solo una nuova spike, con lo
  stesso perimetro isolato (`src/spikes/`, rotta dev non linkata) della precedente. Un esito
  negativo di questa seconda spike riporterebbe automaticamente la scelta su (B), senza bisogno
  di un terzo giro di firma, essendo le due opzioni già mutuamente esclusive e complete.
- **Se (B)**: `SPEC-F04-super-elementor.md` § 1-3 vanno marcate come non proseguite (aggiornamento
  di stato del documento, non riscrittura silenziosa: resta traccia di cosa era stato
  prescritto e perché non si è proseguito). Nessun impatto sul backend, su `app/public-site` o
  sullo schema dei blocchi.
- **In entrambi i casi**: la Decisione 4 di `RFC-F04e-super-elementor.md` (maniglie di resize,
  `ADR-71`) **non dipende tecnicamente da questa riapertura**. Il meccanismo descritto in
  ADR-71 § "Decisione" punto 5 (delta di trascinamento, `getBoundingClientRect()`,
  `updatePropAction`) non richiede che il canvas viva in un iframe — gli stessi componenti
  citati come "continuità" in `SPEC-F04-super-elementor.md` § 4.1 (`BlockHoverOverlay.tsx`,
  `InlineFloatingToolbar.tsx`) vivono oggi nel canvas attuale, senza iframe. Il lavoro di
  schema (nuove props `unitValue`) e di UI del resize handle può procedere sul canvas esistente
  indipendentemente dall'esito di (A)/(B); solo la collocazione finale di `ResizeHandle.tsx`
  dentro `studio-canvas.entry.tsx` (§ 4.2 della SPEC) è condizionata dalla scelta qui sopra.

---

## Rischi

- **Opzione (A)** rischia di consumare una seconda spike per arrivare comunque a un esito
  negativo, se il sistema di delega eventi di React 19 si rivelasse anch'esso legato al confine
  di `document` — un rischio reale, non ipotetico di comodo, perché è la stessa classe di
  vincolo (browsing context separato) che ha appena bocciato il meccanismo attuale, non un
  dettaglio distinto.
- **Opzione (B)** rinuncia all'isolamento DOM/CSS strutturale che aveva motivato la firma
  originale su RFC-F04e Decisione 1 (c), tornando a un isolamento "per convenzione" (classe CSS
  + scope esplicito, ADR-42 § 5) il cui limite era già dichiarato in RFC-F04e come teorico e
  non osservato in un incidente concreto — chi firma valuta se quel limite resta accettabile ora
  che il costo per rimuoverlo si è rivelato più alto del previsto.

---

## Decisione umana

**Decisione 1-bis — Prosecuzione del ramo iframe dopo l'esito negativo della spike**
**Esito**: [x] (A) Autorizzare una spike dedicata sul meccanismo "Portale React"
(`ReactDOM.createPortal`) prima di qualunque nuova ADR · [ ] (B) Chiudere il ramo iframe,
tornare allo status quo (ADR-54+ADR-42), marcare `ADR-70`/la parte "canvas in iframe" di
`ADR-71` come non proseguite · [ ] Rinviato

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-14

**Azione successiva**: [x] Se (A): genera `PLAN-F04-dnd-iframe-portal-spike.md` · [ ] Se (B):
aggiorna `SPEC-F04-super-elementor.md` § 1-3 e chiude formalmente il ramo · [ ] Archivio

---

## Nota fuori dalla decisione — debito preesistente scoperto per riflesso

La spike ha verificato per ispezione del codice esistente (non ri-testato empiricamente in
questo PoC, perché irrilevante rispetto al blocco che impedisce l'avvio stesso del meccanismo)
che il **sensore da tastiera per il riordino nel canvas è già rotto oggi in produzione,
indipendentemente da F04e e dall'iframe**: `FullScreenEditorLayout.tsx` usa
`collisionDetection={pointerWithin}` (righe 335-338, 513) che richiede coordinate del puntatore
(`getEventCoordinates`), mai fornite da un `KeyboardEvent`, senza che venga passato un
`coordinateGetter` custom a `KeyboardSensor` (riga 337) per compensare. Nessun test e2e lo
esercita con successo oggi: l'unico helper esistente,
`e2e/tests/helpers/page-editor.ts:600-639` (`dragBlockToZone`), non ha alcun chiamante
funzionante (`PLAN-F04-dnd-iframe-spike.md` § "Sensore da tastiera esistente").

Questo non è materia di questa RFC (riguarda il canvas attuale, non l'isolamento in iframe) e
non viene aperto qui come voce di debito: va registrato come voce a sé in `docs/TODO.md`, in
contraddizione con lo stato "F04 Done, drag & drop reale con sensore da tastiera" dichiarato in
`docs/roadmap.md` § F04 e `docs/TODO.md` voci 2.4/3.11/3.12.
