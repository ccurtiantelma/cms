/**
 * Test di `ColorField` (`kind: 'colorRef'`, Sub-Task S2.3): verifica che i controlli scrivano
 * la patch corretta verso lo store (callback `onSetAndCommit`, stesso canale di ogni altro
 * `kind`) e che scrivere un breakpoint/stato non cancelli gli altri già presenti nell'envelope
 * — stesso principio del "T8" di ADR-29 § "Conseguenza", qui applicato al kind v2 `colorRef`
 * (ADR-75/ADR-76).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../test/utils';
import { useBlockEditorStore } from '../../../../../hooks/useBlockEditorStore';
import type { BlockPropDescriptor } from '../../../../../types/blocks.types';
import ColorField from '../ColorField';

/** Stesso descrittore reale di `heading.color`/`richText.color`/`button.color` (blocks.types.ts). */
const STATEFUL_RESPONSIVE_PROP: BlockPropDescriptor = {
  name: 'color',
  kind: 'colorRef',
  required: false,
  responsive: true,
  stateful: true,
  cssProperty: 'color',
};

afterEach(() => {
  useBlockEditorStore.getState().setActiveBreakpoint('default');
});

describe('ColorField', () => {
  it('clic su uno swatch di sistema scrive { ref: <id> } sul ramo normal/default', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    renderWithProviders(
      <ColorField
        prop={STATEFUL_RESPONSIVE_PROP}
        value={undefined}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Colore di sistema: Primario' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({ normal: { default: { ref: 'primary' } } });
  });

  it('scrivere un breakpoint diverso da "default" preserva "default" già presente (T8)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    useBlockEditorStore.getState().setActiveBreakpoint('tablet');
    const currentValue = { normal: { default: '#111111' } };
    renderWithProviders(
      <ColorField
        prop={STATEFUL_RESPONSIVE_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Colore di sistema: Accento' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: { default: '#111111', tablet: { ref: 'accent' } },
    });
  });

  it('cambiare stato in Hover scrive nel ramo hover preservando normal intatto (ADR-75)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = { normal: { default: '#222222' } };
    renderWithProviders(
      <ColorField
        prop={STATEFUL_RESPONSIVE_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Hover' }));
    await user.click(screen.getByRole('button', { name: 'Colore di sistema: Secondario' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: { default: '#222222' },
      hover: { default: { ref: 'secondary' } },
    });
  });

  it('senza `prop.stateful` non mostra lo StateSwitcher Normal/Hover', () => {
    const onSetAndCommit = vi.fn();
    renderWithProviders(
      <ColorField
        prop={{ ...STATEFUL_RESPONSIVE_PROP, stateful: false }}
        value={undefined}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    expect(screen.queryByRole('radio', { name: 'Hover' })).not.toBeInTheDocument();
  });
});
