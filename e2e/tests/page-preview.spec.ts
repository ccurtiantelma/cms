import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  openContentTab,
  publishFromStatusMenu,
  saveDraft,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E del criterio di Done di ADR-25/T6 (F04-bis, "Anteprima di una bozza non
 * pubblicata"): genera l'anteprima dal dettaglio Pagina reale (nessuna
 * scorciatoia via API), apre l'URL prodotto, verifica che la rotta dedicata
 * di `app/public-site` porti sempre `X-Robots-Tag: noindex, nofollow,
 * noarchive` e il meta `robots` nel proprio `<head>` (ADR-25 § 4), e che il
 * contenuto REALMENTE pubblicato (l'endpoint `public/`, raggiunto tramite
 * "Vedi pagina") non cambi per effetto della bozza successiva né
 * dell'apertura dell'anteprima.
 *
 * Percorso: pubblico → si ripubblica in bozza (`published -> draft`,
 * transizione ammessa dalla macchina a stati) → si modifica ulteriormente il
 * contenuto senza ripubblicare → si genera e si apre l'anteprima da lì.
 */

const TITOLO_PAGINA = 'Pagina anteprima — E2E ADR-25';
const TESTO_PUBBLICATO = 'Contenuto realmente pubblicato';
const TESTO_SOLO_BOZZA = 'Contenuto solo in bozza, mai pubblicato';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('anteprima dal dettaglio Pagina: header/meta noindex sempre presenti, il pubblico reale non cambia', async ({
  page,
  context,
}) => {
  test.slow();

  // ─── 1. Creo, compongo e pubblico una prima versione ──────────────────
  const slug = uniqueSlug('anteprima-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });

  await openContentTab(page);
  await addRootBlock(page, 'Titolo');
  const heading = blockOfType(page, 'heading');
  await selectBlock(heading, 'Titolo');
  await fillProp(page, 'text', TESTO_PUBBLICATO);
  await saveDraft(page);

  await publishFromStatusMenu(page);

  const vediPagina = page.getByRole('link', { name: 'Vedi pagina' });
  await expect(vediPagina).toBeVisible();
  const publicUrl = (await vediPagina.getAttribute('href')) as string;
  expect(publicUrl).toBeTruthy();

  const publishedBefore = await page.request.get(publicUrl);
  expect(publishedBefore.status()).toBe(200);
  const publishedHtmlBefore = await publishedBefore.text();
  expect(publishedHtmlBefore).toContain(TESTO_PUBBLICATO);

  // ─── 2. Riporto in bozza (published -> draft, il pubblicato resta online) ─
  const statusTrigger = page.getByRole('button', { name: 'Pubblicata', exact: true });
  await statusTrigger.click();
  const dropdownId = await statusTrigger.getAttribute('aria-controls');
  await page
    .locator(`#${dropdownId}`)
    .getByRole('menuitem', { name: 'Riporta in bozza', exact: true })
    .click();
  const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Conferma cambio di stato' });
  await confirmDialog.getByRole('button', { name: 'Riporta in bozza' }).click();
  await expect(page.getByRole('button', { name: 'Bozza', exact: true })).toBeVisible();

  // ─── 3. Modifico ulteriormente la bozza, SENZA ripubblicare ───────────
  await openContentTab(page);
  await selectBlock(blockOfType(page, 'heading'), 'Titolo');
  await fillProp(page, 'text', TESTO_SOLO_BOZZA);
  await saveDraft(page);

  // ─── 4. Genero l'anteprima dal pulsante reale del dettaglio ───────────
  const anteprimaButton = page.getByRole('button', { name: 'Anteprima' });
  await expect(anteprimaButton).toBeVisible();

  const [popup] = await Promise.all([context.waitForEvent('page'), anteprimaButton.click()]);
  await popup.waitForLoadState('domcontentloaded');
  const previewUrl = popup.url();
  expect(previewUrl).toContain('/__preview/');
  await popup.close();

  // ─── 5. Verifica header + meta robots sulla risposta reale della rotta ─
  const previewResponse = await page.request.get(previewUrl);
  expect(previewResponse.status()).toBe(200);
  expect(previewResponse.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');

  const previewHtml = await previewResponse.text();
  expect(previewHtml).toMatch(/<meta[^>]+name="robots"[^>]+content="noindex,\s*nofollow"/i);
  expect(previewHtml).toContain(TESTO_SOLO_BOZZA);

  // ─── 6. Il contenuto pubblicato reale non è cambiato ───────────────────
  const publishedAfter = await page.request.get(publicUrl);
  expect(publishedAfter.status()).toBe(200);
  const publishedHtmlAfter = await publishedAfter.text();
  expect(publishedHtmlAfter).toContain(TESTO_PUBBLICATO);
  expect(publishedHtmlAfter).not.toContain(TESTO_SOLO_BOZZA);
  expect(publishedHtmlAfter).toBe(publishedHtmlBefore);

  // ─── 7. Un 404 sulla rotta di anteprima porta comunque l'header ───────
  const notFoundPreviewUrl = previewUrl.replace(/__preview\/.+$/, '__preview/token-inesistente');
  const notFoundResponse = await page.request.get(notFoundPreviewUrl);
  expect(notFoundResponse.status()).toBe(404);
  expect(notFoundResponse.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');
});
