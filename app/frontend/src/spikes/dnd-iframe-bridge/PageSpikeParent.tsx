/**
 * Pagina della Spike (ADR-70 § 4 / SPEC-F04-super-elementor.md § 3.5, gate di FASE 3).
 *
 * Riproduce la configurazione REALE di `FullScreenEditorLayout.tsx` (righe 335-338, 511-522):
 * stessi sensori (`PointerSensor` con `activationConstraint: { distance: 5 }`,
 * `KeyboardSensor` senza opzioni), stessa `collisionDetection={pointerWithin}` — più
 * `IframeBridgeSensor` da verificare. Rotta dev-only `/dev/dnd-iframe-spike` (vedi App.tsx),
 * mai linkata dalla navigazione di produzione.
 */
import { useEffect, useRef, useState } from 'react';
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
import { IframeBridgeSensor, registerIframeBridgeTarget } from './IframeBridgeSensor';

declare global {
  interface Window {
    __SPIKE_DND_EVENTS__?: unknown[];
  }
}

function logDndEvent(entry: Record<string, unknown>): void {
  if (!window.__SPIKE_DND_EVENTS__) window.__SPIKE_DND_EVENTS__ = [];
  window.__SPIKE_DND_EVENTS__.push({ ts: Date.now(), ...entry });
}

/** Tessera della "palette" nel documento padre — stesso hook/stessa forma di
 * `WidgetPalette.tsx:80-83` (`WidgetTile`). Sorgente dello scenario (a) del task. */
function PaletteTile(): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'new-block:spike-demo',
    data: { type: 'spike-demo', isNew: true },
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
      Trascina "Nuovo blocco" →
    </button>
  );
}

/** Drop-zone di controllo nel documento PADRE (fuori dall'iframe): baseline per confermare che
 * l'impalcatura dnd-kit del PoC funziona come nel canvas reale, prima di guardare l'iframe. */
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

export default function PageSpikeParent(): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string>('(nessun drag ancora concluso)');
  const [log, setLog] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
    useSensor(IframeBridgeSensor),
  );

  useEffect(() => {
    window.__SPIKE_BRIDGE_LOG__ = [];
    window.__SPIKE_DND_EVENTS__ = [];
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
    registerIframeBridgeTarget(frameRef.current);
    appendLog('iframe load → registerIframeBridgeTarget(frame) eseguito (§2.1 della spec)');
  }

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 16 }}>
        Spike IframeBridgeSensor — gate ADR-70 § 4 / SPEC-F04-super-elementor.md § 3.5
      </h2>
      <p style={{ fontSize: 12, color: '#495057', maxWidth: 720 }}>
        Scenario (a): trascina la tessera qui sotto dentro il riquadro nell&apos;iframe. Scenario
        (b): prova a trascinare uno dei &quot;Blocco A/B/C&quot; dentro l&apos;iframe stesso
        (riordino interno). Il pannello diagnostico registra ogni evento nativo e ogni evento
        dnd-kit.
      </p>

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
            src="/spike-dnd-iframe.html"
            title="Canvas della spike"
            onLoad={handleIframeLoad}
            data-testid="spike-iframe"
            style={{ width: 480, height: 360, border: '1px solid #adb5bd', borderRadius: 8 }}
          />

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
