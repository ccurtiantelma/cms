/**
 * Una nuova riga è solo `container` (ADR-100 punto 1): genitore boxed con le colonne come
 * figli diretti, nessuna `section`, nessuna riga intermedia. Le colonne portano la propria
 * `width` (ADR-100 punto 2), 100% su mobile.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { BlockNode } from './block-tree.utils';
import SectionStructureModal from './SectionStructureModal';

async function pick(...buttons: string[]): Promise<void> {
  render(
    <MantineProvider>
      <SectionStructureModal opened onClose={() => {}} parentId={null} index={0} />
    </MantineProvider>,
  );
  for (const name of buttons) {
    await userEvent.click(screen.getByRole('button', { name }));
  }
}

function collectTypes(nodes: readonly BlockNode[]): string[] {
  return nodes.flatMap((node) => [node.type, ...collectTypes(node.children)]);
}

describe('SectionStructureModal — struttura Elementor (solo container)', () => {
  beforeEach(() => useBlockEditorStore.getState().initTree([]));

  it('"2 colonne (33/67)" → container boxed > 2 container full con width 33%/67%', async () => {
    await pick('Flexbox', '2 colonne (33/67)');
    const [root] = useBlockEditorStore.getState().tree;
    expect(root.type).toBe('container');
    expect(root.props.contentWidth).toBe('boxed');
    expect(root.props.layout).toMatchObject({
      default: { display: 'flex', direction: 'row' },
      mobile: { direction: 'column' },
    });
    expect(root.children.map((c) => c.type)).toEqual(['container', 'container']);
    expect(root.children.map((c) => c.props.contentWidth)).toEqual(['full', 'full']);
    expect(root.children.map((c) => c.props.width)).toEqual([
      { default: { value: 33, unit: '%' }, mobile: { value: 100, unit: '%' } },
      { default: { value: 67, unit: '%' }, mobile: { value: 100, unit: '%' } },
    ]);
  });

  it('"Colonna" è un solo container boxed senza figli', async () => {
    await pick('Flexbox', 'Colonna');
    const [root] = useBlockEditorStore.getState().tree;
    expect(root.type).toBe('container');
    expect(root.children).toHaveLength(0);
  });

  it('"Griglia 3×2" → un container grid con 6 celle, 1 colonna su mobile', async () => {
    await pick('Griglia', 'Griglia 3×2');
    const [root] = useBlockEditorStore.getState().tree;
    expect(root.props.layout).toMatchObject({
      default: {
        display: 'grid',
        gridTemplateColumns: { preset: 'repeat', count: 3 },
        gridTemplateRows: { preset: 'repeat', count: 2 },
      },
      mobile: { gridTemplateColumns: { preset: 'repeat', count: 1 } },
    });
    expect(root.children).toHaveLength(6);
  });

  it('nessun preset (Flexbox, Griglia, annidati) crea una section', async () => {
    await pick('Flexbox', 'Strutture annidate avanzate', '1 a sinistra, 2 a destra');
    expect(collectTypes(useBlockEditorStore.getState().tree)).not.toContain('section');
  });
});
