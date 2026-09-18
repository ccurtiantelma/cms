/**
 * Test di `LayoutField` (`kind: 'layout'`, `container` v2, Sub-Task S2.3): verifica il
 * selettore Flex/Grid, che i controlli Flex/Grid scrivano sull'intero oggetto `LayoutValue`
 * (responsive sull'intero oggetto, non per campo — ADR-82 § "Decisione" punto 1) e che
 * scrivere un breakpoint diverso non cancelli "default" già presente (T8).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../test/utils';
import { useBlockEditorStore } from '../../../../../hooks/useBlockEditorStore';
import type { BlockPropDescriptor } from '../../../../../types/blocks.types';
import LayoutField from '../LayoutField';

/** Stesso descrittore reale di `container.layout` (blocks.types.ts). */
const LAYOUT_PROP: BlockPropDescriptor = {
  name: 'layout',
  kind: 'layout',
  required: false,
  responsive: true,
};

afterEach(() => {
  useBlockEditorStore.getState().setActiveBreakpoint('default');
});

describe('LayoutField', () => {
  it('passare a Grid scrive display: "grid" preservando gap già presente', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = {
      default: {
        display: 'flex',
        gap: { x: { value: 8, unit: 'px' }, y: { value: 8, unit: 'px' } },
      },
    };
    renderWithProviders(
      <LayoutField
        prop={LAYOUT_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Grid' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      default: {
        display: 'grid',
        gap: { x: { value: 8, unit: 'px' }, y: { value: 8, unit: 'px' } },
      },
    });
  });

  it('in modalità Grid, il numero di colonne scrive { preset: "repeat", count }', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = { default: { display: 'grid' } };
    renderWithProviders(
      <LayoutField
        prop={LAYOUT_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const columnsInput = screen.getByRole('textbox', { name: 'layout — Numero di colonne' });
    await user.clear(columnsInput);
    await user.type(columnsInput, '4');
    await user.tab();

    expect(onSetAndCommit).toHaveBeenLastCalledWith({
      default: { display: 'grid', gridTemplateColumns: { preset: 'repeat', count: 4 } },
    });
  });

  it('scrivere un breakpoint diverso da "default" preserva "default" già presente (T8)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    useBlockEditorStore.getState().setActiveBreakpoint('mobile');
    const currentValue = { default: { display: 'flex', direction: 'row' } };
    renderWithProviders(
      <LayoutField
        prop={LAYOUT_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Grid' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      default: { display: 'flex', direction: 'row' },
      mobile: { display: 'grid', direction: 'row' },
    });
  });

  it('in modalità Flex mostra Direzione/A capo/Allineamenti, non i controlli Grid', () => {
    const onSetAndCommit = vi.fn();
    renderWithProviders(
      <LayoutField
        prop={LAYOUT_PROP}
        value={{ default: { display: 'flex' } }}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    expect(screen.getByText('Direzione')).toBeInTheDocument();
    expect(screen.queryByText('Numero di colonne')).not.toBeInTheDocument();
  });
});
