import { test, expect, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import { createPageFromUi, deletePageFromUi, uniqueSlug } from './helpers/page-editor';

const PAGE_TITLE = 'Isolamento tema — E2E';
const UPDATED_PRIMARY = '#e11d48';

/**
 * Il `ThemeConfig` completo (ADR-4) è largo e versionato: qui non se ne
 * ricostruisce la forma, si legge quello reale e se ne cambia una voce sola.
 * Il tipo resta volutamente lasco per la stessa ragione.
 */
type ThemeConfigDto = {
  version: number;
  colors: Record<string, string>;
  [key: string]: unknown;
};

test.use({ storageState: ADMIN_STORAGE_STATE });

async function requestTheme(
  page: Page,
  method: 'GET' | 'PUT',
  body?: ThemeConfigDto,
): Promise<ThemeConfigDto> {
  return page.evaluate(
    async ({ method, body }) => {
      const token = window.localStorage.getItem('access_token');
      const response = await fetch('/api/v1/app/settings/theme', {
        method,
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        throw new Error(`Theme API returned HTTP ${response.status}`);
      }
      return (await response.json()) as ThemeConfigDto;
    },
    { method, body },
  );
}

async function openEditor(page: Page): Promise<void> {
  const contentTab = page.getByRole('tab', { name: 'Contenuto' });
  if ((await contentTab.getAttribute('aria-selected')) !== 'true') {
    await contentTab.click();
  }
  await expect(page.locator('.eaidos-canvas-theme-scope')).toBeVisible();
}

/**
 * L'invariante che questa modifica ha stabilito: il tema dell'Editor tema veste
 * il **contenuto** (Canvas dell'editor, e con lo stesso compilatore il sito
 * pubblicato), **non** la chrome amministrativa che lo circonda — che resta sui
 * default di fabbrica di Mantine. È il rapporto che WordPress ha col proprio
 * customizer, ed è verificabile qui in un colpo solo: dopo aver cambiato il
 * primario, il canvas cambia e la sidebar no.
 */
test('il tema veste il canvas e non altera la chrome admin', async ({ page }) => {
  test.slow();

  const guid = await createPageFromUi(page, {
    title: PAGE_TITLE,
    slug: uniqueSlug('theme-scope-e2e'),
  });

  const originalTheme = await requestTheme(page, 'GET');

  try {
    const adminSidebar = page.locator('nav[data-tour="sidebar-nav"]');
    await expect(adminSidebar).toBeVisible();
    const originalChromeColors = await adminSidebar.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });

    await openEditor(page);

    const canvas = page.locator('.eaidos-canvas-theme-scope');
    await expect(canvas).toBeVisible();

    await requestTheme(page, 'PUT', {
      ...originalTheme,
      colors: { ...originalTheme.colors, primary: UPDATED_PRIMARY },
    });

    // Il reload rimonta l'editor e gli fa riconciliare col server il tema appena scritto.
    await page.reload();
    await openEditor(page);

    await expect
      .poll(async () =>
        canvas.evaluate((element) =>
          window.getComputedStyle(element).getPropertyValue('--theme-primary').trim(),
        ),
      )
      .toBe(UPDATED_PRIMARY);

    const updatedChromeColors = await adminSidebar.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });
    expect(updatedChromeColors).toEqual(originalChromeColors);
  } finally {
    await requestTheme(page, 'PUT', originalTheme).catch(() => undefined);
    await deletePageFromUi(page, PAGE_TITLE).catch(() => undefined);
  }
});
