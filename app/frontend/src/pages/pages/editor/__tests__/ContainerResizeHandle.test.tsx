/**
 * Component test della maniglia di ridimensionamento orizzontale di `container` (E03):
 * visibilità, badge in tempo reale, e — il punto che fa la differenza — **una sola** voce di
 * undo/redo per l'intero trascinamento, non una per `pointermove`.
 *
 * Il registro reale non dichiara la prop di larghezza su `container` (ADR-39 § 2: layout
 * puro): qui viene mocked per esercitare il percorso completo, e un test dedicato verifica
 * il comportamento con il registro **reale** — nessuna maniglia, perché una prop non
 * dichiarata verrebbe respinta dal validatore server-side con `BLOCK_PROP_NOT_DECLARED`
 * facendo fallire il salvataggio dell'intera pagina.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/utils';
import type { BlockNode } from '../block-tree.utils';

vi.mock('../../../../types/blocks.types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../types/blocks.types')>();
  return {
    ...actual,
    BLOCK_TYPES: actual.BLOCK_TYPES.map((descriptor) =>
      descriptor.type === 'container'
        ? {
            ...descriptor,
            props: [
              ...descriptor.props,
              {
                name: 'styleFlexBasis',
                kind: 'unitValue' as const,
                required: false,
                units: ['%'] as const,
                min: 5,
                max: 100,
              },
            ],
          }
        : descriptor,
    ),
  };
});

const { useBlockEditorStore } = await import('../../../../hooks/useBlockEditorStore');
const { CONTAINER_WIDTH_PROP } = await import('../container-resize.utils');
const { default: EditorBlockWrapper } = await import('../EditorBlockWrapper');

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
 * jsdom non implementa il layout: ogni `getBoundingClientRect()` è a zero, e la maniglia si
 * rifiuterebbe (correttamente) di partire su un padre di larghezza nulla. Qui ogni elemento
 * misura 800px a partire da `left: 0`, così la matematica del gesto è verificabile:
 * `clientX: 400` è metà del padre, cioè 50%.
 */
const PARENT_WIDTH = 800;
let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

/** jsdom non implementa nemmeno la Pointer Capture API, di cui il gesto ha bisogno. */
const capturedPointers = new Set<number>();

/**
 * jsdom non implementa `PointerEvent`: senza questo polyfill Testing Library ricade su un
 * `Event` generico, che **non porta `clientX`** — ogni `pointermove` arriverebbe al gesto
 * come "puntatore all'ascissa 0" e il test misurerebbe il clamp al minimo invece della
 * percentuale trascinata. Estende `MouseEvent`, che le coordinate le ha davvero.
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

/** Monta un `container` come unico nodo di radice e lo seleziona (o no). */
function mountContainer(options: { selected: boolean; props?: Record<string, unknown> }): void {
  const container = node('cnt-1', 'container', options.props ?? {}, [
    node('h-1', 'heading', { level: 'h2', text: 'Titolo' }),
  ]);
  useBlockEditorStore.getState().initTree([container]);
  if (options.selected) useBlockEditorStore.getState().selectNode('cnt-1');
  renderWithProviders(<EditorBlockWrapper id="cnt-1" />);
}

/** La maniglia montata, o `null` se assente. */
function handle(): HTMLElement | null {
  return screen.queryByTestId('container-resize-handle');
}

/** Nodo `cnt-1` così com'è nell'albero in questo istante. */
function currentContainer(): BlockNode | undefined {
  return useBlockEditorStore.getState().tree.find((entry) => entry.id === 'cnt-1');
}

describe('ContainerResizeHandle — visibilità (E03 punto 1)', () => {
  it('container selezionato: la maniglia è montata', () => {
    mountContainer({ selected: true });
    expect(handle()).not.toBeNull();
  });

  it('container non selezionato: nessuna maniglia (mai su hover)', () => {
    mountContainer({ selected: false });
    expect(handle()).toBeNull();
  });

  it('section selezionata: nessuna maniglia di container (ha il proprio resizer inter-colonna)', () => {
    useBlockEditorStore
      .getState()
      .initTree([node('sec-1', 'section', { columns: { default: '1' } })]);
    useBlockEditorStore.getState().selectNode('sec-1');
    renderWithProviders(<EditorBlockWrapper id="sec-1" />);
    expect(handle()).toBeNull();
  });

  it('il badge compare solo durante il trascinamento, non a riposo', () => {
    mountContainer({ selected: true, props: { [CONTAINER_WIDTH_PROP]: { value: 50, unit: '%' } } });
    expect(screen.queryByTestId('container-resize-badge')).toBeNull();

    fireEvent.pointerDown(handle() as HTMLElement, { pointerId: 1, clientX: PARENT_WIDTH });
    expect(screen.getByTestId('container-resize-badge')).toBeTruthy();
  });
});

describe('ContainerResizeHandle — calcolo e anteprima (E03 punti 2 e 3)', () => {
  it('il trascinamento a metà del padre mostra 50% nel badge e non tocca l’albero', () => {
    mountContainer({ selected: true });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });

    expect(screen.getByTestId('container-resize-badge').textContent).toBe('50%');
    // Anteprima: lo stato visivo è aggiornato, ma la prop sul nodo non esiste ancora.
    expect(useBlockEditorStore.getState().containerResize).toEqual({ id: 'cnt-1', percent: 50 });
    expect(currentContainer()?.props[CONTAINER_WIDTH_PROP]).toBeUndefined();
  });

  it('un terzo della larghezza del padre → 33.3%', () => {
    mountContainer({ selected: true });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 3 });

    expect(screen.getByTestId('container-resize-badge').textContent).toBe('33.3%');
  });

  it('il trascinamento oltre il bordo destro resta clampato a 100%', () => {
    mountContainer({ selected: true });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH * 4 });

    expect(screen.getByTestId('container-resize-badge').textContent).toBe('100%');
  });

  it('nessun pointerdown, nessuna anteprima: un pointermove isolato è ignorato', () => {
    mountContainer({ selected: true });
    fireEvent.pointerMove(handle() as HTMLElement, { pointerId: 1, clientX: 100 });
    expect(useBlockEditorStore.getState().containerResize).toBeNull();
  });
});

describe('ContainerResizeHandle — commit e undo/redo (E03 punto 3)', () => {
  it('l’intero trascinamento registra UNA sola voce di history, non una per pointermove', () => {
    mountContainer({ selected: true });
    const grip = handle() as HTMLElement;
    const depthBefore = useBlockEditorStore.getState().undoStack.length;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    for (const x of [700, 600, 500, 450, 400]) {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: x });
    }
    // Cinque movimenti, ancora zero voci di history: la cronologia non si intasa.
    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);

    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 400 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore + 1);
    expect(currentContainer()?.props[CONTAINER_WIDTH_PROP]).toEqual({ value: 50, unit: '%' });
    expect(useBlockEditorStore.getState().containerResize).toBeNull();
  });

  it('undo riporta il container al valore precedente, redo lo riapplica', () => {
    mountContainer({
      selected: true,
      props: { [CONTAINER_WIDTH_PROP]: { value: 100, unit: '%' } },
    });
    const grip = handle() as HTMLElement;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    expect(currentContainer()?.props[CONTAINER_WIDTH_PROP]).toEqual({ value: 50, unit: '%' });

    useBlockEditorStore.getState().undo();
    expect(currentContainer()?.props[CONTAINER_WIDTH_PROP]).toEqual({ value: 100, unit: '%' });

    useBlockEditorStore.getState().redo();
    expect(currentContainer()?.props[CONTAINER_WIDTH_PROP]).toEqual({ value: 50, unit: '%' });
  });

  it('un trascinamento che torna al valore di partenza non sporca la history', () => {
    mountContainer({ selected: true, props: { [CONTAINER_WIDTH_PROP]: { value: 50, unit: '%' } } });
    const grip = handle() as HTMLElement;
    const depthBefore = useBlockEditorStore.getState().undoStack.length;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);
  });

  it('pointercancel abbandona il gesto senza committare nulla', () => {
    mountContainer({ selected: true });
    const grip = handle() as HTMLElement;
    const depthBefore = useBlockEditorStore.getState().undoStack.length;

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: PARENT_WIDTH });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: PARENT_WIDTH / 2 });
    fireEvent.pointerCancel(grip, { pointerId: 1 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);
    expect(currentContainer()?.props[CONTAINER_WIDTH_PROP]).toBeUndefined();
    expect(useBlockEditorStore.getState().containerResize).toBeNull();
  });
});
