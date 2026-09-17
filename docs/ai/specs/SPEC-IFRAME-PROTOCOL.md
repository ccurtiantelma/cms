# SPEC — Protocollo di comunicazione Sidebar ↔ Canvas Iframe

## Status
[x] Bozza — round R0 di `docs/PLAN-parita-elementor-pro.md` · [ ] Approvata · [ ] Superseded

## Dominio
`docs/ai/INDEX.md` § "Editor Visivo & Canvas". Apre e chiude sullo stesso dominio di
`ADR-70-canvas-iframe-isolation-zustand-sync.md` e
`ADR-72-canvas-iframe-portal-bridge.md`, che questa spec **non supera**: ne è
un'estensione di dettaglio per un caso — l'aggiornamento ad alte prestazioni durante
drag/slide sugli input di stile — non ancora coperto da nessuna delle due.

## ADR applicabili
- `ADR-70-canvas-iframe-isolation-zustand-sync.md` — canvas same-origin, store Zustand
  condiviso per riferimento via `contentWindow`, **nessun `postMessage`, nessuna
  serializzazione** (§ "Decisione" punto 2, motivato dal rischio di latenza sul percorso
  di digitazione).
- `ADR-72-canvas-iframe-portal-bridge.md` — il canvas non è nemmeno un secondo
  `document`/entry-point React: è montato via `ReactDOM.createPortal` **nello stesso
  albero React del documento padre**, dentro il nodo DOM dell'iframe. Sidebar e canvas
  condividono quindi lo stesso motore di reconciliazione React e lo stesso contesto JS —
  non due finestre che si scambiano messaggi, ma due sottoalberi dello stesso render.
- `ADR-75-involucro-stateful-e-stati-hover.md` — questa spec introduce l'anteprima dal
  vivo dello stato `hover` durante l'editing, che deve rispettare lo stesso ordine di
  nidificazione stato → breakpoint → valore.

## Deviazione dichiarata dalla richiesta originale del task
Il task che origina questo documento chiede un "protocollo `postMessage` tra Sidebar
React e Iframe Canvas". **Questa spec non usa `postMessage`.** Non è un'omissione: è
una conseguenza diretta di due decisioni già firmate e non riaperte da questo documento.

`ADR-70` § "Decisione" punto 2 scarta esplicitamente `postMessage` + serializzazione
(`immer`) per il ponte di stato, perché il canvas è **same-origin** e può quindi
condividere oggetti per riferimento — un privilegio del browser che `postMessage`
esiste apposta per sostituire quando quel privilegio *non* è disponibile (frame
cross-origin). Introdurre `postMessage` qui reintrodurrebbe esattamente il costo di
serializzazione che ADR-70 ha speso una spike a evitare, per un canale che ha già un
accesso diretto migliore. `ADR-72` rende la cosa ancora più stretta: sidebar e canvas
non sono nemmeno "due contesti" nel senso in cui `postMessage` presuppone — sono lo
stesso albero React, lo stesso closure scope, con l'unica differenza che una parte del
DOM che quell'albero produce vive dentro un secondo `document` (l'iframe), raggiungibile
con le stesse API sincrone di `contentWindow`/`contentDocument` già in uso per il bridge
dello store.

Questa spec definisce quindi un **canale diretto same-origin** (funzioni esposte su
`contentWindow`, invocate per riferimento, zero `JSON.stringify`) che ottiene lo stesso
risultato architetturale richiesto dal task — un percorso di aggiornamento a 60 fps che
bypassa il ciclo React/Zustand fino a `mouseup`/`blur` — con il meccanismo che l'ADR
vigente impone. Se un giorno il canvas dovesse diventare cross-origin (nessuna ADR in
questo repository lo propone), questa spec andrebbe riscritta da zero su base
`postMessage`: non è una migrazione incrementale, è un cambio di primitiva.

## Outcomes tecnici
Al termine dell'implementazione esiste, in `app/frontend/src/pages/pages/editor/`, un
oggetto `CanvasStyleBridge` esposto su `iframeWindow.__CMS_STYLE_BRIDGE__` al montaggio
del canvas (stesso punto di innesto di `__CMS_EDITOR_STORE__`, ADR-70 § "Decisione"
punto 2), un hook `useLiveStylePreview()` usato dai controlli della sidebar che
manipolano prop `stateful`/`responsive` a grana fine (color picker con drag, slider di
spaziatura, popover tipografia), e un contratto di **commit** che scrive nello store
Zustand (quindi in `draftContent`) solo a fine gesto.

## In scope
- Interfacce TypeScript del canale diretto (§ 1).
- Ciclo di vita di un aggiornamento live: `begin` → N × `update` → `commit`/`cancel` (§ 2).
- Meccanismo di iniezione CSS diretta nel DOM dell'iframe, bypass di React/Zustand (§ 3).
- Regola di rientro nel ciclo normale a `mouseup`/`blur` (§ 4).
- Superficie di stato in anteprima (hover simulato, breakpoint attivo) (§ 5).
- Garanzie di pulizia e casi di interruzione anomala (§ 6).

## Out of scope
- Il bridge dello store Zustand esistente (`__CMS_EDITOR_STORE__`, ADR-70): questa spec
  lo consuma per il commit finale, non lo ridefinisce.
- Drag-and-drop di blocchi (`dnd-kit`, ADR-70 § "Decisione" punto 3/ADR-72): canale
  separato, nessuna sovrapposizione.
- Comunicazione con un iframe cross-origin: fuori scopo per costruzione (vedi
  "Deviazione dichiarata" sopra).

---

## 1. Interfacce TypeScript

```typescript
// app/frontend/src/pages/pages/editor/canvas-style-bridge.types.ts

/** Percorso del nodo target nell'albero blocchi, stessa forma del `path` del validator backend
 * (`blocks[2].children[0]`) — non un id opaco, per poter risolvere l'elemento DOM senza una
 * mappa aggiuntiva: il canvas annota ogni nodo renderizzato con `data-block-path`. */
type BlockPath = string;

/** Stato CSS in anteprima durante il gesto — sottoinsieme degli stati chiusi di ADR-75. */
type PreviewState = 'normal' | 'hover' | 'focus' | 'active';

/** Breakpoint attivo nel canvas al momento del gesto (ADR-76: chiave fra le 7 attive di sito). */
type PreviewBreakpoint = string;

/** Una singola dichiarazione CSS da applicare live, già risolta dal `kind` d'origine lato
 * sidebar (colore, unità, ecc.) — mai una stringa CSS libera scritta a mano: il bridge non è
 * una seconda via per `kind: 'css'` (ADR-78), è un canale di anteprima per `kind` già validati. */
interface LiveDeclaration {
  /** Nome di proprietà CSS lecito, dallo stesso allowlist di ADR-78 § 3 (difesa in profondità:
   * anche un canale interno non introduce proprietà arbitrarie). */
  property: string;
  /** Valore CSS già formattato (es. `'#1b5fa8'`, `'24px'`, `'rotate(15deg)'`). */
  value: string;
}

/** Payload di un aggiornamento live: quale nodo, quale stato/breakpoint in anteprima, quali
 * dichiarazioni sostituiscono (mai sommano: ogni `update` è idempotente rispetto al precedente
 * sullo stesso `path`+`state`+`breakpoint`). */
interface LiveStyleUpdate {
  path: BlockPath;
  state: PreviewState;
  breakpoint: PreviewBreakpoint;
  declarations: LiveDeclaration[];
}

/** Il canale esposto dal canvas sul proprio `window`, letto dalla sidebar via
 * `iframe.contentWindow.__CMS_STYLE_BRIDGE__` — stesso pattern di accesso diretto per
 * riferimento di `__CMS_EDITOR_STORE__` (ADR-70 § "Decisione" punto 2), non un event target. */
interface CanvasStyleBridge {
  /** Apre un gesto di anteprima per un nodo. Idempotente: una `begin` su un `path` già aperto
   * chiude implicitamente il gesto precedente con `cancel()` prima di aprirne uno nuovo — mai
   * due gesti sovrapposti sullo stesso nodo. */
  begin(path: BlockPath): void;
  /** Applica (o sostituisce) le dichiarazioni per lo stato/breakpoint indicati. Scrive
   * direttamente una regola CSSOM (§ 3), non tocca React/Zustand. Può essere chiamato ad alta
   * frequenza (ogni `pointermove` di un drag, ogni tick di uno slider). */
  update(update: LiveStyleUpdate): void;
  /** Chiude il gesto con successo: l'ultimo stato di `update()` per ogni combinazione
   * `state`+`breakpoint` toccata viene restituito al chiamante (mai scritto autonomamente nello
   * store — la sidebar decide se e come persisterlo, § 4) e la regola CSSOM temporanea viene
   * rimossa (il valore committato rientra dal render React ordinario). */
  commit(path: BlockPath): LiveStyleUpdate[];
  /** Annulla il gesto: rimuove la regola CSSOM temporanea senza restituire alcun valore. Il nodo
   * torna esattamente al CSS derivato dall'ultimo stato committato nello store. */
  cancel(path: BlockPath): void;
}

declare global {
  interface Window {
    __CMS_STYLE_BRIDGE__?: CanvasStyleBridge;
  }
}
```

## 2. Ciclo di vita di un aggiornamento live

Un controllo della sidebar che manipola una prop `stateful`/`responsive` a grana fine
(esempi: `ColorRefPicker` con drag sulla ruota colore, `SpacingBox` con drag sul valore
numerico, `TypographyPopover` con uno slider di `fontSize`) segue sempre questa
sequenza, mai una variante:

1. **`pointerdown`/`focus` sul controllo** → `bridge.begin(path)`. Il canvas prepara,
   se non esiste già, un elemento `<style data-live-preview>` nel proprio
   `<head>` dedicato esclusivamente a questo meccanismo (§ 3) — mai riusato per il CSS
   critico ordinario prodotto dal render React.
2. **Ogni `pointermove`/`input` durante il gesto** → `bridge.update({ path, state,
   breakpoint, declarations })`, con `state`/`breakpoint` presi dallo *state switcher* e
   dal selettore breakpoint correnti dell'inspector (ADR-75 § "Conseguenze": lo stato
   attivo nell'editor, non necessariamente `normal`). Nessuna chiamata a `setState`
   Zustand in questa fase: la funzione scrive solo CSSOM (§ 3).
3. **`pointerup`/`blur`** → la sidebar chiama `bridge.commit(path)`, riceve l'elenco
   finale delle `LiveStyleUpdate` accumulate e le applica **una sola volta** allo store
   Zustand (`useBlockEditorStore.getState().updateNodeProp(...)`), esattamente come
   un'edit non interattiva (es. selezione da un `<select>`) avrebbe fatto oggi. Questo è
   il punto in cui il ciclo React/Zustand riprende il controllo: il prossimo render
   ordinario del nodo produce lo stesso CSS che l'anteprima aveva già mostrato, la
   regola temporanea viene rimossa e non c'è mai un doppio stato visibile
   (flash/salto) perché il valore committato è bit-per-bit quello dell'ultimo `update`.
4. **`Escape` durante il gesto, o smontaggio del controllo** → `bridge.cancel(path)`:
   nessuna scrittura allo store, il nodo torna al CSS derivato dall'ultimo stato
   committato in precedenza.

Il costo per frame durante il drag è quindi: una chiamata di funzione sincrona same-
origin (nessuna serializzazione, nessun `postMessage`, nessun re-render React del
sottoalbero canvas) più una scrittura CSSOM (§ 3) — l'unico lavoro che il browser deve
fare per riflettere il cambiamento è ricalcolo di stile/layout/paint sul nodo
interessato, lo stesso costo che pagherebbe un'applicazione diretta di `style` inline,
ma senza comprometterne la sanitizzazione (§ 3 spiega perché non si usa `style` inline).

## 3. Iniezione diretta nel DOM dell'iframe: perché CSSOM e non `element.style`

`bridge.update()` non scrive `element.style.setProperty(...)` sul nodo DOM del blocco
in anteprima. Scrive invece una regola in un foglio di stile dedicato
(`document.styleSheets` via `CSSStyleSheet.insertRule`/`deleteRule` sul nodo
`<style data-live-preview>` preparato da `begin()`), con selettore
`[data-block-path="<path>"]<selettore di stato>` sotto un `@media` coerente con
`breakpoint`. Tre motivi, nessuno negoziabile:

1. **Coerenza con `toCss()` unico** (`SPEC-propkind-v2.md` § 7): il CSS "vero" del
   progetto è sempre emesso per selettore, mai per attributo `style` inline (principio
   già stabilito da ADR-29 § "Decisione" punto 6, "Classi CSS, mai `style` inline", qui
   esteso all'anteprima). Uno `style` inline scritto dal bridge produrrebbe una
   specificity CSS diversa (in pratica sempre vincente) rispetto al CSS che il render
   React applicherà al commit — rischiando un salto visivo esattamente nell'istante in
   cui si vorrebbe garantire continuità.
2. **Stato/breakpoint multipli sullo stesso nodo.** Un `style` inline non può esprimere
   `:hover`/`@media` — rappresenterebbe sempre e solo lo stato "corrente" del dispositivo
   reale, mai un hover "simulato" per l'editing (l'utente sta editando lo stato Hover
   senza passare fisicamente il mouse sul nodo). La regola CSSOM scoped può invece
   dichiarare `[data-block-path="..."].cms-preview-hover { ... }` e il canvas applica la
   classe `cms-preview-hover` al nodo mentre lo stato "Hover" è selezionato
   nell'inspector — nessun evento di mouse reale richiesto.
3. **Un solo punto di rimozione.** `commit()`/`cancel()` puliscono l'intera regola con
   `deleteRule` in O(1); ripulire N proprietà `style` inline scritte nel tempo
   richiederebbe tracciarle una per una.

## 4. Regola di rientro nel ciclo normale

**Nessun aggiornamento live modifica mai `draftContent` prima di `commit()`.** Questo è
il vincolo che rende il meccanismo sicuro rispetto al lock ottimistico (`version` su
`pageEntity`) e alla cronologia Undo/Redo esistente: finché il gesto è in corso, lo
store Zustand — e quindi ogni consumer che ne osserva lo stato (History panel,
indicatore "non salvato", validazione live) — resta esattamente come prima del gesto.
Un `commit()` produce **una singola transizione di stato** equivalente a qualunque altra
modifica di prop, così che Undo/Redo tratti l'intero drag come un'unica azione
annullabile, mai come N passi intermedi.

## 5. Superficie di stato in anteprima

Lo *state switcher* (ADR-75 § "Conseguenze") e il selettore di breakpoint attivo
(ADR-76) sono le uniche due sorgenti che determinano `state`/`breakpoint` passati a
`update()`. Il canvas applica una classe `cms-preview-hover`/`cms-preview-focus`/
`cms-preview-active` sul nodo target **solo mentre l'inspector ha quello stato
selezionato per quel nodo** — mai globalmente sulla pagina, e mai in conflitto con un
hover reale del mouse sul canvas (che resta un hover CSS nativo, non gestito da questo
bridge). Cambiare stato nell'inspector durante un `begin()` aperto forza implicitamente
un `commit()` del gesto in corso prima di applicare il nuovo stato — coerente con "un
gesto per volta" già dichiarato al § 1 dell'interfaccia.

## 6. Garanzie di pulizia e casi di interruzione anomala

- **Smontaggio del canvas (navigazione, chiusura editor) con un `begin()` aperto**: il
  gesto viene trattato come `cancel()` implicito — nessuna scrittura pendente allo
  store. La sidebar non deve fare nulla di speciale: la responsabilità è del canvas, che
  esegue la pulizia nel proprio effetto di `unmount`.
- **Il nodo target sparisce durante il gesto** (es. un altro utente in futuro round di
  collaborazione lo elimina — fuori scopo oggi, mono-utente): `update()` diventa un
  no-op silenzioso se `document.querySelector('[data-block-path="..."]')` non trova più
  il nodo; `commit()` in questo caso restituisce comunque l'ultimo elenco di
  `LiveStyleUpdate` accumulato (la sidebar decide se scartarlo, tipicamente sì se il nodo
  non esiste più nello store).
- **`__CMS_STYLE_BRIDGE__` assente** (iframe non ancora montato, o smontato): ogni hook
  `useLiveStylePreview()` verifica la presenza del bridge prima di ogni chiamata e
  degrada silenziosamente al comportamento non interattivo esistente (scrittura diretta
  allo store a ogni variazione, senza anteprima a 60 fps) — nessuna eccezione lanciata,
  nessuna dipendenza dura dal bridge per il funzionamento base dell'inspector.

## Criteri di verifica
- Test unitario `CanvasStyleBridge`: `begin`→`update`×N→`commit` produce esattamente una
  regola CSSOM finale coerente con l'ultimo `update`, mai un accumulo di regole residue.
- Test unitario: `cancel()` rimuove la regola e non lascia alcuna traccia in
  `document.styleSheets`.
- Test Playwright: un drag su `SpacingBox` aggiorna visivamente il canvas ad ogni
  `pointermove` (screenshot intermedio) **senza** che lo store Zustand (osservato via
  `useBlockEditorStore.getState()` iniettato nel test) cambi finché non avviene
  `pointerup`.
- Test Playwright: interrompere un drag con `Escape` riporta il nodo al CSS
  precedente, bit-per-bit (snapshot prima/dopo confrontati).
- Test di carico frame: durante un drag continuo di 2 secondi su un nodo con 5
  dichiarazioni `stateful`+`responsive`, nessun re-render del sottoalbero React del
  canvas viene osservato (contatore di render strumentato in ambiente di test), a
  conferma che il bypass del punto 2 del ciclo di vita è realmente rispettato.
