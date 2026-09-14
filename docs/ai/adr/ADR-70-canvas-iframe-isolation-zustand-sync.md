# ADR-70 — Canvas dell'editor in iframe same-origin, con sincronizzazione diretta dello store Zustand

## Status
[ ] In discussione · [x] **Approvata** · [ ] Rifiutata · [ ] Superseded da ADR-XXX

## Data approvazione
2026-09-14 — approvato da: marketing@antelmagroup.net

## RFC di riferimento
`docs/ai/rfc/RFC-F04e-super-elementor.md` — Decisione 1 (Isolamento canvas) e Decisione 2
(Ponte di stato), esito firmato nella sezione "Decisione umana".

---

## Contesto

`RFC-F04e-super-elementor.md` ha verificato che la richiesta originale di isolare il canvas
dell'editor in un iframe confligge con due decisioni già approvate:

- **ADR-54** — l'editor vive su rotta isolata `/studio/:id`, un solo documento, nessuna chrome
  admin nel canvas. Resta valida come inquadramento della rotta: questa ADR non tocca il
  routing, aggiunge un iframe **dentro** `LayoutStudio`, non un secondo documento al posto suo.
- **ADR-42 § 5** — l'isolamento CSS del canvas è ottenuto oggi via variabili scopate su una
  classe radice (`generateThemeCss` con `selector` esplicito), non via confine di motore di
  rendering. Resta il meccanismo per il **contenuto del tema**; l'iframe aggiunge un secondo
  livello di isolamento (DOM/CSS strutturale), non lo sostituisce.
- **ADR-32(vecchia numerazione, "Editor a schermo intero, Navigator e sidebar widget") § 5** —
  `DndContext` richiede un antenato DOM comune fra `WidgetPalette` (sorgente drag) e
  `EditorBlockWrapper` (destinazioni drop). Un iframe separa i due in due `document` distinti:
  **questo è il vincolo che questa ADR supera**, e lo fa solo per il ramo "canvas in iframe" —
  per ogni altra superficie dell'editor (palette, ispettore, navigator) il vincolo di ADR-32 § 5
  resta invariato, perché restano nello stesso documento.
- **ADR-17** — Zustand è letto/scritto in-process, un solo albero React, nessuna
  serializzazione. Un iframe introduce un secondo `window`/`document`: questa ADR estende
  l'accesso allo store a un secondo contesto JS, **senza** introdurre una seconda istanza di
  store né una copia serializzata.

Il vincolo tecnico reale non è "iframe sì/no" in astratto, ma **due limiti concreti di
libreria** che la RFC ha isolato:

1. `dnd-kit` non fornisce un adattatore pubblico per far attraversare un `DndContext` un
   confine di iframe (nessuna versione pubblica lo documenta).
2. Un ponte di stato per iframe cross-origin richiederebbe `postMessage` + serializzazione
   (`immer`, dipendenza non nello stack) con un costo di latenza sul percorso critico di
   digitazione, a rischio sul NFR "100 blocchi interattivi entro 2s".

La firma umana su RFC-F04e vincola l'iframe a **same-origin** esplicitamente per rendere
disponibile una terza via che elimina entrambi i limiti, descritta di seguito.

## Decisione

1. **Il canvas (`EditorCanvas` e l'albero di blocchi renderizzato) viene montato dentro un
   `<iframe>` same-origin**, servito dalla stessa origin di `/studio/:id` (stesso
   scheme/host/porta — nessuna origin esterna, nessun `sandbox` che isoli il contesto JS).
   `LayoutStudio` (shell: palette, ispettore, navigator, topbar) resta nel documento padre,
   fuori dall'iframe. Il canvas carica un **entry point React dedicato**, montato dentro
   l'iframe al suo `load`, che renderizza lo stesso albero di componenti blocco già usato oggi
   (`EditorBlockWrapper` e discendenti) — nessun secondo renderer, stesso codice, montato in un
   secondo `document`.

2. **Lo store Zustand resta un singleton di modulo nel documento padre** (coerente con ADR-17):
   non nasce una seconda istanza di store nell'iframe. Al montaggio, il documento padre espone
   l'istanza dello store (non una copia, non un valore serializzato) su
   `iframe.contentWindow.__CMS_EDITOR_STORE__`. Il codice React montato dentro l'iframe importa
   un hook (`useBlockEditorStore`) che, quando eseguito nel contesto iframe, legge lo store da
   quella proprietà del proprio `window` invece di importarlo come modulo locale — stesso
   selettore mirato di ADR-17 § "Regole di adozione" punto 2, stessa API (`subscribe`,
   `getState`, `setState`), zero superficie nuova sopra Zustand.

   **Perché funziona solo same-origin**: l'oggetto store (funzioni, closure, riferimenti)
   attraversa il confine di `contentWindow` per riferimento diretto — è una capacità del
   browser riservata a frame della stessa origin. Un iframe cross-origin non lo permetterebbe
   (da qui il vincolo "same-origin" nella firma della RFC, non "iframe" generico). Nessun
   `postMessage`, nessuna serializzazione, nessuna dipendenza `immer`: il rischio di latenza sul
   percorso di digitazione che la RFC segnalava per l'opzione postMessage+immer **non si
   applica** a questo meccanismo.

3. **`dnd-kit` attraversa il confine tramite un Sensor custom, non un fork della libreria.**
   `dnd-kit` espone `Sensor` come estensione pubblica supportata (`useSensor(CustomSensor)`);
   questa ADR autorizza la scrittura di un `IframeBridgeSensor` che:
   - registra i propri listener di puntatore (`pointerdown`/`pointermove`/`pointerup`) su
     `iframe.contentWindow.document` invece che sul `document` del frame padre — accessibile
     direttamente perché same-origin;
   - traduce le coordinate di ogni evento sommando l'offset di
     `iframe.getBoundingClientRect()`, in modo che il `DndContext` montato nel documento padre
     (dove vive anche `WidgetPalette`) veda coordinate coerenti con il proprio sistema di
     riferimento;
   - inoltra l'evento tradotto al protocollo di attivazione sensore che `dnd-kit` già espone
     per i sensori nativi (`PointerSensor`), senza toccare `moveNodeToAction` né la regola di
     ammissibilità `canDropInto` (ADR-28 § 2 e § 5, invariate).

   Il vincolo di ADR-32(vecchia numerazione) § 5 (antenato comune per `DndContext`) è quindi
   **soddisfatto per costruzione anche col canvas in iframe**: il `DndContext` resta unico, nel
   documento padre; ciò che cambia è come gli eventi di punterio che avvengono fisicamente
   dentro l'iframe raggiungono quel contesto. `WidgetPalette` e la shell restano invariate.

4. **Prerequisito vincolante prima di qualunque task di implementazione**: una spike
   documentata che verifichi `IframeBridgeSensor` contro scroll interno del canvas, resize
   della finestra, zoom del browser e il sensore da tastiera esistente (ADR-28 § "Conseguenza"
   — la copertura e2e del riordino passa da lì, deve restare verde). Riporta quanto già
   dichiarato in RFC-F04e § Impatto: **nessun task di F04e-implementazione parte prima che
   questa spike produca un esito scritto**. Non è una raccomandazione, è condizione di questa
   ADR.

5. **Isolamento CSS**: l'iframe eredita comunque lo scoping di ADR-42 § 5
   (`generateThemeCss` con `selector` esplicito sulla radice del documento iframe, scheme
   chiaro forzato come da ADR-42 § 6) — l'iframe è un livello di isolamento aggiuntivo
   strutturale, il meccanismo a variabili CSS scopate non viene rimosso.

6. **Nessuna nuova dipendenza npm.** Né `immer` né alcuna libreria di bridging: il meccanismo
   usa solo API standard del browser (`contentWindow`, `getBoundingClientRect`) e l'API pubblica
   di sensori di `dnd-kit` già installato (ADR-28).

## Alternative valutate

| Opzione | Pro | Contro | Motivo scarto |
|---|---|---|---|
| Status quo (nessun iframe, ADR-54+ADR-42) | Costo zero, nessun rischio nuovo | Isolamento solo per convenzione CSS, non strutturale | Scartata dalla firma umana su RFC-F04e Decisione 1 |
| Shadow DOM sulla radice canvas | Stesso documento, nessun ponte di stato nuovo | Comportamento di `dnd-kit`/Mantine attraverso un confine shadow non documentato dalla libreria, verifica non banale | Non scelta in sede di firma (RFC-F04e, opzione (b) non selezionata) |
| Iframe cross-origin | Isolamento massimo, anche da injection di script | Nessun accesso diretto a `contentWindow`/store; richiederebbe `postMessage`+`immer`, il rischio di latenza che questa ADR evita | Esclusa esplicitamente dalla firma ("vincolato a Same-Origin") |
| `postMessage` + `immer` come ponte (opzione (b) originale della RFC) | Funziona anche cross-origin, pattern documentato | Dipendenza nuova fuori stack, costo di serializzazione sul percorso di digitazione, rischio diretto sul NFR 100 blocchi/2s | Superata dal meccanismo a riferimento diretto reso possibile dal vincolo same-origin |
| Fork/patch di `dnd-kit` per supporto cross-frame nativo | Soluzione "corretta" a monte | Onere di manutenzione permanente su una dipendenza esterna, nessuna necessità se il Sensor custom basta | Scartata: l'API pubblica di `Sensor` è sufficiente, un fork sarebbe over-engineering |

## Conseguenze

**Positive**
- Isolamento DOM/CSS strutturale per il canvas, richiesta originale soddisfatta senza
  compromettere `dnd-kit` né introdurre dipendenze nuove.
- Zero costo di serializzazione: lo store resta un singolo oggetto in memoria, letto per
  riferimento da due contesti JS.
- Nessuna migrazione, nessun cambio di schema blocchi, nessun impatto sul consumer pubblico
  (ADR-22) — il meccanismo è interamente lato editor/admin.

**Negative / costi**
- `IframeBridgeSensor` è infrastruttura nuova da scrivere e testare (non fornita da `dnd-kit`):
  è la spesa reale di questa decisione, gated dalla spike del punto 4.
- L'accoppiamento a same-origin è permanente: se in futuro il canvas dovesse servire contenuto
  di un'origin diversa (es. anteprima di un tema ospitato altrove), questo meccanismo smette di
  funzionare e va rivalutato da zero — non è un dettaglio di configurazione.
- Debug leggermente più complesso: due `document` nello stesso `window` tree, strumenti dev
  browser devono essere puntati esplicitamente sul frame corretto.
- Mantine monta portali (`Tooltip`, `Popover`, `Modal`) fuori dall'albero locale per default:
  vanno verificati/ripuntati per i controlli interni al canvas, altrimenti perdono
  tooltip/popover (stesso rischio già segnalato in RFC-F04e per l'opzione Shadow DOM, si
  applica identico qui perché è un secondo `document`).

## Conformità

1. **Same-origin, mai cross-origin**: l'`src`/`srcdoc` dell'iframe del canvas serve sempre
   dalla stessa origin dell'app admin — nessun URL con host/scheme/porta diversi.
2. **Una sola istanza di store**: `grep -rn "createStore\|create(" app/frontend/src/hooks` non
   deve mostrare una seconda definizione dello store dell'editor per il contesto iframe.
3. **Nessuna dipendenza `immer` nel `package.json` di `app/frontend`** introdotta per questo
   round.
4. **`DndContext` resta unico**, montato nel documento padre (`grep -rn "DndContext"
   app/frontend/src` deve mostrare un solo punto di montaggio, coerente con ADR-32 § 5 vecchia
   numerazione).
5. La spike del punto 4 ha un esito scritto (verbale/commit di riferimento) prima che qualunque
   PR di implementazione di F04e venga aperta.
