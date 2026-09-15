/**
 * Spike T3 — indagine aggiuntiva su richiesta della firma umana dopo l'addendum del
 * 2026-09-14 a `docs/ai/plans/PLAN-F04-dnd-iframe-portal-spike.md` (verifica con mouse reale,
 * Playwright): lo scenario (b) (riordino interno al canvas nell'iframe) è confermato
 * funzionante con `createPortal` puro (T2). Lo scenario (a) (drag dalla palette esterna dentro
 * il canvas nell'iframe) si conclude sempre con `onDragEnd` (nessun blocco a tempo indefinito,
 * a differenza di T1) ma `over` resta sempre `null`.
 *
 * **Prima ipotesi (fatta cadere da un probe empirico dedicato, non presente in questo file)**:
 * si era ipotizzato che il problema fosse la *consegna* degli eventi nativi — `PointerSensor`
 * lega i propri listener al document che ha ricevuto il `pointerdown` iniziale
 * (`getOwnerDocument`, `core.esm.js:1404-1409`), quindi per un drag partito dalla palette
 * (document padre) si è pensato che gli eventi generati fisicamente dentro l'iframe non
 * raggiungessero mai quel listener. **Un probe raw (listener diretti su entrambi i document,
 * nessun dnd-kit di mezzo) ha smentito questa ipotesi**: durante un trascinamento reale col
 * mouse tenuto premuto (CDP `Input.dispatchMouseEvent` via Playwright `page.mouse`), Chromium
 * applica una cattura implicita del puntatore per tutta la durata del bottone premuto — TUTTI i
 * `pointermove` successivi al `pointerdown` iniziale continuano ad arrivare al document PADRE
 * (28/28 nel probe), **zero** al document dell'iframe, anche quando il cursore è visivamente
 * dentro il suo rettangolo — con coordinate (`clientX`/`clientY`) reali e coerenti con la
 * posizione a schermo (verificato: l'ultimo evento riportava `x:500,y:206.2`, dentro il
 * rettangolo atteso della drop-zone). Un meccanismo di relay/ponte per la consegna degli eventi
 * (tentato in una prima versione di questo file, rimosso) è quindi **inutile**: gli eventi
 * arrivano già, di loro, al posto giusto.
 *
 * **Causa reale, isolata dopo la smentita sopra**: `useDroppable`/`useDraggable` misurano il
 * rettangolo dei nodi con `element.getBoundingClientRect()` (default measuring di dnd-kit,
 * `defaultMeasuringConfiguration`, `core.esm.js:2478-2490`), che per un nodo il cui
 * `ownerDocument` è quello dell'iframe restituisce coordinate relative al **viewport
 * dell'iframe stesso** (origine 0,0 in alto a sinistra del SUO riquadro), mai tradotte
 * nell'offset del riquadro nella pagina padre. Il puntatore, invece, arriva al `PointerSensor`
 * del padre con coordinate assolute nel viewport della **pagina padre** (confermato dal probe
 * sopra). Due sistemi di riferimento diversi confrontati come se fossero lo stesso:
 * `pointerWithin` non può mai risolvere la collisione, indipendentemente da quanto siano
 * corrette le coordinate del puntatore in sé — coerente con `isOver` sempre `false` osservato
 * empiricamente, sia con che senza il tentativo di relay.
 *
 * Per lo scenario (b) (riordino tutto interno all'iframe, confermato funzionante in T2) questo
 * problema non esiste: sia il puntatore (eventi ascoltati e generati dentro il document
 * dell'iframe, perché lì è iniziato il `pointerdown`) sia i rettangoli dei nodi droppable
 * (misurati anch'essi dentro l'iframe) sono coerentemente nello stesso sistema di riferimento
 * locale all'iframe — nessuna traduzione necessaria.
 *
 * **Fix qui verificato**: `measuring.droppable.measure` (e `.draggable.measure`) di `DndContext`
 * sono API pubbliche sostituibili (`MeasuringConfiguration`, `core.esm.js`, esportate da
 * `@dnd-kit/core`). Questa variante fornisce una funzione di misura che, quando l'origine del
 * drag corrente è nel document padre (`event.active.id` con prefisso `new-block:`, stessa
 * convenzione di `PaletteTile`) e il nodo misurato vive nel document dell'iframe, somma
 * l'offset di `iframe.getBoundingClientRect()` al rettangolo grezzo — portandolo nello stesso
 * sistema di riferimento (pagina padre) del puntatore. Nessuna nuova dipendenza npm, nessun
 * fork di `dnd-kit`: solo l'API pubblica di misurazione già esposta dalla libreria.
 *
 * Rotta dev-only `/dev/dnd-iframe-portal-bridge-spike` (vedi App.tsx), mai linkata dalla
 * navigazione di produzione.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type ClientRect,
  type DragEndEvent,
  type DragStartEvent,
  type MeasuringConfiguration,
} from '@dnd-kit/core';

declare global {
  interface Window {
    __SPIKE_BRIDGE_DND_EVENTS__?: unknown[];
    __SPIKE_BRIDGE_OWNERDOC_OK__?: boolean;
  }
}

function logDndEvent(entry: Record<string, unknown>): void {
  if (!window.__SPIKE_BRIDGE_DND_EVENTS__) window.__SPIKE_BRIDGE_DND_EVENTS__ = [];
  window.__SPIKE_BRIDGE_DND_EVENTS__.push({ ts: Date.now(), ...entry });
}

const IFRAME_SRC_DOC = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="portal-root"></div>
  </body>
</html>`;

/** Solo trascinamenti iniziati dalla palette (documento padre) hanno bisogno della traduzione
 * di coordinate — stessa convenzione `new-block:` di `PaletteTile`. */
function isPaletteOrigin(activeId: string): boolean {
  return activeId.startsWith('new-block:');
}

function toPlainRect(rect: DOMRect): ClientRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right,
  };
}

function shiftRect(rect: DOMRect, dx: number, dy: number): ClientRect {
  const top = rect.top + dy;
  const left = rect.left + dx;
  return {
    top,
    left,
    width: rect.width,
    height: rect.height,
    bottom: top + rect.height,
    right: left + rect.width,
  };
}

function PaletteTile(): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'new-block:spike-bridge-demo',
    data: { type: 'spike-bridge-demo', isNew: true },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid="palette-tile"
      style={{
        padding: '10px 14px',
        borderRadius: 6,
        border: '1px solid #dee2e6',
        background: isDragging ? '#4dabf7' : '#fff',
        color: isDragging ? '#fff' : '#212529',
        cursor: 'grab',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      Trascina &quot;Nuovo blocco&quot; →
    </button>
  );
}

function PortalBlock({ id, label }: { id: string; label: string }): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: 'spike-bridge-block' },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${id}`,
    data: { parentId: 'iframe-bridge-root', index: 0 },
  });

  return (
    <div
      ref={setDropRef}
      data-testid={`portal-block-dropzone-${id}`}
      style={{
        border: isOver ? '2px solid #12b886' : '2px dashed #ced4da',
        background: isOver ? '#e6fcf5' : '#f8f9fa',
        borderRadius: 8,
        padding: 4,
        marginBottom: 8,
      }}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-testid={`portal-block-${id}`}
        style={{
          padding: '10px 14px',
          borderRadius: 6,
          background: isDragging ? '#4dabf7' : '#ffffff',
          color: isDragging ? '#fff' : '#212529',
          border: '1px solid #dee2e6',
          cursor: 'grab',
          userSelect: 'none',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
        }}
      >
        {label} {isDragging ? '(isDragging=true)' : ''}
      </div>
    </div>
  );
}

function PortalCanvasRoot(): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: 'iframe-bridge-canvas-root',
    data: { parentId: null, index: 0 },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid="iframe-bridge-canvas-root"
      style={{
        minHeight: 220,
        border: isOver ? '3px solid #12b886' : '3px dashed #adb5bd',
        background: isOver ? '#e6fcf5' : '#ffffff',
        borderRadius: 10,
        padding: 16,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: 12, color: '#495057' }}>
        Canvas (createPortal + measure cross-frame) — isOver=<b>{String(isOver)}</b>
      </p>
      <PortalBlock id="portal-block-1" label="Blocco A (container)" />
      <PortalBlock id="portal-block-2" label="Blocco B (widget)" />
      <PortalBlock id="portal-block-3" label="Blocco C (widget)" />
    </div>
  );
}

export default function PageSpikePortalBridgeParent(): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const dragOriginRef = useRef<'parent' | 'iframe' | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string>('(nessun drag ancora concluso)');
  const [log, setLog] = useState<string[]>([]);
  const [ownerDocInfo, setOwnerDocInfo] = useState<string>('(iframe non ancora caricato)');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    window.__SPIKE_BRIDGE_DND_EVENTS__ = [];
  }, []);

  function appendLog(line: string): void {
    setLog((prev) => [...prev.slice(-30), line]);
  }

  /** Vedi commento di testa del file: porta il rettangolo di un nodo misurato nello stesso
   * sistema di riferimento del document da cui il puntatore del drag corrente riceve le sue
   * coordinate (`dragOriginRef`), sommando/sottraendo l'offset dell'iframe quando i due
   * document non coincidono. */
  const measureCrossFrame = useCallback((element: Element): ClientRect => {
    const rect = element.getBoundingClientRect();
    const iframe = frameRef.current;
    const origin = dragOriginRef.current;
    if (!iframe || !origin) return toPlainRect(rect);

    const elementIsInIframe = element.ownerDocument === iframe.contentDocument;
    const frameRect = iframe.getBoundingClientRect();

    if (origin === 'parent' && elementIsInIframe) {
      return shiftRect(rect, frameRect.left, frameRect.top);
    }
    if (origin === 'iframe' && !elementIsInIframe) {
      return shiftRect(rect, -frameRect.left, -frameRect.top);
    }
    return toPlainRect(rect);
  }, []);

  const measuring: MeasuringConfiguration = {
    droppable: { measure: measureCrossFrame },
    draggable: { measure: measureCrossFrame },
  };

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    dragOriginRef.current = isPaletteOrigin(id) ? 'parent' : 'iframe';
    setActiveId(id);
    appendLog(`dragStart active=${id} origin=${dragOriginRef.current}`);
    logDndEvent({ phase: 'dragStart', active: id, origin: dragOriginRef.current });
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    const overId = event.over ? String(event.over.id) : null;
    const msg = `dragEnd active=${String(event.active.id)} over=${overId ?? '(null — nessun target valido)'}`;
    setLastResult(msg);
    appendLog(msg);
    logDndEvent({ phase: 'dragEnd', active: String(event.active.id), over: overId });
    dragOriginRef.current = null;
  }

  function handleDragCancel(): void {
    setActiveId(null);
    appendLog('dragCancel');
    logDndEvent({ phase: 'dragCancel' });
    dragOriginRef.current = null;
  }

  function handleIframeLoad(): void {
    const iframe = frameRef.current;
    const doc = iframe?.contentDocument ?? null;
    const container = doc?.getElementById('portal-root') ?? null;
    if (!container) {
      appendLog('ERRORE: portal-root non trovato nel document dell’iframe dopo load');
      return;
    }
    setPortalContainer(container);
    const ok = container.ownerDocument === iframe?.contentDocument;
    window.__SPIKE_BRIDGE_OWNERDOC_OK__ = ok;
    setOwnerDocInfo(`container.ownerDocument === iframe.contentDocument → ${ok}`);
    appendLog('iframe load → portal-root trovato, createPortal montato');
  }

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 16 }}>
        Spike T3 — Traduzione cross-frame del rettangolo di misura (indagine su Scenario a)
      </h2>
      <p style={{ fontSize: 12, color: '#495057', maxWidth: 720 }}>
        Come T2, ma con `measuring.droppable/draggable.measure` sostituito: quando un drag parte
        dalla palette (padre) e il nodo misurato vive nell&apos;iframe, il suo rettangolo viene
        traslato dell&apos;offset dell&apos;iframe prima del calcolo di collisione.
      </p>
      <p style={{ fontSize: 11, color: '#868e96', maxWidth: 720 }}>{ownerDocInfo}</p>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={measuring}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 220 }}>
            <PaletteTile />
          </div>

          <iframe
            ref={frameRef}
            srcDoc={IFRAME_SRC_DOC}
            title="Canvas della spike (portale React + measure cross-frame)"
            onLoad={handleIframeLoad}
            data-testid="spike-bridge-iframe"
            style={{ width: 480, height: 360, border: '1px solid #adb5bd', borderRadius: 8 }}
          />

          {portalContainer ? createPortal(<PortalCanvasRoot />, portalContainer) : null}

          <div
            style={{
              width: 360,
              fontSize: 11,
              fontFamily: 'monospace',
              background: '#212529',
              color: '#d3f9d8',
              padding: 10,
              borderRadius: 8,
              height: 360,
              overflow: 'auto',
            }}
            data-testid="diagnostics-panel"
          >
            <div>active: {activeId ?? '(nessuno)'}</div>
            <div>ultimo esito: {lastResult}</div>
            <hr />
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <div
              style={{
                padding: '8px 12px',
                background: '#4dabf7',
                color: '#fff',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              {activeId}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
