import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  activateMenuItem,
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deleteBlock,
  deletePageFromUi,
  fillProp,
  openContentTab,
  publishFromStatusMenu,
  reorderBlock,
  saveDraft,
  selectBlock,
  selectProp,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * Etichette accessibili dei tre controlli di `ViewportSelector.tsx`
 * (`aria-label={`Viewport ${label}, ${width}`}`): Desktop resta fluido (`100%`, tetto
 * `1280px`), Tablet/Mobile sono un device frame a larghezza fissa — stessi tre valori
 * letterali del componente, non riderivati qui.
 */
const VIEWPORT_BUTTON = {
  desktop: 'Viewport Desktop, 100%',
  tablet: 'Viewport Tablet, 768px',
  mobile: 'Viewport Mobile, 375px',
} as const;

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
  await expect(page.getByText('Trascina il widget qui')).toBeVisible();

  // ─── 3. Aggiungo una section in radice, con tre figli ─────────────────────
  // La Pagina appena creata non parte da un canvas vuoto: il `templateSlug` di default
  // ("empty", RFC-43) porta già una Sezione seed in radice (`page-blueprints.registry.ts`).
  // Si calcola il delta rispetto al conteggio iniziale invece di assumere un unico blocco,
  // e si individua la Sezione di questo test con `.last()` — "Aggiungi widget" inserisce
  // sempre in coda alla radice (`addRootBlock`, commento di testa in `page-editor.ts`).
  const initialSectionCount = await blockOfType(page, 'section').count();
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section').last();
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);
  await expect(section.getByText('Contenitore vuoto')).toBeVisible();

  // `addChildBlock` sceglie da sola il trigger giusto: il segnaposto "Contenitore vuoto"
  // (primo figlio) o "Inserisci Dopo" dal menu contestuale dell'ultimo figlio già presente
  // (dal secondo figlio in poi) — vedi il suo commento di testa, `helpers/page-editor.ts`:
  // nessun trigger di coda dedicato resta su un contenitore che ha già almeno un figlio.
  await addChildBlock(section, 'Titolo');
  await addChildBlock(section, 'Testo');
  await addChildBlock(section, 'Pulsante');

  await expect(blockOfType(section, 'heading')).toHaveCount(1);
  await expect(blockOfType(section, 'richText')).toHaveCount(1);
  await expect(blockOfType(section, 'button')).toHaveCount(1);

  // La palette è generata dal registro: dentro una section non si offrono section. Letta
  // dallo stesso flusso "Inserisci Dopo" di `addChildBlock` (nessun trigger diretto rimasto
  // su un contenitore non vuoto): si apre e si chiude senza scegliere nulla. Da tastiera, non
  // `.click()`: il menu contestuale del canvas non ha `zIndex={1100}` come ogni altro popover
  // dell'editor — bug applicativo reale, segnalato nel report del test engineer (vedi il
  // commento di testa di `activateMenuItem`, `helpers/page-editor.ts`).
  await blockOfType(section, 'button').click({ button: 'right' });
  const contextMenu = page.getByRole('menu');
  await expect(contextMenu).toBeVisible();
  await activateMenuItem(contextMenu.getByRole('menuitem', { name: 'Inserisci Dopo', exact: true }));
  // `.last()`: il primo menu resta nel DOM durante la propria transizione di chiusura,
  // vedi il commento in `addChildBlock` (`helpers/page-editor.ts`) per lo stesso dettaglio.
  const insertMenu = page.getByRole('menu').last();
  await expect(insertMenu).toBeVisible();
  const vociAmmesse = await insertMenu.getByRole('menuitem').allInnerTexts();
  await page.keyboard.press('Escape');
  // `container` (ADR-39, "Contenitore") è stato aggiunto ai tipi ammessi dentro una
  // `section` dopo che questa lista era stata scritta la prima volta — non una regressione
  // del restyle, un'evoluzione del registro nel frattempo: verificato sul DOM reale.
  expect(vociAmmesse).toEqual(['Titolo', 'Testo', 'Immagine', 'Pulsante', 'Contenitore']);

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

  await reorderBlock(blockOfType(section, 'richText'), 'up');

  const tipiDopoIlRiordino = await section
    .locator('[data-block-type]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-type')));
  expect(tipiDopoIlRiordino).toEqual(['richText', 'heading', 'button']);

  // ─── 6. Elimino un blocco ─────────────────────────────────────────────────
  await selectBlock(blockOfType(section, 'button'), 'Pulsante');
  await deleteBlock(blockOfType(section, 'button'), 'Pulsante');
  await expect(blockOfType(section, 'button')).toHaveCount(0);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);
  await expect(blockOfType(section, 'richText')).toHaveCount(1);

  // ─── 7. Salvo la bozza: nessun 400 di validazione, nessun 409 ─────────────
  await saveDraft(page);

  // Il contenuto sopravvive al reload: è persistito, non tenuto in memoria.
  await page.reload();
  await openContentTab(page);
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);
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

/**
 * Stress test dello switcher di viewport responsive (`ViewportSelector.tsx`, F14-02):
 * Desktop → Tablet → Mobile, con verifica che il contenitore simulato
 * (`.viewportContainer`/`data-viewport`, `FullScreenEditorLayout.tsx`) cambi davvero
 * larghezza e che la toolbar di selezione di un blocco (`BlockHoverOverlay.tsx`) resti
 * ancorata e cliccabile a ogni passaggio, senza eccezioni JS in console.
 *
 * `data-viewport` non pilota una media query propria (il rendering responsive dei
 * blocchi passa da `container-type: inline-size`, letto dalle `@container` di
 * `style-tokens.module.css`): resta comunque l'aggancio dichiarativo pensato apposta per
 * selettori E2E sul breakpoint simulato (commento di testa in `FullScreenEditorLayout.tsx`).
 */
test('switcher di viewport responsive: Desktop → Tablet → Mobile, canvas e toolbar di selezione restano coerenti', async ({
  page,
}) => {
  test.slow();

  const jsErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') jsErrors.push(msg.text());
  });
  page.on('pageerror', (error) => jsErrors.push(error.message));

  const slug = uniqueSlug('viewport-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section').last();
  await addChildBlock(section, 'Titolo');
  const heading = blockOfType(section, 'heading');
  await selectBlock(heading, 'Titolo');

  const viewportContainer = page.locator('[data-viewport]');
  // Stesso controllo dell'overlay a ogni passaggio: un click rieseleziona lo stesso nodo
  // già selezionato (`selectNode(id)`, idempotente) — prova che la toolbar riceve ancora
  // click reali dopo il cambio di larghezza, non solo che è visibile.
  const modificaButton = heading.getByRole('button', { name: 'Modifica il blocco Titolo' });

  // ─── Desktop (stato iniziale) ───────────────────────────────────────────
  await expect(viewportContainer).toHaveAttribute('data-viewport', 'desktop');
  const desktopBox = await viewportContainer.boundingBox();
  expect(desktopBox?.width).toBeGreaterThan(768);
  await expect(modificaButton).toBeVisible();
  await modificaButton.click();

  // ─── Tablet ──────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: VIEWPORT_BUTTON.tablet }).click();
  await expect(viewportContainer).toHaveAttribute('data-viewport', 'tablet');
  await expect(viewportContainer).toHaveCSS('width', '768px');
  await expect(modificaButton).toBeVisible();
  await modificaButton.click();

  // ─── Mobile ──────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: VIEWPORT_BUTTON.mobile }).click();
  await expect(viewportContainer).toHaveAttribute('data-viewport', 'mobile');
  await expect(viewportContainer).toHaveCSS('width', '375px');
  await expect(modificaButton).toBeVisible();
  await modificaButton.click();

  // ─── Torno a Desktop: lo switcher è bidirezionale, non solo "in giù" ──────
  await page.getByRole('button', { name: VIEWPORT_BUTTON.desktop }).click();
  await expect(viewportContainer).toHaveAttribute('data-viewport', 'desktop');
  await expect(modificaButton).toBeVisible();

  expect(jsErrors, `nessuna eccezione JS attesa in console: ${jsErrors.join('; ')}`).toEqual([]);
});
