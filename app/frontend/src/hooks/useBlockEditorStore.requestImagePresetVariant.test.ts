/**
 * Unit test del trigger di `requestImagePresetVariantIfNeeded` (ADR-58, funzione module-private
 * chiamata a fine `updateBlockPropsAction`, fuori da `set()`): accoda `fetchMediaMetadata` +
 * `requestImageTransform` (`services/media.service.ts`, mockato — servizio esterno, mai una
 * chiamata di rete reale nei test) solo quando la patch contiene `styleSizePreset` su un preset
 * nominato E il nodo target è `type:'image'` con `mediaRef` non vuoto. Stesso pattern di
 * `useBlockEditorStore.convertToGlobalSection.test.ts` (mock dedicato in un file separato,
 * `notifications.show` mockato per il ramo di fallimento).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBlockEditorStore } from './useBlockEditorStore';
import type { BlockNode } from '../pages/pages/editor/block-tree.utils';
import type { MediaFileRecord, MediaTransformResult } from '../types/media.types';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
const { notifications } = await import('@mantine/notifications');

vi.mock('../services/media.service', () => ({
  fetchMediaMetadata: vi.fn(),
  requestImageTransform: vi.fn(),
}));
const { fetchMediaMetadata, requestImageTransform } = await import('../services/media.service');

/** Nodo di comodo con `children` sempre presente. */
function node(
  id: string,
  type: string,
  props: Record<string, unknown> = {},
  children: BlockNode[] = [],
): BlockNode {
  return { id, type, props, children };
}

/** Riga `MediaFileRecord` minima plausibile, come restituita da `GET app/files/:guid/metadata`. */
function buildMetadata(guid: string): MediaFileRecord {
  return {
    guid,
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    width: 2000,
    height: 1000,
    url: null,
    entity: 'page-media',
    entityId: null,
    createdAt: new Date().toISOString(),
    focalX: 50,
    focalY: 50,
  };
}

const TRANSFORM_RESULT: MediaTransformResult = { jobId: 'job-1' };

describe('useBlockEditorStore — requestImagePresetVariantIfNeeded (ADR-58)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
    useBlockEditorStore.getState().selectNode(null);
    vi.mocked(fetchMediaMetadata).mockReset();
    vi.mocked(requestImageTransform).mockReset();
    vi.mocked(notifications.show).mockClear();
  });

  /** Attende il fire-and-forget accodato da `updateBlockPropsAction` (nessuna promise esposta al chiamante). */
  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('styleSizePreset impostato su un preset nominato, nodo image con mediaRef non vuoto: chiama fetchMediaMetadata poi requestImageTransform con preset/focalX/focalY', async () => {
    const guid = '0123456789abcdef';
    useBlockEditorStore
      .getState()
      .initTree([node('img-1', 'image', { mediaRef: guid, alt: 'alt' })]);
    vi.mocked(fetchMediaMetadata).mockResolvedValue(buildMetadata(guid));
    vi.mocked(requestImageTransform).mockResolvedValue(TRANSFORM_RESULT);

    useBlockEditorStore.getState().updateBlockPropsAction('img-1', { styleSizePreset: 'card' });
    await flushMicrotasks();

    expect(fetchMediaMetadata).toHaveBeenCalledTimes(1);
    expect(fetchMediaMetadata).toHaveBeenCalledWith(guid);
    expect(requestImageTransform).toHaveBeenCalledTimes(1);
    expect(requestImageTransform).toHaveBeenCalledWith(guid, {
      focalX: 50,
      focalY: 50,
      preset: 'card',
    });
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it.each(['full', 'custom'])(
    'styleSizePreset impostato su "%s" (non un preset nominato) non chiama mai il transform',
    async (preset) => {
      const guid = '0123456789abcdef';
      useBlockEditorStore
        .getState()
        .initTree([node('img-1', 'image', { mediaRef: guid, alt: 'alt' })]);

      useBlockEditorStore.getState().updateBlockPropsAction('img-1', { styleSizePreset: preset });
      await flushMicrotasks();

      expect(fetchMediaMetadata).not.toHaveBeenCalled();
      expect(requestImageTransform).not.toHaveBeenCalled();
    },
  );

  it('nodo image con mediaRef vuoto: non chiama mai il transform, anche con un preset nominato', async () => {
    useBlockEditorStore.getState().initTree([node('img-1', 'image', { mediaRef: '', alt: 'alt' })]);

    useBlockEditorStore.getState().updateBlockPropsAction('img-1', { styleSizePreset: 'hero' });
    await flushMicrotasks();

    expect(fetchMediaMetadata).not.toHaveBeenCalled();
    expect(requestImageTransform).not.toHaveBeenCalled();
  });

  it('una prop non correlata (non styleSizePreset) non chiama mai il transform, anche su un nodo image valido', async () => {
    const guid = '0123456789abcdef';
    useBlockEditorStore
      .getState()
      .initTree([node('img-1', 'image', { mediaRef: guid, alt: 'vecchio' })]);

    useBlockEditorStore.getState().updateBlockPropsAction('img-1', { alt: 'nuovo' });
    await flushMicrotasks();

    expect(fetchMediaMetadata).not.toHaveBeenCalled();
    expect(requestImageTransform).not.toHaveBeenCalled();
  });

  it('un nodo non-image (es. heading) con styleSizePreset nella patch non chiama mai il transform', async () => {
    useBlockEditorStore
      .getState()
      .initTree([node('h-1', 'heading', { level: 'h2', text: 'Titolo' })]);

    useBlockEditorStore.getState().updateBlockPropsAction('h-1', { styleSizePreset: 'card' });
    await flushMicrotasks();

    expect(fetchMediaMetadata).not.toHaveBeenCalled();
    expect(requestImageTransform).not.toHaveBeenCalled();
  });

  it('requestImageTransform che fallisce mostra una notification rossa e non lancia/rompe lo store', async () => {
    const guid = '0123456789abcdef';
    useBlockEditorStore
      .getState()
      .initTree([node('img-1', 'image', { mediaRef: guid, alt: 'alt' })]);
    vi.mocked(fetchMediaMetadata).mockResolvedValue(buildMetadata(guid));
    vi.mocked(requestImageTransform).mockRejectedValue(new Error('400 Bad Request'));

    expect(() =>
      useBlockEditorStore.getState().updateBlockPropsAction('img-1', { styleSizePreset: 'og' }),
    ).not.toThrow();
    await flushMicrotasks();

    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));
    // Lo stato dell'albero resta comunque quello aggiornato dal reducer: il fallimento
    // dell'accodamento fire-and-forget non fa rollback della prop già salvata (ADR-58, "nel
    // frattempo il blocco mostra l'originale" — la prop è comunque quella scelta dall'utente).
    const treeNode = useBlockEditorStore.getState().tree[0];
    expect(treeNode.props.styleSizePreset).toBe('og');
  });

  it('fetchMediaMetadata che fallisce mostra comunque la notification rossa, senza mai chiamare requestImageTransform', async () => {
    const guid = '0123456789abcdef';
    useBlockEditorStore
      .getState()
      .initTree([node('img-1', 'image', { mediaRef: guid, alt: 'alt' })]);
    vi.mocked(fetchMediaMetadata).mockRejectedValue(new Error('404 Not Found'));

    useBlockEditorStore.getState().updateBlockPropsAction('img-1', { styleSizePreset: 'thumbnail' });
    await flushMicrotasks();

    expect(requestImageTransform).not.toHaveBeenCalled();
    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));
  });
});
