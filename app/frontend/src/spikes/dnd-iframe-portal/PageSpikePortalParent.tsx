/**
 * Spike T2 (Opzione A di `RFC-F04e-bis-esito-spike-iframe.md` § "Decisione umana", firmato
 * marketing@antelmagroup.net 2026-09-14) — verifica se `ReactDOM.createPortal` permette al
 * canvas di vivere nello stesso albero React (stesso `DndContext`, stesso `InternalContext` di
 * dnd-kit) pur avendo il suo output DOM dentro `iframe.contentDocument`.
 *
 * Differenza strutturale rispetto alla Spike T1 (`../dnd-iframe-bridge/`, esito negativo,
 * `PLAN-F04-dnd-iframe-spike.md`): qui NON esiste un secondo `ReactDOM.createRoot()` né un
 * secondo entry point Vite. Un solo componente, montato nel root dell'app; il contenuto del
 * canvas è portato dentro l'iframe via `createPortal`, restando parte dello stesso Fiber tree
 * del documento padre. Nessun `IframeBridgeSensor`: se l'ipotesi di questa spike è corretta
 * (la delega eventi di React funziona anche attraverso un portal cross-document), `dnd-kit`
 * vede gli eventi nativi già tradotti in coordinate corrette dal browser stesso.
 *
 * Rotta dev-only `/dev/dnd-iframe-portal-spike` (vedi App.tsx), mai linkata dalla navigazione
 * di produzione.
 */
import { useEffect, useRef, useState } from 'react';
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
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

declare global {
  interface Window {
    __SPIKE_PORTAL_DND_EVENTS__?: unknown[];
    __SPIKE_PORTAL_OWNERDOC_OK__?: boolean;
  }
}

function logDndEvent(entry: Record<string, unknown>): void {
  if (!window.__SPIKE_PORTAL_DND_EVENTS__) window.__SPIKE_PORTAL_DND_EVENTS__ = [];
  window.__SPIKE_PORTAL_DND_EVENTS__.push({ ts: Date.now(), ...entry });
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

/** Tessera della "palette" nel documento padre — stessa forma di `WidgetPalette.tsx:80-83`.
 * Sorgente dello scenario (a): drag dal padre verso il canvas portato nell'iframe. */
function PaletteTile(): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'new-block:spike-portal-demo',
    data: { type: 'spike-portal-demo', isNew: true },
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

/** Drop-zone di controllo nel documento PADRE: baseline, stesso ruolo che aveva in T1. */
function ParentControlDropzone(): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: 'parent-control-dropzone',
    data: { parentId: null, index: 0 },
  });
  return (
    <div
      ref={setNodeRef}
      data-testid="parent-control-dropzone"
      style={{
        border: isOver ? '2px solid #12b886' : '2px dashed #ced4da',
        background: isOver ? '#e6fcf5' : '#f1f3f5',
        borderRadius: 8,
        padding: 12,
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
        marginBottom: 12,
      }}
    >
      Drop-zone di controllo (stesso documento del padre). isOver=<b>{String(isOver)}</b>
    </div>
  );
}

/** Un "blocco" del canvas portato nell'iframe — stessi hook/stessa forma di `data` di
 * `EditorBlockWrapper.tsx:1106-1108`, ma qui gira nello STESSO albero React del padre (nessun
 * root separato): unica differenza dal blocco reale è il documento fisico in cui il DOM finisce
 * (via `createPortal`), non il codice che lo produce. */
function PortalBlock({ id, label }: { id: string; label: string }): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: 'spike-portal-block' },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${id}`,
    data: { parentId: 'iframe-portal-root', index: 0 },
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
        {label} {isDragging ? '(isDragging=true — dnd-kit ha riconosciuto il drag)' : ''}
      </div>
    </div>
  );
}

/** Zona droppable "canvas root" dentro l'iframe — bersaglio dello scenario (a). Analoga a
 * `EditorCanvas.tsx:88-91` (`root-empty-dropzone`). */
function PortalCanvasRoot(): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: 'iframe-portal-canvas-root',
    data: { parentId: null, index: 0 },
  });

  return (
    <div
      ref={setNodeRef}
      data-testid="iframe-portal-canvas-root"
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
        Canvas (portato via <code>createPortal</code> dentro l&apos;iframe) — isOver=
        <b>{String(isOver)}</b>
      </p>
      <PortalBlock id="portal-block-1" label="Blocco A (container)" />
      <PortalBlock id="portal-block-2" label="Blocco B (widget)" />
      <PortalBlock id="portal-block-3" label="Blocco C (widget)" />
    </div>
  );
}

export default function PageSpikePortalParent(): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
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
    window.__SPIKE_PORTAL_DND_EVENTS__ = [];
  }, []);

  function appendLog(line: string): void {
    setLog((prev) => [...prev.slice(-30), line]);
  }

  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
    appendLog(`dragStart active=${String(event.active.id)}`);
    logDndEvent({ phase: 'dragStart', active: String(event.active.id) });
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveId(null);
    const overId = event.over ? String(event.over.id) : null;
    const msg = `dragEnd active=${String(event.active.id)} over=${overId ?? '(null — nessun target valido)'}`;
    setLastResult(msg);
    appendLog(msg);
    logDndEvent({ phase: 'dragEnd', active: String(event.active.id), over: overId });
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
    window.__SPIKE_PORTAL_OWNERDOC_OK__ = ok;
    setOwnerDocInfo(
      `container.ownerDocument === iframe.contentDocument → ${ok} (verifica che il nodo target del portal sia realmente nel document dell'iframe, non un residuo del padre)`,
    );
    appendLog('iframe load → portal-root trovato, createPortal montato');
  }

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 16 }}>
        Spike T2 — Portale React (Opzione A, RFC-F04e-bis § Decisione umana)
      </h2>
      <p style={{ fontSize: 12, color: '#495057', maxWidth: 720 }}>
        Scenario (a): trascina la tessera qui sotto dentro il riquadro nell&apos;iframe. Scenario
        (b): trascina uno dei &quot;Blocco A/B/C&quot; dentro l&apos;iframe (riordino interno).
        Nessun <code>IframeBridgeSensor</code> qui: se gli eventi nativi generati fisicamente dentro
        l&apos;iframe raggiungono comunque il punto di ascolto di React nel documento padre, dnd-kit
        dovrebbe funzionare senza alcun ponte custom.
      </p>
      <p style={{ fontSize: 11, color: '#868e96', maxWidth: 720 }}>{ownerDocInfo}</p>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 220 }}>
            <PaletteTile />
            <div style={{ height: 16 }} />
            <ParentControlDropzone />
          </div>

          <iframe
            ref={frameRef}
            srcDoc={IFRAME_SRC_DOC}
            title="Canvas della spike (portale React)"
            onLoad={handleIframeLoad}
            data-testid="spike-portal-iframe"
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
