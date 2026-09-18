/**
 * Test di `TypographyField` (`kind: 'typography'`, Sub-Task S2.3): verifica che ogni campo
 * scriva la patch corretta e che `responsive` (per campo, SPEC-PROPKIND-V2-DETAILS.md § 3
 * punto 3) e `stateful` (sull'intero oggetto, punto 4) non cancellino mai un ramo già presente
 * — stesso principio del "T8" di ADR-29 § "Conseguenza", qui a due dimensioni.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../../../test/utils';
import { useBlockEditorStore } from '../../../../../hooks/useBlockEditorStore';
import type { BlockPropDescriptor } from '../../../../../types/blocks.types';
import TypographyField from '../TypographyField';

/** Stesso descrittore reale di `heading.typography`/`richText.typography`/`button.typography`. */
const TYPOGRAPHY_PROP: BlockPropDescriptor = {
  name: 'typography',
  kind: 'typography',
  required: false,
  responsive: true,
  stateful: true,
};

afterEach(() => {
  useBlockEditorStore.getState().setActiveBreakpoint('default');
});

describe('TypographyField', () => {
  it('scrivere fontWeight preserva fontSize già presente sullo stesso stato/breakpoint', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = { normal: { fontSize: { default: { value: 16, unit: 'px' } } } };
    renderWithProviders(
      <TypographyField
        prop={TYPOGRAPHY_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const weightSelect = screen.getByRole('textbox', { name: 'typography — Spessore' });
    await user.click(weightSelect);
    await user.click(screen.getByRole('option', { name: '700' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: {
        fontSize: { default: { value: 16, unit: 'px' } },
        fontWeight: { default: '700' },
      },
    });
  });

  it('scrivere fontSize su un breakpoint diverso preserva "default" dello stesso campo (responsive per-campo)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    useBlockEditorStore.getState().setActiveBreakpoint('mobile');
    const currentValue = { normal: { fontSize: { default: { value: 32, unit: 'px' } } } };
    renderWithProviders(
      <TypographyField
        prop={TYPOGRAPHY_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    const sizeInput = screen.getByRole('textbox', { name: 'typography — Dimensione' });
    await user.clear(sizeInput);
    await user.type(sizeInput, '22');
    await user.tab();

    expect(onSetAndCommit).toHaveBeenLastCalledWith({
      normal: {
        fontSize: { default: { value: 32, unit: 'px' }, mobile: { value: 22, unit: 'px' } },
      },
    });
  });

  it('cambiare stato in Hover scrive nel ramo hover preservando normal intatto (ADR-75)', async () => {
    const user = userEvent.setup();
    const onSetAndCommit = vi.fn();
    const currentValue = { normal: { fontWeight: { default: '400' } } };
    renderWithProviders(
      <TypographyField
        prop={TYPOGRAPHY_PROP}
        value={currentValue}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Hover' }));
    const weightSelect = screen.getByRole('textbox', { name: 'typography — Spessore' });
    await user.click(weightSelect);
    await user.click(screen.getByRole('option', { name: 'bold' }));

    expect(onSetAndCommit).toHaveBeenCalledWith({
      normal: { fontWeight: { default: '400' } },
      hover: { fontWeight: { default: 'bold' } },
    });
  });

  it('nessun campo `textAlign`: non esiste in TypographyValue (SPEC-PROPKIND-V2-DETAILS.md § 3)', () => {
    const onSetAndCommit = vi.fn();
    renderWithProviders(
      <TypographyField
        prop={TYPOGRAPHY_PROP}
        value={undefined}
        propsMeta={undefined}
        onSetAndCommit={onSetAndCommit}
      />,
    );

    expect(screen.queryByText(/allineamento testo/i)).not.toBeInTheDocument();
  });
});
