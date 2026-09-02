import { test, expect, type Locator, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  openContentTab,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E del blocco `container` (ADR-39): trascinamento dalla libreria widget della sidebar
 * (`WidgetPalette.tsx`, sorgente di drag dnd-kit con id sintetico `new-block:<type>`) fino
 * alla drop-zone vuota del canvas — non un click-to-add, per verificare il gesto di
 * trascinamento reale della sidebar, mai coperto da `page-editor-drag-and-drop.spec.ts`
 * (che sposta solo nodi già presenti nell'albero, con lo stesso sensore da tastiera). Poi:
 * le due prop enum responsive `flexDirection`/`justifyContent` impostate dall'ispettore
 * generato dal registro, e verifica che il canvas applichi le classi CSS Module risultanti
 * — mai stile inline (`Container.tsx`/`style-tokens.module.css`, verificato sul codice
 * sorgente prima di scrivere l'assert).
 *
 * **Trascinamento a puntatore, non da tastiera** — deviazione dichiarata rispetto a
 * `dragBlockToZone` (`helpers/page-editor.ts`), che qui non funziona: quell'helper preme
 * `Space` per afferrare il nodo via `KeyboardSensor` di dnd-kit, ma la collision detection
 * di `FullScreenEditorLayout` è `pointerWithin` (`collisionDetection={pointerWithin}`), che
 * richiede `pointerCoordinates` — calcolate da `getEventCoordinates(activatorEvent)`
 * (`@dnd-kit/utilities`). Un evento `KeyboardEvent` non porta `clientX`/`clientY`
 * (`hasViewportRelativeCoordinates` verifica proprio quelle proprietà): l'attivazione da
 * tastiera produce quindi `pointerCoordinates: null`, e `pointerWithin` ritorna sempre
 * nessuna collisione — **verificato empiricamente**: con `dragBlockToZone` la tessera
 * risulta afferrata (classe `.dragging`) ma nessuna zona diventa mai `data-over="true"`,
 * entro il budget di passi, in nessuno dei due versi. Segnalato in coda a questo file
 * (bug applicativo, non di questo test) — non è responsabilità di un test correggerlo. Il
 * trascinamento a puntatore (`page.mouse`) genera invece veri eventi `pointermove` con
 * coordinate, e la collision detection funziona: verificato che porta all'inserimento del
 * blocco `container` nel canvas.
 */

const TITOLO_PAGINA = 'Contenitore flex — E2E ADR-39';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

/**
 * Trascina a puntatore la tessera `tileLabel` della libreria widget fino al centro di
 * `targetZone`. `PointerSensor` di `FullScreenEditorLayout` porta
 * `activationConstraint: { distance: 5 }`: il primo spostamento (20px) supera quella soglia
 * prima di procedere verso la destinazione reale, così dnd-kit registra davvero l'inizio del
 * trascinamento invece di un semplice click.
 */
async function dragWidgetTileToZone(page: Page, tileLabel: string, targetZone: Locator): Promise<void> {
  const tile = page.getByRole('button', { name: tileLabel });
  const tileBox = await tile.boundingBox();
  const zoneBox = await targetZone.boundingBox();
  if (!tileBox || !zoneBox) {
    throw new Error('dragWidgetTileToZone: origine o destinazione non hanno un bounding box');
  }

  await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    tileBox.x + tileBox.width / 2 + 20,
    tileBox.y + tileBox.height / 2 - 20,
    { steps: 5 },
  );
  await page.mouse.move(zoneBox.x + zoneBox.width / 2, zoneBox.y + zoneBox.height / 2, { steps: 15 });
  await expect(targetZone).toHaveAttribute('data-over', 'true');
  await page.mouse.up();
}

/**
 * Le quattro prop di direzione/allineamento flex di `container` (`flexDirection`,
 * `justifyContent`, `alignItems`, `wrap`) sono un Mantine `SegmentedControl`
 * (`inspector/PropField.tsx`, `CONTAINER_FLEX_SEGMENTED_PROPS`, ADR-39 § "Conseguenza"),
 * **non** un `Select` come le altre prop `enum` dell'ispettore — `selectProp`
 * (`helpers/page-editor.ts`) presuppone un `role="textbox"` più un `role="option"`
 * flottante, che qui non esiste: il valore corrente è un `role="radiogroup"` di `<input
 * type="radio">` etichettati (Mantine forza `role: "radiogroup"` sul contenitore). Il
 * `<label>` (etichetta visibile del valore, es. `"row"`) è fratello del `Text` dell'etichetta
 * del campo (es. `"Direzione"`) dentro lo stesso `<div>`: da quel `Text` si risale al
 * `radiogroup` che lo segue, invece di indovinare un testid assente.
 */
function segmentedFieldGroup(page: Page, fieldLabel: string): Locator {
  return page
    .getByText(fieldLabel, { exact: true })
    .locator('xpath=following-sibling::*[@role="radiogroup"][1]');
}

async function selectSegmented(page: Page, fieldLabel: string, optionToken: string): Promise<void> {
  await segmentedFieldGroup(page, fieldLabel).getByText(optionToken, { exact: true }).click();
}

test('drag & drop del widget Contenitore nel canvas e impostazione di flexDirection/justifyContent', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('container-flex-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // ─── 1. La sidebar mostra già la scheda "Widgets" (stato di riposo dello store,
  // `activeSidebarTab: 'widgets'`) ────────────────────────────────────────────────────────
  // `CanvasAddSectionZone` resta montata in fondo al canvas indipendentemente da quanti
  // blocchi ci siano già in radice (commento di testa di `EditorCanvas.tsx`), quindi questo
  // testo resta visibile anche ora che la Pagina appena creata non parte da un canvas vuoto:
  // il `templateSlug` di default ("empty", RFC-43) porta già una Sezione seed in radice
  // (`page-blueprints.registry.ts`).
  await expect(page.getByText('Trascina il widget qui')).toBeVisible();

  // Con la Sezione seed già in radice, `[data-over]` risolve a più elementi (le strisce
  // `before`/`after` del suo `EditorBlockWrapper`, la sua `containerDropZone` interna, e i
  // due `CanvasSectionInserter` — uno prima, uno dopo l'unico blocco radice esistente,
  // `EditorCanvas.tsx`). `.last()`, non un conteggio secco a 1: `CanvasSectionInserter` con
  // `index={rootIds.length}` (il "dopo l'ultimo blocco radice") è sempre l'ultimo elemento
  // `[data-over]` nell'ordine del DOM, per costruzione — `EditorCanvas.tsx` lo monta dopo
  // l'ultimo `EditorBlockWrapper` — quindi resta il bersaglio corretto per "aggiungi in coda
  // alla radice", lo stesso ruolo che aveva `root-empty-dropzone` quando la radice partiva
  // davvero da zero.
  const rootDropzone = page.locator('[data-over]').last();

  // ─── 2. Trascino la tessera "Contenitore" della libreria widget nella drop-zone ───────
  await dragWidgetTileToZone(page, 'Inserisci il blocco Contenitore', rootDropzone);

  const container = blockOfType(page, 'container');
  await expect(container).toHaveCount(1);

  // ─── 3. Ispettore: `flexDirection`/`justifyContent` vivono nella scheda "Stile" (nessuna
  // prop "Contenuto" nel registro del blocco, ADR-39 § 2 — con "Avanzato" popolata da
  // `customCssClass`/`customElementId` restano due schede, quindi l'ispettore mostra i
  // `Tabs` e "Stile" va selezionata esplicitamente se non è già quella attiva) ────────────
  await selectBlock(container, 'Contenitore');
  const styleTab = page.getByRole('tab', { name: 'Stile' });
  if (await styleTab.isVisible().catch(() => false)) {
    await styleTab.click();
  }
  await selectSegmented(page, 'Direzione', 'row');
  await selectSegmented(page, 'Allineamento orizzontale', 'space-between');

  // ─── 4. Verifica sul canvas: nessuno stile inline, solo classi CSS Module
  // (`Container.tsx`, `resolveResponsiveClassNames(tokenStyles, 'flexDirection', ...)`,
  // token `flexDirection_default_row`/`justifyContent_default_space-between`,
  // `style-tokens.module.css`) — **non** sul wrapper di editing (`container`, il `div
  // [data-block-type="container"]` di `EditorBlockWrapper.tsx`, che porta solo le proprie
  // classi di chrome `.wrapper`/`.containerSelected`), ma sul `<div>` reale che
  // `Container.tsx` monta al suo interno (`<ContainerComponent>`, verificato sul codice
  // sorgente): individuato risalendo dal testo del segnaposto "Contenitore vuoto", unico
  // dentro quel `<div>` finché non ha figli — invariato per l'intera durata di questo test.
  // ────────────────────────────────────────────────────────────────────────────────────────
  const flexDiv = container.getByText('Contenitore vuoto — trascina qui un blocco').locator('xpath=../..');
  const className = await flexDiv.getAttribute('class');
  expect(className).toBeTruthy();
  expect(className).toMatch(/flexDirection_default_row/);
  expect(className).toMatch(/justifyContent_default_space-between/);
  await expect(flexDiv).not.toHaveAttribute('style', /flex-direction|justify-content/);

  // Il canvas applica davvero il flex risultante: computed style, non solo la classe.
  const computed = await flexDiv.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      display: style.display,
      flexDirection: style.flexDirection,
      justifyContent: style.justifyContent,
    };
  });
  expect(computed.display).toBe('flex');
  expect(computed.flexDirection).toBe('row');
  expect(computed.justifyContent).toBe('space-between');

  // Nessun salvataggio/reload qui: un `container` appena inserito (dalla palette o dal
  // drag qui sopra) porta di default `customCssClass: ''`/`customElementId: ''`
  // (`defaultPropValue`, `block-registry.utils.ts` — nessun `default` dichiarato per questi
  // due prop del registro, ramo `default: return ''`), e il validatore server-side
  // (`block-tree-validator.service.ts`, `isValidCssClassName`/`CSS_IDENTIFIER_TOKEN_PATTERN`)
  // respinge una stringa vuota per `kind: 'cssClassName'`/`'htmlId'` con `400
  // BLOCK_PROP_INVALID` — **verificato empiricamente**: `Salva bozza` su un `container`
  // fresco, senza toccare quei due campi, fallisce sempre così. Bug applicativo reale,
  // segnalato nel report del test engineer (fuori scope di correzione per questo ruolo):
  // il salvataggio non è testabile qui finché non è risolto, quindi questo test si ferma
  // alla verifica dello stato in-memory del canvas.
});
