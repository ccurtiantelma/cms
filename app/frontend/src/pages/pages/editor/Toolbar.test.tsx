/**
 * Component test dei controlli E01 della topbar dell'editor full-screen (`Toolbar.tsx`):
 * badge di stato, toggle "Anteprima Pura", separazione fra "Salva Bozza" e il menu
 * "Cambia Stato" (che riusa `onRequestStatusChange`, mai una seconda macchina a stati —
 * vedi il commento di `ToolbarProps` in `Toolbar.tsx`).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import Toolbar, { type ToolbarProps } from './Toolbar';

const baseProps: ToolbarProps = {
  pageTitle: 'Chi siamo',
  backHref: '/pages/a1b2c3d4e5f6a7b8',
  viewport: 'desktop',
  onViewportChange: vi.fn(),
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  hasUnsavedChanges: false,
  saving: false,
  onSaveDraft: vi.fn(),
  pageStatus: 'draft',
  visibleTransitions: ['review', 'scheduled', 'published'],
  statusSubmitting: false,
  onRequestStatusChange: vi.fn(),
  isPreviewMode: false,
  onTogglePreviewMode: vi.fn(),
};

describe('Toolbar — E01', () => {
  it('mostra il badge cromatico dello stato accanto al titolo', () => {
    renderWithProviders(<Toolbar {...baseProps} />);

    expect(screen.getByText('Bozza')).toBeInTheDocument();
  });

  it('non mostra alcun badge di stato quando pageStatus non è fornito (Builder Sezioni Globali)', () => {
    renderWithProviders(<Toolbar {...baseProps} pageStatus={undefined} />);

    expect(screen.queryByText('Bozza')).not.toBeInTheDocument();
  });

  it('il toggle "Anteprima Pura" invoca onTogglePreviewMode', async () => {
    const user = userEvent.setup();
    const onTogglePreviewMode = vi.fn();
    renderWithProviders(<Toolbar {...baseProps} onTogglePreviewMode={onTogglePreviewMode} />);

    await user.click(screen.getByRole('button', { name: 'Anteprima Pura' }));

    expect(onTogglePreviewMode).toHaveBeenCalledTimes(1);
  });

  it('riflette isPreviewMode su aria-pressed del toggle', () => {
    const { rerender } = renderWithProviders(<Toolbar {...baseProps} isPreviewMode={false} />);
    expect(screen.getByRole('button', { name: 'Anteprima Pura' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    rerender(<Toolbar {...baseProps} isPreviewMode />);
    expect(screen.getByRole('button', { name: 'Anteprima Pura' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('separa "Salva Bozza" da "Cambia Stato": il primo salva la bozza, mai una transizione', async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();
    const onRequestStatusChange = vi.fn();
    renderWithProviders(
      <Toolbar
        {...baseProps}
        onSaveDraft={onSaveDraft}
        onRequestStatusChange={onRequestStatusChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Salva Bozza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambia Stato' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salva Bozza' }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onRequestStatusChange).not.toHaveBeenCalled();
  });

  it('il menu "Cambia Stato" elenca solo le transizioni ammesse e invoca onRequestStatusChange col target scelto', async () => {
    const user = userEvent.setup();
    const onRequestStatusChange = vi.fn();
    renderWithProviders(
      <Toolbar
        {...baseProps}
        visibleTransitions={['review']}
        onRequestStatusChange={onRequestStatusChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cambia Stato' }));
    const item = await screen.findByRole('menuitem', { name: 'Invia in revisione' });
    expect(screen.queryByRole('menuitem', { name: 'Pubblica' })).not.toBeInTheDocument();

    await user.click(item);

    expect(onRequestStatusChange).toHaveBeenCalledTimes(1);
    expect(onRequestStatusChange).toHaveBeenCalledWith('review');
  });

  it('disabilita "Cambia Stato" quando non ci sono transizioni ammesse dal ruolo corrente', () => {
    renderWithProviders(<Toolbar {...baseProps} visibleTransitions={[]} />);

    expect(screen.getByRole('button', { name: 'Cambia Stato' })).toBeDisabled();
  });
});
