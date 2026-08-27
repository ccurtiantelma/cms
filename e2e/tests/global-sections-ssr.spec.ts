import { test, expect, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  openContentTab,
  publishFromStatusMenu,
  saveDraft,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * `addRootBlock` (`helpers/page-editor.ts`) cerca il pulsante testuale "Aggiungi blocco in
 * fondo" — **non più presente nel canvas**: la zona vuota/di coda ora è `CanvasAddSectionZone`
 * (`app/frontend/src/pages/pages/editor/CanvasAddSectionZone.tsx`), tre `ActionIcon` senza
 * quel testo. Il terzo (icona `IconSparkles`) monta comunque una `BlockPalette` reale con
 * `aria-label="Aggiungi widget"` — stesso menu di inserimento, stesso `role="menu"` — solo un
 * trigger diverso: **verificato empiricamente** (`addRootBlock` va in timeout di 90s su
 * qualunque canvas vuoto, Pagina o Sezione Globale che sia). Bug applicativo/drift del test
 * helper rispetto all'interfaccia reale, segnalato nel report del test engineer — non è
 * responsabilità di questo file correggere l'helper condiviso, usato da altri spec: qui si
 * usa solo il trigger reale, in locale.
 */
async function addRootBlockViaWidgetMenu(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Aggiungi widget' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: label, exact: true }).click();
}

/**
 * E2E delle Sezioni Globali (F06, ADR-40): creazione dallo slot "Header", contenuto a
 * blocchi nel Builder dedicato (`/global-sections/:guid/builder`) e verifica sul sito
 * pubblico SSR reale (`app/public-site`) che il layout la innesti come `<header>`, prima di
 * `<main>` (`PageView.tsx`, `GlobalSectionSlot`).
 *
 * Serve una Pagina pubblicata reale per avere un `<main>` da confrontare: stesso flusso
 * minimo di creazione/pubblicazione già in `page-full-flow.spec.ts`/`page-preview.spec.ts`
 * (drawer "Nuova Pagina" → editor → "Salva bozza" → tendina di stato → "Vedi pagina"), non
 * un percorso nuovo.
 */

const TITOLO_SEZIONE = 'Header E2E Test';
const TITOLO_PAGINA = 'Pagina per SSR sezioni globali — E2E ADR-40';
const TESTO_HEADER = 'TEST HEADER SSR';

/**
 * Origine del sito pubblico SSR per la richiesta HTTP diretta di questo test — stesso
 * schema di `E2E_FRONTEND_URL` in `playwright.config.ts`: variabile d'ambiente in CI,
 * fallback allo sviluppo locale. Combacia col default reale di `PublicSiteConfig.port`
 * (`app/public-site/src/config.ts`, `PORT`, default `55000`) e con quello di
 * `VITE_PUBLIC_SITE_URL`/`usePublicPageUrl.ts` — ma è una variabile distinta e non un
 * duplicato: quella è cablata nel build del frontend admin, questa è letta a runtime da
 * questo test, e le due possono legittimamente puntare a istanze diverse (es. un frontend
 * già buildato contro un altro ambiente). Solo l'**origine** viene da qui; il **percorso**
 * resta quello vero risolto dalla UI (`usePublicPageUrl`, href di "Vedi pagina"), mai
 * ricostruito a mano — unica fonte di verità per slug annidati/locale (ADR-24).
 */
const PUBLIC_SITE_ORIGIN = process.env.E2E_PUBLIC_SITE_URL ?? 'http://localhost:55000';

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Elimina (soft-delete) dall'elenco la Sezione Globale creata dal test, passando dalla riga
 * e dalla conferma come farebbe una persona — stesso principio di `deletePageFromUi`
 * (`helpers/page-editor.ts`): libera anche lo slot `header` per gli altri test/run, visto
 * che l'unicità è un vincolo di database solo fra righe **attive** (ADR-40).
 */
async function deleteGlobalSectionFromUi(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.goto('/global-sections');
  const riga = page.getByRole('row').filter({ hasText: title }).first();
  try {
    await riga.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }
  await riga.getByRole('button', { name: 'Elimina' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Conferma Eliminazione' });
  await dialog.getByRole('button', { name: 'Elimina' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Titolo della Sezione Globale che occupava lo slot "Header" prima di questo test, se
 * presente (ambiente osservato: già occupato da una riga preesistente — non uno stato
 * pulito). Letto in una variabile del modulo perché `afterEach` deve poterlo ripristinare
 * indipendentemente dall'esito del test (anche se fallisce a metà).
 */
let previousHeaderOccupant: string | null = null;

/**
 * Cambia lo slot di layout di una Sezione Globale già esistente dalla riga dell'elenco
 * (`Modifica meta-dati`), passando dal drawer reale — mai una scrittura diretta via API.
 */
async function setLayoutSlotFromUi(
  page: import('@playwright/test').Page,
  title: string,
  slotLabel: 'Nessuno' | 'Header' | 'Footer',
): Promise<void> {
  await page.goto('/global-sections');
  const riga = page.getByRole('row').filter({ hasText: title }).first();
  await riga.waitFor({ state: 'visible', timeout: 10_000 });
  await riga.getByRole('button', { name: 'Modifica meta-dati' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Slot di layout').click();
  await page.getByRole('option', { name: slotLabel, exact: true }).click();
  await drawer.getByRole('button', { name: 'Salva' }).click();
  await expect(drawer).toBeHidden();
}

/**
 * Libera lo slot "Header" se occupato da un'altra Sezione Globale (l'unicità di ADR-40 è un
 * vincolo fra righe **attive**: senza questo passo la creazione della Sezione di questo test
 * userebbe uno slot già preso e la UI disabiliterebbe l'opzione "Header" nel `Select`).
 * Ritorna il titolo dell'occupante liberato, o `null` se lo slot era già libero — usato da
 * `afterEach` per ripristinarlo esattamente come lo ha trovato.
 */
async function freeHeaderSlot(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/global-sections');
  // L'elenco si popola da una fetch client-side dopo la navigazione (stesso motivo già
  // documentato per `deletePageFromUi`, `helpers/page-editor.ts`): un `count()` letto subito
  // dopo `goto` può leggere zero righe solo perché la risposta non è ancora arrivata.
  const emptyState = page.getByText('Nessuna Sezione Globale trovata');
  const firstRow = page.getByRole('row').nth(1); // nth(0) è l'intestazione di colonna
  await Promise.race([
    firstRow.waitFor({ state: 'visible', timeout: 10_000 }),
    emptyState.waitFor({ state: 'visible', timeout: 10_000 }),
  ]).catch(() => undefined);

  const occupantRow = page.getByRole('row').filter({ has: page.getByText('Header', { exact: true }) });
  if (!(await occupantRow.first().isVisible().catch(() => false))) return null;

  const title = (await occupantRow.first().locator('td').first().innerText()).trim();
  if (!title) return null;
  await setLayoutSlotFromUi(page, title, 'Nessuno');
  return title;
}

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
  await deleteGlobalSectionFromUi(page, TITOLO_SEZIONE).catch(() => undefined);
  // Ripristino dell'ambiente com'era prima del test — best-effort, mai a costo di mascherare
  // un fallimento del test stesso.
  if (previousHeaderOccupant) {
    await setLayoutSlotFromUi(page, previousHeaderOccupant, 'Header').catch(() => undefined);
    previousHeaderOccupant = null;
  }
});

test('Sezione Globale assegnata a "Header": il sito pubblico la serve come <header> prima di <main>', async ({
  page,
}) => {
  test.slow();

  // ─── 0. Libero lo slot "Header" se già occupato (ambiente osservato: lo era) ──────────
  previousHeaderOccupant = await freeHeaderSlot(page);

  // ─── 1. Creo la Sezione Globale dall'elenco, assegnata allo slot "Header" ─────────────
  // Campi reali del drawer (`PageGlobalSections.tsx`): `TextInput label="Titolo"` e
  // `Select label="Slot di layout"` (data `LAYOUT_SLOT_LABELS`, valore "Header").
  await page.goto('/global-sections');
  await page.getByRole('button', { name: 'Nuova Sezione Globale' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Titolo').fill(TITOLO_SEZIONE);
  await drawer.getByLabel('Slot di layout').click();
  await page.getByRole('option', { name: 'Header', exact: true }).click();
  await drawer.getByRole('button', { name: 'Salva' }).click();

  // La creazione riuscita apre da sola il Builder (`handleFormSubmit`, `navigate`).
  await expect(page).toHaveURL(/\/global-sections\/[0-9a-f]{16}\/builder$/);

  // ─── 2. Nel Builder: un blocco Titolo con il testo da riconoscere nell'HTML pubblico ──
  // Stessa chrome dell'editor di Pagina (`FullScreenEditorLayout`), stessi helper.
  await expect(page.getByText('Trascina il widget qui')).toBeVisible();
  await addRootBlockViaWidgetMenu(page, 'Titolo');
  const heading = blockOfType(page, 'heading');
  await expect(heading).toHaveCount(1);
  await selectBlock(heading, 'Titolo');
  await fillProp(page, 'text', TESTO_HEADER);

  // Il Builder non ha "Bozza"/"Pubblicata": una Sezione Globale non ha stato distinto da
  // pubblicato (`PageGlobalSectionBuilder.tsx`, commento di testa) — la notifica di
  // salvataggio è "Sezione Globale salvata", non "Bozza salvata" (`saveDraft` di
  // `helpers/page-editor.ts` non si applica qui: cerca il testo sbagliato).
  await page.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page.getByRole('alert').getByText('Sezione Globale salvata')).toBeVisible();

  // ─── 3. Pagina pubblicata reale, per avere un <main> con cui confrontare l'header ─────
  const slug = uniqueSlug('ssr-global-sections-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);
  await addRootBlockViaWidgetMenu(page, 'Titolo');
  const pageHeading = blockOfType(page, 'heading');
  await selectBlock(pageHeading, 'Titolo');
  await fillProp(page, 'text', 'Contenuto della pagina di prova');
  await saveDraft(page);
  await publishFromStatusMenu(page);

  const vediPagina = page.getByRole('link', { name: 'Vedi pagina' });
  await expect(vediPagina).toBeVisible();
  const publicUrl = (await vediPagina.getAttribute('href')) as string;
  expect(publicUrl, 'il dettaglio deve esporre l’URL pubblico di una Pagina pubblicata').toBeTruthy();

  // ─── 4. Richiesta HTTP diretta al sito pubblico SSR reale (porta 55000 di default,
  // `PublicSiteConfig.port`/`app/public-site/src/config.ts`), origine da `E2E_PUBLIC_SITE_URL`
  // — solo il percorso viene da `publicUrl` (vedi commento della costante sopra) ──────────
  const directUrl = `${PUBLIC_SITE_ORIGIN}${new URL(publicUrl).pathname}`;
  const publicResponse = await page.request.get(directUrl);
  expect(publicResponse.status()).toBe(200);
  const html = await publicResponse.text();

  expect(html).toContain(TESTO_HEADER);
  expect(html).toContain('<header');
  expect(html).toContain('<main');
  // L'header precede il main nel DOM (`PageView.tsx`: `<GlobalSectionSlot as="header" />`
  // prima di `<main>`), non solo presente da qualche parte nel documento.
  expect(html.indexOf('<header')).toBeGreaterThan(-1);
  expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main'));
  // Il testo del blocco Titolo della Sezione Globale arriva prima del contenuto di Pagina:
  // ulteriore conferma che sta nell'header, non dentro il main.
  expect(html.indexOf(TESTO_HEADER)).toBeLessThan(html.indexOf('Contenuto della pagina di prova'));
});
