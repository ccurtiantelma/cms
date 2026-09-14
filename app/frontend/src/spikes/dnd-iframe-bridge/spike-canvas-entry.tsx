/**
 * Entry point React montato dentro l'iframe della Spike (`spike-dnd-iframe.html`).
 *
 * Root React SEPARATO da quello del documento padre (proprio `ReactDOM.createRoot`), per
 * riprodurre fedelmente ADR-70 § "Decisione" punto 1: "Il canvas ... viene montato dentro un
 * `<iframe>` ... Il canvas carica un entry point React dedicato". Deliberatamente NESSUN
 * `DndContext` qui (vincolo ADR-70 punto 3 / SPEC-F04-super-elementor.md § "Vincoli e
 * assunzioni" punto 3): i blocchi sotto usano `useDraggable`/`useDroppable` di
 * `@dnd-kit/core` esattamente come farebbe `EditorBlockWrapper.tsx` nel canvas reale, per
 * verificare se si registrano comunque con il `DndContext` del padre in assenza di un
 * proprio Provider locale.
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function logNative(kind: string, extra: Record<string, unknown> = {}): void {
  const top = window.top ?? window;
  if (!top.__SPIKE_BRIDGE_LOG__) top.__SPIKE_BRIDGE_LOG__ = [];
  top.__SPIKE_BRIDGE_LOG__.push({ ts: Date.now(), source: 'iframe-native-dom', kind, ...extra });
}

/** Un "blocco" del canvas nell'iframe: drag source (riordino) + drop target, esattamente come
 * `EditorBlockWrapper.tsx` (righe 1099-1124) — stessi hook, stessa forma di `data`, unica
 * differenza è il documento/root React in cui questi hook girano. */
function IframeBlock({ id, label }: { id: string; label: string }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type: 'spike-block' },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${id}`,
    data: { parentId: 'iframe-root', index: 0 },
  });

  return (
    <div
      ref={setDropRef}
      data-testid={`iframe-block-dropzone-${id}`}
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
        data-testid={`iframe-block-${id}`}
        onPointerDownCapture={() => logNative('pointerdown-on-block', { id })}
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

/** Zona droppable "canvas root": bersaglio di uno drag avviato dalla palette nel padre
 * (scenario a) del task). Analoga a `EditorCanvas.tsx:88-91` (`root-empty-dropzone`). */
function IframeCanvasRoot(): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: 'iframe-canvas-root',
    data: { parentId: null, index: 0 },
  });
  const [pointerEventsSeen, setPointerEventsSeen] = useState(0);

  useEffect(() => {
    function onNativeMove(): void {
      setPointerEventsSeen((n) => n + 1);
    }
    document.addEventListener('pointermove', onNativeMove);
    return () => document.removeEventListener('pointermove', onNativeMove);
  }, []);

  return (
    <div
      ref={setNodeRef}
      data-testid="iframe-canvas-root"
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
        Canvas (iframe) — <code>useDroppable(&apos;iframe-canvas-root&apos;)</code>.
        isOver=<b>{String(isOver)}</b> · pointermove nativi ricevuti da questo documento:{' '}
        <b>{pointerEventsSeen}</b>
      </p>
      <IframeBlock id="iframe-block-1" label="Blocco A (container)" />
      <IframeBlock id="iframe-block-2" label="Blocco B (widget)" />
      <IframeBlock id="iframe-block-3" label="Blocco C (widget)" />
    </div>
  );
}

function SpikeCanvasApp(): React.JSX.Element {
  return (
    <div style={{ padding: 12 }}>
      <h4 style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#868e96' }}>
        Documento iframe — root React separato, nessun DndContext locale
      </h4>
      <IframeCanvasRoot />
    </div>
  );
}

logNative('mount');
ReactDOM.createRoot(document.getElementById('spike-canvas-root')!).render(<SpikeCanvasApp />);
