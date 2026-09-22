/**
 * Un preset a più colonne inserisce la gerarchia reale Section → Row → Column: ogni colonna è
 * un `container` (nodo selezionabile e dropzone), non una cella grid virtuale della section.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import SectionStructureModal from './SectionStructureModal';

async function pick(step: string, preset: string): Promise<void> {
  render(
    <MantineProvider>
      <SectionStructureModal opened onClose={() => {}} parentId={null} index={0} />
    </MantineProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: step }));
  await userEvent.click(screen.getByRole('button', { name: preset }));
}

describe('SectionStructureModal — colonne come nodi', () => {
  beforeEach(() => useBlockEditorStore.getState().initTree([]));

  /*
   * Nessun peso scritto sui nodi (`buildCellNode`, `SectionStructureModal.tsx`): il registro
   * `container` v2 (ADR-82) non dichiara più `styleFlexBasis` e non ha oggi alcuna prop di
   * peso per-colonna (task R2 T4/T5, non ancora fatto) — scrivere il peso su `boxedWidth`
   * (max-width centrato, attivo solo con `contentWidth: 'boxed'`, `Container.tsx`) non
   * produceva alcuna larghezza reale in riga flex: bug corretto qui, le colonne 33/67
   * inseriscono oggi lo stesso 50/50 equo di un preset "equal" (default CSS,
   * `Container.module.css`/`EditorBlockWrapper.module.css`), non ancora la proporzione
   * scelta nella tessera.
   */
  it('"2 colonne (33/67)" → section > row container > 2 column container, nessun peso persistito', async () => {
    await pick('Flexbox', '2 colonne (33/67)');
    const [section] = useBlockEditorStore.getState().tree;
    expect(section.type).toBe('section');
    expect(section.children).toHaveLength(1);
    const row = section.children[0];
    expect(row.type).toBe('container');
    expect(row.children.map((c) => c.type)).toEqual(['container', 'container']);
    expect(row.children.map((c) => c.props.boxedWidth)).toEqual([undefined, undefined]);
  });

  it('"Colonna" resta una section piatta senza figli', async () => {
    await pick('Flexbox', 'Colonna');
    const [section] = useBlockEditorStore.getState().tree;
    expect(section.type).toBe('section');
    expect(section.children).toHaveLength(0);
  });
});
