/**
 * Component test dello switcher dei breakpoint del canvas full-screen (ADR-76
 * breakpoints-configurabili.md, Sub-Task "Frame WYSIWYG In-Place & Breakpoint Switcher"):
 * mostra solo i breakpoint attivi per il sito (mai i 7 nomi chiusi incondizionatamente),
 * riflette la selezione corrente via `aria-pressed` e invoca `onBreakpointChange` al click.
 * Stesso idioma di `Toolbar.test.tsx`/`ResizeHandle.test.tsx`: stato reale dello store
 * (`useBlockEditorStore.setState`), nessun mock del modulo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { ResolvedBreakpoint } from '../../../libs/breakpoints';
import BreakpointSwitcher from './BreakpointSwitcher';

/** Sottoinsieme di comodo: solo `default`/`tablet`/`mobile` attivi (default di fabbrica
 * ADR-76), `widescreen`/`laptop`/`tabletExtra`/`mobileExtra` assenti — stesso principio del
 * DTO di fabbrica di `libs/breakpoints.ts`, senza dipendere da quel modulo per l'elenco. */
const ACTIVE_SUBSET: ResolvedBreakpoint[] = [
  { name: 'default' },
  { name: 'tablet', mediaQuery: '(max-width: 1024px)', widthPx: 1024 },
  { name: 'mobile', mediaQuery: '(max-width: 767px)', widthPx: 767 },
];

beforeEach(() => {
  useBlockEditorStore.setState({ activeBreakpoints: ACTIVE_SUBSET });
});

describe('BreakpointSwitcher', () => {
  it('mostra un pulsante solo per i breakpoint attivi, mai per quelli disattivi', () => {
    renderWithProviders(<BreakpointSwitcher value="default" onBreakpointChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Breakpoint Desktop/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Breakpoint Tablet/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Breakpoint Mobile/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Breakpoint Widescreen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Breakpoint Laptop/ })).not.toBeInTheDocument();
  });

  it('il click su un breakpoint invoca onBreakpointChange col nome giusto', async () => {
    const user = userEvent.setup();
    const onBreakpointChange = vi.fn();
    renderWithProviders(
      <BreakpointSwitcher value="default" onBreakpointChange={onBreakpointChange} />,
    );

    await user.click(screen.getByRole('button', { name: /Breakpoint Tablet/ }));

    expect(onBreakpointChange).toHaveBeenCalledTimes(1);
    expect(onBreakpointChange).toHaveBeenCalledWith('tablet');
  });

  it('riflette il breakpoint corrente via aria-pressed, uno solo alla volta', () => {
    renderWithProviders(<BreakpointSwitcher value="tablet" onBreakpointChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Breakpoint Desktop/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /Breakpoint Tablet/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Breakpoint Mobile/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('la tooltip/aria-label riporta la soglia in px quando presente, non per il default fluido', () => {
    renderWithProviders(<BreakpointSwitcher value="default" onBreakpointChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Breakpoint Desktop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Breakpoint Tablet 1024px' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Breakpoint Mobile 767px' })).toBeInTheDocument();
  });
});
