import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'path';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addRootBlock,
  blockOfType,
  canvasFrame,
  createPageFromUi,
  deletePageFromUi,
  openContentTab,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E Wave 2.1 (refactoring `FullScreenEditorLayout` in moduli + Impostazioni Pagina
 * nell'Inspector): verifica in browser reale — mouse reale, mai eventi sintetici — che la
 * scomposizione non abbia rotto hover/selezione/drag & drop cross-frame (ADR-72) e che le
 * Impostazioni Pagina compaiano una volta sola (Inspector, non anche nella sidebar).
 *
 * Screenshot diagnostici in `e2e/artifacts/wave-2-1/`.
 */

const TITOLO_PAGINA = 'Wave 2.1 — Impostazioni Pagina, hover, selezione, DnD';
const SHOTS = resolve(__dirname, '../artifacts/wave-2-1');

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

/**
 * Deseleziona il blocco corrente. `useEditorShortcuts` ascolta solo la `window` del padre
 * (comportamento preesistente alla Wave 2): con il fuoco dentro l'iframe Escape non arriva,
 * quindi si riporta prima il fuoco nel documento padre con un click reale sull'angolo (vuoto)
 * della topbar.
 */
async function deselectFromParent(page: Page): Promise<void> {
  await page.getByRole('banner').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Escape');
}

test('Impostazioni Pagina canoniche nell’Inspector, inserimento, hover, selezione e drag & drop', async ({
  page,
}) => {
  test.slow();

  await createPageFromUi(page, {
    title: TITOLO_PAGINA,
    slug: uniqueSlug('wave21-e2e'),
  });
  await openContentTab(page);
  await expect(canvasFrame(page).getByText('Trascina il widget qui')).toBeVisible();

  const inspector = page.getByRole('complementary', {
    name: "Proprietà dell'elemento",
  });
  const titoloPagina = page.getByRole('textbox', { name: /^Titolo/ });
  const slugPagina = page.getByRole('textbox', { name: /^Slug/ });

  // ─── 1. Stato iniziale: Page Settings nell'Inspector, NESSUNA duplicazione nella sidebar ───
  await expect(inspector.getByText('Impostazioni Pagina')).toBeVisible();
  await expect(inspector.getByRole('textbox', { name: /^Titolo/ })).toHaveValue(TITOLO_PAGINA);
  await expect(inspector.getByRole('textbox', { name: /^Slug/ })).toBeVisible();
  // Un solo form Titolo/Slug in tutta la pagina, e la scheda "Pagina" della sidebar assente.
  await expect(titoloPagina).toHaveCount(1);
  await expect(slugPagina).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Pagina' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Widgets' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-stato-iniziale.png` });

  // ─── 2. Inserimento di una Sezione e di un Widget ───────────────────────────────────────
  const sections = blockOfType(page, 'section');
  const sectionsBefore = await sections.count();
  await addRootBlock(page, 'Sezione');
  await expect(sections).toHaveCount(sectionsBefore + 1);

  const headings = blockOfType(page, 'heading');
  const headingsBefore = await headings.count();
  await addRootBlock(page, 'Titolo');
  await expect(headings).toHaveCount(headingsBefore + 1);

  // ─── 3. Hover con mouse reale (sezione, poi widget) ─────────────────────────────────────
  // L'inserimento seleziona il widget appena creato: si torna prima allo stato neutro, così
  // l'hover si osserva senza selezione attiva.
  await deselectFromParent(page);
  await expect(inspector.getByText('Impostazioni Pagina')).toBeVisible();

  // Il canvas è in un iframe: il mouse reale (`page.mouse`) attraversa il confine iframe↔padre.
  // L'asserzione guarda il badge di hover (`hoverBadgeLabel`) con l'etichetta *di quel blocco*:
  // un overlay qualunque potrebbe appartenere al figlio annidato.
  const hoverBadge = (label: string) =>
    canvasFrame(page).locator('[class*="hoverBadgeLabel"]').filter({ hasText: label });

  // Sezione: bordo sinistro (la sua fascia di padding attorno al Titolo annidato, 5px).
  const section = sections.first();
  await section.scrollIntoViewIfNeeded();
  const sectionBox = await section.boundingBox();
  if (!sectionBox) throw new Error('Sezione senza bounding box');
  await page.mouse.move(sectionBox.x + 2, sectionBox.y + sectionBox.height / 2);
  await expect(hoverBadge('Sezione')).toBeVisible();
  await expect(hoverBadge('Titolo')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/02-hover-sezione.png` });

  // Widget: centro del Titolo.
  const heading = headings.last();
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error('Titolo senza bounding box');
  await page.mouse.move(headingBox.x + headingBox.width / 2, headingBox.y + headingBox.height / 2, {
    steps: 5,
  });
  await expect(hoverBadge('Titolo')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-hover-widget.png` });

  // ─── 4. Selezione con click reale: l'Inspector passa da Page Settings a Property Inspector ─
  await heading.click();
  await expect(inspector.getByText('Impostazioni Pagina')).toHaveCount(0);
  await expect(titoloPagina).toHaveCount(0);
  // Con un blocco selezionato la scheda "Pagina" torna disponibile nella sidebar, ma il suo
  // form non è montato finché non la si apre: ancora nessuna duplicazione a schermo.
  await expect(page.getByRole('tab', { name: 'Pagina' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-selezione.png` });

  // Deselezione: torna il pannello Impostazioni Pagina, la scheda sidebar sparisce di nuovo.
  await deselectFromParent(page);
  await expect(inspector.getByText('Impostazioni Pagina')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pagina' })).toHaveCount(0);
  await expect(titoloPagina).toHaveCount(1);

  // ─── 5. Drag & drop base con mouse reale: tessera della palette (documento padre) → ───────
  // drop-zone nell'iframe. Attraversa il ponte di misura cross-frame (`useCrossFrameMeasuring`):
  // senza, la zona non diventa mai `data-over` e il drop non inserisce nulla.
  const tile = page.getByRole('button', {
    name: /^Inserisci il blocco Titolo /,
  });
  const zone = canvasFrame(page).locator('[data-over]').last();
  await tile.scrollIntoViewIfNeeded();
  await zone.scrollIntoViewIfNeeded();
  const tileBox = await tile.boundingBox();
  const zoneBox = await zone.boundingBox();
  if (!tileBox || !zoneBox) throw new Error('DnD: tessera o drop-zone senza bounding box');

  const headingsBeforeDrop = await headings.count();
  await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tileBox.x + tileBox.width / 2 + 20, tileBox.y + tileBox.height / 2 - 20, {
    steps: 5,
  });
  await page.mouse.move(zoneBox.x + zoneBox.width / 2, zoneBox.y + zoneBox.height / 2, {
    steps: 15,
  });
  await expect(zone).toHaveAttribute('data-over', 'true');
  await page.screenshot({ path: `${SHOTS}/05-drag-in-corso.png` });
  await page.mouse.up();

  await expect(headings).toHaveCount(headingsBeforeDrop + 1);
  await page.screenshot({ path: `${SHOTS}/06-dopo-drop.png` });
});
