import { describe, expect, it } from 'vitest';
import { instantiatePreset, serializePreset } from './BlockPresetManager';
import type { BlockNode } from './block-tree.utils';

const source: BlockNode = {
  id: 'section-original',
  type: 'section',
  props: { title: 'Preset' },
  children: [
    {
      id: 'container-original',
      type: 'container',
      props: { gap: 'md' },
      children: [{ id: 'heading-original', type: 'heading', props: { text: 'Ciao' }, children: [] }],
    },
  ],
};

function ids(node: BlockNode): string[] {
  return [node.id, ...node.children.flatMap(ids)];
}

describe('BlockPresetManager', () => {
  it('rigenera ricorsivamente UUID v4 per radice e discendenti', () => {
    const preset = serializePreset(source, 'Hero');
    const instance = instantiatePreset(preset);
    const instanceIds = ids(instance);

    expect(instanceIds).toHaveLength(3);
    expect(new Set(instanceIds).size).toBe(3);
    expect(instanceIds).not.toEqual(ids(source));
    expect(instanceIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))).toBe(true);
    expect(instance.children[0].children[0].id).not.toBe(source.children[0].children[0].id);
  });

  it('non condivide l’albero o le props con il nodo sorgente', () => {
    const preset = serializePreset(source, 'Copia');
    expect(preset.node).not.toBe(source);
    expect(preset.node.props).not.toBe(source.props);
    expect(preset.node.children).not.toBe(source.children);
  });
});