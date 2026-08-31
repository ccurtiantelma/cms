import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  dragTreeNodeOnto,
  duplicateBlock,
  openContentTab,
  selectBlock,
  treeNodeRow,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E del round F04c (PLAN-F04c-editor-maturo.md T7/T8): "duplica blocco" e drag & drop
 * reale. Non ripete `page-editor.spec.ts` (percorso completo) né
 * `page-editor-undo-redo.spec.ts` (spostamento fra contenitori, già coperto lì): qui il
 * fuoco è sul gesto di trascinamento in sé.
 *
 * **Deviazione dal round F04c originale, dichiarata nel report del test engineer**: il
 * sensore da tastiera di `dnd-kit` sul canvas, un tempo la sola via deterministica per
 * questo test, oggi non porta a termine alcun trascinamento — bug applicativo reale, non
 * corretto qui, vedi il commento di testa di `dragBlockToZone`
 * (`helpers/page-editor.ts`): il `DndContext` condiviso del canvas usa
 * `collisionDetection={pointerWithin}`, che richiede coordinate reali del puntatore, mai
 * prodotte da un'attivazione da tastiera (stesso bug già segnalato da
 * `container-flexbox.spec.ts` per un altro trascinamento nello stesso contesto). In più, dal
 * restyle "Elementor Pro Twin" il grip di trascinamento del canvas esiste solo sui blocchi
 * `section` (Handle Bar), mai su un widget foglia come `heading`/`richText` — i bersagli di
 * questo test. Il trascinamento qui passa quindi dal pannello Struttura
 * (`dragTreeNodeOnto`/`treeNodeRow`, `EditorStructureNavigator.tsx`, `PointerSensor` a
 * puntatore reale), l'unica via oggi funzionante e valida per ogni tipo di blocco.
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
  await duplicateBlock(blockOfType(page, 'heading'), 'Titolo');

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

test('drag & drop a puntatore nel pannello Struttura: dentro, prima e fuori da un contenitore', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('dnd-tastiera-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // Sezione con un figlio "sacrificale" (Immagine, mai controllato dalle asserzioni): serve
  // solo a dare al trascinamento "dentro" un bersaglio valido — il pannello Struttura sposta
  // il nodo trascinato accanto alla riga sorvolata, mai "dentro" la riga di un contenitore
  // ancora privo di figli (bug applicativo reale, segnalato nel report del test engineer,
  // vedi il commento di testa di `dragTreeNodeOnto`, `helpers/page-editor.ts`).
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section');
  await addChildBlock(section, 'Immagine');

  // Poi due blocchi di radice, dopo la Sezione: Titolo, Testo.
  await addRootBlock(page, 'Titolo');
  await addRootBlock(page, 'Testo');

  const tipiDiRadice = () =>
    page.locator('[data-block-type]').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.parentElement?.closest('[data-block-type]') ?? null) === null)
        .map((node) => node.getAttribute('data-block-type')),
    );
  await expect.poll(tipiDiRadice).toEqual(['section', 'heading', 'richText']);

  const heading = blockOfType(page, 'heading');
  const richText = blockOfType(page, 'richText');

  // ─── Caso "dentro": il Titolo entra nella Sezione, sorvolando il suo figlio esistente ──
  await dragTreeNodeOnto(page, 'Titolo', treeNodeRow(page, 'Immagine'));

  await expect.poll(tipiDiRadice).toEqual(['section', 'richText']);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);

  // ─── Caso "prima": il Testo passa davanti alla Sezione ─────────────────────────────────
  // Il Testo, alla radice dopo la Sezione, sorvola la riga della Sezione: stesso genitore
  // (radice) e indice d'origine successivo a quello del bersaglio, quindi nessuno scarto da
  // rimozione non si applica — l'inserimento avviene esattamente all'indice della Sezione,
  // spingendola indietro (`moveNodeTo`, `block-tree.utils.ts`).
  await dragTreeNodeOnto(page, 'Testo', treeNodeRow(page, 'Sezione'));

  await expect.poll(tipiDiRadice).toEqual(['richText', 'section']);

  // ─── Caso "fuori": il Titolo (dentro la Sezione) ne esce, tornando alla radice ─────────
  // Sorvola la riga della Sezione da un genitore diverso (la Sezione stessa, non la radice):
  // l'inserimento avviene esattamente all'indice della Sezione all'interno della radice,
  // spingendola indietro di nuovo — il Titolo atterra appena prima di lei.
  await dragTreeNodeOnto(page, 'Titolo', treeNodeRow(page, 'Sezione'));

  await expect.poll(tipiDiRadice).toEqual(['richText', 'heading', 'section']);
  await expect(blockOfType(section, 'heading')).toHaveCount(0);
  await expect(heading).toHaveCount(1);
  await expect(richText).toHaveCount(1);
});
