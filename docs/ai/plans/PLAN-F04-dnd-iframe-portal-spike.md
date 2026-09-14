# Plan — Spike Portale React (`ReactDOM.createPortal`), Opzione (A) di RFC-F04e-bis

## Esito

**Da compilare a valle dell'esecuzione** (§ "Risultato" più sotto). Questo piano è generato in
esecuzione della firma umana su `RFC-F04e-bis-esito-spike-iframe.md` § "Decisione umana"
(Decisione 1-bis, Opzione A, approvato marketing@antelmagroup.net, 2026-09-14).

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
