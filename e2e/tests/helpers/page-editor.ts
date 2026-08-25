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
 *
 * `parentGuid` è opzionale (`PagePages.tsx`, campo libero "Pagina genitore (guid)", nessuna
 * validazione client sulla forma): compila lo slug annidato di una Pagina figlia senza
 * passare da un secondo modo di crearla — stesso drawer, un campo in più (ADR-24 § 1).
 */
export async function createPageFromUi(
  page: Page,
  { title, slug, parentGuid }: { title: string; slug: string; parentGuid?: string },
): Promise<string> {
  await page.goto('/pages');
  await page.getByRole('button', { name: 'Nuova Pagina' }).click();

  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Titolo').fill(title);
  await drawer.getByLabel('Slug').fill(slug);
  // "Locale" arriva già compilato a it-IT dal form di creazione: non si tocca.
  if (parentGuid) {
    await drawer.getByLabel('Pagina genitore (guid)').fill(parentGuid);
  }
  await drawer.getByRole('button', { name: 'Salva' }).click();

  await expect(page).toHaveURL(/\/pages\/[0-9a-f]{16}$/);
  const guid = page.url().split('/').pop() as string;
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return guid;
}

/**
 * Apre la scheda "Contenuto" del dettaglio, dove vive l'editor. Non è una rotta
 * separata: l'editor è il modo in cui si guarda il contenuto della Pagina.
 *
 * Salta il click se la scheda è già quella attiva: da quando è attiva monta
 * `FullScreenEditorLayout` (`position: fixed; inset: 0`, ADR-32), che copre l'intera
 * viewport — `Tabs.List` incluso, perché la sua fascia orizzontale coincide con quella
 * del canvas sottostante e non può essere sollevata sopra l'overlay senza intercettare a
 * sua volta i click sui blocchi (verificato in E2E: la stessa `Tabs.List` sollevata
 * bloccava "Aggiungi blocco in fondo"/"Aggiungi dentro"). Un secondo `click()` su una
 * scheda già selezionata non cambierebbe comunque stato — è ridondante, e qui l'unico
 * segno visibile del problema: evitarlo elimina la sola chiamata che lo richiederebbe.
 */
export async function openContentTab(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Contenuto' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
  await expect(page.getByRole('button', { name: 'Salva bozza' })).toBeVisible();
}

/** Il wrapper di editing di un blocco, individuato dal tipo del registro. */
export function blockOfType(scope: Page | Locator, type: string): Locator {
  return scope.locator(`[data-block-type="${type}"]`);
}

/**
 * Apre una palette e restituisce **il suo** dropdown.
 *
 * Non più via `aria-controls` del `trigger` (comportamento pre-T-canvas-cleanup): per le
 * palette icon-only (`BlockPalette.tsx`, `iconOnly`), `Menu.Target` clona `aria-controls`
 * sul suo figlio diretto (`<Tooltip>`), e quell'attributo finisce su un nodo che — verificato
 * sul DOM reale — non è né il bottone con `role="button"` né un suo antenato: irraggiungibile
 * da questo locator senza una ricerca globale fragile. Il click funziona comunque (l'evento
 * nativo apre il menu), quindi si aspetta l'unico `role="menu"` visibile sulla pagina dopo il
 * click, invece di risalire a un id: più semplice, e resta corretto perché Mantine qui monta
 * il dropdown solo mentre è aperto (mai più di uno alla volta, verificato sul DOM reale — a
 * differenza di quanto assumeva questo helper prima di T-canvas-cleanup).
 */
async function openPalette(trigger: Locator): Promise<Locator> {
  await trigger.click();
  const dropdown = trigger.page().getByRole('menu');
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

/**
 * Aggiunge un blocco dentro un contenitore, dalla sua palette icon-only "Aggiungi dentro"
 * (rinominata da "Aggiungi qui" nel round T-canvas-cleanup, uncommitted al momento in cui
 * questo helper è stato adeguato — vedi nota su {@link selectBlock} per lo stesso round).
 */
export async function addChildBlock(container: Locator, label: string): Promise<void> {
  const dropdown = await openPalette(
    container.getByRole('button', { name: 'Aggiungi dentro' }).first(),
  );
  await dropdown.getByRole('menuitem', { name: label, exact: true }).click();
}

/**
 * Seleziona un blocco cliccando il suo wrapper nel canvas, come farebbe una persona.
 *
 * Fino al round T-canvas-cleanup il bersaglio di selezione era un `UnstyledButton` testuale
 * (`getByRole('button', { name: label })`); quel bottone è stato rimosso a favore del click
 * diretto sul wrapper del blocco (`div[data-block-type]`, `tabIndex=0` + `aria-label`, **senza**
 * `role="button"` esplicito) — un `<div>` con solo `tabIndex` non riceve il ruolo ARIA
 * "button" per costruzione, quindi `getByRole('button', …)` su quel bersaglio non trova più
 * nulla. Questo helper clicca perciò `block` stesso (il locator del wrapper, tipicamente
 * `blockOfType(...)`), non un discendente cercato per ruolo — `label` resta nella firma solo
 * per la leggibilità dei call site, non è più usato per la ricerca. Segnalato nel report del
 * test engineer: un `<div>` interattivo senza `role="button"` è anche una regressione di
 * accessibilità reale, non solo un problema di questo helper.
 */
export async function selectBlock(block: Locator, _label: string): Promise<void> {
  await block.first().click();
}

/**
 * Compila una prop testuale dell'ispettore e conferma con il blur: l'editor
 * scrive in store `onBlur`, non a ogni tasto — un `fill` senza uscita dal campo
 * non produrrebbe alcuna modifica.
 *
 * Caso speciale `richText`/`html` (`RichTextFieldEditor.tsx`): la scheda "Visuale",
 * attiva di default, monta l'editor Tiptap come `contenteditable` — nessun
 * `role="textbox"` con nome accessibile "Contenuto" da trovare lì. Solo la scheda
 * "Codice" espone un `Textarea` con `aria-label` reale. Se quella scheda esiste
 * (silenziosamente ignorata per ogni altro tipo di prop, che non la monta affatto),
 * la si seleziona prima di cercare il campo — un `fill` diretto sulla vista Visuale
 * non avrebbe comunque scritto nulla di verificabile da qui.
 */
export async function fillProp(page: Page, propName: string, value: string): Promise<void> {
  const codeTab = page.getByRole('tab', { name: 'Codice' });
  if (await codeTab.isVisible().catch(() => false)) {
    await codeTab.click();
  }
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

/**
 * Salva la bozza e attende la conferma; fallisce se compare un 400 o un 409.
 *
 * La conferma si legge dalla notifica (`role="alert"`, Mantine `@mantine/notifications`),
 * non da un `getByText('Bozza salvata')` generico: la chrome full-screen (T-canvas-cleanup)
 * ha aggiunto nel topbar un'etichetta permanente con lo stesso testo esatto quando non ci
 * sono modifiche non salvate (`FullScreenEditorLayout.tsx`), quindi una ricerca per solo
 * testo trova due elementi — violazione di strict mode — non appena la notifica compare
 * sopra un salvataggio già "a riposo".
 */
export async function saveDraft(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Salva bozza' }).click();
  await expect(page.getByRole('alert').getByText('Bozza salvata')).toBeVisible();
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
 *
 * L'attesa esplicita sulla riga (`waitFor`, non un `count()` letto subito dopo `goto`) non è
 * pedanteria: l'elenco si popola da una fetch client-side dopo la navigazione, e un `count()`
 * immediato può leggere zero righe semplicemente perché la risposta non è ancora arrivata —
 * verificato empiricamente scrivendo questo helper: una pulizia "silenziosamente" no-op che
 * lascia Pagine di bozza orfane a ogni run, non un'assenza vera della riga.
 */
export async function deletePageFromUi(page: Page, title: string): Promise<void> {
  await page.goto('/pages');
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
