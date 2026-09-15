# ADR-72 — Canvas dell'editor in iframe same-origin via `React.createPortal`, con traduzione cross-frame del rettangolo di misura di `dnd-kit`

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
**2026-09-14** — approvato da marketing@antelmagroup.net. La sezione "Decisione umana" in fondo
a questo documento riporta la firma. Da questo momento questa ADR autorizza la scrittura del
meccanismo qui descritto nel codice di produzione.

## RFC/Piani di riferimento

- `docs/ai/rfc/RFC-F04e-bis-esito-spike-iframe.md` § "Decisione umana" (Decisione 1-bis,
  Opzione A, approvato marketing@antelmagroup.net, 2026-09-14): autorizza la spike sul
  meccanismo Portale React e dichiara che *"solo un esito scritto positivo di quella spike
  autorizzerebbe una ADR di superamento di ADR-70 (es. ADR-72)"*.
- `docs/ai/plans/PLAN-F04-dnd-iframe-portal-spike.md` — spike T2 (verifica strutturale
  `createPortal`) e relativi Addendum 1 (verifica supplementare con mouse reale, esito misto) e
  Addendum 2 (T3, causa isolata e fix verificato per lo scenario palette→canvas). Questa ADR
  formalizza esattamente e solo quanto quel piano ha verificato — nessuna estensione non
  documentata.
- `docs/ai/adr/ADR-70-canvas-iframe-isolation-zustand-sync.md` — **ADR di riferimento,
  approvata e non modificata da questo documento** (`docs/constitution.md` § Documentation
  Policy: una ADR già approvata non si tocca mai). Questa ADR ne supera i punti 1 e 3 della
  sezione "Decisione"; i punti 2 ("Store Zustand"), 5 ("Isolamento CSS") e 6 ("Nessuna nuova
  dipendenza npm") restano validi e si applicano identici, non riaperti qui.

---

## Contesto

`ADR-70` autorizzava un canvas montato in un **secondo `ReactDOM.createRoot()`** dentro
l'iframe, con un `IframeBridgeSensor` custom come ponte per `dnd-kit`, subordinato a una spike
vincolante (§ "Decisione" punto 4). Quella spike (T1,
`docs/ai/plans/PLAN-F04-dnd-iframe-spike.md`) ha avuto **esito negativo**: l'`InternalContext`
di `dnd-kit` non propaga fra due `ReactDOM.createRoot()` distinti — vincolo strutturale di
React, non un difetto del Sensor.

`RFC-F04e-bis` ha riaperto la sola Decisione 1/2 di `RFC-F04e-super-elementor.md` e autorizzato,
come unica via prima di qualunque nuova ADR, una spike sul pattern alternativo
`ReactDOM.createPortal` (canvas nello stesso albero React del padre, nessun secondo root). Quella
spike (T2) ha dato esito **parzialmente positivo**: il vincolo strutturale di T1 è eliminato
(`useDraggable`/`useDroppable` su nodi portati nell'iframe si registrano correttamente col
`DndContext` reale del padre, verificato a livello di codice e di comportamento osservato), ma
la verifica end-to-end del rilascio (scenario "drag dalla palette esterna dentro il canvas")
restava inconcludente con gli strumenti disponibili in quella sessione (nessun primitivo di
mouse reale).

Una verifica supplementare con `page.mouse` di Playwright (evento CDP reale, non sintetico) ha
chiuso quel punto in due fasi:

1. **Prima misura**: lo scenario "riordino interno al canvas nell'iframe" è confermato
   funzionante end-to-end (`onDragEnd` con target corretto). Lo scenario "drag dalla palette
   esterna" completa il ciclo (nessun blocco a tempo indefinito, a differenza di T1) ma non
   risolve mai un target valido (`over: null`).
2. **Indagine dedicata (T3)** ha isolato la causa: non è un problema di consegna degli eventi
   (un probe raw ha dimostrato che Chromium applica una cattura implicita del puntatore per
   tutta la durata del bottone premuto — gli eventi nativi raggiungono già, di loro, il
   `PointerSensor` del documento padre, con coordinate corrette, anche col cursore fisicamente
   sopra l'iframe). La causa reale è che il rettangolo dei nodi droppable dentro l'iframe viene
   misurato di default (`element.getBoundingClientRect()`) nel sistema di riferimento locale
   dell'iframe, mai tradotto nell'offset del suo riquadro nella pagina padre — mentre il
   puntatore arriva con coordinate assolute nel viewport della pagina padre. Due sistemi di
   riferimento incompatibili confrontati come fossero lo stesso.

Sostituendo `measuring.droppable.measure`/`measuring.draggable.measure` di `DndContext` — API
pubblica di `dnd-kit`, non un'estensione non documentata — con una funzione che somma l'offset
dell'iframe quando il drag corrente ha origine nel documento padre, entrambi gli scenari
risolvono correttamente, verificato con mouse reale, 10/10 run deterministici
(`e2e/tests/spike-dnd-iframe-portal-bridge.spec.ts`).

## Decisione

1. **Il canvas (`EditorCanvas` e l'albero di blocchi renderizzato) resta parte dello stesso
   albero React del documento padre.** Nessun secondo `ReactDOM.createRoot()`, nessun secondo
   entry point Vite/bundle (`/studio-canvas.html` e `studio-canvas.entry.tsx`, previsti da
   `ADR-70` § "Decisione" punto 1, **non vengono creati**). Il contenuto del canvas viene
   montato dentro l'`<iframe>` tramite `ReactDOM.createPortal(canvasTree,
   iframe.contentDocument.getElementById('canvas-root'))`, restando montato nel `<iframe>`
   stesso come figlio di `LayoutStudio` — un solo componente React, un solo `DndContext`, un
   solo `InternalContext` di `dnd-kit`, che attraversa il confine del `document` per costruzione
   (propagazione del Context nel Fiber tree, indipendente dal `document` fisico in cui il DOM
   portato finisce). Questo **supera ADR-70 § "Decisione" punto 1**.

2. **Nessun Sensor custom.** `IframeBridgeSensor`, previsto da `ADR-70` § "Decisione" punto 3
   come ponte per `dnd-kit` attraverso il confine, **non viene scritto**: non serve. Verificato
   empiricamente (probe raw, browser reale) che Chromium recapita tutti gli eventi
   `pointermove`/`pointerup` successivi a un `pointerdown` con bottone premuto al document che
   ha ricevuto il `pointerdown` iniziale, indipendentemente da dove il cursore si trovi
   visivamente — cattura implicita del browser, non un meccanismo di `dnd-kit` o React. Il
   `PointerSensor` nativo, già montato dal `DndContext` del documento padre, riceve quindi da
   solo tutti gli eventi necessari per un drag che nasce nel padre e attraversa l'iframe. Questo
   **supera ADR-70 § "Decisione" punto 3**.

3. **Obbligo architetturale: `measuring.droppable.measure` e `measuring.draggable.measure` del
   `DndContext` unico devono tradurre il rettangolo dei nodi portati nell'iframe nel sistema di
   riferimento del documento la cui coordinata di puntatore è attiva per il drag corrente.**
   Non è un dettaglio di implementazione lasciato al momento della scrittura del codice: senza
   questa traduzione, ogni drag che attraversa il confine iframe↔padre risolve sempre `over:
   null` (collisione mai rilevata), indipendentemente da quanto siano corretti gli eventi del
   puntatore. La funzione di misura:
   - usa `element.getBoundingClientRect()` come base (nessuna reimplementazione della geometria
     nativa);
   - quando l'`ownerDocument` dell'elemento misurato differisce dal documento di riferimento del
     drag attivo, somma (o sottrae, per la direzione opposta) l'offset di
     `iframe.getBoundingClientRect()` prima di restituire il rettangolo;
   - determina il documento di riferimento del drag attivo dall'origine del nodo trascinato
     (es. convenzione `new-block:` già in uso da `WidgetPalette` per i nuovi blocchi, o
     equivalente per un id già esistente nell'albero), non da uno stato globale mutabile fuori
     dal ciclo di vita del drag.
   Resta l'API pubblica `MeasuringConfiguration` esposta da `@dnd-kit/core` (`measuring` prop di
   `DndContext`): nessun fork, nessuna patch al pacchetto.

4. **Store Zustand, isolamento CSS, nessuna nuova dipendenza npm: invariati.** `ADR-70` §
   "Decisione" punti 2, 5 e 6 restano validi e si applicano identici a questa architettura — non
   sono oggetto di questa ADR, non vengono riaperti.

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Secondo `ReactDOM.createRoot()` + `IframeBridgeSensor` custom (ADR-70 originale) | Isolamento massimo del bundle canvas | `InternalContext` di `dnd-kit` non propaga fra due root distinti — vincolo strutturale di React | Bocciata dalla spike T1, esito negativo scritto |
| Relay/ponte di eventi nativi cross-document (prima ipotesi di questa stessa indagine) | Sembrava coerente con la diagnosi iniziale | Chromium recapita già gli eventi al document giusto grazie alla cattura implicita del puntatore — il relay non intercetta nulla (0 eventi catturati in un probe dedicato) | Ipotesi causale sbagliata, smentita empiricamente prima di essere proposta per la firma |
| Chiudere il ramo iframe, tornare allo status quo (Opzione B di RFC-F04e-bis) | Nessun rischio nuovo, nessuna ADR richiesta | Rinuncia all'isolamento DOM/CSS strutturale motivato dalla firma originale su RFC-F04e | Non scelta dalla firma umana su RFC-F04e-bis (Decisione 1-bis: Opzione A) |
| Restringere l'iframe a parti non interattive (anteprima statica) | Evita del tutto il problema di misura cross-frame | Cambia il perimetro della feature (non più "canvas interattivo isolato") | Fuori perimetro di questa ADR, richiederebbe una RFC a sé (già annotato in `RFC-F04e-bis` § "Alternative valutate") |

## Conseguenze

**Positive**
- Isolamento DOM/CSS strutturale del canvas, richiesta originale soddisfatta, senza il costo di
  un `IframeBridgeSensor` da scrivere e mantenere né di un secondo bundle/entry point.
- Nessuna nuova dipendenza npm, nessun fork di `dnd-kit`: il meccanismo usa solo API pubbliche
  (`createPortal`, `MeasuringConfiguration`) e comportamento standard del browser.
- Entrambi gli scenari di drag richiesti (riordino interno, inserimento da palette esterna) sono
  verificati con input reale (mouse via CDP), non solo per ispezione di codice.

**Negative / costi**
- La funzione di misura cross-frame è infrastruttura nuova da scrivere e testare (§ "Decisione"
  punto 3) — non un default di `dnd-kit`, va mantenuta e coperta da test quanto lo sarebbe stato
  un Sensor custom.
- **Rischi residui non verificati in questa sessione**, da chiudere nel round di implementazione
  o con una spike dedicata separata, non coperti dalla firma di questa ADR:
  - Scroll automatico del canvas durante un drag: `FullScreenEditorLayout.tsx:392,412` ascolta
    `pointermove` nativi su `window`, che non attraversano il confine dell'iframe verso il padre
    (comportamento diverso dalla cattura implicita osservata per gli eventi di drag di
    `dnd-kit`, perché lì il listener è su `window`, non sul `document` che ha ricevuto il
    `pointerdown`) — andrebbe ribridgato separatamente.
  - Il sensore da tastiera per il riordino nel canvas è già rotto oggi in produzione,
    indipendentemente da questa ADR (`FullScreenEditorLayout.tsx` righe 335-338/513,
    `collisionDetection={pointerWithin}` senza `coordinateGetter` custom per `KeyboardSensor`) —
    debito preesistente, non introdotto né risolto qui, da registrare a parte in `docs/TODO.md`
    (già segnalato da `RFC-F04e-bis` § "Nota fuori dalla decisione").
  - Scroll/zoom del documento padre stesso durante un drag attivo: fuori dallo scope verificato
    in questa sessione (solo l'offset statico dell'iframe è stato validato; un ricalcolo ad ogni
    misura, già previsto da `MeasuringStrategy.WhileDragging`, dovrebbe coprirlo ma non è stato
    osservato empiricamente).
  - Verifica eseguita con eventi mouse dispatchati via CDP (Playwright `page.mouse`), non con
    hardware reale: la nota di metodo già presente in `PLAN-F04-dnd-iframe-spike.md` e
    `PLAN-F04-dnd-iframe-portal-spike.md` sulla cattura implicita del puntatore di un vero mouse
    fisico si applica anche qui, per quanto CDP sia lo standard probatorio più alto disponibile
    in questo ambiente.
- L'accoppiamento a same-origin resta permanente, ereditato invariato da ADR-70 § "Decisione"
  punto 1 (non riaperto da questa ADR).

## Conformità

1. **Nessun secondo `ReactDOM.createRoot()` per il canvas**: `grep -rn "createRoot" app/frontend/src`
   non deve mostrare un punto di montaggio dedicato al canvas oltre a quello dell'app principale.
2. **Nessun secondo entry point Vite per il canvas**: nessun file `studio-canvas.entry.tsx` /
   `studio-canvas.html` nel repository.
3. **Nessun `Sensor` custom per il bridging iframe**: `grep -rn "IframeBridgeSensor"
   app/frontend/src` non deve produrre risultati fuori da `src/spikes/` (PoC storici, da
   rimuovere solo dopo il recepimento di questa ADR a valle, non class di produzione).
4. **`measuring` custom presente e testato**: il `DndContext` di produzione del canvas passa una
   prop `measuring` con `droppable.measure`/`draggable.measure` non di default, coperta da
   almeno un test E2E Playwright con `page.mouse` reale per lo scenario palette→canvas.
5. **Una sola istanza di store, un solo `DndContext`**: invariato da ADR-70 § "Conformità" punti
   2 e 4, non riverificato qui perché non toccato da questa ADR.
6. **Nessuna dipendenza `immer` o di bridging iframe** nel `package.json` di `app/frontend`:
   invariato da ADR-70 § "Conformità" punto 3.

---

## Decisione umana

**Decisione — Superamento di ADR-70 § "Decisione" punti 1 e 3, `createPortal` + traduzione
cross-frame del rettangolo di misura come architettura del canvas incapsulato**

**Esito**: [x] Approvato così com'è · [ ] Approvato con modifiche (vedi commenti) · [ ] Rifiutato
· [ ] Rinviato, servono altre verifiche

**Approvato da**: marketing@antelmagroup.net · **Data**: 2026-09-14

**Verifica indipendente eseguita in sede di firma**: prima di questa approvazione, i due file di
test citati in questa ADR sono stati rieseguiti dal vivo (`npm run dev` porta 55173 +
`npx playwright test spike-dnd-iframe-portal.spec.ts spike-dnd-iframe-portal-bridge.spec.ts
--project=chromium --no-deps`): **4/4 test passati** (i 2 test di
`spike-dnd-iframe-portal.spec.ts`, scenari (a)/(b) di T2, e i 2 test di
`spike-dnd-iframe-portal-bridge.spec.ts`, scenari (a)/(b) di T3 col fix di misura). Esito
confermato, non solo riportato dal piano.

**Nota per chi firma**: l'approvazione di questa ADR autorizza la scrittura del meccanismo qui
descritto nel codice di produzione, ma **non** modifica `ADR-70` (rimane storica e non toccata,
per `docs/constitution.md` § Documentation Policy — nessun agente AI tocca mai una ADR già
approvata). Il riferimento alla supersessione è registrato in `docs/ai/INDEX.md` § "Nota di
allineamento", con lo stesso meccanismo già usato per ADR-22/ADR-23 superseded da ADR-45/ADR-53.
Aggiornati in conseguenza di questa firma: `docs/ai/specs/SPEC-F04-super-elementor.md` § 1 e
§ 3.3/3.5 (architettura prescritta), § "Out of scope" (rimozione del gate di spike, ormai
superato) e § "Vincoli e assunzioni" punto 6.
