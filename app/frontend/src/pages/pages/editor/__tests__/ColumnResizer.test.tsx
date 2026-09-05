/**
 * Component test della maniglia di ridimensionamento inter-colonna di `section`: visibilità,
 * badge in tempo reale, e — il punto che fa la differenza rispetto alla versione precedente
 * (inline in `EditorBlockWrapper.tsx`, committava `updateBlockPropsAction` ad ogni cambio di
 * soglia durante il drag) — **una sola** voce di undo/redo per l'intero trascinamento, non
 * una per `pointermove`. Stesso principio di `ContainerResizeHandle.test.tsx`.
 *
 * `columnRatio` è già dichiarata dal registro reale (`section.block.ts`, `kind: 'enum'`),
 * a differenza della prop di larghezza di `container`: nessun mock di `BLOCK_TYPES` qui
 * necessario.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/utils';
import { useBlockEditorStore } from '../../../../hooks/useBlockEditorStore';
import type { BlockNode } from '../block-tree.utils';
import EditorBlockWrapper from '../EditorBlockWrapper';

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/**
 * jsdom non implementa il layout: ogni `getBoundingClientRect()` è a zero. Qui ogni elemento
 * misura 800px a partire da `left: 0`, così la matematica del gesto è verificabile:
 * `clientX: 240` è il 30% del padre (stop "30-70", RFC-58), `clientX: 400` è il 50% ("equal").
 */
const PARENT_WIDTH = 800;
let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

/** jsdom non implementa nemmeno la Pointer Capture API, di cui il gesto ha bisogno. */
const capturedPointers = new Set<number>();

/**
 * jsdom non implementa `PointerEvent`: senza questo polyfill Testing Library ricade su un
 * `Event` generico, che non porta `clientX` — ogni `pointermove` arriverebbe al gesto come
 * "puntatore all'ascissa 0". Estende `MouseEvent`, che le coordinate le ha davvero.
 */
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeEach(() => {
  window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
  originalGetRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function mockRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: PARENT_WIDTH,
      bottom: 100,
      width: PARENT_WIDTH,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  };
  capturedPointers.clear();
  HTMLElement.prototype.setPointerCapture = function setCapture(pointerId: number): void {
    capturedPointers.add(pointerId);
  };
  HTMLElement.prototype.hasPointerCapture = function hasCapture(pointerId: number): boolean {
    return capturedPointers.has(pointerId);
  };
  HTMLElement.prototype.releasePointerCapture = function releaseCapture(pointerId: number): void {
    capturedPointers.delete(pointerId);
  };

  useBlockEditorStore.getState().initTree([]);
  useBlockEditorStore.getState().setActiveViewport('desktop');
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
});

/** Monta una `section` a due colonne come unico nodo di radice e la seleziona (o no). */
function mountSection(options: { selected: boolean; columnRatio?: string }): void {
  const section = node(
    'sec-1',
    'section',
    { columns: { default: '2' }, ...(options.columnRatio ? { columnRatio: options.columnRatio } : {}) },
    [node('h-1', 'heading', { level: 'h2', text: 'Colonna 1' }), node('h-2', 'heading', { level: 'h2', text: 'Colonna 2' })],
  );
  useBlockEditorStore.getState().initTree([section]);
  if (options.selected) useBlockEditorStore.getState().selectNode('sec-1');
  renderWithProviders(<EditorBlockWrapper id="sec-1" />);
}

/** La maniglia montata, o `null` se assente. */
function handle(): HTMLElement | null {
  return screen.queryByTestId('column-resizer-handle');
}

/** Nodo `sec-1` così com'è nell'albero in questo istante. */
function currentSection(): BlockNode | undefined {
  return useBlockEditorStore.getState().tree.find((entry) => entry.id === 'sec-1');
}

describe('ColumnResizer — visibilità', () => {
  it('section a due colonne: la maniglia è montata (anche senza selezione — a differenza del resizer di container)', () => {
    mountSection({ selected: false });
    expect(handle()).not.toBeNull();
  });

  it('section a una colonna: nessuna maniglia (significativa solo con 2 colonne)', () => {
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [
      node('h-1', 'heading', { level: 'h2', text: 'Titolo' }),
    ]);
    useBlockEditorStore.getState().initTree([section]);
    renderWithProviders(<EditorBlockWrapper id="sec-1" />);
    expect(handle()).toBeNull();
  });

  it('container selezionato: nessuna maniglia inter-colonna (ha il proprio resizer di larghezza)', () => {
    const container = node('cnt-1', 'container', {}, [node('h-1', 'heading', { level: 'h2', text: 'Titolo' })]);
    useBlockEditorStore.getState().initTree([container]);
    useBlockEditorStore.getState().selectNode('cnt-1');
    renderWithProviders(<EditorBlockWrapper id="cnt-1" />);
    expect(handle()).toBeNull();
  });

  it('il badge compare solo durante il trascinamento, non a riposo', () => {
    mountSection({ selected: true });
    expect(screen.queryByTestId('column-resizer-badge')).toBeNull();

    fireEvent.pointerDown(handle() as HTMLElement, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    expect(screen.getByTestId('column-resizer-badge')).toBeTruthy();
  });
});

describe('ColumnResizer — calcolo e anteprima', () => {
  it('il trascinamento a metà del contenitore mostra "50% / 50%" e non tocca l’albero', () => {
    mountSection({ selected: true });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });

    expect(screen.getByTestId('column-resizer-badge').textContent).toBe('50% / 50%');
    expect(currentSection()?.props.columnRatio).toBeUndefined();
  });

  it('un trascinamento a sinistra (30% del contenitore) mostra "30% / 70%" (stop "30-70", RFC-58: più vicino di "33-66" a una posizione esattamente al 30%)', () => {
    mountSection({ selected: true });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH * 0.3 });

    expect(screen.getByTestId('column-resizer-badge').textContent).toBe('30% / 70%');
  });

  it('un trascinamento a destra (70% del contenitore) mostra "70% / 30%" (stop "70-30", RFC-58: più vicino di "66-33" a una posizione esattamente al 70%)', () => {
    mountSection({ selected: true });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH * 0.7 });

    expect(screen.getByTestId('column-resizer-badge').textContent).toBe('70% / 30%');
  });
});

describe('ColumnResizer — commit e undo/redo', () => {
  it('l’intero trascinamento registra UNA sola voce di history, non una per pointermove', () => {
    mountSection({ selected: true });
    const grip = handle() as HTMLElement;
    const depthBefore = useBlockEditorStore.getState().undoStack.length;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    // Cinque posizioni che attraversano più volte le soglie fra i cinque stop (RFC-58).
    for (const x of [200, 700, 240, 560, 240]) {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: x });
    }
    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);

    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 240 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore + 1);
    // 240/800 = 30% esatto: con RFC-58 lo stop più vicino è "30-70" (distanza 0), non più
    // "33-66" (distanza 3.33%) — comportamento cambiato legittimamente dal nuovo stop più
    // esterno, non una regressione.
    expect(currentSection()?.props.columnRatio).toBe('30-70');
    expect(useBlockEditorStore.getState().columnResize).toBeNull();
  });

  it('undo riporta la section allo stop precedente, redo lo riapplica', () => {
    mountSection({ selected: true, columnRatio: '66-33' });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    expect(currentSection()?.props.columnRatio).toBe('equal');

    useBlockEditorStore.getState().undo();
    expect(currentSection()?.props.columnRatio).toBe('66-33');

    useBlockEditorStore.getState().redo();
    expect(currentSection()?.props.columnRatio).toBe('equal');
  });

  it('un trascinamento che torna allo stop di partenza non sporca la history', () => {
    mountSection({ selected: true, columnRatio: 'equal' });
    const grip = handle() as HTMLElement;
    const depthBefore = useBlockEditorStore.getState().undoStack.length;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);
  });

  it('pointercancel abbandona il gesto senza committare nulla', () => {
    mountSection({ selected: true });
    const grip = handle() as HTMLElement;
    const depthBefore = useBlockEditorStore.getState().undoStack.length;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 100 });
    fireEvent.pointerCancel(grip, { pointerId: 1 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);
    expect(currentSection()?.props.columnRatio).toBeUndefined();
    expect(useBlockEditorStore.getState().columnResize).toBeNull();
  });
});
