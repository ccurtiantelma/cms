import { test, expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  canvasFrame,
  createPageFromUi,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * Wave 1.1 — la chrome di hover/selezione (ADR-92) è un overlay puro: il box model del
 * blocco e la posizione del testo NON cambiano fra stato neutro, hover e selezione.
 * Validazione nel browser reale con misura geometrica e screenshot distinti.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

const OUT_DIR = resolve(__dirname, '../artifacts/wave-1-1');
const NEUTRAL_POINT = { x: 2, y: 2 }; // fuori dal canvas: nessun hover possibile

interface Geometry {
  wrapper: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
  text: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Riporta il puntatore fuori dal canvas con un passaggio esplicito sul bordo del wrapper della
 * Sezione (il suo `mouseout` azzera l'hover) e poi fuori dall'iframe. Serve perché un blocco
 * inserito sotto un puntatore fermo riceve `mouseover` ma il genitore non riceve mai `mouseout`
 * (nessun movimento): l'hover resterebbe "stantio" — un artefatto del test, non dell'app: un
 * utente che muove il mouse produce sempre la coppia mouseout/mouseover.
 */
async function resetPointer(page: Page): Promise<void> {
  const box = await blockOfType(page, 'section').first().boundingBox();
  if (!box) throw new Error('Sezione non misurabile');
  await page.mouse.move(box.x + 1, box.y + 1, { steps: 4 });
  await page.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y, { steps: 12 });
  await expect(canvasFrame(page).locator('[data-block-chrome="hover"]')).toHaveCount(0);
}

async function hoverAt(page: Page, box: { x: number; y: number }): Promise<void> {
  // Due mosse: la prima porta il puntatore nell'iframe, la seconda genera il `mouseover` finale.
  await page.mouse.move(box.x - 1, box.y - 1);
  await page.mouse.move(box.x, box.y, { steps: 3 });
}

async function measure(block: Locator, contentSelector: string): Promise<Geometry> {
  const wrapper = await block.boundingBox();
  const content = await block.locator(contentSelector).first().boundingBox();
  if (!wrapper || !content) throw new Error('bounding box non disponibile');
  const text = await block.locator(contentSelector).first().evaluate((el) => {
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return { wrapper, content, text };
}

async function shot(page: Page, name: string): Promise<string> {
  const path = resolve(OUT_DIR, name);
  await page.locator('iframe').first().screenshot({ path, animations: 'disabled' });
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function chromeOf(block: Locator): Promise<{ state: string | null; borderWidth: string }> {
  const chrome = block.locator(':scope > [data-block-chrome]');
  await expect(chrome).toHaveCount(1);
  return {
    state: await chrome.getAttribute('data-block-chrome'),
    borderWidth: await chrome.evaluate((el) => getComputedStyle(el).borderTopWidth),
  };
}

test('chrome hover/selezione: overlay puro, nessun layout shift (Sezione + Titolo)', async ({
  page,
}) => {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(() => {
    window.localStorage.setItem('tour_completed', 'true');
    window.localStorage.setItem('mfaPromptShown', 'true');
  });

  await createPageFromUi(page, { title: 'Chrome geometry', slug: uniqueSlug('chrome-geo') });
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section').first();
  await expect(section).toBeVisible();
  await addChildBlock(section, 'Titolo');
  const heading = blockOfType(page, 'heading').first();
  await expect(heading).toBeVisible();

  const SECTION_CONTENT = ':scope > *:not([data-block-chrome]):not([data-block-overlay])';
  const HEADING_CONTENT = 'h1, h2, h3, h4, h5, h6';

  // ---- Stato neutro --------------------------------------------------------------------
  // L'inserimento seleziona il blocco appena creato: Escape (useEditorShortcuts) deseleziona,
  // poi il puntatore esce dall'iframe. Nessun click sul canvas: colpirebbe un blocco.
  await page.keyboard.press('Escape');
  await resetPointer(page);
  await expect(canvasFrame(page).locator('[data-block-chrome]')).toHaveCount(0);
  const neutralHeading = await measure(heading, HEADING_CONTENT);
  const neutralSection = await measure(section, SECTION_CONTENT);
  const hashNeutral = await shot(page, '00-neutral.png');

  // ---- Hover widget ---------------------------------------------------------------------
  const hb = neutralHeading.content;
  await hoverAt(page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
  expect(await chromeOf(heading)).toEqual({ state: 'hover', borderWidth: '1px' });
  await expect(canvasFrame(page).locator('[data-block-chrome]')).toHaveCount(1);
  const hoverHeading = await measure(heading, HEADING_CONTENT);
  const hashHoverWidget = await shot(page, '01-hover-widget.png');

  // ---- Hover sezione (angolo interno, fuori dal titolo) -----------------------------------
  await resetPointer(page);
  const sb = neutralSection.wrapper;
  await hoverAt(page, { x: sb.x + sb.width - 6, y: sb.y + sb.height - 6 });
  expect(await chromeOf(section)).toEqual({ state: 'hover', borderWidth: '1px' });
  await expect(canvasFrame(page).locator('[data-block-chrome]')).toHaveCount(1);
  const hoverSection = await measure(section, SECTION_CONTENT);
  const hashHoverSection = await shot(page, '02-hover-section.png');

  // ---- Selezione widget (puntatore fuori: nessun hover residuo) ---------------------------
  await resetPointer(page);
  await selectBlock(heading, 'Titolo');
  await resetPointer(page);
  expect(await chromeOf(heading)).toEqual({ state: 'selected', borderWidth: '2px' });
  const selectedHeading = await measure(heading, HEADING_CONTENT);
  const hashSelectedWidget = await shot(page, '03-selected-widget.png');

  // ---- Selezione sezione -----------------------------------------------------------------
  await selectBlock(section, 'Sezione');
  await resetPointer(page);
  expect(await chromeOf(section)).toEqual({ state: 'selected', borderWidth: '2px' });
  const selectedSection = await measure(section, SECTION_CONTENT);
  const hashSelectedSection = await shot(page, '04-selected-section.png');

  // ---- Geometria: identica in ogni stato (tolleranza 0) --------------------------------
  expect(hoverHeading, 'Titolo: hover vs neutro').toEqual(neutralHeading);
  expect(selectedHeading, 'Titolo: selezionato vs neutro').toEqual(neutralHeading);
  expect(hoverSection.wrapper, 'Sezione: hover vs neutro').toEqual(neutralSection.wrapper);
  expect(selectedSection.wrapper, 'Sezione: selezionata vs neutro').toEqual(neutralSection.wrapper);

  // ---- Screenshot: cinque stati, tutti distinti -----------------------------------------
  const hashes = [
    hashNeutral,
    hashHoverWidget,
    hashHoverSection,
    hashSelectedWidget,
    hashSelectedSection,
  ];
  expect(new Set(hashes).size, 'screenshot duplicati').toBe(hashes.length);
});
