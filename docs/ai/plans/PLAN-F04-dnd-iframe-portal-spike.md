# Plan — Spike Portale React (`ReactDOM.createPortal`), Opzione (A) di RFC-F04e-bis

## Esito

**PARZIALMENTE POSITIVO — il vincolo strutturale critico è eliminato, la verifica end-to-end
resta incompleta per limite dello strumento di automazione disponibile in questa sessione.**

Il rischio che questa spike doveva verificare (`RFC-F04e-bis` righe 96-103: "resta da
verificare se un evento nativo che avviene fisicamente nell'iframe raggiunga comunque il punto
di ascolto del root") è **risolto positivamente**: `useDraggable`/`useDroppable` eseguiti su
nodi il cui DOM reale vive dentro `iframe.contentDocument` (via `createPortal`, nessun secondo
root) si registrano correttamente con lo stesso `DndContext`/`InternalContext` del documento
padre — provato empiricamente e a livello di codice sorgente, § "Risultato" punto 1. Questo è
l'esatto opposto dell'esito di T1, dove `InternalContext` non si propagava mai.

Non è invece stato possibile produrre, con gli strumenti di questa sessione, una verifica
affidabile del completamento del ciclo (`onDragEnd`) su una sequenza di drag sintetica — **ma
lo stesso sintomo si riproduce identico anche nel caso di controllo senza alcun iframe** (§
"Risultato" punto 2), il che esclude che sia un difetto del meccanismo Portale e lo qualifica
come limite dello strumento di verifica disponibile (nessun input mouse reale via CDP in questa
sessione — stessa classe di limite già dichiarata in `PLAN-F04-dnd-iframe-spike.md` § "Nota di
metodo", qui più marcata perché ha impedito la chiusura del ciclo anche nel caso di controllo).

**Non autorizza da solo una nuova ADR**: `RFC-F04e-bis` § "Soluzione proposta" Opzione (A)
richiede un "esito scritto positivo" prima di una ADR di superamento — questo esito è positivo
sul punto strutturale che l'Opzione (A) doveva chiarire, ma non ancora una verifica end-to-end
completa. § "Prossimo passo raccomandato" propone come chiuderlo.

**Aggiornamento 2026-09-14** — il punto 1 di "Prossimo passo raccomandato" è stato eseguito con
mouse reale (Playwright, non più solo eventi sintetici): vedi § "Addendum — turno di verifica
supplementare con mouse reale" in fondo a questo file. Risultato: non un "positivo" pieno né un
negativo — riordino interno al canvas confermato funzionante, inserimento dalla palette esterna
confermato **non** funzionante (causa isolata, diversa da quella di T1).

**Aggiornamento 2 — 2026-09-14** — su richiesta della firma umana, indagine dedicata sulla causa
dell'inserimento dalla palette: vedi § "Addendum 2 — causa isolata e fix verificato per lo
scenario (a)" in fondo a questo file. **Esito: entrambi gli scenari ora verificati funzionanti**
(fix di misura cross-frame, API pubblica di `dnd-kit`, 10/10 run deterministici con mouse
reale). Resta comunque riservata alla firma umana la decisione di procedere a una nuova ADR.

Questo piano è generato in esecuzione della firma umana su
`RFC-F04e-bis-esito-spike-iframe.md` § "Decisione umana" (Decisione 1-bis, Opzione A, approvato
marketing@antelmagroup.net, 2026-09-14).

## Riferimenti

- `docs/ai/rfc/RFC-F04e-bis-esito-spike-iframe.md` § "Soluzione proposta" → Opzione (A) e §
  "Decisione umana" (mandato di questa spike).
- `docs/ai/plans/PLAN-F04-dnd-iframe-spike.md` — spike precedente (T1, `IframeBridgeSensor`),
  esito negativo: causa radice era il `InternalContext` di `dnd-kit` non propagato fra due
  `ReactDOM.createRoot()` distinti. Questa spike (T2) elimina quella causa per costruzione
  (nessun secondo root: `createPortal` mantiene il contenuto del canvas nello stesso albero
  React/Fiber del documento padre) ma introduce un rischio diverso, dichiarato esplicitamente
  in `RFC-F04e-bis` righe 96-103: la delega degli eventi nativi DOM di React 19 è ancorata al
  *root container* passato a `createRoot` (nel documento padre); resta da verificare
  empiricamente se un evento nativo (`pointerdown`/`pointermove`/`pointerup`) generato
  fisicamente dentro `iframe.contentDocument` raggiunga comunque quel punto di ascolto.
- `docs/ai/adr/ADR-70-canvas-iframe-isolation-zustand-sync.md` § "Decisione" punto 3 (Sensor
  custom, ora non necessario in questa architettura se il delegate DOM nativo funziona) e punto
  4 (disciplina di spike vincolante, stesso rigore richiesto qui).
- `docs/ai/specs/SPEC-F04-super-elementor.md` § 1, § 3 — sezioni che l'esito positivo di questa
  spike autorizzerebbe a modificare (non toccate finché l'esito non è scritto).

## Perimetro (invariato rispetto a T1)

- PoC isolato in `app/frontend/src/spikes/dnd-iframe-portal/`, rotta dev `/dev/dnd-iframe-portal-spike`
  registrata in `App.tsx`, **mai linkata** dalla navigazione di produzione.
- Nessuna nuova dipendenza npm.
- Verifica con `npm run dev` + browser reale via MCP Puppeteer (non solo lettura di sorgente),
  stesso standard probatorio di T1.

## Differenza architetturale rispetto al PoC T1

T1 usava un **secondo entry point Vite** (`spike-dnd-iframe.html` + `spike-canvas-entry.tsx`)
che montava un **secondo `ReactDOM.createRoot()`** dentro l'iframe — questo è esattamente ciò
che l'Opzione (A) sostituisce. Il PoC T2 **non ha un secondo entry point**: un solo componente
React, montato nel root esistente del documento padre, che:

1. Monta un `<iframe>` (stessa origin, `srcDoc` con un `<div id="portal-root">` vuoto — nessun
   bundle JS separato caricato dentro l'iframe).
2. Al `load` dell'iframe, ottiene `iframe.contentDocument.getElementById('portal-root')` e lo
   passa come container a `ReactDOM.createPortal(canvasTree, container)`, dentro lo **stesso**
   albero React del documento padre (stesso `DndContext`, stesso `InternalContext` di
   `dnd-kit` — nessun `IframeBridgeSensor`, nessun ponte di coordinate manuale: se la delega
   eventi funziona, `dnd-kit` vede gli eventi nativi tradotti in coordinate già corrette dal
   browser stesso, perché sono eventi realmente generati in quel punto del layout).

## Metodo di verifica (stesso rigore di T1)

1. `npm run dev` (Vite, porta 55173).
2. Navigazione reale via MCP Puppeteer su `/dev/dnd-iframe-portal-spike`.
3. Simulazione di sequenze `pointerdown → pointermove → pointerup` reali (`dispatchEvent` di
   `PointerEvent` nativi, stessa tecnica di T1 — stessa nota di metodo su cattura implicita del
   puntatore non replicabile senza controllo mouse CDP reale) sia interamente dentro l'iframe
   (scenario riordino) sia a cavallo del confine palette→iframe (scenario drop).
4. Lettura dello stato via `window.__SPIKE_DND_EVENTS__` (eventi reali `onDragStart`/
   `onDragOver`/`onDragEnd` di `DndContext`, montato nel padre) — stesso diagnostico di T1, per
   comparabilità diretta dell'esito.
5. Verifica aggiuntiva specifica di questa architettura: conferma via `console.log`/ispezione
   Puppeteer che il nodo draggable/droppable dentro l'iframe è realmente lo stesso
   `ownerDocument` dell'iframe (`node.ownerDocument === iframe.contentDocument`) — per escludere
   che il container passato a `createPortal` sia in realtà ancora nel documento padre per
   errore di implementazione del PoC.

## Task breakdown

- **T2.1** — Implementare `PageSpikePortalParent.tsx` (`DndContext` unico, palette + drop-zone
  di controllo nel padre, iframe con `srcDoc`, `createPortal` del canvas dentro l'iframe,
  blocchi draggable/droppable nel canvas con la stessa forma di id/data di
  `EditorBlockWrapper.tsx`).
- **T2.2** — Registrare rotta dev `/dev/dnd-iframe-portal-spike` in `App.tsx` (non linkata).
- **T2.3** — Verifica browser reale via MCP Puppeteer, scenario (a) drag palette→iframe e
  scenario (b) riordino interno all'iframe.
- **T2.4** — Scrivere l'esito (positivo o negativo) in questo stesso file, § "Risultato", con
  evidenze di codice e di log — nessuna scelta architetturale presa qui: un esito positivo
  autorizza (non produce da sé) una nuova ADR di superamento di ADR-70.

## Come riprodurre

```
cd app/frontend && npm run dev
# poi apri http://localhost:55173/dev/dnd-iframe-portal-spike
```

---

## Risultato

Verifica eseguita con `npm run dev` (porta 55173) + MCP Puppeteer (Chromium headless reale, non
solo lettura di sorgente), navigando su `/dev/dnd-iframe-portal-spike`.

### 1. Il canvas portato nell'iframe si registra correttamente con il `DndContext` del padre (POSITIVO)

Verifica preliminare di struttura: `container.ownerDocument === iframe.contentDocument` → `true`
(esposto anche a video come `window.__SPIKE_PORTAL_OWNERDOC_OK__`); `idoc.querySelectorAll('[data-testid^="portal-block-"]')` trova i 6 nodi attesi (3 blocchi + 3
wrapper drop-zone) **dentro** il documento dell'iframe, `document.querySelectorAll(...)` nel
padre ne trova 0 — il contenuto del canvas vive per intero nel document dell'iframe, non è un
residuo del padre spostato solo visivamente via CSS.

Sequenza reale: `pointerdown` sul nodo "Blocco A" (`portal-block-1`, dentro l'iframe) seguito da
6 `pointermove` di 6px ciascuno (soglia `activationConstraint.distance: 5`, identica alla
configurazione reale di `FullScreenEditorLayout.tsx`):

```json
{ "ts": 1789401069338, "phase": "dragStart", "active": "portal-block-1" }
```

`window.__SPIKE_PORTAL_DND_EVENTS__` (log diretto degli eventi reali `onDragStart` di
`DndContext`, montato nel padre) registra correttamente l'avvio del drag per un nodo il cui DOM
fisico è nell'iframe — **screenshot** (`spike-t2-portal-dragstart`) conferma anche visivamente
tre segnali indipendenti e coerenti nello stesso istante:
1. Il `<DragOverlay>` (portato da dnd-kit in `document.body` del **padre**) mostra il pill blu
   "portal-block-1".
2. Il blocco "Blocco A" **dentro l'iframe** mostra il proprio stato locale
   `isDragging=true` (dal suo `useDraggable()` — stesso hook, stessa istanza di
   `InternalContext`, non simulato).
3. Il pannello diagnostico (nel padre) mostra `active: portal-block-1` e
   `dragStart active=portal-block-1`.

Questo è l'opposto esatto dell'esito di T1, dove `window.__SPIKE_DND_EVENTS__` restava `[]` per
l'intera sequenza perché `useDraggable`/`useDroppable` nel secondo root ricevevano sempre
`defaultInternalContext` (`dispatch: noop`). Qui **non c'è un secondo root**: un solo
`ReactDOM.createRoot()`, un solo albero Fiber, e il Context arriva intatto attraverso il
`createPortal` — confermando che il Context React attraversa i confini di `document` quando il
meccanismo è un portal nello stesso albero, non quando è un secondo root separato (la
distinzione esatta che l'Opzione (A) proponeva di sfruttare).

**Conferma anche a livello di codice sorgente**, non solo di comportamento osservato:
`node_modules/@dnd-kit/core/dist/core.esm.js` mostra che `dnd-kit` è già progettato per essere
consapevole di confini di documento diversi — non usa mai `document`/`window` globali fissi per
i propri listener interni, ma li deriva sempre dal nodo reale su cui è avvenuto l'evento:

- `PointerSensor` (riga 1627): `const listenerTarget = getOwnerDocument(event.target);` — i
  listener `pointermove`/`pointerup`/`pointercancel` vengono registrati sul document
  **proprietario del nodo che ha ricevuto il pointerdown**, non su un document fisso.
- `AbstractPointerSensor` (righe 1411-1414): `this.document = getOwnerDocument(target)`,
  `this.windowListeners = new Listeners(getWindow(target))` — stessa logica per i listener a
  livello di document (`keydown`, `click`, `selectionchange`) e di window (`resize`,
  `dragstart`, `visibilitychange`, `contextmenu`).

Verificato empiricamente strumentando `iframe.contentWindow.EventTarget.prototype.addEventListener`
(il prototipo **del realm dell'iframe**, non quello del padre — i due sono oggetti distinti,
dettaglio di cui questa verifica ha dovuto tenere conto): durante la sequenza sopra, i listener
`pointermove`/`pointerup`/`pointercancel` risultano registrati esattamente su `idoc`
(`iframe.contentDocument`) e `resize`/`dragstart`/`visibilitychange`/`contextmenu` su
`iframe.contentWindow` — coerente riga per riga con il codice sorgente citato sopra, non
un'inferenza.

### 2. Verifica end-to-end del rilascio (`onDragEnd`) — INCONCLUSIVA, limite dello strumento

Nessuna sequenza sintetica `dispatchEvent(PointerEvent)` — dispatchata sul nodo originale, sul
document dell'iframe, o sul document del padre — ha prodotto un `onDragEnd` osservabile: il
drag resta "attivo" a tempo indefinito (stesso sintomo superficiale di T1 Scenario (a)), oppure
si azzera silenziosamente (`active: (nessuno)` senza una voce `dragEnd` né `dragCancel` nel log,
sintomo di un `onDragCancel` non strumentato separatamente in questo PoC) — **in modo non
deterministico fra run identici**.

**Controllo decisivo**: la stessa identica sequenza, ripetuta **senza alcun iframe** (tessera
della palette → drop-zone di controllo, entrambe nel documento padre, `PageSpikePortalParent`
riga "Drop-zone di controllo... baseline"), mostra **lo stesso sintomo** (`dragStart` isolato,
mai `dragEnd`, talvolta nemmeno `dragStart`). Poiché il caso di controllo non coinvolge alcun
iframe/portal, il sintomo **non può essere attribuito al meccanismo Portale** — indica un limite
della tecnica di verifica (eventi sintetici via `dispatchEvent`) in questo ambiente headless,
non un difetto architetturale del meccanismo sotto test.

Ispezionando il codice (`handleMove`/`handleEnd`, righe 1517-1579 di `core.esm.js`) è stato
confermato che i gestori **vengono invocati correttamente e senza eccezioni** (verificato
avvolgendo la chiamata in un `try/catch` e con `window.addEventListener('error', ...)` su
entrambi i realm, padre e iframe — nessun errore mai catturato): il problema non è un'eccezione
silenziosa né un guasto del bridging del Context, ma qualcosa a valle nella risoluzione
`over`/misurazione delle geometrie (`ResizeObserver`) o nella dipendenza dei sensori sintetici
da una cattura implicita del puntatore che un vero drag col mouse fornisce e
`dispatchEvent`/CDP senza controllo reale del mouse non replica — esattamente il limite già
dichiarato in `PLAN-F04-dnd-iframe-spike.md` § "Nota di metodo", qui emerso in forma più severa
perché ha impedito la chiusura del ciclo anche nel caso di controllo a documento singolo.

Gli strumenti MCP Puppeteer disponibili in questa sessione (`puppeteer_navigate`,
`puppeteer_evaluate`, `puppeteer_click`, `puppeteer_hover`, `puppeteer_fill`,
`puppeteer_select`, `puppeteer_screenshot`) non espongono un primitivo di trascinamento reale
(`page.mouse.down/move/up` o `Input.dispatchMouseEvent` diretto) — solo `evaluate` permette di
costruire eventi, ma sono per costruzione sintetici (`isTrusted: false`) e privi della cattura
implicita del puntatore del browser reale.

### Cosa NON è stato invalidato da questo esito

- Il vincolo di ADR-32(vecchia numerazione) § 5 (antenato DOM comune per `DndContext`) resta
  soddisfatto per costruzione: un solo `DndContext`, nel padre, invariato.
- Il ponte di stato Zustand via `contentWindow` (ADR-70 § 2) non è oggetto di questa spike e non
  è rimesso in discussione.
- L'isolamento CSS via `iframe.contentDocument` (ADR-70 § 5) funziona come atteso — visibile
  nello screenshot: il contenuto del canvas è visivamente isolato dentro il riquadro
  dell'iframe.

## Prossimo passo raccomandato (per l'Orchestratore/firma umana, nessuna scelta presa qui)

1. **Turno di verifica supplementare con input mouse reale** prima di dichiarare il gate
   pienamente superato: servirebbe accesso a un primitivo CDP di mouse reale
   (`page.mouse.down/move/up`, non esposto dagli strumenti MCP Puppeteer di questa sessione) per
   chiudere il punto 2 in modo conclusivo, oppure un test e2e Playwright (`e2e/`, che usa
   `page.mouse` nativo) mirato su questo PoC.
2. In alternativa, se il rischio residuo del punto 2 è ritenuto accettabile dato quanto già
   dimostrato al punto 1 (il vincolo strutturale che ha bocciato T1 è eliminato), procedere
   comunque a una nuova ADR (es. ADR-72, superamento di ADR-70 § "Decisione" punti 1 e 3) **con
   esplicita menzione del rischio residuo non verificato** — decisione che spetta alla firma
   umana, non a questo piano.
3. In entrambi i casi, questo PoC (`app/frontend/src/spikes/dnd-iframe-portal/`, rotta
   `/dev/dnd-iframe-portal-spike`) resta isolato e non linkato, da rimuovere solo dopo che
   l'esito qui sopra è stato recepito a valle.

---

## Addendum — turno di verifica supplementare con mouse reale (2026-09-14)

Eseguito il punto 1 di "Prossimo passo raccomandato": verifica con input mouse reale (non
sintetico) tramite `page.mouse.move/down/up` di Playwright (eventi CDP `isTrusted`, non
`dispatchEvent`), invece degli strumenti MCP Puppeteer della sessione originale (privi di quel
primitivo). Test riproducibile in
`e2e/tests/spike-dnd-iframe-portal.spec.ts`, eseguito con `cd e2e && npx playwright test
spike-dnd-iframe-portal.spec.ts --project=chromium --no-deps` contro `npm run dev` (porta 55173),
stesso PoC (`PageSpikePortalParent.tsx`), nessuna modifica al PoC stesso.

**Risultato: misto, non un "positivo" pieno.**

### Scenario (b) — riordino interno al canvas nell'iframe: POSITIVO, confermato con mouse reale

`onDragEnd` viene emesso in modo affidabile e ripetibile, con risoluzione corretta del target:
`{"phase":"dragEnd","active":"portal-block-1","over":"drop:portal-block-1"}`. Il ciclo si
completa da capo a fondo (avvio, tracking, rilascio, collisione) per un drag che nasce e finisce
interamente dentro il document dell'iframe. Chiude in modo conclusivo, per questo scenario, il
punto lasciato aperto dalla sessione originale.

### Scenario (a) — drag dalla palette (padre) al canvas nell'iframe: `onDragEnd` si completa, ma senza target risolto

Miglioramento reale rispetto a T1: **nessun blocco a tempo indefinito** — `onDragEnd` viene
sempre emesso, l'`active` non resta mai "fantasma" dopo il rilascio (il difetto che in T1
produceva un `DragOverlay` bloccato è assente qui). Ma il target non si risolve mai:
`{"phase":"dragEnd","active":"new-block:spike-portal-demo","over":null}`, e un'ispezione durante
il trascinamento (prima del rilascio) mostra `isOver=false` sulla drop-zone del canvas per
l'intera traversata, anche con il puntatore geometricamente al centro del suo rettangolo.

**Causa, coerente con quanto già isolato a livello di codice in questo stesso piano** (§
"Risultato" punto 1, citazione di `core.esm.js`): `PointerSensor` lega i propri listener di
movimento al *document proprietario del nodo che ha ricevuto il `pointerdown`* — per uno
scenario che parte dalla palette (documento padre), quel document è il padre. Una volta che il
cursore entra fisicamente nel rettangolo dell'iframe, gli eventi nativi di movimento vengono
recapitati al document dell'iframe (un browsing context separato), non al listener registrato sul
document padre: la posizione interna che `dnd-kit` usa per il calcolo delle collisioni resta
quindi ferma all'ultimo punto noto prima dell'attraversamento, e non converge mai sul rettangolo
reale della drop-zone nell'iframe. Non è lo stesso problema di T1 (propagazione del Context React,
già escluso qui) né un problema di traduzione di coordinate (già verificato funzionante in questo
piano) — è un terzo problema, specifico alla consegna degli eventi nativi quando il drag
*attraversa* il confine invece di restare tutto da un lato.

### Implicazione pratica

Il pattern `createPortal` risolve per intero il caso "riordino dentro il canvas già isolato" (la
parte quantitativamente più frequente dell'editor). Non risolve, così com'è, il caso "trascina un
blocco nuovo dalla palette esterna dentro il canvas" — un requisito reale della feature (§
"Impatto" di questo stesso file la cita come lo scenario (a) previsto da RFC-F04e-bis), non un
dettaglio di test. **Non equivale né al "turno di verifica supplementare" pienamente risolutivo
né a un esito negativo pieno**: è un terzo esito, più preciso dei due precedenti, che identifica
esattamente quale delle due direzioni di drag richiede lavoro aggiuntivo (un ponte per il
tracking del puntatore quando attraversa il confine, non un nuovo meccanismo di rendering/portal,
già validato).

Nessuna scelta architetturale presa qui: questo esito va comunque alla firma umana, con
l'informazione aggiuntiva rispetto alla sessione originale che permette una decisione più
mirata (es. autorizzare `ADR-72` limitata al riordino interno, lasciando l'inserimento
palette→canvas su un meccanismo separato o su un piano di lavoro dedicato) invece di una scelta
binaria tutto/niente.

---

## Addendum 2 — causa isolata e fix verificato per lo scenario (a) (2026-09-14)

Su richiesta esplicita della firma umana ("indagine aggiuntiva sul ponte pointer per lo scenario
(a), prima di qualunque ADR"), è stato costruito un terzo PoC (T3,
`app/frontend/src/spikes/dnd-iframe-portal/PageSpikePortalBridgeParent.tsx`, rotta dev
`/dev/dnd-iframe-portal-bridge-spike`) per isolare e chiudere il punto lasciato aperto
dall'Addendum 1.

### Prima ipotesi, fatta cadere da un probe empirico dedicato

Si è ipotizzato inizialmente che il problema fosse la **consegna** degli eventi nativi:
`PointerSensor` lega i propri listener al document che ha ricevuto il `pointerdown` iniziale
(`getOwnerDocument`, `core.esm.js:1404-1409`) — per un drag partito dalla palette (document
padre) si pensava che gli eventi generati fisicamente dentro l'iframe non raggiungessero mai
quel listener. Un primo tentativo di correzione (un "relay" che ridispatcha gli eventi
dell'iframe sul document padre, analogo nello spirito a `IframeBridgeSensor` di T1 ma senza
Sensor custom) non ha prodotto alcun effetto: **zero** eventi intercettati dal relay.

Un probe raw dedicato (listener diretti su entrambi i document, nessun dnd-kit di mezzo) ha
chiarito il motivo e smentito l'ipotesi: durante un trascinamento reale col mouse tenuto premuto
(CDP `Input.dispatchMouseEvent` via `page.mouse`), **Chromium applica una cattura implicita del
puntatore per tutta la durata del bottone premuto** — tutti i `pointermove` successivi al
`pointerdown` iniziale continuano ad arrivare al document PADRE (28/28 nel probe), **zero** al
document dell'iframe, anche quando il cursore è visivamente dentro il suo rettangolo, con
coordinate reali e coerenti con la posizione a schermo. Gli eventi arrivavano già, di loro, al
posto giusto: nessun ponte di consegna serviva.

### Causa reale

`useDroppable`/`useDraggable` misurano il rettangolo dei nodi con
`element.getBoundingClientRect()` (measuring di default di dnd-kit,
`defaultMeasuringConfiguration`, `core.esm.js:2478-2490`), che per un nodo il cui
`ownerDocument` è quello dell'iframe restituisce coordinate relative al **viewport dell'iframe
stesso**, mai tradotte nell'offset del riquadro nella pagina padre. Il puntatore, invece, arriva
al `PointerSensor` del padre con coordinate assolute nel viewport della **pagina padre**
(confermato dal probe sopra). Due sistemi di riferimento diversi confrontati come fossero lo
stesso: `pointerWithin` non può mai risolvere la collisione, indipendentemente da quanto siano
corrette le coordinate del puntatore in sé — coerente con `isOver` sempre `false` osservato in
`Addendum 1`, sia con che senza il tentativo di relay.

Per lo scenario (b) (riordino tutto interno all'iframe) questo problema non esiste: sia il
puntatore (eventi ascoltati e generati dentro il document dell'iframe, perché lì è iniziato il
`pointerdown`) sia i rettangoli dei nodi droppable (misurati anch'essi dentro l'iframe) sono
coerentemente nello stesso sistema di riferimento locale all'iframe.

### Fix verificato

`measuring.droppable.measure` e `measuring.draggable.measure` di `DndContext` sono API
pubbliche sostituibili (`MeasuringConfiguration`, esportata da `@dnd-kit/core`, non
un'estensione non documentata). Il PoC T3 fornisce una funzione di misura che somma l'offset di
`iframe.getBoundingClientRect()` al rettangolo grezzo quando il drag corrente è di origine
palette (`event.active.id` con prefisso `new-block:`) e il nodo misurato vive nell'iframe —
portandolo nello stesso sistema di riferimento del puntatore. Nessuna nuova dipendenza npm,
nessun fork di `dnd-kit`, nessun Sensor custom.

**Verifica con mouse reale** (`e2e/tests/spike-dnd-iframe-portal-bridge.spec.ts`, `page.mouse`,
non eventi sintetici), 5 run consecutivi, 10/10 passati:

- Scenario (a): `isOver=true` sulla drop-zone **prima** del rilascio (non solo un esito casuale
  al drop), poi `onDragEnd` con `over: "iframe-bridge-canvas-root"` — risolto, deterministico.
- Scenario (b): resta funzionante dopo il fix di misura (nessuna regressione), `onDragEnd` con
  un target di reorder valido in tutti i run.

### Esito

**Entrambi gli scenari richiesti da `RFC-F04e-bis` § Opzione (A) sono ora verificati funzionanti
con input reale**, con causa e fix isolati a livello di codice (non solo osservazione empirica):
il pattern `createPortal` (canvas nello stesso albero React del padre) risolve il vincolo
strutturale che aveva bocciato T1 (propagazione del Context), e la sostituzione di
`measuring.*.measure` — API pubblica di `dnd-kit`, non un workaround fragile — risolve il
secondo vincolo isolato da questo addendum (sistemi di riferimento incoerenti tra puntatore e
rettangoli misurati attraverso il confine del document).

Resta comunque **riservata alla firma umana** la decisione di procedere a una nuova ADR (es.
`ADR-72`, superamento di `ADR-70` § "Decisione" punti 1 e 3) che formalizzi questo meccanismo —
nessuna ADR viene scritta o approvata da questo piano. Elementi che la firma dovrebbe
considerare: (a) l'esito è ora positivo su entrambi gli scenari richiesti, non solo parziale;
(b) il fix di misura va formalizzato come parte del pattern architetturale (non un dettaglio
implementativo lasciato all'improvvisazione in fase di codifica), quindi andrebbe esplicitamente
descritto nel testo della nuova ADR, non solo il meccanismo `createPortal`; (c) restano non
verificati in questa sessione, perché fuori standard probatorio raggiungibile con gli strumenti
disponibili: scroll automatico del canvas durante il drag (`FullScreenEditorLayout.tsx:392,412`,
già segnalato come rischio aggiuntivo in `PLAN-F04-dnd-iframe-spike.md`), il sensore da tastiera
(già accertato rotto oggi indipendentemente dall'iframe, stesso file), e comportamento sotto
scroll/zoom del documento padre stesso (solo lo scroll/resize dell'iframe rispetto al padre era
nello scope di ADR-70 § 4).
