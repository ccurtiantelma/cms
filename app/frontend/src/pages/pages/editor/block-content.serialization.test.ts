import { describe, expect, it } from 'vitest';
import { toPersistableBlocks } from './block-content.serialization';
import type { BlockNode } from './block-tree.utils';

describe('toPersistableBlocks', () => {
  it('preserves empty required richText.html and removes empty optional props', () => {
    const tree: BlockNode[] = [
      {
        id: 'rich-text-1',
        type: 'richText',
        props: {
          html: '',
          styleTextColor: '',
        },
        children: [],
      },
    ];

    expect(toPersistableBlocks(tree)[0]).toMatchObject({
      type: 'richText',
      props: { html: '' },
    });
    expect(toPersistableBlocks(tree)[0].props).not.toHaveProperty('styleTextColor');
  });
});
