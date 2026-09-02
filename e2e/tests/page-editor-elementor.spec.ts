import { test, expect, type Locator, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  openContentTab,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E dell'overlay hover/selezione unico dell'editor visivo (restyle "Elementor Pro Twin",
 * `BlockHoverOverlay.tsx`/`EditorBlockWrapper.tsx`) e del Device Switcher del canvas
 * (`ViewportSelector.tsx`). Copre i quattro scenari richiesti: comparsa dell'overlay su
 * Sezione e blocco interno, duplicazione, eliminazione (via `ConfirmModal`, non via menu
 * contestuale — percorso distinto da {@link import('./helpers/page-editor').duplicateBlock}/
 * {@link import('./helpers/page-editor').deleteBlock}, che passano dal tasto destro), e il
 * cambio di viewport Desktop → Tablet → Mobile.
 *
 * Le etichette "Sezione"/"Titolo" sono quelle di `meta.label` nel registro generato
 * (`app/frontend/src/types/blocks.types.ts`, tipi `section`/`heading`), verificate sul file
 * prima di scriverle qui — è lo stesso vocabolario già usato da `addRootBlock`/`addChildBlock`
 * negli altri spec di questa cartella.
 */

const TITOLO_PAGINA = 'Overlay hover editor — E2E Elementor';
const SECTION_LABEL = 'Sezione';
const HEADING_LABEL = 'Titolo';

/** Forma di `crypto.randomUUID()` (`block-tree.utils.ts`), usata per ogni id di nodo. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

/**
 * Crea una Pagina, apre l'editor e compone una Sezione con un Titolo come unico figlio.
 *
 * La Pagina appena creata non parte da un canvas vuoto: il `templateSlug` di default
 * ("empty", RFC-43) porta già una Sezione seed in radice (`page-blueprints.registry.ts`,
 * `app/backend/src/pages/blueprints/`). Si calcola il delta rispetto al conteggio iniziale
 * invece di assumere un'unica Sezione in pagina, e si individua quella di questo test con
 * `.last()` — "Aggiungi widget" inserisce sempre in coda alla radice (`addRootBlock`,
 * commento di testa in `page-editor.ts`), quindi resta sempre l'ultima nell'ordine del DOM.
 */
async function setupSectionWithHeading(page: Page): Promise<{ section: Locator }> {
  const slug = uniqueSlug('editor-elementor-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  const initialSectionCount = await blockOfType(page, 'section').count();
  await addRootBlock(page, SECTION_LABEL);
  const section = blockOfType(page, 'section').last();
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);

  await addChildBlock(section, HEADING_LABEL);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);

  return { section };
}

/**
 * L'overlay unico (`BlockHoverOverlay.tsx`) è montato solo mentre il suo blocco è in hover o
 * selezionato — mai in DOM altrimenti — quindi una ricerca per discendenza da `block` risolve
 * a un solo elemento finché nessun blocco annidato al suo interno è a sua volta in hover/
 * selezionato.
 */
function overlayOf(block: Locator): Locator {
  return block.locator('[data-block-overlay="true"]');
}

/** Verifica che l'overlay porti esattamente i quattro controlli attesi, per l'etichetta data. */
async function expectOverlayActions(overlay: Locator, label: string): Promise<void> {
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('button')).toHaveCount(4);
  await expect(overlay.getByRole('button', { name: `Trascina per spostare il blocco ${label}` })).toBeVisible();
  await expect(overlay.getByRole('button', { name: `Duplica il blocco ${label}`, exact: true })).toBeVisible();
  await expect(overlay.getByRole('button', { name: `Modifica il blocco ${label}`, exact: true })).toBeVisible();
  await expect(overlay.getByRole('button', { name: `Elimina il blocco ${label}`, exact: true })).toBeVisible();
}

test('hover overlay: compare su una Sezione e su un blocco interno con i quattro controlli', async ({ page }) => {
  test.slow();
  const { section } = await setupSectionWithHeading(page);
  const heading = blockOfType(section, 'heading');

  // Hover sulla Sezione: `overlayOf` cerca solo dentro il sottoalbero di `section`, quindi
  // risolve al suo overlay indipendentemente da eventuali residui di hover altrove.
  await section.hover();
  await expectOverlayActions(overlayOf(section), SECTION_LABEL);

  // Hover sul blocco interno (Titolo, foglia, nessun discendente proprio): `overlayOf(heading)`
  // cerca solo dentro il suo sottoalbero, quindi risolve al suo overlay senza ambiguità con
  // quello — eventualmente ancora montato — della Sezione che lo contiene.
  await heading.hover();
  await expectOverlayActions(overlayOf(heading), HEADING_LABEL);
});

test('duplicazione: il pulsante "Duplica" dell\'overlay inserisce il nodo copiato con un guid autonomo', async ({
  page,
}) => {
  test.slow();
  const { section } = await setupSectionWithHeading(page);
  const heading = blockOfType(section, 'heading');
  const originalId = await heading.getAttribute('data-block-id');
  expect(originalId).toMatch(UUID_PATTERN);

  await heading.hover();
  await overlayOf(heading).getByRole('button', { name: `Duplica il blocco ${HEADING_LABEL}`, exact: true }).click();

  const headings = blockOfType(section, 'heading');
  await expect(headings).toHaveCount(2);

  const ids = await headings.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id')));
  expect(ids).toContain(originalId);
  expect(new Set(ids).size).toBe(2);
  const duplicateId = ids.find((id) => id !== originalId);
  expect(duplicateId).toMatch(UUID_PATTERN);
});

test('eliminazione: il pulsante "Elimina" dell\'overlay apre il ConfirmModal e rimuove il nodo dal Canvas', async ({
  page,
}) => {
  test.slow();
  const { section } = await setupSectionWithHeading(page);
  const heading = blockOfType(section, 'heading');

  await heading.hover();
  await overlayOf(heading).getByRole('button', { name: `Elimina il blocco ${HEADING_LABEL}`, exact: true }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: `Elimina blocco "${HEADING_LABEL}"` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Elimina', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(blockOfType(section, 'heading')).toHaveCount(0);
});

/**
 * Attende l'ampiezza finale di `.viewportContainer` dentro `[min, max]`: la larghezza non
 * cambia di scatto, `.viewportContainer` porta una `transition: width 0.3s ease-in-out`
 * (`FullScreenEditorLayout.module.css`) — un `boundingBox()` letto subito dopo il click
 * legge un valore ancora a metà dell'animazione, verificato empiricamente (938px invece di
 * 768 sul frame Tablet, letto un istante dopo il cambio di classe).
 */
async function expectStableWidth(locator: Locator, min: number, max: number): Promise<void> {
  await expect
    .poll(async () => (await locator.boundingBox())?.width, { timeout: 2_000 })
    .toBeGreaterThanOrEqual(min);
  await expect
    .poll(async () => (await locator.boundingBox())?.width, { timeout: 2_000 })
    .toBeLessThanOrEqual(max);
}

test('viewport switcher: Desktop -> Tablet -> Mobile applica classe e ampiezza al contenitore del Canvas', async ({
  page,
}) => {
  test.slow();
  const slug = uniqueSlug('editor-elementor-viewport-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // `.viewportContainer` (`FullScreenEditorLayout.tsx`): unico elemento con `data-viewport`
  // nel canvas, aggancio dichiarativo per selettori CSS/E2E (commento di testa del suo JSX).
  const canvasViewport = page.locator('[data-viewport]');
  await expect(canvasViewport).toHaveAttribute('data-viewport', 'desktop');
  await expect(canvasViewport).toHaveClass(/viewportDesktop/);
  const desktopBox = await canvasViewport.boundingBox();
  expect(desktopBox).not.toBeNull();

  await page.getByRole('button', { name: 'Viewport Tablet, 768px', exact: true }).click();
  await expect(canvasViewport).toHaveAttribute('data-viewport', 'tablet');
  await expect(canvasViewport).toHaveClass(/viewportTablet/);
  await expectStableWidth(canvasViewport, 766, 770);

  await page.getByRole('button', { name: 'Viewport Mobile, 375px', exact: true }).click();
  await expect(canvasViewport).toHaveAttribute('data-viewport', 'mobile');
  await expect(canvasViewport).toHaveClass(/viewportMobile/);
  await expectStableWidth(canvasViewport, 373, 377);

  await page.getByRole('button', { name: 'Viewport Desktop, 100%', exact: true }).click();
  await expect(canvasViewport).toHaveAttribute('data-viewport', 'desktop');
  await expect(canvasViewport).toHaveClass(/viewportDesktop/);
  // Desktop è fluido (nessuna larghezza fissa come Tablet/Mobile): la sola garanzia stabile
  // è che torni più largo del frame Mobile appena lasciato, una volta finita la transizione.
  await expect
    .poll(async () => (await canvasViewport.boundingBox())?.width, { timeout: 2_000 })
    .toBeGreaterThan(377);
});
