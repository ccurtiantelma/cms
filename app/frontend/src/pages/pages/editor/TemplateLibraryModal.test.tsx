/**
 * Component test dei filtri della "Libreria Sezioni" (ADR-56 § 4): chip di categoria e
 * campo di ricerca testuale filtrano client-side l'array `PRESETS` già in memoria, in AND
 * fra loro (`matchesFilters`, non esportata — verificata qui solo attraverso il DOM
 * renderizzato, stesso principio di `CanvasSectionInserter.test.tsx`: store Zustand reale,
 * nessun mock del modulo sotto test).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import TemplateLibraryModal from './TemplateLibraryModal';

describe('TemplateLibraryModal — filtro categoria e ricerca (ADR-56 § 4)', () => {
  beforeEach(() => {
    useBlockEditorStore.getState().initTree([]);
  });

  function renderModal() {
    return renderWithProviders(
      <TemplateLibraryModal opened parentId={null} index={0} onClose={() => {}} />,
    );
  }

  it('senza filtri mostra tutte le tessere del catalogo statico', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Hero Section' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Domande Frequenti' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call to Action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tabella Prezzi 3 Piani' })).toBeInTheDocument();
  });

  // Timeout esplicito più largo del default (5000ms) sui tre test che digitano nel campo di
  // ricerca: `userEvent.type` simula un tasto per carattere, e sotto carico di più suite in
  // parallelo (jsdom + Mantine) può superare il default senza che sia un difetto del test.
  it('digitare nel campo di ricerca restringe le tessere a label/tag corrispondenti', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Cerca preset'), 'faq');

    expect(screen.getByRole('button', { name: 'Domande Frequenti' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hero Section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call to Action' })).not.toBeInTheDocument();
  }, 15000);

  it('cliccare un chip di categoria restringe le tessere a quella categoria', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('radio', { name: 'Call to Action' }));

    expect(screen.getByRole('button', { name: 'Call to Action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tabella Prezzi 3 Piani' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hero Section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Domande Frequenti' })).not.toBeInTheDocument();
  });

  it('categoria e ricerca si combinano in AND: un chip attivo restringe ulteriormente ciò che la ricerca mostrerebbe da sola', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('radio', { name: 'Call to Action' }));
    await user.type(screen.getByLabelText('Cerca preset'), 'prezzi');

    // "prezzi" è un tag solo di "Tabella Prezzi 3 Piani": l'altro preset della categoria CTA
    // ("Call to Action") non ha quel tag e deve sparire, mostrando che la ricerca filtra
    // ulteriormente l'insieme già ristretto dal chip, non lo sostituisce (AND, non OR).
    expect(screen.getByRole('button', { name: 'Tabella Prezzi 3 Piani' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call to Action' })).not.toBeInTheDocument();
  }, 15000);

  it('il chip "Tutte" azzera il filtro categoria mantenendo la ricerca testuale', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('radio', { name: 'Call to Action' }));
    expect(screen.queryByRole('button', { name: 'Hero Section' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Tutte' }));

    expect(screen.getByRole('button', { name: 'Hero Section' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call to Action' })).toBeInTheDocument();
  });

  it('nessun risultato mostra il messaggio dedicato, mai una lista vuota silenziosa', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText('Cerca preset'), 'nessun-preset-corrisponde-a-questo');

    expect(
      screen.getByText('Nessun preset corrisponde ai filtri selezionati.'),
    ).toBeInTheDocument();
  }, 15000);
});
