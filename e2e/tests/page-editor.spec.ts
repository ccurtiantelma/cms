import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deleteBlock,
  deletePageFromUi,
  fillProp,
  openContentTab,
  paletteEntries,
  publishFromStatusMenu,
  saveDraft,
  selectBlock,
  selectProp,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * E2E del **criterio di Done di F04**, per intero e nell'ordine in cui è scritto
 * (`docs/ai/plans/PLAN-F04-editor-visivo.md`): si crea una Pagina reale
 * dall'inizio alla fine senza mai toccare `curl` o l'API a mano — creazione,
 * editor, blocchi, proprietà, riordino, eliminazione, salvataggio, pubblicazione
 * — e il contenuto si verifica letto da `app/public-site` (F03).
 *
 * Due note su come è scritto:
 *
 * 1. **L'unica lettura fuori dal browser è quella finale**, sul sito pubblico:
 *    è una verifica, non un passaggio del percorso. L'URL non è costruito dal
 *    test ma preso dal pulsante "Vedi pagina" del dettaglio, che è il modo in
 *    cui ci arriva chi scrive.
 * 2. **L'editor non è una rotta separata.** Vive nella scheda "Contenuto" del
 *    dettaglio e la pubblicazione sta nella tendina di stato dell'intestazione:
 *    il test percorre l'interfaccia reale, non quella descritta dal piano prima
 *    delle correzioni all'interfaccia del 2026-08-19.
 *
 * Ciò che è **fuori** dal perimetro del primo rilascio (drag & drop, anteprima
 * responsive, duplicazione, WYSIWYG, scorciatoie da tastiera) non compare qui:
 * la sua assenza dal percorso è essa stessa la verifica che non è stato
 * reintrodotto.
 */

const TITOLO_PAGINA = 'Chi siamo — E2E F04';
/** Contiene `&` e `<b>` di proposito: `plainText` si conserva verbatim, l'escaping è del renderer. */
const TESTO_TITOLO = 'Servizi & consulenza <b>non</b> in grassetto';
const HTML_RICH_TEXT = '<p>Primo paragrafo pubblicato dall<strong>editor</strong>.</p>';

/** Sessione amministrativa condivisa: nessuna login per test (vedi `admin.setup.ts`). */
test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  // Pulizia dei dati di verifica, dalla stessa interfaccia del test.
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('percorso completo: creo, compongo, salvo, pubblico e ritrovo il contenuto sul sito pubblico', async ({
  page,
}) => {
  test.slow();

  // ─── 1. Creo la Pagina dalla dashboard ────────────────────────────────────
  const slug = uniqueSlug('chi-siamo-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });

  // ─── 2. Apro l'editor: è la scheda "Contenuto", non una rotta a parte ─────
  await openContentTab(page);
  await expect(page.getByText('La bozza non contiene ancora blocchi')).toBeVisible();

  // ─── 3. Aggiungo una section in radice, con tre figli ─────────────────────
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section');
  await expect(section).toHaveCount(1);
  await expect(section.getByText('Contenitore vuoto')).toBeVisible();

  await addChildBlock(section, 'Titolo');
  await addChildBlock(section, 'Testo');
  await addChildBlock(section, 'Pulsante');

  await expect(blockOfType(section, 'heading')).toHaveCount(1);
  await expect(blockOfType(section, 'richText')).toHaveCount(1);
  await expect(blockOfType(section, 'button')).toHaveCount(1);

  // La palette è generata dal registro: dentro una section non si offrono section.
  const vociAmmesse = await paletteEntries(
    section.getByRole('button', { name: 'Aggiungi qui' }).first(),
  );
  expect(vociAmmesse).toEqual(['Titolo', 'Testo', 'Immagine', 'Pulsante']);

  // ─── 4. Compilo le proprietà dall'ispettore generato dal registro ─────────
  await selectBlock(blockOfType(section, 'heading'), 'Titolo');
  await selectProp(page, 'level', 'h3');
  await fillProp(page, 'text', TESTO_TITOLO);

  await selectBlock(blockOfType(section, 'richText'), 'Testo');
  await fillProp(page, 'html', HTML_RICH_TEXT);

  // ─── 5. Riordino: il testo passa davanti al titolo ────────────────────────
  const tipiPrimaDelRiordino = await section
    .locator('[data-block-type]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-type')));
  expect(tipiPrimaDelRiordino).toEqual(['heading', 'richText', 'button']);

  await page.getByRole('button', { name: 'Sposta su il blocco Testo' }).click();

  const tipiDopoIlRiordino = await section
    .locator('[data-block-type]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-type')));
  expect(tipiDopoIlRiordino).toEqual(['richText', 'heading', 'button']);

  // ─── 6. Elimino un blocco ─────────────────────────────────────────────────
  await deleteBlock(page, 'Pulsante');
  await expect(blockOfType(section, 'button')).toHaveCount(0);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);
  await expect(blockOfType(section, 'richText')).toHaveCount(1);

  // ─── 7. Salvo la bozza: nessun 400 di validazione, nessun 409 ─────────────
  await saveDraft(page);

  // Il contenuto sopravvive al reload: è persistito, non tenuto in memoria.
  await page.reload();
  await openContentTab(page);
  await expect(blockOfType(page, 'section')).toHaveCount(1);
  await expect(page.getByText('Servizi & consulenza')).toBeVisible();

  // ─── 8. Pubblico dalla tendina di stato dell'intestazione ─────────────────
  await publishFromStatusMenu(page);

  // ─── 9. Verifica finale: l'HTML servito da app/public-site (F03) ──────────
  const vediPagina = page.getByRole('link', { name: 'Vedi pagina' });
  await expect(vediPagina).toBeVisible();
  const publicUrl = await vediPagina.getAttribute('href');
  expect(
    publicUrl,
    'il dettaglio deve esporre l’URL pubblico di una Pagina pubblicata',
  ).toBeTruthy();
  expect(publicUrl).toContain(`/${slug}`);

  const publicResponse = await page.request.get(publicUrl as string);
  expect(publicResponse.status()).toBe(200);
  const html = await publicResponse.text();

  // Il titolo c'è, come `h3` scelto nell'ispettore.
  expect(html).toContain('<h3');
  // `plainText` escapato dal renderer (invariante ereditata da ADR-21): il testo
  // digitato arriva come contenuto, mai come markup.
  expect(html).toContain('Servizi &amp; consulenza');
  expect(html).toContain('&lt;b&gt;non&lt;/b&gt;');
  expect(html).not.toContain('consulenza <b>non</b>');
  // Il rich text, sanitizzato server-side, arriva come markup vero.
  expect(html).toContain('<strong>editor</strong>');
  // Il blocco eliminato non è mai stato pubblicato.
  expect(html).not.toContain('<button');
  // L'ordine è quello lasciato dal riordino: prima il testo, poi il titolo.
  expect(html.indexOf('Primo paragrafo')).toBeGreaterThan(-1);
  expect(html.indexOf('Primo paragrafo')).toBeLessThan(html.indexOf('Servizi &amp; consulenza'));
});
