/**
 * Test di `BorderField` (`kind: 'border'`, Sub-Task S2.3). Il comportamento scalare (ADR-38 §
 * 3) resta coperto da `PropertyInspector.test.tsx` (`heading.styleBorder`, non `stateful`):
 * questo file copre solo l'estensione di questo Sub-Task, il supporto `stateful` (ADR-75),
 * dichiarato oggi solo da `container.border` (`grep stateful app/backend/src/blocks/types/
 * *.block.ts`).
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../test/utils';
import type { BlockPropDescriptor } from '../../../../../types/blocks.types';
import BorderField from '../BorderField';

/** Stesso descrittore reale di `container.border` (blocks.types.ts). */
const STATEFUL_BORDER_PROP: BlockPropDescriptor = {
  name: 'border',
  kind: 'border',
  required: false,
  stateful: true,
};

describe('BorderField', () => {
  it('senza `prop.stateful` non mostra lo StateSwitcher Normal/Hover', () => {
    const onSetAndCommit = vi.fn();
    renderWithProviders(
      <BorderField
        prop={{ ...STATEFUL_BORDER_PROP, stateful: false }}
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
    const currentValue = { normal: { width: 2, style: 'solid', color: '#000000', radius: 0 } };
    renderWithProviders(
      <BorderField
        prop={STATEFUL_BORDER_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Hover' }));
    const styleSelect = screen.getByRole('textbox', { name: 'border — Stile' });
    await user.click(styleSelect);
    await user.click(screen.getByRole('option', { name: 'dashed' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: { width: 2, style: 'solid', color: '#000000', radius: 0 },
      hover: { width: 0, style: 'dashed', color: '#000000', radius: 0 },
    });
  });

  it('restando su Normal, modificare lo spessore lascia intatto un ramo hover già presente', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = {
      normal: { width: 0, style: 'solid', color: '#000000', radius: 0 },
      hover: { width: 3, style: 'dashed', color: '#ff0000', radius: 4 },
    };
    renderWithProviders(
      <BorderField
        prop={STATEFUL_BORDER_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const widthSlider = screen.getByRole('slider', { name: 'border — Spessore' });
    widthSlider.focus();
    await user.keyboard('{ArrowRight}');

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: { width: 1, style: 'solid', color: '#000000', radius: 0 },
      hover: { width: 3, style: 'dashed', color: '#ff0000', radius: 4 },
    });
  });
});
