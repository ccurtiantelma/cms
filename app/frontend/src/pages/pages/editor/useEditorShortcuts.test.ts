/**
 * Unit test del motore di scorciatoie da tastiera dell'Editor Visivo
 * (`useEditorShortcuts.ts`): copre le cinque scorciatoie, il no-op "nessun blocco
 * selezionato" per Delete/Ctrl+D e il no-op "fuoco su un campo di digitazione" per tutte.
 *
 * Lo store è mockato: qui interessa solo che il listener `keydown` invochi l'azione
 * giusta con l'argomento giusto — la correttezza delle azioni stesse (undo/redo/
 * removeBlockAction/...) è già coperta da `useBlockEditorStore.test.ts`.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const undo = vi.fn();
const redo = vi.fn();
const selectNode = vi.fn();
const removeBlockAction = vi.fn();
const duplicateNodeAction = vi.fn();

// `useSelectedId` è un hook selettore mirato: mockato a parte per poter cambiare il suo
// valore di ritorno fra un test e l'altro senza dover ricreare l'intero store Zustand.
let mockSelectedId: string | null = null;

vi.mock('../../../hooks/useBlockEditorStore', () => ({
  useSelectedId: () => mockSelectedId,
  useBlockEditorStore: {
    getState: () => ({
      undo,
      redo,
      selectNode,
      removeBlockAction,
      duplicateNodeAction,
    }),
  },
}));

const { useEditorShortcuts } = await import('./useEditorShortcuts');

/** Dispara un `keydown` sulla `window`, con `target` opzionale (default: `document.body`). */
function fireKeyDown(init: KeyboardEventInit & { target?: EventTarget }): void {
  const { target, ...eventInit } = init;
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit });
  (target ?? window).dispatchEvent(event);
}

describe('useEditorShortcuts', () => {
  beforeEach(() => {
    mockSelectedId = null;
    undo.mockClear();
    redo.mockClear();
    selectNode.mockClear();
    removeBlockAction.mockClear();
    duplicateNodeAction.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Ctrl+Z chiama undo()', () => {
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
  });

  it('Cmd+Z (metaKey) chiama undo()', () => {
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'z', metaKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z chiama redo()', () => {
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+Z chiama redo()', () => {
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'z', metaKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y chiama redo()', () => {
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'y', ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('Delete elimina il blocco selezionato', () => {
    mockSelectedId = 'block-1';
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'Delete' });
    expect(removeBlockAction).toHaveBeenCalledWith('block-1');
  });

  it('Backspace elimina il blocco selezionato', () => {
    mockSelectedId = 'block-2';
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'Backspace' });
    expect(removeBlockAction).toHaveBeenCalledWith('block-2');
  });

  it('Delete senza blocco selezionato è no-op', () => {
    mockSelectedId = null;
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'Delete' });
    expect(removeBlockAction).not.toHaveBeenCalled();
  });

  it('Escape deseleziona', () => {
    mockSelectedId = 'block-1';
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'Escape' });
    expect(selectNode).toHaveBeenCalledWith(null);
  });

  it('Ctrl+D duplica il blocco selezionato', () => {
    mockSelectedId = 'block-3';
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'd', ctrlKey: true });
    expect(duplicateNodeAction).toHaveBeenCalledWith('block-3');
  });

  it('Cmd+D duplica il blocco selezionato', () => {
    mockSelectedId = 'block-4';
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'd', metaKey: true });
    expect(duplicateNodeAction).toHaveBeenCalledWith('block-4');
  });

  it('Ctrl+D senza blocco selezionato è no-op', () => {
    mockSelectedId = null;
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'd', ctrlKey: true });
    expect(duplicateNodeAction).not.toHaveBeenCalled();
  });

  it('ignora le scorciatoie quando il fuoco è su un <input>', () => {
    mockSelectedId = 'block-1';
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'z', ctrlKey: true, target: input });
    fireKeyDown({ key: 'Delete', target: input });
    fireKeyDown({ key: 'Escape', target: input });
    fireKeyDown({ key: 'd', ctrlKey: true, target: input });
    expect(undo).not.toHaveBeenCalled();
    expect(removeBlockAction).not.toHaveBeenCalled();
    expect(selectNode).not.toHaveBeenCalled();
    expect(duplicateNodeAction).not.toHaveBeenCalled();
  });

  it('ignora le scorciatoie quando il fuoco è su una <textarea>', () => {
    mockSelectedId = 'block-1';
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'z', ctrlKey: true, target: textarea });
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignora le scorciatoie quando il fuoco è su un elemento contentEditable', () => {
    mockSelectedId = 'block-1';
    // jsdom non calcola `isContentEditable` da `contenteditable="true"` (limite noto della
    // libreria, non del codice sotto test): la proprietà è ridefinita direttamente per
    // simulare un editor rich text montato (es. Tiptap/`RichText`), che marca così il suo
    // nodo radice.
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    renderHook(() => useEditorShortcuts());
    fireKeyDown({ key: 'Delete', target: editable });
    expect(removeBlockAction).not.toHaveBeenCalled();
  });

  it('enabled=false non registra alcun listener', () => {
    mockSelectedId = 'block-1';
    renderHook(() => useEditorShortcuts(false));
    fireKeyDown({ key: 'z', ctrlKey: true });
    fireKeyDown({ key: 'Delete' });
    expect(undo).not.toHaveBeenCalled();
    expect(removeBlockAction).not.toHaveBeenCalled();
  });

  it('rimuove il listener allo smontaggio', () => {
    const { unmount } = renderHook(() => useEditorShortcuts());
    unmount();
    fireKeyDown({ key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });
});
