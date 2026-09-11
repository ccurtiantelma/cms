/**
 * Component test dei controlli E01 della topbar dell'editor full-screen (`Toolbar.tsx`):
 * badge di stato, "Anteprima" (apre l'anteprima in una nuova scheda, non più un toggle
 * "Anteprima Pura" — richiesta esplicita del task), "Salva Bozza" e il menu "Cambia Stato",
 * spostato qui dalla barra di pubblicazione in fondo alla sidebar sinistra (rimossa).
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

  it('non mostra l\'icona "Anteprima" quando onPreview non è fornito', () => {
    renderWithProviders(<Toolbar {...baseProps} />);

    expect(screen.queryByRole('button', { name: 'Anteprima' })).not.toBeInTheDocument();
  });

  it('"Anteprima" invoca onPreview (apertura in nuova scheda), non un toggle di sidebar', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    renderWithProviders(<Toolbar {...baseProps} onPreview={onPreview} />);

    await user.click(screen.getByRole('button', { name: 'Anteprima' }));

    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('"Salva Bozza" invoca onSaveDraft', async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();
    renderWithProviders(<Toolbar {...baseProps} onSaveDraft={onSaveDraft} />);

    expect(screen.getByRole('button', { name: 'Salva Bozza' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salva Bozza' }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it('il pulsante "Cambia Stato" resta disabilitato senza transizioni ammesse', () => {
    renderWithProviders(
      <Toolbar {...baseProps} onRequestStatusChange={vi.fn()} visibleTransitions={[]} />,
    );

    expect(screen.getByRole('button', { name: 'Cambia Stato' })).toBeDisabled();
  });

  it('il menu "Cambia Stato" elenca le transizioni ammesse e invoca onRequestStatusChange', async () => {
    const user = userEvent.setup();
    const onRequestStatusChange = vi.fn();
    renderWithProviders(
      <Toolbar
        {...baseProps}
        onRequestStatusChange={onRequestStatusChange}
        visibleTransitions={['published']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Altre opzioni di pubblicazione' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pubblica' }));

    expect(onRequestStatusChange).toHaveBeenCalledWith('published');
  });
});
