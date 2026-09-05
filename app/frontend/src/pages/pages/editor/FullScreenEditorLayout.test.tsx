/**
 * Component test del cambio di viewport simulato in `FullScreenEditorLayout.tsx`: il
 * click sul `ViewportSelector` della topbar deve aggiornare `activeViewport` su
 * `useBlockEditorStore` e riflettersi sulla classe CSS (quindi sul `max-width`, definito
 * in `FullScreenEditorLayout.module.css`) del contenitore che avvolge `EditorCanvas`.
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
  useBlockEditorStore.setState({ activeViewport: 'desktop', globalTokens: DEFAULT_GLOBAL_TOKENS });
});

describe('FullScreenEditorLayout — cambio viewport', () => {
  it('parte sul frame desktop', () => {
    const { container } = renderLayout();

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportDesktop);
    expect(frame).toHaveAttribute('data-viewport', 'desktop');
  });

  it('selezionare Tablet applica la classe (e quindi il max-width) del frame tablet', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: /Viewport Tablet/ }));

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportTablet);
    expect(frame).not.toHaveClass(styles.viewportDesktop);
    expect(frame).toHaveAttribute('data-viewport', 'tablet');
    expect(useBlockEditorStore.getState().activeViewport).toBe('tablet');
  });

  it('selezionare Mobile applica la classe (e quindi il max-width) del frame mobile', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: /Viewport Mobile/ }));

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportMobile);
    expect(frame).toHaveAttribute('data-viewport', 'mobile');
    expect(useBlockEditorStore.getState().activeViewport).toBe('mobile');
  });

  it('tornare su Desktop ripristina il frame a piena larghezza', async () => {
    const user = userEvent.setup();
    useBlockEditorStore.setState({ activeViewport: 'mobile' });
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: /Viewport Desktop/ }));

    const frame = container.querySelector(`.${styles.viewportContainer}`);
    expect(frame).toHaveClass(styles.viewportDesktop);
    expect(frame).toHaveAttribute('data-viewport', 'desktop');
  });

  it('il pulsante del viewport attivo riflette la pressione via aria-pressed', async () => {
    const user = userEvent.setup();
    renderLayout();

    const tabletButton = screen.getByRole('button', { name: /Viewport Tablet/ });
    expect(tabletButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(tabletButton);

    await waitFor(() => expect(tabletButton).toHaveAttribute('aria-pressed', 'true'));
  });
});
