import { expect, type Locator, type Page } from '@playwright/test';
import { BLOCK_TYPES } from '../../../app/frontend/src/types/blocks.types';

/**
 * Gesti dell'editor visivo (F04) espressi una volta sola, così i test dicono
 * *cosa* si fa e non *quale selettore* si usa. Ogni funzione qui passa
 * esclusivamente dall'interfaccia: nessuna scorciatoia via API, nessuna
 * scrittura diretta nello store.
 */

/**
 * Etichetta leggibile di una prop, come la mostra `PropertyInspector` da T6 in poi
 * (ADR-30 § 1, `meta.props[nome].label`). `fillProp`/`selectProp` continuano ad accettare
 * il **nome tecnico** della prop (`text`, `level`, `html`, …) — è il vocabolario con cui
 * ogni test esistente la individua — ma cercano il campo per l'etichetta leggibile che
 * l'ispettore espone davvero, letta dal registro generato invece che duplicata a mano qui.
 *
 * Nessun `data-testid` esiste oggi sui campi dell'ispettore: finché non c'è (task minimo
 * consigliato, non eseguito da questo ruolo — vedi report), questa è la ricerca più
 * robusta disponibile. Un nome tecnico non presente in alcun tipo del registro ricade sul
 * nome stesso (comportamento pre-T6, utile solo a rendere l'errore leggibile a chi scrive
 * un test nuovo).
 */
function readableLabel(propName: string): string {
  for (const descriptor of BLOCK_TYPES) {
    const meta = descriptor.meta?.props?.[propName];
    if (meta?.label) return meta.label;
  }
  return propName;
}

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
  const field = page.getByRole('textbox', { name: new RegExp(`^${readableLabel(propName)}`) });
  await field.fill(value);
  await field.blur();
}

/** Sceglie il valore di una prop `enum` dall'ispettore. */
export async function selectProp(page: Page, propName: string, value: string): Promise<void> {
  await page
    .getByRole('textbox', { name: new RegExp(`^${readableLabel(propName)}`) })
    .click();
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

/** Duplica un blocco dalla sua toolbar (T7 § Parte 1). */
export async function duplicateBlock(page: Page, blockLabel: string): Promise<void> {
  await page.getByRole('button', { name: `Duplica il blocco ${blockLabel}` }).click();
}

/**
 * Trascina un blocco fino alla zona di rilascio `targetZone`, usando **solo** il sensore
 * da tastiera di dnd-kit (Space per afferrare/rilasciare, frecce per muovere il "fantasma"
 * di uno scatto fisso alla volta): la via a puntatore richiederebbe passi intermedi
 * sintetici ed è la via fragile, non quella scelta per i test (PLAN-F04c-editor-maturo.md
 * T7/T8). Ogni zona di rilascio porta `data-over="true"` mentre il puntatore/fantasma ci
 * sta sopra (`EditorBlockWrapper.tsx`, `dropZoneAttrs`) — lo stesso segnale che guida
 * l'indicatore visivo di rilascio: qui si preme una freccia alla volta finché la zona
 * attesa non è quella "over", poi si rilascia con Space.
 *
 * Prova prima `primaryDirection`, poi (se non trovata entro metà del budget di passi)
 * l'opposta: il verso giusto dipende dalla posizione relativa nel DOM fra origine e
 * destinazione, che il chiamante non sempre conosce con certezza pixel per pixel.
 */
export async function dragBlockToZone(
  page: Page,
  handleLabel: string,
  targetZone: Locator,
  primaryDirection: 'ArrowDown' | 'ArrowUp' = 'ArrowDown',
  maxSteps = 60,
): Promise<void> {
  const targetHandle = await targetZone.elementHandle();
  if (!targetHandle) {
    throw new Error('dragBlockToZone: la zona di destinazione non è presente nel DOM');
  }

  const secondaryDirection = primaryDirection === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown';

  async function attempt(direction: 'ArrowDown' | 'ArrowUp', steps: number): Promise<boolean> {
    const handle = page.getByRole('button', { name: handleLabel });
    await handle.focus();
    await page.keyboard.press('Space'); // afferra

    for (let step = 0; step < steps; step += 1) {
      const overCount = await page.locator('[data-over="true"]').count();
      if (overCount > 0) {
        const isTarget = await page
          .locator('[data-over="true"]')
          .first()
          .evaluate((el, expected) => el === expected, targetHandle);
        if (isTarget) {
          await page.keyboard.press('Space'); // rilascia sulla zona attesa
          return true;
        }
      }
      await page.keyboard.press(direction);
    }

    await page.keyboard.press('Escape'); // annulla: nessuna zona attesa raggiunta in questo verso
    return false;
  }

  const half = Math.ceil(maxSteps / 2);
  if (await attempt(primaryDirection, half)) return;
  if (await attempt(secondaryDirection, maxSteps - half)) return;

  throw new Error(
    `dragBlockToZone: la zona di rilascio attesa non è mai risultata "over" entro ${maxSteps} passi da tastiera (nessuno dei due versi)`,
  );
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
