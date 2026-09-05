/**
 * Test d'integrazione dei tre controlli E01 aggiunti alla chrome dell'editor visivo, per
 * come sono davvero cablati insieme dentro `BlockEditorPanel.tsx`
 * (`FullScreenEditorLayout` → `Toolbar`/`EditorSidebar`):
 * - il toggle "Anteprima Pura" nasconde la sidebar sinistra e disattiva i contorni del
 *   canvas (`data-preview-mode`, `EditorBlockWrapper.module.css`);
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
const fullScreenStyles = (await import('./FullScreenEditorLayout.module.css')).default as Record<
  string,
  string
>;

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
  props: { pageStatus?: PageStatus; visibleTransitions?: readonly PageStatus[] } = {},
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
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useBlockEditorStore.setState({
    isPreviewMode: false,
    isSidebarOpen: true,
    activeSidebarTab: 'widgets',
  });
});

describe('BlockEditorPanel — E01', () => {
  it('mostra la scheda "Pagina" nella sidebar, accanto a "Widgets" e "Proprietà"', () => {
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Widgets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Proprietà' })).toBeInTheDocument();
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

  it('separa "Salva Bozza" da "Cambia Stato" nella topbar', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Salva Bozza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambia Stato' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Cambia Stato' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Invia in revisione' }));

    expect(onRequestStatusChange).toHaveBeenCalledTimes(1);
    expect(onRequestStatusChange).toHaveBeenCalledWith('review');
  });

  it('"Anteprima Pura" nasconde la sidebar sinistra e disattiva i contorni del canvas', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();

    expect(
      container.querySelector(`.${fullScreenStyles.sidebar}.${fullScreenStyles.sidebarCollapsed}`),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Anteprima Pura' }));

    expect(useBlockEditorStore.getState().isPreviewMode).toBe(true);
    expect(
      container.querySelector(`.${fullScreenStyles.sidebar}.${fullScreenStyles.sidebarCollapsed}`),
    ).toBeInTheDocument();
    // La disattivazione vera e propria dei contorni è una regola CSS scoped da questo
    // attributo (`[data-preview-mode='true']` in `EditorBlockWrapper.module.css`), non
    // calcolabile in jsdom (nessun CSS Module applicato) — qui si verifica solo l'attributo
    // che quella regola osserva.
    expect(container.querySelector('[data-preview-mode="true"]')).toBeInTheDocument();
  });
});
