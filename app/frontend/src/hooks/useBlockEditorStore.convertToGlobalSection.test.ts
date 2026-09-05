/**
 * Unit test di `convertToGlobalSectionAction` (ADR-55, F06 esteso): estrae il sottoalbero
 * selezionato, chiama `createGlobalSection` (`services/global-sections.service.ts`) e
 * sostituisce il nodo con un puntatore `{type: 'globalRef', props: {globalSectionGuid},
 * children: []}` **solo** se la chiamata riesce. `createGlobalSection` è mockato (servizio
 * esterno/chiamata di rete, mai reale nei test): un test dedicato lo fa fallire per
 * verificare che l'albero locale resti invariato e che l'errore sia notificato via
 * `notifications.show` (mockato, stesso pattern di `useBlockEditorStore.test.ts`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBlockEditorStore } from './useBlockEditorStore';
import type { BlockNode } from '../pages/pages/editor/block-tree.utils';
import type { GlobalSectionRecord } from '../types/global-sections.types';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
const { notifications } = await import('@mantine/notifications');

vi.mock('../services/global-sections.service', () => ({
  createGlobalSection: vi.fn(),
}));
const { createGlobalSection } = await import('../services/global-sections.service');

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/** Riga `GlobalSectionRecord` minima plausibile, come restituita da `POST /app/global-sections`. */
function buildRecord(guid: string): GlobalSectionRecord {
  return {
    guid,
    title: 'Hero aziendale',
    slug: 'hero-aziendale',
    layoutSlot: 'none',
    isSticky: false,
    content: { version: 1, blocks: [] },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GlobalSectionRecord;
}

describe('useBlockEditorStore — convertToGlobalSectionAction (ADR-55)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().selectNode(null);
    vi.mocked(createGlobalSection).mockReset();
    vi.mocked(notifications.show).mockClear();
  });

  it('happy path: sostituisce il sottoalbero selezionato con un nodo globalRef solo dopo che createGlobalSection ha successo, e ritorna true', async () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    vi.mocked(createGlobalSection).mockResolvedValue(buildRecord('aaaaaaaaaaaaaaaa'));

    const result = await useBlockEditorStore
      .getState()
      .convertToGlobalSectionAction('sec-1', 'Hero aziendale');

    expect(result).toBe(true);
    expect(createGlobalSection).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(createGlobalSection).mock.calls[0][0];
    expect(payload.title).toBe('Hero aziendale');

    const tree = useBlockEditorStore.getState().tree;
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('globalRef');
    expect(tree[0].props).toEqual({ globalSectionGuid: 'aaaaaaaaaaaaaaaa' });
    expect(tree[0].children).toEqual([]);
    // Il nodo originale non è più nell'albero, sostituito integralmente dal puntatore.
    expect(tree[0].id).not.toBe('sec-1');

    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'green' }),
    );
  });

  it('errore di rete: createGlobalSection fallisce → l\'albero locale resta invariato, notifications.show mostra l\'errore, ritorna false', async () => {
    const child = node('h-child', 'heading', { level: 'h2', text: 'Titolo' });
    const section = node('sec-1', 'section', { columns: { default: '1' } }, [child]);
    useBlockEditorStore.getState().initTree([section]);
    vi.mocked(createGlobalSection).mockRejectedValue(new Error('Network Error'));

    const result = await useBlockEditorStore
      .getState()
      .convertToGlobalSectionAction('sec-1', 'Hero aziendale');

    expect(result).toBe(false);
    expect(createGlobalSection).toHaveBeenCalledTimes(1);

    // Nessuna sostituzione: l'albero è esattamente quello di partenza (stesso id/struttura).
    const tree = useBlockEditorStore.getState().tree;
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('sec-1');
    expect(tree[0].type).toBe('section');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('h-child');

    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red' }),
    );
  });

  it('un id inesistente (nodo sparito prima della chiamata) ritorna false senza invocare createGlobalSection', async () => {
    useBlockEditorStore.getState().initTree([node('sec-1', 'section', {}, [])]);

    const result = await useBlockEditorStore
      .getState()
      .convertToGlobalSectionAction('id-inesistente', 'Titolo');

    expect(result).toBe(false);
    expect(createGlobalSection).not.toHaveBeenCalled();
  });
});
