import { test, expect, type Locator, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  openContentTab,
  selectBlock,
  selectProp,
  treeNodeRow,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E del pannello Struttura/Navigator (`EditorStructureNavigator.tsx`) e della prop
 * `columnRatio` di `section` (ADR-33 § 2, `Section.tsx`).
 *
 * Copre i due scenari richiesti:
 * a) toggle del pannello da Top Bar, corrispondenza albero/struttura reale, sincronia
 *    hover/selezione fra Navigator e Canvas;
 * b) modifica di `columnRatio` dall'Ispettore su una Sezione a due colonne e
 *    preservazione dei widget figli già presenti.
 */

const TITOLO_PAGINA = 'Navigator e layout multi-colonna — E2E';
const SECTION_LABEL = 'Sezione';
const HEADING_LABEL = 'Titolo';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

/**
 * L'`<a>` reale del `NavLink` di una riga dell'albero, individuato dal testo esatto della
 * sua etichetta (`treeNodeRow` risolve invece allo `<span>` interno, insufficiente per
 * leggere lo stato `active` del link). Mantine applica lo stato via `mod={{ active }}`,
 * che sul DOM reale diventa `data-active="true"` (stesso pattern già verificato nel
 * codebase, `EditorSidebar.module.css`: `.mantine-Tabs-tab[data-active='true']`) — mai
 * l'attributo quando `active` è `false`.
 */
function navLinkRow(page: Page, label: string): Locator {
  return page
    .getByRole('complementary', { name: 'Struttura della pagina' })
    .locator('a.mantine-NavLink-root')
    .filter({ has: page.getByText(label, { exact: true }) });
}

/**
 * La Sezione appena aggiunta da questo test, **non** "l'unica Sezione della pagina":
 * verificato sul DOM reale (debug mirato, non assunto) che una Pagina appena creata da
 * `createPageFromUi` **non** parte vuota — arriva già con una Sezione preesistente (blocco
 * seed, coerente con `app/backend/src/pages/blueprints/` e RFC-43, entrambi in lavorazione
 * non ancora documentati in `docs/`). `blockOfType(page, 'section')` risolve quindi a **due**
 * elementi non appena questo test ne aggiunge una propria — violazione di strict mode,
 * riscontrata scrivendo questo file. `.last()`, non un id catturato a monte: "Aggiungi
 * widget" inserisce sempre in coda alla radice (`addRootBlock`, commento di testa in
 * `page-editor.ts`), quindi la Sezione di questo test è sempre l'ultima nell'ordine del DOM,
 * indipendentemente da quante Sezioni preesistenti la precedano.
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: ogni
 * spec E2E esistente in questa cartella che compone la propria struttura da una Pagina
 * "vuota" (`page-editor-elementor.spec.ts`, `container-flexbox.spec.ts`, …) presuppone un
 * albero iniziale senza blocchi — un'assunzione oggi falsa, verificata rompere
 * `page-editor-elementor.spec.ts` (`toHaveCount(1)` su `blockOfType(page, 'section')` dopo un
 * solo `addRootBlock`, risolto a 2). Non è una regressione introdotta da questo file: il seed
 * è nel comportamento applicativo di creazione Pagina, non nell'helper condiviso.
 */
function newSection(page: Page): Locator {
  return blockOfType(page, 'section').last();
}

/**
 * L'elemento `<section>` reale renderizzato da `Section.tsx` dentro il wrapper di editing
 * (`[data-block-type="section"]`, un `<div>`, mai lo stesso nodo): le classi di griglia
 * (`columnRatio_*`, `columns_default_*`) vivono lì, non sul wrapper.
 */
function sectionElement(section: Locator): Locator {
  return section.locator('section');
}

/**
 * Apre il modal "Seleziona la tua struttura" e sceglie il preset Flexbox "2 colonne"
 * (`columns: { default: '2' }`, `columnRatio: 'equal'`, `SectionStructureModal.tsx`) —
 * a differenza di `addRootBlock('Sezione')` (che sceglie sempre "Colonna", 1 colonna),
 * qui servono davvero due colonne perché il test sulla preservazione dei figli abbia senso
 * contro un layout multi-colonna reale, non solo contro la prop `columnRatio` isolata.
 */
async function addRootTwoColumnSection(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Aggiungi widget' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: SECTION_LABEL, exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Quale layout desideri utilizzare?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Flexbox', exact: true }).click();
  await dialog.getByRole('button', { name: '2 colonne', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('Navigator: toggle da Top Bar, albero coerente con la struttura, sincronia hover/selezione col Canvas', async ({
  page,
}) => {
  test.slow();
  const slug = uniqueSlug('navigator-sync-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  await addRootTwoColumnSection(page);
  const section = newSection(page);

  // Il pannello non è nel DOM finché il toggle in Top Bar non viene premuto
  // (`isStructurePanelOpen &&`, `FullScreenEditorLayout.tsx`).
  await expect(page.getByRole('complementary', { name: 'Struttura della pagina' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pannello struttura' }).click();
  const panel = page.getByRole('complementary', { name: 'Struttura della pagina' });
  await expect(panel).toBeVisible();

  await expect(treeNodeRow(page, SECTION_LABEL).last()).toBeVisible();

  // Hover su una voce dell'albero -> highlight sul blocco corrispondente nel Canvas.
  // Sulla Sezione **preesistente** (quella già in pagina prima di questo test, vedi
  // {@link newSection}), non su quella appena creata: `addBlockAction` imposta
  // `selectedId: insertedNode.id` (`useBlockEditorStore.ts`), quindi la Sezione appena
  // inserita è già selezionata a questo punto — e per una Sezione `.hovered` copre **sia**
  // hover **sia** selezione, stesso bordo (commento di testa di `overlayBorderClassName`,
  // `EditorBlockWrapper.tsx`). Verificare "non hovered" su di lei sarebbe già falso in
  // partenza per la sola selezione, non per hover. La Sezione preesistente non è mai stata
  // selezionata da questo test: base pulita per isolare l'hover puro.
  const firstSection = blockOfType(page, 'section').first();
  const firstSectionRow = treeNodeRow(page, SECTION_LABEL).first();
  await expect(firstSection).not.toHaveClass(/hovered/);
  await firstSectionRow.hover();
  await expect(firstSection).toHaveClass(/hovered/);

  await addChildBlock(section, HEADING_LABEL);
  const heading = blockOfType(section, 'heading');
  await expect(heading).toHaveCount(1);

  // L'albero rispecchia la struttura reale appena composta: la Sezione ha ora un Titolo
  // figlio, in coda a quanto già presente (vedi {@link newSection}) — `.last()`, stessa
  // ragione.
  const headingRow = treeNodeRow(page, HEADING_LABEL).last();
  await expect(headingRow).toBeVisible();

  // Click su un nodo -> selezione impostata sia nell'albero (NavLink `active`) sia nel
  // Canvas (classe `.selected` sul wrapper del blocco). Sul Titolo, foglia: qui la classe
  // di selezione non è ambigua con quella di hover come lo sarebbe su una Sezione.
  // `addChildBlock` lascia il Titolo stesso selezionato (`addBlockAction`, `selectedId:
  // insertedNode.id`, `useBlockEditorStore.ts`): si sposta prima la selezione sulla Sezione
  // (da tastiera, `selectBlock` — nessun click reale sul canvas, quindi nessun rischio di
  // ripetere il difetto di hover appena documentato) per una verifica "non selezionato"
  // che parta da una premessa vera.
  await selectBlock(section, SECTION_LABEL);
  await expect(heading).not.toHaveClass(/selected/);
  await expect(navLinkRow(page, HEADING_LABEL).last()).not.toHaveAttribute('data-active', 'true');

  await headingRow.click();

  await expect(navLinkRow(page, HEADING_LABEL).last()).toHaveAttribute('data-active', 'true');
  await expect(heading).toHaveClass(/selected/);
});

test('Layout multi-colonna: cambiare columnRatio aggiorna le classi grid e preserva i widget figli', async ({
  page,
}) => {
  test.slow();
  const slug = uniqueSlug('navigator-columnratio-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  await addRootTwoColumnSection(page);
  const section = newSection(page);
  await addChildBlock(section, HEADING_LABEL);
  await addChildBlock(section, HEADING_LABEL);
  const headings = blockOfType(section, 'heading');
  await expect(headings).toHaveCount(2);
  const idsBefore = await headings.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-block-id')),
  );
  expect(idsBefore).toHaveLength(2);
  expect(new Set(idsBefore).size).toBe(2);

  // Preset "2 colonne" -> `columnRatio: 'equal'` di partenza (`SectionStructureModal.tsx`).
  await expect(sectionElement(section)).toHaveClass(/columnRatio_equal/);

  await selectBlock(section, SECTION_LABEL);
  await page.getByRole('tab', { name: 'Stile' }).click();
  await selectProp(page, 'columnRatio', '33-66');

  // La struttura CSS della Sezione aggiorna la propria classe grid (`resolveScalarClassName`,
  // `Section.tsx`): via da `equal`, verso `33-66`.
  await expect(sectionElement(section)).toHaveClass(/columnRatio_33-66/);
  await expect(sectionElement(section)).not.toHaveClass(/columnRatio_equal/);

  // I widget già presenti nelle colonne restano intatti nel DOM: stesso numero, stessi
  // `data-block-id` di prima — nessuna rimozione/reinserimento dietro la modifica della prop.
  const idsAfter = await blockOfType(section, 'heading').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-block-id')),
  );
  expect(idsAfter).toEqual(idsBefore);
});
