/**
 * Test d'integrazione dei controlli E01 aggiunti alla chrome dell'editor visivo, per come
 * sono davvero cablati insieme dentro `BlockEditorPanel.tsx`
 * (`FullScreenEditorLayout` → `Toolbar`/`EditorSidebar`):
 * - l'icona "Anteprima" della topbar apre l'anteprima della Pagina (`onPreview`), non un
 *   toggle che nasconde la sidebar (richiesta esplicita del task);
 * - la scheda "Pagina" compare nella sidebar sinistra, accanto a "Widgets"/"Proprietà", e
 *   mostra Titolo/Slug della Pagina in editing;
 * - "Salva Bozza" e "Cambia Stato" sono due controlli distinti nella topbar.
 *
 * `EditorCanvas`/`EditorStructureNavigator`/`LocaleSwitcher`/`TemplateLibraryModal`/
 * `HistoryDrawer` sono mockati: irrilevanti per questi tre comportamenti e altrimenti
 * pesanti da montare per davvero (dnd-kit, Global Design Tokens, rete). `pages.service` è
 * mockato al confine di rete, stesso principio di `PagePageDetail.test.tsx`.
 * `useUnsavedChangesGuard` (dentro `BlockEditorPanel`) chiama `useNavigate()`: serve un
 * `MemoryRouter` reale attorno, non un mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import type { PageRecord, PageStatus } from '../../../types/pages.types';

vi.mock('./EditorCanvas', () => ({ default: () => <div data-testid="mock-canvas" /> }));
vi.mock('./EditorStructureNavigator', () => ({ default: () => null }));
vi.mock('./LocaleSwitcher', () => ({ default: () => null }));
vi.mock('./TemplateLibraryModal', () => ({ default: () => null }));
vi.mock('./HistoryDrawer', () => ({ default: () => null }));
vi.mock('../../../services/pages.service', () => ({ updatePage: vi.fn() }));

const { default: BlockEditorPanel } = await import('./BlockEditorPanel');

/** Fixture minima: solo i campi letti da `BlockEditorPanel`/`EditorSidebar`/`Toolbar`, non l'intero contratto `PageDto`. */
const basePage = {
  guid: 'a1b2c3d4e5f6a7b8',
  title: 'Chi siamo',
  slug: 'chi-siamo',
  locale: 'it',
  status: 'draft',
  version: 3,
  parentGuid: null,
  publishedAt: null,
  scheduledAt: null,
  draftContent: { version: 1, blocks: [] },
  draftSeo: {},
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
} as unknown as PageRecord;

function renderPanel(
  props: {
    pageStatus?: PageStatus;
    visibleTransitions?: readonly PageStatus[];
    onPreview?: () => void;
  } = {},
) {
  return renderWithProviders(
    <MemoryRouter>
      <BlockEditorPanel
        page={basePage}
        onPageUpdated={vi.fn()}
        onVersionConflict={vi.fn()}
        pageStatus={props.pageStatus ?? 'draft'}
        visibleTransitions={props.visibleTransitions ?? ['review', 'scheduled', 'published']}
        onRequestStatusChange={vi.fn()}
        onPreview={props.onPreview}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useBlockEditorStore.setState({
    isSidebarOpen: true,
    activeSidebarTab: 'widgets',
  });
});

describe('BlockEditorPanel — E01', () => {
  it('mostra la scheda "Pagina" nella sidebar, accanto a "Widgets" (non più "Proprietà", ADR-91: colonna destra fissa)', () => {
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Widgets' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Proprietà' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pagina' })).toBeInTheDocument();
  });

  it('la scheda "Pagina" mostra Titolo e Slug della Pagina in editing', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: 'Pagina' }));

    // `exact: false`: l'etichetta include l'asterisco di campo obbligatorio ("Titolo *",
    // `withAsterisk` di Mantine) nel testo computato da Testing Library.
    expect(screen.getByLabelText('Titolo', { exact: false })).toHaveValue('Chi siamo');
    expect(screen.getByLabelText('Slug', { exact: false })).toHaveValue('chi-siamo');
  });

  it('mostra Pubblica nella topbar e non mostra Salva Bozza come pulsante', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Pubblica' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salva Bozza' })).not.toBeInTheDocument();
  });

  it('"Cambia Stato" invoca onRequestStatusChange, mai un salvataggio bozza', async () => {
    const user = userEvent.setup();
    const onRequestStatusChange = vi.fn();
    renderWithProviders(
      <MemoryRouter>
        <BlockEditorPanel
          page={basePage}
          onPageUpdated={vi.fn()}
          onVersionConflict={vi.fn()}
          pageStatus="draft"
          visibleTransitions={['review']}
          onRequestStatusChange={onRequestStatusChange}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Altre opzioni di pubblicazione' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Invia in revisione' }));

    expect(onRequestStatusChange).toHaveBeenCalledTimes(1);
    expect(onRequestStatusChange).toHaveBeenCalledWith('review');
  });

  it('"Anteprima" nella topbar invoca onPreview, non un toggle di sidebar', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    renderPanel({ onPreview });

    await user.click(screen.getByRole('button', { name: 'Anteprima' }));

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(useBlockEditorStore.getState().isSidebarOpen).toBe(true);
  });
});
