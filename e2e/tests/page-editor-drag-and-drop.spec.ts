import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  dragBlockToZone,
  duplicateBlock,
  openContentTab,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E del round F04c (PLAN-F04c-editor-maturo.md T7/T8): "duplica blocco" e drag & drop
 * reale con il sensore da tastiera di `dnd-kit`. Non ripete `page-editor.spec.ts`
 * (percorso completo) né `page-editor-undo-redo.spec.ts` (pulsanti indent/outdent, già
 * coperti): qui il fuoco è sul gesto nuovo di questo round.
 *
 * Il trascinamento a puntatore è dichiaratamente fragile (richiede passi intermedi
 * sintetici, RFC-F04c-editor-maturo.md) — è per questo che il registro dei blocchi attiva
 * anche il sensore da tastiera di `dnd-kit`, la sola via deterministica per un test E2E: è
 * quella percorsa qui, mai il puntatore.
 */

const TITOLO_PAGINA = 'Drag & drop e duplica — E2E F04c';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('duplicazione dal pulsante di toolbar: il duplicato compare nel DOM ed è il blocco selezionato', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('duplica-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  await addRootBlock(page, 'Titolo');
  await expect(blockOfType(page, 'heading')).toHaveCount(1);

  await selectBlock(blockOfType(page, 'heading'), 'Titolo');
  await duplicateBlock(page, 'Titolo');

  // Il duplicato è un secondo nodo `heading` nel DOM: la duplicazione non è un no-op.
  await expect(blockOfType(page, 'heading')).toHaveCount(2);

  // Il duplicato diventa il nodo selezionato (Done di T7): il suo wrapper porta la classe
  // di selezione, l'originale no. Non essendoci un `data-testid` di selezione, si legge
  // lo stesso segnale che vede una persona — il bordo di selezione applicato dalla classe
  // CSS module (segmento del nome preservato dal bundler in dev).
  const wrappers = blockOfType(page, 'heading');
  const classi = await wrappers.evaluateAll((nodes) => nodes.map((n) => n.className));
  const selezionati = classi.filter((className) => /selected/i.test(className));
  expect(selezionati).toHaveLength(1);

  // L'undo rimuove il duplicato per intero: torna un solo `heading`.
  await page.getByRole('button', { name: "Annulla l'ultima modifica" }).click();
  await expect(blockOfType(page, 'heading')).toHaveCount(1);
});

test('drag & drop da tastiera: prima, dopo e dentro un contenitore', async ({ page }) => {
  test.slow();

  const slug = uniqueSlug('dnd-tastiera-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // Tre blocchi di radice, in quest'ordine: Sezione, Titolo, Testo.
  await addRootBlock(page, 'Sezione');
  await addRootBlock(page, 'Titolo');
  await addRootBlock(page, 'Testo');

  const tipiDiRadice = () =>
    page.locator('[data-block-type]').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.parentElement?.closest('[data-block-type]') ?? null) === null)
        .map((node) => node.getAttribute('data-block-type')),
    );
  await expect.poll(tipiDiRadice).toEqual(['section', 'heading', 'richText']);

  const section = blockOfType(page, 'section');
  const heading = blockOfType(page, 'heading');
  const richText = blockOfType(page, 'richText');

  // ─── Caso "dentro": il Titolo entra nella Sezione che lo precede ──────────
  const zonaDentroSezione = page.locator(
    '[data-block-type="section"] > section > div[data-over]',
  );
  await dragBlockToZone(page, 'Trascina per spostare il blocco Titolo', zonaDentroSezione, 'ArrowUp');

  await expect.poll(tipiDiRadice).toEqual(['section', 'richText']);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);

  // ─── Caso "prima": il Testo passa davanti alla Sezione ────────────────────
  const zonaPrimaDellaSezione = section.locator('xpath=preceding-sibling::div[1]');
  await dragBlockToZone(
    page,
    'Trascina per spostare il blocco Testo',
    zonaPrimaDellaSezione,
    'ArrowUp',
  );

  await expect.poll(tipiDiRadice).toEqual(['richText', 'section']);

  // ─── Caso "dopo": il Titolo (dentro la Sezione) esce e si mette dopo di lei ─
  const zonaDopoLaSezione = section.locator('xpath=following-sibling::div[1]');
  await dragBlockToZone(
    page,
    'Trascina per spostare il blocco Titolo',
    zonaDopoLaSezione,
    'ArrowDown',
  );

  await expect.poll(tipiDiRadice).toEqual(['richText', 'section', 'heading']);
  await expect(blockOfType(section, 'heading')).toHaveCount(0);
  await expect(heading).toHaveCount(1);
  await expect(richText).toHaveCount(1);
});
