/**
 * Component test della maniglia generica di ridimensionamento (ADR-71
 * resize-handles-unita-dinamiche.md, `ResizeHandle.tsx`, montata da `EditorBlockWrapper.tsx`):
 * visibilità legata a selezione + registro, anteprima durante il trascinamento (nessuna voce
 * di history), commit clampato al rilascio. Stesso idioma e stesse infrastrutture jsdom di
 * `ContainerResizeHandle.test.tsx` (la maniglia pre-esistente), ma sul **registro reale** —
 * a differenza di quel file, qui non serve mockare `blocks.types` perché `container.styleWidth`/
 * `container.styleHeight` sono già dichiarate `unitValue` px/% dal registro (ADR-71 § 3).
 * Copre solo i casi specifici della maniglia generica: `px` diretto oltre a `%`, risoluzione
 * dinamica per `(blockType, propName)` diversi, maniglia assente quando il registro non
 * dichiara la prop per quel tipo — mai duplicando i casi già coperti da
 * `ContainerResizeHandle.test.tsx` per la maniglia `styleFlexBasis`.
 *
 * ADR-73-rimozione-maniglie-resize-widget-foglia.md (2026-09-16) restringe parzialmente
 * ADR-71 § "Decisione" punto 3: `heading`/`richText`/`image`/`button` non montano più
 * `ResizeHandle` per nessuna prop (né margini né, per `image`, `styleWidth`/`styleHeight`) —
 * solo `container` resta un widget con maniglia trascinabile sul canvas. I casi di
 * trascinamento/commit sotto, che prima usavano `heading.styleMarginTop` come esempio di
 * comodo, ora usano `container.styleHeight` (stesso asse verticale, stessa meccanica `px`
 * diretto, `direction: 1` invece di `-1` — la direzione `-1` dei margini "iniziali" resta
 * comunque coperta a livello di funzione pura in `resize-handle.utils.test.ts`, non più
 * raggiungibile da nessun tipo di blocco a livello di componente dopo ADR-73).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../../test/utils';
import { useBlockEditorStore, usePropResizePreview } from '../../../../hooks/useBlockEditorStore';
import { renderHook } from '@testing-library/react';
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
 * misura `PARENT_SIZE` di lato (larghezza E altezza), a partire da `left/top: 0` — copre sia
 * l'asse orizzontale (`styleWidth`/margini laterali) sia il verticale (`styleHeight`/margini
 * verticali) con lo stesso mock, stesso principio di `ContainerResizeHandle.test.tsx`.
 */
const PARENT_SIZE = 800;
let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

/** jsdom non implementa nemmeno la Pointer Capture API, di cui il gesto ha bisogno. */
const capturedPointers = new Set<number>();

/**
 * jsdom non implementa `PointerEvent`: senza questo polyfill Testing Library ricade su un
 * `Event` generico, privo di `clientX`/`clientY` (vedi il commento gemello in
 * `ContainerResizeHandle.test.tsx`).
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
      right: PARENT_SIZE,
      bottom: PARENT_SIZE,
      width: PARENT_SIZE,
      height: PARENT_SIZE,
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

/** Monta un nodo di root `type` con `props`, selezionato o no. */
function mountNode(
  type: string,
  props: Record<string, unknown>,
  options: { selected: boolean },
): void {
  const built = node('n-1', type, props);
  useBlockEditorStore.getState().initTree([built]);
  if (options.selected) useBlockEditorStore.getState().selectNode('n-1');
  renderWithProviders(<EditorBlockWrapper id="n-1" />);
}

/** Nodo `n-1` così com'è nell'albero in questo istante. */
function currentNode(): BlockNode | undefined {
  return useBlockEditorStore.getState().tree.find((entry) => entry.id === 'n-1');
}

describe('ResizeHandle — visibilità (ADR-71): solo su nodo selezionato e prop dichiarata dal registro', () => {
  it('heading selezionato: nessuna maniglia styleMarginTop — widget foglia escluso (ADR-73 § "Decisione" punto 1, supersede parziale di ADR-71 § 3)', () => {
    mountNode('heading', { level: 'h2', text: 'Titolo' }, { selected: true });
    expect(screen.queryByTestId('resize-handle-styleMarginTop')).toBeNull();
  });

  it('heading non selezionato: nessuna maniglia (né per l\'esclusione ADR-73, né per la mancata selezione)', () => {
    mountNode('heading', { level: 'h2', text: 'Titolo' }, { selected: false });
    expect(screen.queryByTestId('resize-handle-styleMarginTop')).toBeNull();
  });

  it('container selezionato: la maniglia styleWidth è montata (dichiarata dal registro, ADR-71 § 3 — container non è escluso da ADR-73)', () => {
    mountNode('container', {}, { selected: true });
    expect(screen.queryByTestId('resize-handle-styleWidth')).not.toBeNull();
  });

  it('container selezionato: la maniglia styleHeight è montata (dichiarata dal registro, ADR-71 § 3 — container non è escluso da ADR-73)', () => {
    mountNode('container', {}, { selected: true });
    expect(screen.queryByTestId('resize-handle-styleHeight')).not.toBeNull();
  });

  it('heading non dichiara styleWidth (oltre a essere comunque un widget foglia escluso, ADR-73): nessuna maniglia, anche selezionato', () => {
    mountNode('heading', { level: 'h2', text: 'Titolo' }, { selected: true });
    expect(screen.queryByTestId('resize-handle-styleWidth')).toBeNull();
  });

  it('container.styleMarginTop resta un enum a token (ADR-33 § 4), non una prop pilotabile da maniglia: nessuna maniglia anche selezionato', () => {
    mountNode('container', {}, { selected: true });
    expect(screen.queryByTestId('resize-handle-styleMarginTop')).toBeNull();
    expect(screen.queryByTestId('resize-handle-styleMarginBottom')).toBeNull();
    expect(screen.queryByTestId('resize-handle-styleMarginLeft')).toBeNull();
    expect(screen.queryByTestId('resize-handle-styleMarginRight')).toBeNull();
  });

  /**
   * ADR-73 § "Decisione" punto 1: i quattro widget foglia, non solo `heading` sopra. Props
   * minime realistiche per tipo (stesso pattern di `EditorBlockWrapper.test.tsx`), solo per
   * evitare un rendering vuoto/malformato — irrilevanti per l'asserzione, che riguarda solo
   * l'assenza della maniglia.
   */
  const LEAF_MOUNT_PROPS: Record<'richText' | 'image' | 'button', Record<string, unknown>> = {
    richText: { html: '<p>Ciao</p>' },
    image: { mediaRef: 'a1b2c3d4e5f6a1b2', alt: 'Descrizione' },
    button: { label: 'Vai', href: '/pagina' },
  };

  it.each(['richText', 'image', 'button'] as const)(
    '%s selezionato: nessuna maniglia styleWidth/styleHeight/margini, qualunque prop dichiarata dal registro (ADR-73)',
    (blockType) => {
      mountNode(blockType, LEAF_MOUNT_PROPS[blockType], { selected: true });
      expect(screen.queryByTestId('resize-handle-styleWidth')).toBeNull();
      expect(screen.queryByTestId('resize-handle-styleHeight')).toBeNull();
      expect(screen.queryByTestId('resize-handle-styleMarginTop')).toBeNull();
      expect(screen.queryByTestId('resize-handle-styleMarginBottom')).toBeNull();
      expect(screen.queryByTestId('resize-handle-styleMarginLeft')).toBeNull();
      expect(screen.queryByTestId('resize-handle-styleMarginRight')).toBeNull();
    },
  );
});

describe('ResizeHandle — trascinamento: solo anteprima, nessuna voce di history (ADR-71 § "Decisione" punto 5)', () => {
  it('px diretto: il trascinamento aggiorna solo usePropResizePreview, la prop sul nodo resta invariata', () => {
    mountNode('container', { styleHeight: { value: 20, unit: 'px' } }, { selected: true });
    const depthBefore = useBlockEditorStore.getState().undoStack.length;
    const grip = screen.getByTestId('resize-handle-styleHeight');

    // Asse verticale, direzione 1 (styleHeight, lato "finale" del box): muoversi verso il
    // basso (clientY maggiore dell'origine) allarga l'altezza. Origine a 400, spostamento a
    // 430 → 30px verso il basso.
    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 430 });

    const { result } = renderHook(() => usePropResizePreview('n-1', 'styleHeight'));
    expect(result.current).toEqual({ value: 50, unit: 'px' });
    expect(currentNode()?.props.styleHeight).toEqual({ value: 20, unit: 'px' });
    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);
  });

  it('%: il delta è relativo al contenitore padre, non al pixel assoluto', () => {
    mountNode(
      'container',
      { styleWidth: { value: 50, unit: '%' } },
      { selected: true },
    );
    const grip = screen.getByTestId('resize-handle-styleWidth');

    // Asse orizzontale, direzione 1 (styleWidth). Padre di 800px: 80px di spostamento a
    // destra equivalgono a 10 punti percentuali (80/800*100).
    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 80 });

    expect(screen.getByTestId('resize-handle-badge-styleWidth').textContent).toBe('60%');
  });

  it('il badge in tempo reale compare solo durante il trascinamento, non a riposo', () => {
    mountNode('container', { styleHeight: { value: 20, unit: 'px' } }, { selected: true });
    expect(screen.queryByTestId('resize-handle-badge-styleHeight')).toBeNull();

    fireEvent.pointerDown(screen.getByTestId('resize-handle-styleHeight'), {
      pointerId: 1,
      clientY: 400,
    });
    expect(screen.getByTestId('resize-handle-badge-styleHeight')).toBeTruthy();
  });
});

describe('ResizeHandle — commit al rilascio, clampato dentro [min, max] (ADR-71 § "Decisione" punto 5)', () => {
  it('il rilascio chiama updateBlockPropsAction con il valore finale e registra UNA sola voce di history', () => {
    mountNode('container', { styleHeight: { value: 20, unit: 'px' } }, { selected: true });
    const depthBefore = useBlockEditorStore.getState().undoStack.length;
    const grip = screen.getByTestId('resize-handle-styleHeight');

    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 430 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 430 });

    expect(currentNode()?.props.styleHeight).toEqual({ value: 50, unit: 'px' });
    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore + 1);
    const { result } = renderHook(() => usePropResizePreview('n-1', 'styleHeight'));
    expect(result.current).toBeNull();
  });

  it('un trascinamento oltre il massimo dichiarato (4000, container.styleHeight) commette il valore clampato al massimo, mai il valore grezzo', () => {
    mountNode('container', { styleHeight: { value: 0, unit: 'px' } }, { selected: true });
    const grip = screen.getByTestId('resize-handle-styleHeight');

    // direzione 1: muoversi molto verso il basso (clientY molto maggiore dell'origine) spinge
    // il valore ben oltre il massimo dichiarato (4000px, molto più ampio dei 500px del
    // vecchio esempio a margine — serve un delta maggiore per superarlo).
    fireEvent.pointerDown(grip, { pointerId: 1, clientY: -5000 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 5000 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 5000 });

    expect(currentNode()?.props.styleHeight).toEqual({ value: 4000, unit: 'px' });
  });

  it('un trascinamento sotto il minimo dichiarato (0) commette il valore clampato al minimo', () => {
    mountNode('container', { styleHeight: { value: 100, unit: 'px' } }, { selected: true });
    const grip = screen.getByTestId('resize-handle-styleHeight');

    // direzione 1: muoversi verso l'alto (clientY minore dell'origine) riduce l'altezza —
    // ben oltre lo zero.
    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 5000 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 0 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 0 });

    expect(currentNode()?.props.styleHeight).toEqual({ value: 0, unit: 'px' });
  });

  it('pointercancel abbandona il gesto senza committare nulla', () => {
    mountNode('container', { styleHeight: { value: 20, unit: 'px' } }, { selected: true });
    const depthBefore = useBlockEditorStore.getState().undoStack.length;
    const grip = screen.getByTestId('resize-handle-styleHeight');

    fireEvent.pointerDown(grip, { pointerId: 1, clientY: 400 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 430 });
    fireEvent.pointerCancel(grip, { pointerId: 1 });

    expect(useBlockEditorStore.getState().undoStack.length).toBe(depthBefore);
    expect(currentNode()?.props.styleHeight).toEqual({ value: 20, unit: 'px' });
    const { result } = renderHook(() => usePropResizePreview('n-1', 'styleHeight'));
    expect(result.current).toBeNull();
  });
});
