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

  const tipiDiRadice = () =>
    page.locator('[data-block-type]').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.parentElement?.closest('[data-block-type]') ?? null) === null)
        .map((node) => node.getAttribute('data-block-type')),
    );

  // La Pagina appena creata non parte da un canvas vuoto: il `templateSlug` di default
  // ("empty", RFC-43) porta già una Sezione seed in radice (`page-blueprints.registry.ts`),
  // mai toccata da questo test — resta sempre prima nell'ordine di radice. Si legge il suo
  // tipo qui, prima di ogni manipolazione, per costruire le sequenze attese come suffisso
  // di quella preesistente invece di assumere una radice che parte da zero.
  const tipiIniziali = await tipiDiRadice();

  // Sezione con un figlio "sacrificale" (Immagine, mai controllato dalle asserzioni): serve
  // solo a dare al trascinamento "dentro" un bersaglio valido — il pannello Struttura sposta
  // il nodo trascinato accanto alla riga sorvolata, mai "dentro" la riga di un contenitore
  // ancora privo di figli (bug applicativo reale, segnalato nel report del test engineer,
  // vedi il commento di testa di `dragTreeNodeOnto`, `helpers/page-editor.ts`).
  await addRootBlock(page, 'Sezione');
  // `.last()`: la Sezione seed precede sempre questa (mai spostata, resta all'indice 0 di
  // radice), quindi la Sezione di questo test è sempre l'ultima nell'ordine del DOM al
  // momento della sua creazione — stesso principio di `newSection` in
  // `page-editor-navigator-layouts.spec.ts`.
  const section = blockOfType(page, 'section').last();
  await addChildBlock(section, 'Immagine');

  // Poi due blocchi di radice, dopo la Sezione: Titolo, Testo.
  await addRootBlock(page, 'Titolo');
  await addRootBlock(page, 'Testo');

  await expect.poll(tipiDiRadice).toEqual([...tipiIniziali, 'section', 'heading', 'richText']);

  const heading = blockOfType(page, 'heading');
  const richText = blockOfType(page, 'richText');
  // Riga della Sezione di questo test, mai quella seed: la Sezione seed non ha children, e
  // resta comunque la prima di due righe "Sezione" nel pannello — stesso ordine del DOM
  // radice, mai riordinata da questo test (nessun trascinamento la tocca).
  const sectionRow = () => treeNodeRow(page, 'Sezione').last();

  /**
   * Ripete il trascinamento a puntatore finché `tipiDiRadice()` non raggiunge `expected`, fino
   * a 3 tentativi. La Sezione seed allunga il percorso del puntatore rispetto a una radice che
   * partiva da zero (più righe sopra il bersaglio nel pannello Struttura): con più passi da
   * attraversare, il riflow dal vivo di dnd-kit durante il trascinamento (`closestCenter`
   * ricalcolato a ogni `pointermove`, righe che si spostano mentre il nodo sollevato le
   * attraversa) può, di tanto in tanto, far risolvere la collisione finale sul nodo trascinato
   * stesso invece che sulla riga bersaglio — **verificato empiricamente** scrivendo questo
   * fix: il rilascio non sposta nulla, la riga resta dov'era. Un secondo tentativo, ripartendo
   * da capo con posizioni fresche, risolve la stessa corsa senza introdurre falsi positivi
   * (converge solo quando l'albero raggiunge davvero la forma attesa).
   */
  async function dragUntil(
    action: () => Promise<void>,
    expected: readonly string[],
  ): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await action();
      try {
        await expect.poll(tipiDiRadice, { timeout: 3_000 }).toEqual(expected);
        return;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
  }

  // ─── Caso "dentro": il Titolo entra nella Sezione, sorvolando il suo figlio esistente ──
  await dragUntil(
    () => dragTreeNodeOnto(page, 'Titolo', treeNodeRow(page, 'Immagine')),
    [...tipiIniziali, 'section', 'richText'],
  );
  await expect(blockOfType(section, 'heading')).toHaveCount(1);

  // ─── Caso "prima": il Testo passa davanti alla Sezione ─────────────────────────────────
  // Il Testo, alla radice dopo la Sezione, sorvola la riga della Sezione: stesso genitore
  // (radice) e indice d'origine successivo a quello del bersaglio, quindi nessuno scarto da
  // rimozione non si applica — l'inserimento avviene esattamente all'indice della Sezione,
  // spingendola indietro (`moveNodeTo`, `block-tree.utils.ts`).
  await dragUntil(
    () => dragTreeNodeOnto(page, 'Testo', sectionRow()),
    [...tipiIniziali, 'richText', 'section'],
  );

  // ─── Caso "fuori": il Titolo (dentro la Sezione) ne esce, tornando alla radice ─────────
  // Sorvola la riga del Testo — un fratello di radice già esistente, non la Sezione (il
  // proprio genitore diretto): stesso principio di `outdentBlock` (`helpers/page-editor.ts`),
  // che per lo stesso motivo sorvola sempre un fratello di destinazione, mai il contenitore
  // stesso. Sorvolare la riga del proprio genitore diretto è un caso limite per
  // `closestCenter` (distanza minima fra origine e bersaglio, verificato empiricamente non
  // affidabile qui — vedi il commento di testa di `dragTreeNodeOnto`): un fratello vero
  // risolve la stessa uscita dal contenitore senza quell'ambiguità. L'inserimento avviene
  // esattamente all'indice del Testo, spingendolo indietro — il Titolo atterra appena prima
  // di lui.
  await dragUntil(
    () => dragTreeNodeOnto(page, 'Titolo', treeNodeRow(page, 'Testo')),
    [...tipiIniziali, 'heading', 'richText', 'section'],
  );
  await expect(blockOfType(section, 'heading')).toHaveCount(0);
  await expect(heading).toHaveCount(1);
  await expect(richText).toHaveCount(1);
});
