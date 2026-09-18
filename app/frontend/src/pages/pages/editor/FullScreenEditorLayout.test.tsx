/**
 * Component test del cambio di breakpoint simulato in `FullScreenEditorLayout.tsx` (Sub-Task
 * "Frame WYSIWYG In-Place & Breakpoint Switcher"): il click sul `BreakpointSwitcher` della
 * topbar deve aggiornare `activeBreakpoint` su `useBlockEditorStore` e riflettersi sulla
 * classe/`style` inline (quindi sulla larghezza reale, definita in
 * `FullScreenEditorLayout.module.css`) del contenitore che avvolge `IframeCanvas`.
 *
 * `getGlobalTokensApi` è mockato al confine di rete (stesso principio di
 * `LocaleSwitcher.test.tsx`): questo componente la chiama una tantum al mount per
 * idratare i Global Design Tokens, cosa estranea al comportamento sotto test qui.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/utils';
import { useBlockEditorStore } from '../../../hooks/useBlockEditorStore';
import { DEFAULT_GLOBAL_TOKENS } from '../../../libs/globalTokensCompiler';
import type { GlobalTokensDto } from '../../../services/settings.service';

const getGlobalTokensApi = vi.fn<() => Promise<GlobalTokensDto>>();

vi.mock('../../../services/settings.service', () => ({
  getGlobalTokensApi: () => getGlobalTokensApi(),
  toGlobalTokens: (dto: unknown) => dto,
}));

const { default: FullScreenEditorLayout } = await import('./FullScreenEditorLayout');
const styles = (await import('./FullScreenEditorLayout.module.css')).default as Record<
  string,
  string
>;

function renderLayout() {
  return renderWithProviders(
    <FullScreenEditorLayout
      pageTitle="Chi siamo"
      backHref="/pages/a1b2c3d4e5f6a7b8"
      hasUnsavedChanges={false}
      saving={false}
      onSaveDraft={() => undefined}
    >
      <div>contenuto</div>
    </FullScreenEditorLayout>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useBlockEditorStore.setState({
    activeBreakpoint: 'default',
    activeViewport: 'desktop',
    globalTokens: DEFAULT_GLOBAL_TOKENS,
  });
});

describe('FullScreenEditorLayout — cambio breakpoint', () => {
  it('parte sul frame default (fluido)', () => {
    const { container } = renderLayout();

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportDesktop);
    expect(frame).toHaveAttribute('data-breakpoint', 'default');
  });

  it('selezionare Tablet applica la larghezza esatta (1024px, default di fabbrica ADR-76) del frame', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: /Breakpoint Tablet/ }));

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportFramed);
    expect(frame).not.toHaveClass(styles.viewportDesktop);
    expect(frame).toHaveAttribute('data-breakpoint', 'tablet');
    expect(frame).toHaveStyle({ width: '1024px' });
    expect(useBlockEditorStore.getState().activeBreakpoint).toBe('tablet');
    // Il Property Inspector (3 vie) resta coerente senza essere toccato da questo task.
    expect(useBlockEditorStore.getState().activeViewport).toBe('tablet');
  });

  it('selezionare Mobile applica la larghezza esatta (767px, default di fabbrica ADR-76) del frame', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: /Breakpoint Mobile/ }));

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportFramed);
    expect(frame).toHaveAttribute('data-breakpoint', 'mobile');
    expect(frame).toHaveStyle({ width: '767px' });
    expect(useBlockEditorStore.getState().activeBreakpoint).toBe('mobile');
    expect(useBlockEditorStore.getState().activeViewport).toBe('mobile');
  });

  it('tornare su Desktop ripristina il frame fluido a piena larghezza', async () => {
    const user = userEvent.setup();
    useBlockEditorStore.setState({ activeBreakpoint: 'mobile', activeViewport: 'mobile' });
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: /Breakpoint Desktop/ }));

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportDesktop);
    expect(frame).toHaveAttribute('data-breakpoint', 'default');
  });

  it('il pulsante del breakpoint attivo riflette la pressione via aria-pressed', async () => {
    const user = userEvent.setup();
    renderLayout();

    const tabletButton = screen.getByRole('button', { name: /Breakpoint Tablet/ });
    expect(tabletButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(tabletButton);

    await waitFor(() => expect(tabletButton).toHaveAttribute('aria-pressed', 'true'));
  });

  it('mostra solo i breakpoint attivi per il sito (default di fabbrica: default/tablet/mobile, mai widescreen)', () => {
    renderLayout();

    expect(screen.getByRole('button', { name: /Breakpoint Desktop/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Breakpoint Tablet/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Breakpoint Mobile/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Breakpoint Widescreen/ })).not.toBeInTheDocument();
  });
});
