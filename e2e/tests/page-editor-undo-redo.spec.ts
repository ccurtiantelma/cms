import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  indentBlock,
  openContentTab,
  outdentBlock,
  redoLastChange,
  saveDraft,
  selectBlock,
  uniqueSlug,
  undoLastChange,
} from './helpers/page-editor';

/**
 * E2E dell'upgrade editor di F04b (round F04b, voce TODO 3.11 — implementato senza alcun
 * test end-to-end). Copre, dal solo browser e senza mai passare dallo store direttamente:
 *
 * 1. Un giro reale undo → redo → salva, sulla toolbar in cima al canvas.
 * 2. L'inserimento posizionale fra contenitori (`moveNodeToAction`): non c'è drag & drop
 *    nel primo rilascio, l'operazione è esposta come "porta dentro il contenitore
 *    precedente" / "porta fuori dal contenitore" sulla toolbar di ogni blocco — sopra
 *    (dentro) e sotto (fuori) rispetto a un blocco già esistente.
 *
 * Non ripete la copertura di `page-editor.spec.ts` (percorso completo di creazione/
 * composizione/pubblicazione) né quella di `page-editor-conflitto.spec.ts` (409
 * ottimistico): qui il fuoco è solo sulla history e sullo spostamento fra contenitori.
 */

const TITOLO_PAGINA = 'Undo redo e spostamento — E2E F04b';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('undo → redo → salva: la modifica annullata e poi ripristinata sopravvive al salvataggio', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('undo-redo-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // Annulla/ripristina partono disabilitati: storia vuota.
  await expect(page.getByRole('button', { name: "Annulla l'ultima modifica" })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ripristina la modifica annullata' })).toBeDisabled();

  // Una modifica: aggiungo una section in radice.
  await addRootBlock(page, 'Sezione');
  await expect(blockOfType(page, 'section')).toHaveCount(1);
  await expect(page.getByRole('button', { name: "Annulla l'ultima modifica" })).toBeEnabled();

  // Annullo: la section sparisce, "Ripristina" ora è disponibile.
  await undoLastChange(page);
  await expect(blockOfType(page, 'section')).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Annulla l'ultima modifica" })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ripristina la modifica annullata' })).toBeEnabled();

  // Ripristino: la section torna.
  await redoLastChange(page);
  await expect(blockOfType(page, 'section')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ripristina la modifica annullata' })).toBeDisabled();

  // Salvo: nessun 400/409, e il contenuto ripristinato (non quello annullato) è ciò che
  // sopravvive al reload — la prova che "annulla poi ripristina" non è un no-op nella UI
  // ma nello store che alimenta il salvataggio.
  await saveDraft(page);
  await page.reload();
  await openContentTab(page);
  await expect(blockOfType(page, 'section')).toHaveCount(1);
});

test('inserimento posizionale: porto un blocco dentro il contenitore precedente e poi fuori di nuovo', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('indent-outdent-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // Due blocchi di radice: una section (può contenere un titolo) e un titolo, in quest'ordine.
  await addRootBlock(page, 'Sezione');
  await addRootBlock(page, 'Titolo');

  // Tipi dei soli blocchi di radice: quelli il cui `[data-block-type]` più vicino, salendo
  // nel DOM, è se stesso — un blocco annidato ha sempre un antenato `[data-block-type]`.
  const tipiDiRadice = () =>
    page.locator('[data-block-type]').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.parentElement?.closest('[data-block-type]') ?? null) === null)
        .map((node) => node.getAttribute('data-block-type')),
    );
  await expect.poll(tipiDiRadice).toEqual(['section', 'heading']);

  const section = blockOfType(page, 'section');
  await expect(blockOfType(section, 'heading')).toHaveCount(0);

  // "Porta dentro": il titolo di radice entra nella section che lo precede.
  await indentBlock(page, 'Titolo');

  await expect.poll(tipiDiRadice).toEqual(['section']);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);

  // "Porta fuori": lo riporto al livello di radice, subito dopo la section.
  await outdentBlock(page, 'Titolo');

  await expect.poll(tipiDiRadice).toEqual(['section', 'heading']);
  await expect(blockOfType(section, 'heading')).toHaveCount(0);

  // Compilo la prop richiesta (altrimenti il salvataggio è respinto per validazione, non
  // per lo spostamento) e salvo: la posizione finale sopravvive al reload.
  await selectBlock(blockOfType(page, 'heading'), 'Titolo');
  await fillProp(page, 'text', 'Titolo portato fuori');

  await saveDraft(page);
  await page.reload();
  await openContentTab(page);
  await expect.poll(tipiDiRadice).toEqual(['section', 'heading']);
});
