/**
 * Test di `ShadowField` (`kind: 'shadow'`, Sub-Task S2.3). Il comportamento scalare (ADR-38 §
 * 4) resta coperto da `PropertyInspector.test.tsx` (`heading.styleShadow`, non `stateful`):
 * questo file copre solo l'estensione di questo Sub-Task, il supporto `stateful` (ADR-75),
 * dichiarato oggi solo da `container.shadow`.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../test/utils';
import type { BlockPropDescriptor } from '../../../../../types/blocks.types';
import ShadowField from '../ShadowField';

/** Stesso descrittore reale di `container.shadow` (blocks.types.ts). */
const STATEFUL_SHADOW_PROP: BlockPropDescriptor = {
  name: 'shadow',
  kind: 'shadow',
  required: false,
  stateful: true,
};

describe('ShadowField', () => {
  it('senza `prop.stateful` non mostra lo StateSwitcher Normal/Hover', () => {
    const onSetAndCommit = vi.fn();
    renderWithProviders(
      <ShadowField
        prop={{ ...STATEFUL_SHADOW_PROP, stateful: false }}
        value={undefined}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    expect(screen.queryByRole('radio', { name: 'Hover' })).not.toBeInTheDocument();
  });

  it('cambiare stato in Hover scrive nel ramo hover preservando normal intatto (ADR-75)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = { normal: { x: 0, y: 0, blur: 0, spread: 0, color: '#000000' } };
    renderWithProviders(
      <ShadowField
        prop={STATEFUL_SHADOW_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Hover' }));
    const blurSlider = screen.getByRole('slider', { name: 'shadow — Sfocatura' });
    blurSlider.focus();
    // Un solo `{ArrowRight}`: il mock `onSetAndCommit` non riscrive la prop `value` fra un
    // tasto e l'altro (a differenza dello store reale), quindi una seconda pressione
    // ripartirebbe dallo stesso `blur: 0` invece di accumularsi — il comportamento cumulativo
    // reale è già verificato dal test `border` equivalente su un solo incremento.
    await user.keyboard('{ArrowRight}');

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: { x: 0, y: 0, blur: 0, spread: 0, color: '#000000' },
      hover: { x: 0, y: 0, blur: 1, spread: 0, color: '#000000' },
    });
  });
});
