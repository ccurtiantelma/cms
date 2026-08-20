import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Gesti dell'editor visivo (F04) espressi una volta sola, così i test dicono
 * *cosa* si fa e non *quale selettore* si usa. Ogni funzione qui passa
 * esclusivamente dall'interfaccia: nessuna scorciatoia via API, nessuna
 * scrittura diretta nello store.
 */

/** Slug irripetibile fra un run e l'altro: lo slug è unico per locale+genitore (409 altrimenti). */
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Crea una Pagina dal drawer "Nuova Pagina" dell'elenco e resta sul suo
 * dettaglio. Ritorna il `guid`, letto dall'URL su cui l'app naviga da sola.
 */
export async function createPageFromUi(
  page: Page,
  { title, slug }: { title: string; slug: string },
): Promise<string> {
  await page.goto('/pages');
  await page.getByRole('button', { name: 'Nuova Pagina' }).click();

  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Titolo').fill(title);
  await drawer.getByLabel('Slug').fill(slug);
  // "Locale" arriva già compilato a it-IT dal form di creazione: non si tocca.
  await drawer.getByRole('button', { name: 'Salva' }).click();

  await expect(page).toHaveURL(/\/pages\/[0-9a-f]{16}$/);
  const guid = page.url().split('/').pop() as string;
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return guid;
}

/**
 * Apre la scheda "Contenuto" del dettaglio, dove vive l'editor. Non è una rotta
 * separata: l'editor è il modo in cui si guarda il contenuto della Pagina.
 */
export async function openContentTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Contenuto' }).click();
  await expect(page.getByRole('button', { name: 'Salva bozza' })).toBeVisible();
}

/** Il wrapper di editing di un blocco, individuato dal tipo del registro. */
export function blockOfType(scope: Page | Locator, type: string): Locator {
  return scope.locator(`[data-block-type="${type}"]`);
}

/**
 * Apre una palette e restituisce **il suo** dropdown. Lo scoping non è pedanteria:
 * Mantine lascia montato il dropdown di un menu già chiuso (resta nel DOM a
 * `opacity: 0`), quindi con più palette in pagina una ricerca globale di
 * `menuitem` trova le voci di tutte. Il legame fra pulsante e dropdown è
 * l'`aria-controls` del target, cioè lo stesso che usa un lettore di schermo.
 */
async function openPalette(trigger: Locator): Promise<Locator> {
  await trigger.click();
  const dropdownId = await trigger.getAttribute('aria-controls');
  if (!dropdownId)
    throw new Error('openPalette: il pulsante della palette non espone aria-controls');
  const dropdown = trigger.page().locator(`#${dropdownId}`);
  await expect(dropdown).toBeVisible();
  return dropdown;
}

/** Le voci offerte da una palette, nell'ordine in cui il registro le dichiara. */
export async function paletteEntries(trigger: Locator): Promise<string[]> {
  const dropdown = await openPalette(trigger);
  const labels = await dropdown.getByRole('menuitem').allInnerTexts();
  await trigger.page().keyboard.press('Escape');
  return labels;
}

/** Aggiunge un blocco alla radice dell'albero, dalla palette in fondo al canvas. */
export async function addRootBlock(page: Page, label: string): Promise<void> {
  const dropdown = await openPalette(
    page.getByRole('button', { name: 'Aggiungi blocco in fondo' }),
  );
  await dropdown.getByRole('menuitem', { name: label, exact: true }).click();
}

/** Aggiunge un blocco dentro un contenitore, dalla sua palette "Aggiungi qui". */
export async function addChildBlock(container: Locator, label: string): Promise<void> {
  const dropdown = await openPalette(
    container.getByRole('button', { name: 'Aggiungi qui' }).first(),
  );
  await dropdown.getByRole('menuitem', { name: label, exact: true }).click();
}

/** Seleziona un blocco cliccandone l'etichetta nella toolbar, come farebbe una persona. */
export async function selectBlock(block: Locator, label: string): Promise<void> {
  await block.getByRole('button', { name: label, exact: true }).first().click();
}

/**
 * Compila una prop testuale dell'ispettore e conferma con il blur: l'editor
 * scrive in store `onBlur`, non a ogni tasto — un `fill` senza uscita dal campo
 * non produrrebbe alcuna modifica.
 */
export async function fillProp(page: Page, propName: string, value: string): Promise<void> {
  const field = page.getByRole('textbox', { name: new RegExp(`^${propName}`) });
  await field.fill(value);
  await field.blur();
}

/** Sceglie il valore di una prop `enum` dall'ispettore. */
export async function selectProp(page: Page, propName: string, value: string): Promise<void> {
  await page.getByRole('textbox', { name: new RegExp(`^${propName}`) }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

/** Elimina un blocco dalla sua toolbar, passando dalla conferma. */
export async function deleteBlock(page: Page, blockLabel: string): Promise<void> {
  await page.getByRole('button', { name: `Elimina il blocco ${blockLabel}` }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Elimina blocco' });
  await dialog.getByRole('button', { name: 'Elimina' }).click();
  await expect(dialog).toBeHidden();
}

/** Annulla l'ultima modifica dell'editor (pulsante "Annulla", toolbar undo/redo). */
export async function undoLastChange(page: Page): Promise<void> {
  await page.getByRole('button', { name: "Annulla l'ultima modifica" }).click();
}

/** Ripristina l'ultima modifica annullata (pulsante "Ripristina", toolbar undo/redo). */
export async function redoLastChange(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ripristina la modifica annullata' }).click();
}

/**
 * Sposta un blocco dentro il contenitore immediatamente precedente ("indent"): è lo
 * spostamento posizionale fra contenitori (`moveNodeToAction`) esposto dall'interfaccia —
 * non c'è drag & drop nel primo rilascio (F04), solo questa coppia di pulsanti.
 */
export async function indentBlock(page: Page, blockLabel: string): Promise<void> {
  await page
    .getByRole('button', { name: `Sposta il blocco ${blockLabel} dentro il contenitore precedente` })
    .click();
}

/** Porta un blocco fuori dal proprio contenitore, di un livello ("outdent"). */
export async function outdentBlock(page: Page, blockLabel: string): Promise<void> {
  await page.getByRole('button', { name: `Porta il blocco ${blockLabel} fuori dal contenitore` }).click();
}

/** Salva la bozza e attende la conferma; fallisce se compare un 400 o un 409. */
export async function saveDraft(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page.getByText('Bozza salvata')).toBeVisible();
  await expect(page.getByText('Blocco non valido')).toHaveCount(0);
  await expect(page.getByText('Conflitto di editing')).toHaveCount(0);
}

/**
 * Pubblica la Pagina dalla tendina di stato dell'intestazione. La transizione è
 * una sola e vive lì: l'editor non ha un proprio pulsante di pubblicazione.
 */
export async function publishFromStatusMenu(page: Page): Promise<void> {
  // `exact` obbligatorio: "Salva bozza" contiene "Bozza".
  const trigger = page.getByRole('button', { name: 'Bozza', exact: true });
  await trigger.click();
  const dropdownId = await trigger.getAttribute('aria-controls');
  await page
    .locator(`#${dropdownId}`)
    .getByRole('menuitem', { name: 'Pubblica', exact: true })
    .click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Conferma cambio di stato' });
  await dialog.getByRole('button', { name: 'Pubblica' }).click();

  await expect(page.getByRole('button', { name: 'Pubblicata' })).toBeVisible();
}

/**
 * Elimina (soft-delete) dall'elenco la Pagina creata da un test, passando dalla
 * riga e dalla conferma come farebbe una persona. Pulizia dei dati di verifica:
 * l'ambiente resta come l'ha trovato, senza aprire un secondo percorso via API
 * — e senza consumare una `POST /auth/login`, contata dal rate limit.
 *
 * È best-effort per costruzione: se il test è già fallito prima di creare la
 * Pagina non c'è nulla da togliere, e un fallimento della pulizia non deve
 * mascherare l'errore vero.
 */
export async function deletePageFromUi(page: Page, title: string): Promise<void> {
  await page.goto('/pages');
  const riga = page.getByRole('row').filter({ hasText: title }).first();
  if ((await riga.count()) === 0) return;

  await riga.getByRole('button', { name: 'Elimina' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Conferma Eliminazione' });
  await dialog.getByRole('button', { name: 'Elimina' }).click();
  await expect(dialog).toBeHidden();
}
