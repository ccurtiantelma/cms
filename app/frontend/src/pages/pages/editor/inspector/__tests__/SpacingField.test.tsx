/**
 * Test di `SpacingField` (`kind: 'spacing'`, Sub-Task S2.3): verifica che modificare un lato
 * scriva la patch corretta, che `linked` sincronizzi i quattro lati solo quando attivo (§ 4
 * punto 2 dello SPEC, "presentazione, non validazione") e che scrivere un breakpoint diverso
 * non cancelli "default" già presente (T8, ADR-29 § "Conseguenza").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../test/utils';
import { useBlockEditorStore } from '../../../../../hooks/useBlockEditorStore';
import type { BlockPropDescriptor } from '../../../../../types/blocks.types';
import SpacingField from '../SpacingField';

/** Stesso descrittore reale di `container.padding` (blocks.types.ts). */
const PADDING_PROP: BlockPropDescriptor = {
  name: 'padding',
  kind: 'spacing',
  required: false,
  responsive: true,
  units: ['px', '%', 'em', 'rem'],
  min: 0,
  max: 500,
  target: 'padding',
};

afterEach(() => {
  useBlockEditorStore.getState().setActiveBreakpoint('default');
});

describe('SpacingField', () => {
  it('senza `linked`, cambiare un lato scrive solo quel lato', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = {
      default: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px', linked: false },
    };
    renderWithProviders(
      <SpacingField
        prop={PADDING_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const topInput = screen.getByRole('textbox', { name: 'padding — Alto' });
    await user.clear(topInput);
    await user.type(topInput, '24');
    await user.tab();

    expect(onSetAndCommit).toHaveBeenLastCalledWith({
      default: { top: 24, right: 10, bottom: 10, left: 10, unit: 'px', linked: false },
    });
  });

  it('con `linked` attivo, cambiare un lato sincronizza tutti e quattro', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = {
      default: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px', linked: true },
    };
    renderWithProviders(
      <SpacingField
        prop={PADDING_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const leftInput = screen.getByRole('textbox', { name: 'padding — Sinistra' });
    await user.clear(leftInput);
    await user.type(leftInput, '32');
    await user.tab();

    expect(onSetAndCommit).toHaveBeenLastCalledWith({
      default: { top: 32, right: 32, bottom: 32, left: 32, unit: 'px', linked: true },
    });
  });

  it('scrivere un breakpoint diverso da "default" preserva "default" già presente (T8)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    useBlockEditorStore.getState().setActiveBreakpoint('tablet');
    const currentValue = {
      default: { top: 16, right: 16, bottom: 16, left: 16, unit: 'px', linked: true },
    };
    renderWithProviders(
      <SpacingField
        prop={PADDING_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const topInput = screen.getByRole('textbox', { name: 'padding — Alto' });
    await user.clear(topInput);
    await user.type(topInput, '8');
    await user.tab();

    expect(onSetAndCommit).toHaveBeenLastCalledWith({
      default: { top: 16, right: 16, bottom: 16, left: 16, unit: 'px', linked: true },
      tablet: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px', linked: true },
    });
  });

  it('cambiare unità preserva i quattro valori numerici correnti', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = {
      default: { top: 10, right: 20, bottom: 10, left: 20, unit: 'px', linked: false },
    };
    renderWithProviders(
      <SpacingField
        prop={PADDING_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const unitSelect = screen.getByRole('textbox', { name: 'padding — Unità' });
    await user.click(unitSelect);
    await user.click(screen.getByRole('option', { name: 'rem' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      default: { top: 10, right: 20, bottom: 10, left: 20, unit: 'rem', linked: false },
    });
  });
});
