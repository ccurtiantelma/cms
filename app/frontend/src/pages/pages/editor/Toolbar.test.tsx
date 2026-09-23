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
  activeBreakpoint: 'default',
  onBreakpointChange: vi.fn(),
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  isSidebarVisible: true,
  onToggleSidebarVisible: vi.fn(),
  isHeaderFooterVisible: true,
  onToggleHeaderFooterVisible: vi.fn(),
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

  it('mantiene l\'icona "Anteprima" disabilitata quando manca il callback', () => {
    renderWithProviders(<Toolbar {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Anteprima' })).toBeDisabled();
  });

  it('non mostra l\'icona "Anteprima" nel Builder delle Sezioni Globali', () => {
    renderWithProviders(<Toolbar {...baseProps} pageStatus={undefined} />);

    expect(screen.queryByRole('button', { name: 'Anteprima' })).not.toBeInTheDocument();
  });

  it('"Anteprima" invoca onPreview (apertura in nuova scheda), non un toggle di sidebar', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    renderWithProviders(<Toolbar {...baseProps} onPreview={onPreview} />);

    await user.click(screen.getByRole('button', { name: 'Anteprima' }));

    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('"Salva bozza" nel menu invoca onSaveDraft', async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();
    renderWithProviders(
      <Toolbar
        {...baseProps}
        onSaveDraft={onSaveDraft}
        onRequestStatusChange={vi.fn()}
        visibleTransitions={['review']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Altre opzioni di pubblicazione' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Salva bozza' }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it('il pulsante "Pubblica" resta disabilitato senza la transizione published', () => {
    renderWithProviders(
      <Toolbar {...baseProps} onRequestStatusChange={vi.fn()} visibleTransitions={[]} />,
    );

    expect(screen.getByRole('button', { name: 'Pubblica' })).toBeDisabled();
  });

  it('il pulsante Pubblica invoca la transizione published', async () => {
    const user = userEvent.setup();
    const onRequestStatusChange = vi.fn();
    renderWithProviders(
      <Toolbar
        {...baseProps}
        onRequestStatusChange={onRequestStatusChange}
        visibleTransitions={['published']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Pubblica' }));

    expect(onRequestStatusChange).toHaveBeenCalledWith('published');
  });

  it('il menu mostra bozza, template e le transizioni non pubblicative', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Toolbar
        {...baseProps}
        onRequestStatusChange={vi.fn()}
        visibleTransitions={['review', 'scheduled', 'published']}
        onSaveAsTemplate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Altre opzioni di pubblicazione' }));
    expect(await screen.findByRole('menuitem', { name: 'Salva bozza' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Salva come template' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Invia in revisione' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Programma' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Pubblica' })).not.toBeInTheDocument();
    expect(screen.queryByText('Transizioni ammesse')).not.toBeInTheDocument();
  });
});
