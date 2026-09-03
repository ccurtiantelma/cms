import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  openContentTab,
  saveDraft,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E di F14-01/F14-02 — "Salva come Preset Globale" da una Sezione del canvas
 * (sesto controllo di `BlockHoverOverlay.tsx`, montato da `EditorBlockWrapper.tsx`) e
 * reinserimento da "I Miei Preset" nella scheda "Widgets" della sidebar
 * (`WidgetPaletteGrid.tsx`, sezione sempre montata sopra le categorie).
 *
 * Due scostamenti rispetto alla formulazione letterale del task, verificati sul codice
 * sorgente e non correzioni da segnalare — comportamento applicativo intenzionale:
 *
 * 1. La toolbar con "Salva come Preset Globale" compare solo quando la Sezione è
 *    **selezionata** (`isSelected`), mai sul solo hover — il commento di testa di
 *    `BlockHoverOverlay.tsx` lo dichiara esplicitamente ("mai sul solo hover"). Il test
 *    passa comunque dall'hover (segnale visivo verificato) ma si affida alla selezione
 *    da tastiera (`selectBlock`, stesso principio degli altri E2E dell'editor) per il
 *    click effettivo.
 * 2. "I Miei Preset" non è una scheda propria della sidebar (`EditorSidebar.tsx` ne ha
 *    solo tre: "Widgets"/"Proprietà"/"Pagina") ma una sezione sempre visibile dentro la
 *    scheda "Widgets" (`WidgetPaletteGrid.tsx`, `presetsOnly` sopra l'accordion delle
 *    categorie). Selezionare un blocco porta la sidebar su "Proprietà"
 *    (`useBlockEditorStore.selectNode`): si riapre "Widgets" a mano dopo la selezione.
 *
 * Selezionare il **Titolo** (non contenitore) invece della Sezione appena creata prima di
 * cliccare il preset è deliberato: l'inserimento da click di `WidgetPaletteGrid` va dentro
 * il nodo selezionato quando è un contenitore (`clickInsertionTarget`, `WidgetPalette.tsx`)
 * — con la Sezione ancora selezionata il preset si annelerebbe dentro se stesso invece di
 * comparire in radice.
 */

const TITOLO_PAGINA = 'Preset Sezioni — E2E F14';
const NOME_PRESET = 'Sezione Promo E2E';
const TESTO_TITOLO = 'Promo E2E';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('salvo una Sezione come Preset Globale e la reinserisco da "I Miei Preset"', async ({ page }) => {
  test.slow();

  // ─── 1. Login (storageState) + editor su una Pagina di test ───────────────
  const slug = uniqueSlug('preset-sezioni-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // ─── 2. Compongo la Sezione sorgente del preset ────────────────────────────
  // Come altrove nella suite (`page-editor-navigator-layouts.spec.ts`): la Pagina non parte
  // vuota (Sezione seed del template di default), quindi si calcola il delta invece di
  // assumere un conteggio assoluto, e si individua la Sezione di questo test con `.last()`.
  const initialSectionCount = await blockOfType(page, 'section').count();
  await addRootBlock(page, 'Sezione');
  const sourceSection = blockOfType(page, 'section').last();
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);

  await addChildBlock(sourceSection, 'Titolo');
  await selectBlock(blockOfType(sourceSection, 'heading'), 'Titolo');
  await fillProp(page, 'text', TESTO_TITOLO);

  // ─── 3. Hover sulla Sezione + click su "Salva come Preset Globale" ─────────
  await sourceSection.hover();
  await selectBlock(sourceSection, 'Sezione');

  const saveAsPresetButton = sourceSection.getByRole('button', {
    name: 'Salva il blocco Sezione come Preset Globale',
  });
  await expect(saveAsPresetButton).toBeVisible();
  await saveAsPresetButton.click();

  // ─── 4. Compilo il nome nel modale e confermo ──────────────────────────────
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Salva come Preset Globale')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Nome del preset' }).fill(NOME_PRESET);
  await dialog.getByRole('button', { name: 'Salva', exact: true }).click();
  await expect(dialog).toBeHidden();

  // ─── 5. Navigo alla palette "I Miei Preset" (scheda Widgets) ───────────────
  await selectBlock(blockOfType(sourceSection, 'heading'), 'Titolo');
  await page.getByRole('tab', { name: 'Widgets' }).click();

  const widgetsPanel = page.getByRole('complementary', { name: 'Libreria widget' });
  const presetEntry = widgetsPanel.getByRole('button', {
    name: `Inserisci preset ${NOME_PRESET}`,
  });
  await expect(presetEntry).toBeVisible();

  // ─── 6. Inserisco la Sezione Globale nel Canvas ────────────────────────────
  await presetEntry.click();
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 2);
  const insertedSection = blockOfType(page, 'section').last();
  await expect(blockOfType(insertedSection, 'heading')).toHaveCount(1);
  await expect(insertedSection.getByText(TESTO_TITOLO)).toBeVisible();

  // ─── 7. Salvo dalla TopBar e verifico la notifica di successo ──────────────
  await saveDraft(page);
});
