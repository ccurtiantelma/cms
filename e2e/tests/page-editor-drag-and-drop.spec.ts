import { test, expect, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  canvasFrame,
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
 * E2E del drag & drop dell'editor (PLAN-F04c T7/T8 + round "DnD stabile"): "duplica blocco" e
 * i gesti di trascinamento reali sul canvas, tutti a puntatore vero (`page.mouse`, mai eventi
 * sintetici):
 *
 * - **palette → canvas**: la tessera del pannello Widgets attraversa il confine dell'`<iframe>`
 *   del canvas; il padre deve continuare a ricevere il puntatore (durante il drag l'iframe lascia
 *   passare i `pointer-events`), altrimenti ghost e zona `over` restano congelati sul bordo;
 * - **riordino da canvas**: grip di un blocco esistente (documento dell'iframe), ghost ancorato
 *   al cursore nonostante l'offset dell'iframe;
 * - **indicatore di rilascio** anche sul *corpo* di un blocco radice (non solo sui 10px di bordo);
 * - **auto-scroll** del documento dell'iframe ai bordi superiore/inferiore;
 * - **Escape** annulla il drag e ripristina i `pointer-events` dell'iframe;
 * - **pannello Struttura**: `DndContext` distinto (`EditorStructureNavigator.tsx`), dentro/prima/
 *   fuori da un contenitore.
 *
 * Il sensore da tastiera di dnd-kit non porta a termine alcun drag sul canvas (la collisione
 * `pointerWithin` richiede coordinate reali del puntatore, mai prodotte da un'attivazione da
 * tastiera — vedi `dragBlockToZone`, `helpers/page-editor.ts`): per questo qui si usa sempre
 * il mouse.
 */

/** Etichetta della riga di un `heading` nel pannello Struttura: il suo testo di default, non l'etichetta di registro. */
const RIGA_TITOLO = 'Questo è un titolo';

const TITOLO_PAGINA = 'Drag & drop e duplica — E2E F04c';

test.use({ storageState: ADMIN_STORAGE_STATE });

/** Tipi dei blocchi di radice, nell'ordine del DOM del canvas (documento dell'`<iframe>`). */
async function rootTypes(page: Page): Promise<(string | null)[]> {
  return canvasFrame(page)
    .locator('[data-block-type]')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.parentElement?.closest('[data-block-type]') ?? null) === null)
        .map((node) => node.getAttribute('data-block-type')),
    );
}

/** Zone di rilascio attualmente "sotto il puntatore" (`data-over`), nel canvas. */
function overZones(page: Page) {
  return canvasFrame(page).locator('[data-over="true"]');
}

/** Riporta lo scroll del documento dell'iframe del canvas a `top` px. */
async function scrollCanvasTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => {
    const frame = document.getElementById('cms-canvas-frame') as HTMLIFrameElement;
    frame.contentWindow?.scrollTo(0, y);
  }, top);
}

async function canvasScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const frame = document.getElementById('cms-canvas-frame') as HTMLIFrameElement;
    return frame.contentDocument?.scrollingElement?.scrollTop ?? 0;
  });
}

/** `pointer-events` inline dell'iframe del canvas ('' = a riposo, 'none' = drag dalla palette in corso). */
async function iframePointerEvents(page: Page): Promise<string> {
  return page.evaluate(
    () => (document.getElementById('cms-canvas-frame') as HTMLIFrameElement).style.pointerEvents,
  );
}

/**
 * Afferra la tessera `tileLabel` della palette (scheda Widgets) e la porta a `(x, y)` con un
 * percorso a puntatore reale, superando l'`activationConstraint` del `PointerSensor` (5px).
 * Non rilascia: il chiamante asserisce lo stato del drag e poi chiama `page.mouse.up()`.
 */
async function pickPaletteTile(page: Page, tileLabel: string): Promise<{ x: number; y: number }> {
  await page.getByRole('tab', { name: 'Widgets' }).click();
  const tile = page.getByRole('button', { name: new RegExp(`^Inserisci il blocco ${tileLabel} `) });
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  if (!box) throw new Error(`pickPaletteTile: la tessera "${tileLabel}" non ha un bounding box`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 30, { steps: 5 });
  return start;
}

async function moveTo(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y, { steps: 20 });
}

/** Aggiunge un blocco alla radice cliccando la tessera (click-to-add): ordine di inserimento = ordine di radice. */
async function seedRoot(page: Page, labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    await addRootBlock(page, label);
  }
}

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

  // Il duplicato diventa il nodo selezionato (Done di T7): solo il suo wrapper porta la cornice
  // di selezione (`data-block-chrome="selected"`, `BlockSelectionChrome`), l'originale no.
  const wrappers = blockOfType(page, 'heading');
  const selezionati = await wrappers.evaluateAll((nodes) =>
    nodes.map((node) => node.querySelector('[data-block-chrome="selected"]') !== null),
  );
  expect(selezionati).toEqual([false, true]);

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

  const tipiDiRadice = () => rootTypes(page);

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

  // Il click su una tessera della palette inserisce *dentro* il contenitore selezionato: si
  // seleziona la foglia (Immagine), così i due blocchi seguenti finiscono alla radice.
  await selectBlock(blockOfType(section, 'image'), 'Immagine');

  // Poi due blocchi di radice, dopo la Sezione: Titolo, Testo.
  await addRootBlock(page, 'Titolo');
  // Dopo il Titolo la selezione è una foglia: anche il Testo va alla radice.
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
    () => dragTreeNodeOnto(page, RIGA_TITOLO, treeNodeRow(page, 'Immagine')),
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
    () => dragTreeNodeOnto(page, RIGA_TITOLO, treeNodeRow(page, 'Testo')),
    [...tipiIniziali, 'heading', 'richText', 'section'],
  );
  await expect(blockOfType(section, 'heading')).toHaveCount(0);
  await expect(heading).toHaveCount(1);
  await expect(richText).toHaveCount(1);
});

test('palette → canvas: la tessera attraversa l\'iframe, l\'indicatore compare sul corpo di un blocco e il drop inserisce lì (un solo undo)', async ({
  page,
}) => {
  test.slow();
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug: uniqueSlug('dnd-palette-e2e') });
  await openContentTab(page);
  // Il template di default porta già un blocco seed in radice: le attese lo includono in testa.
  const seed = await rootTypes(page);
  await seedRoot(page, ['Titolo', 'Testo', 'Immagine']);
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'richText', 'image']);

  // Punto sul corpo del Testo (nella metà alta, lontano dai 10px di bordo delle strisce).
  const testo = await blockOfType(page, 'richText').boundingBox();
  if (!testo) throw new Error('il blocco Testo non ha un bounding box');

  await pickPaletteTile(page, 'Galleria');
  // Il padre continua a ricevere il puntatore sopra l'iframe: senza passthrough dei
  // `pointer-events` la zona `over` restava congelata sul bordo del canvas.
  await moveTo(page, testo.x + testo.width / 2, testo.y + 12);
  await expect(overZones(page)).toHaveCount(1);
  expect(await iframePointerEvents(page)).toBe('none');

  await page.mouse.up();
  // Metà alta del Testo → l'Immagine atterra prima del Testo, dopo il Titolo.
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'gallery', 'richText', 'image']);
  expect(await iframePointerEvents(page)).toBe('');

  // Il drop è un'unica voce di history (Undo/Redo atomico).
  await page.getByRole('button', { name: "Annulla l'ultima modifica" }).click();
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'richText', 'image']);
});

test('riordino da canvas: il grip di un blocco esistente lo sposta, con il ghost sul cursore', async ({
  page,
}) => {
  test.slow();
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug: uniqueSlug('dnd-riordino-e2e') });
  await openContentTab(page);
  // Il template di default porta già un blocco seed in radice: le attese lo includono in testa.
  const seed = await rootTypes(page);
  await seedRoot(page, ['Titolo', 'Testo', 'Immagine']);
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'richText', 'image']);

  await scrollCanvasTo(page, 0);
  await selectBlock(blockOfType(page, 'heading'), 'Titolo');
  const grip = canvasFrame(page)
    .getByRole('button', { name: /^Trascina per spostare il blocco/ })
    .first();
  const gripBox = await grip.boundingBox();
  const immagine = await blockOfType(page, 'image').boundingBox();
  if (!gripBox || !immagine) throw new Error('grip o Immagine senza bounding box');

  const start = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 30, { steps: 5 });
  // Metà bassa dell'Immagine: il Titolo deve atterrare dopo di lui.
  const target = { x: immagine.x + immagine.width / 2, y: immagine.y + immagine.height * 0.7 };
  await moveTo(page, target.x, target.y);
  await expect(overZones(page)).toHaveCount(1);

  // Il ghost (DragOverlay, documento padre) sta accanto al cursore, non sfalsato dell'offset
  // dell'iframe (300px a sinistra / 52px in alto prima di questo fix).
  const ghost = page.getByText('Titolo', { exact: true }).last();
  const ghostBox = await ghost.boundingBox();
  if (!ghostBox) throw new Error('il ghost del drag non è visibile');
  expect(Math.abs(ghostBox.x - target.x)).toBeLessThan(120);
  expect(Math.abs(ghostBox.y - target.y)).toBeLessThan(80);

  await page.mouse.up();
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'richText', 'image', 'heading']);

  await page.getByRole('button', { name: "Annulla l'ultima modifica" }).click();
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'richText', 'image']);
});

test('auto-scroll: trascinando dalla palette ai bordi del canvas il documento scrolla e il drop atterra dove punta il cursore', async ({
  page,
}) => {
  test.slow();
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug: uniqueSlug('dnd-scroll-e2e') });
  await openContentTab(page);
  // Il template di default porta già un blocco seed in radice: le attese lo includono in testa.
  const seed = await rootTypes(page);
  await seedRoot(page, Array.from({ length: 14 }, () => 'Titolo'));
  await expect.poll(() => blockOfType(page, 'heading').count()).toBe(14);
  await scrollCanvasTo(page, 0);

  const frame = await page.locator('#cms-canvas-frame').boundingBox();
  if (!frame) throw new Error("l'iframe del canvas non ha un bounding box");
  const centerX = frame.x + frame.width / 2;

  await pickPaletteTile(page, 'Testo');
  // Bordo inferiore: scrolla verso il fondo.
  await moveTo(page, centerX, frame.y + frame.height - 12);
  await expect.poll(() => canvasScrollTop(page), { timeout: 10_000 }).toBeGreaterThan(300);

  // Bordo superiore: torna verso l'inizio.
  const fondo = await canvasScrollTop(page);
  await moveTo(page, centerX, frame.y + 12);
  await expect.poll(() => canvasScrollTop(page), { timeout: 10_000 }).toBeLessThan(fondo - 200);

  // Di nuovo in fondo, poi rilascio: dopo lo scroll le zone sono rimisurate, quindi il drop
  // risolve la fessura sotto il cursore (in coda), non una zona stantia misurata a inizio drag.
  await moveTo(page, centerX, frame.y + frame.height - 12);
  await expect.poll(() => canvasScrollTop(page), { timeout: 10_000 }).toBeGreaterThan(300);
  await expect(overZones(page)).toHaveCount(1);
  await page.mouse.up();

  await expect.poll(() => blockOfType(page, 'richText').count()).toBe(1);
  const tipi = await rootTypes(page);
  expect(tipi).toHaveLength(seed.length + 15);
  // Sul fondo del canvas: il nuovo blocco è nella parte finale dell'albero, mai in testa.
  expect(tipi.indexOf('richText')).toBeGreaterThan(seed.length + 9);
});

test('Escape annulla il drag: nessun inserimento e i pointer-events dell\'iframe tornano a riposo', async ({
  page,
}) => {
  test.slow();
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug: uniqueSlug('dnd-escape-e2e') });
  await openContentTab(page);
  // Il template di default porta già un blocco seed in radice: le attese lo includono in testa.
  const seed = await rootTypes(page);
  await seedRoot(page, ['Titolo', 'Testo']);
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'richText']);

  const testo = await blockOfType(page, 'richText').boundingBox();
  if (!testo) throw new Error('il blocco Testo non ha un bounding box');

  await pickPaletteTile(page, 'Immagine');
  await moveTo(page, testo.x + testo.width / 2, testo.y + 12);
  await expect(overZones(page)).toHaveCount(1);
  expect(await iframePointerEvents(page)).toBe('none');

  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(overZones(page)).toHaveCount(0);
  expect(await iframePointerEvents(page)).toBe('');
  await expect.poll(() => rootTypes(page)).toEqual([...seed, 'heading', 'richText']);

  // Il canvas resta interattivo dopo l'annullamento: un click seleziona ancora il blocco.
  await selectBlock(blockOfType(page, 'heading'), 'Titolo');
  await expect(
    blockOfType(page, 'heading').locator('[data-block-chrome="selected"]'),
  ).toHaveCount(1);
});

test('contenitori annidati: il drop risolve sempre il contenitore più profondo sotto il cursore', async ({
  page,
}) => {
  test.slow();
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug: uniqueSlug('dnd-annidati-e2e') });
  await openContentTab(page);
  // Il template di default porta un `container` vuoto in radice (`page-blueprints.registry.ts`).
  await expect(blockOfType(page, 'container')).toHaveCount(1);

  const contenitori = blockOfType(page, 'container');

  // 1. Contenitore annidato: la tessera "Contenitore" sul contenitore seed vuoto.
  const esterno = await contenitori.first().boundingBox();
  if (!esterno) throw new Error('il contenitore seed non ha un bounding box');
  await pickPaletteTile(page, 'Contenitore');
  await moveTo(page, esterno.x + esterno.width / 2, esterno.y + esterno.height / 2);
  await expect(overZones(page)).toHaveCount(1);
  await page.mouse.up();
  await expect(contenitori).toHaveCount(2);
  await expect(contenitori.first().locator('[data-block-type="container"]')).toHaveCount(1);

  // 2. Titolo sul contenitore interno (vuoto): finisce nei suoi children, non in quelli dell'esterno.
  await scrollCanvasTo(page, 0);
  const interno = await contenitori.nth(1).boundingBox();
  if (!interno) throw new Error('il contenitore annidato non ha un bounding box');
  await pickPaletteTile(page, 'Titolo');
  await moveTo(page, interno.x + interno.width / 2, interno.y + interno.height / 2);
  await expect(overZones(page)).toHaveCount(1);
  await page.mouse.up();

  await expect(blockOfType(contenitori.nth(1), 'heading')).toHaveCount(1);
  // L'esterno contiene comunque il titolo (come discendente) ma solo tramite l'interno.
  await expect(contenitori.first().locator(':scope > * [data-block-type="heading"]')).toHaveCount(1);
  expect(await rootTypes(page)).toEqual(['container']);

  // 3. Undo atomico: un solo passo toglie il Titolo, un altro il contenitore annidato.
  await page.getByRole('button', { name: "Annulla l'ultima modifica" }).click();
  await expect(blockOfType(page, 'heading')).toHaveCount(0);
  await page.getByRole('button', { name: "Annulla l'ultima modifica" }).click();
  await expect(contenitori).toHaveCount(1);
});
