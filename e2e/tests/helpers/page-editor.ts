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
  try {
    await page.goto('/pages');
  } catch (error: unknown) {
    if (error instanceof Error && /invalid url/i.test(error.message)) {
      throw new Error(
        'createPageFromUi: impossibile navigare verso /pages; configura Playwright use.baseURL (E2E_BASE_URL).',
        { cause: error },
      );
    }
    throw error;
  }
  await page.getByRole('button', { name: 'Nuova Pagina' }).click();

  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Titolo').fill(title);
  await drawer.getByLabel('Slug').fill(slug);
  // "Locale" arriva già compilato a it-IT dal form di creazione: non si tocca.
  if (parentGuid) {
    await drawer.getByLabel('Pagina genitore (guid)').fill(parentGuid);
  }
  await drawer.getByRole('button', { name: 'Salva' }).click();

  // `?tab=content` in coda: comportamento applicativo reale osservato dopo la creazione
  // (non più il solo `/pages/{guid}` di quando questo helper è stato scritto) — la regex
  // e l'estrazione del guid tollerano la query string invece di dipendere dalla forma
  // esatta dell'URL post-navigazione.
  await expect(page).toHaveURL(/\/pages\/[0-9a-f]{16}(\?.*)?$/);
  const guid = page.url().match(/\/pages\/([0-9a-f]{16})/)?.[1] as string;
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
 * bloccava i trigger di inserimento del canvas). Un secondo `click()` su una
 * scheda già selezionata non cambierebbe comunque stato — è ridondante, e qui l'unico
 * segno visibile del problema: evitarlo elimina la sola chiamata che lo richiederebbe.
 */
export async function openContentTab(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Contenuto' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
  await expect(saveButton(page)).toBeVisible();
}

/**
 * Il pulsante che salva la bozza dell'editor full-screen (`Toolbar.tsx`).
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: la
 * sua etichetta accessibile è **"Pubblica"** (icona `IconDeviceFloppy`, un dischetto), non
 * più "Salva bozza" — verificato sul DOM reale (`error-context.md` di un run fallito) e sul
 * sorgente: `Toolbar.tsx` renderizza `<Button onClick={onPublish}>Pubblica</Button>`, ma
 * `FullScreenEditorLayout.tsx` collega quella stessa prop `onPublish` a `onSaveDraft` — il
 * pulsante **salva la bozza**, non pubblica nulla (nessuna chiamata allo stato
 * `published` dietro questo click), ma il testo mostrato dice l'opposto. Un utente reale
 * leggerebbe "Pubblica" e crederebbe di star pubblicando. La pubblicazione vera resta,
 * invariata, quella raggiunta da {@link publishFromStatusMenu} (tendina di stato, dialog
 * "Conferma cambio di stato"): nessuna ambiguità nel comportamento, solo nell'etichetta.
 * `exact: true` evita ambiguità con l'omonimo pulsante di quel dialog (scope diverso, mai
 * visibile insieme a questo).
 */
function saveButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Pubblica', exact: true });
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

/**
 * Completa l'inserimento di una `section` dal modal "Quale layout desideri utilizzare?"
 * (ADR-33 § 7, `SectionStructureModal.tsx`): la voce "Sezione" di **ogni** `BlockPalette`
 * (radice, dentro un contenitore, "Inserisci Prima/Dopo") apre sempre questo modal a due
 * passi invece di creare direttamente il blocco — mai una scorciatoia diretta, comportamento
 * indipendente dal restyle "Elementor Pro Twin" e preesistente ad esso. Sceglie sempre lo
 * stesso percorso, il più semplice: layout "Flexbox", preset "Colonna" (1 colonna, gli
 * stessi default puri del registro prima che l'utente scelga altro).
 */
async function completeSectionStructureModal(page: Page): Promise<void> {
  // Un solo `role="dialog"` alla volta in tutto l'editor (stesso principio già in uso per
  // `role="menu"` altrove in questo file): niente filtro per titolo, che cambierebbe
  // `Locator` mid-flusso. `SectionStructureModal.tsx` cambia il proprio titolo fra il primo
  // passo ("Quale layout desideri utilizzare?") e il secondo ("Seleziona la tua struttura",
  // via `<Text>` accanto a un `<ActionIcon>` "Torna alla scelta del tipo di layout" — non
  // più solo testo semplice) — un `Locator` filtrato per `hasText` sul titolo iniziale
  // smette di risolvere non appena quel titolo cambia: `dialog.getByRole('button', { name:
  // 'Colonna' })` non troverebbe più nulla, in attesa per sempre di un genitore ormai vuoto.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Quale layout desideri utilizzare?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Flexbox', exact: true }).click();
  await dialog.getByRole('button', { name: 'Colonna', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Aggiunge un blocco alla radice dell'albero, dal trigger "Aggiungi widget" della zona
 * fissa in fondo al canvas.
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: il
 * vecchio pulsante testuale "Aggiungi blocco in fondo" non esiste più — la zona di coda del
 * canvas è ora `CanvasAddSectionZone.tsx` (restyle "Elementor Pro Twin"), tre `ActionIcon`
 * icon-only senza quel testo. Il terzo (icona `IconSparkles`, tooltip/aria-label "Aggiungi
 * widget") monta comunque la stessa `BlockPalette` generica di sempre — stesso `role="menu"`,
 * stesse voci — solo il trigger è cambiato. `CanvasAddSectionZone` resta sempre montata in
 * fondo alla radice (ad albero vuoto o pieno, `EditorCanvas.tsx`: `index={0}` nel primo caso,
 * `index={rootIds.length}` nel secondo), quindi questo trigger aggiunge sempre in coda alla
 * radice, indipendentemente da quanti blocchi ci siano già — stesso comportamento della
 * funzione precedente. Deviazione già riscontrata e aggirata localmente da
 * `global-sections-ssr.spec.ts` (`addRootBlockViaWidgetMenu`, ora superflua: usa questo
 * helper condiviso).
 */
export async function addRootBlock(page: Page, label: string): Promise<void> {
  const dropdown = await openPalette(page.getByRole('button', { name: 'Aggiungi widget' }));
  await dropdown.getByRole('menuitem', { name: label, exact: true }).click();
  if (label === 'Sezione') {
    await completeSectionStructureModal(page);
  }
}

/**
 * Aggiunge un blocco dentro un contenitore (`section`/`container`).
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: il
 * trigger dedicato "Aggiungi dentro", sempre presente nella vecchia toolbar integrata, non
 * esiste più in nessuna forma per un contenitore che ha **già** almeno un figlio — verificato
 * sul JSX reale di `EditorBlockWrapper.tsx`: l'unico `BlockPalette` di un contenitore vive
 * dentro il ramo `childIds.length === 0` (segnaposto "Contenitore vuoto"/"Colonna vuota",
 * `label` "Aggiungi Blocco"/"Aggiungi blocco" a seconda del numero di colonne); il ramo con
 * figli (`childrenArea`) li renderizza e basta, nessun trigger di coda. L'unico percorso
 * rimasto per aggiungere un **secondo** figlio è "Inserisci Dopo" dal menu contestuale
 * (tasto destro, `CanvasContextMenu.tsx`) sull'ultimo figlio già presente — che riapre la
 * stessa `BlockPalette` generica, ancorata lì (`insertFlow`, stesso `role="menu"`).
 *
 * Questo helper sceglie da solo il percorso giusto: se il trigger del segnaposto vuoto è
 * visibile lo usa (contenitore ancora vuoto), altrimenti apre "Inserisci Dopo" sull'ULTIMO
 * discendente `[data-block-id]` presente — assume che quel discendente sia una foglia diretta
 * del contenitore (vero per ogni chiamata esistente: `heading`/`richText`/`button`, mai
 * annidati), non un algoritmo generale di ricerca dell'ultimo figlio diretto a profondità
 * arbitraria.
 */
export async function addChildBlock(container: Locator, label: string): Promise<void> {
  const page = container.page();
  const emptyTrigger = container.getByRole('button', { name: /^Aggiungi [Bb]locco$/ }).first();
  if (await emptyTrigger.isVisible().catch(() => false)) {
    const dropdown = await openPalette(emptyTrigger);
    await dropdown.getByRole('menuitem', { name: label, exact: true }).click();
    if (label === 'Sezione') {
      await completeSectionStructureModal(page);
    }
    return;
  }

  const lastChild = container.locator('[data-block-id]').last();
  await lastChild.click({ button: 'right' });
  const contextMenu = page.getByRole('menu');
  await expect(contextMenu).toBeVisible();
  // Da tastiera, non `.click()`: il menu contestuale del canvas non ha `zIndex={1100}` come
  // ogni altro popover dell'editor — bug applicativo reale, vedi il commento di testa di
  // {@link activateMenuItem}.
  await activateMenuItem(contextMenu.getByRole('menuitem', { name: 'Inserisci Dopo', exact: true }));

  // Il click sopra chiude il menu contestuale e ne riapre subito un altro (stesso
  // `BlockPalette` generico, ancorato allo stesso punto — `CanvasContextMenu.tsx`,
  // `insertFlow`). `.last()`, non una ricerca nuda: il primo menu, in chiusura, resta nel DOM
  // per la sua transizione d'uscita — **verificato sul DOM reale**, in quella finestra
  // `getByRole('menu')` risolve a **due** elementi (violazione di strict mode), non uno solo
  // come assumeva questa nota prima di verificarlo di persona. Il nuovo menu, montato dopo,
  // è sempre l'ultimo nell'ordine del DOM.
  const insertMenu = page.getByRole('menu').last();
  await expect(insertMenu).toBeVisible();
  await insertMenu.getByRole('menuitem', { name: label, exact: true }).click();
  if (label === 'Sezione') {
    await completeSectionStructureModal(page);
  }
}

/**
 * Seleziona un blocco portando il fuoco sul suo wrapper nel canvas e premendo Invio — mai
 * `.click()`.
 *
 * Fino al round T-canvas-cleanup il bersaglio di selezione era un `UnstyledButton` testuale
 * (`getByRole('button', { name: label })`); quel bottone è stato rimosso a favore del
 * wrapper del blocco stesso (`div[data-block-type]`, `tabIndex=0` + `aria-label`, **senza**
 * `role="button"` esplicito) — un `<div>` con solo `tabIndex` non riceve il ruolo ARIA
 * "button" per costruzione, quindi `getByRole('button', …)` su quel bersaglio non trova più
 * nulla. Questo helper porta il fuoco su `block` stesso (il locator del wrapper, tipicamente
 * `blockOfType(...)`), non un discendente cercato per ruolo — `label` resta nella firma solo
 * per la leggibilità dei call site, non è più usato per la ricerca. Segnalato nel report del
 * test engineer: un `<div>` interattivo senza `role="button"` è anche una regressione di
 * accessibilità reale, non solo un problema di questo helper.
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: un
 * `.click()` sul wrapper non è affidabile — le zone di rilascio invisibili "prima"/"dopo" di
 * un blocco vicino (`.dropZone`/`EditorBlockWrapper.tsx`, mai pensate per uscire dai confini
 * del proprio blocco) possono coprire il punto di click di un fratello quando i blocchi sono
 * compatti (poco testo, sezione corta) — stesso bug già visto e documentato in
 * `dragTreeNodeOnto`, qui contro il click di selezione invece che contro un trascinamento.
 * Il wrapper gestisce già Invio/Spazio come selezione (`onKeyDown`, `EditorBlockWrapper.tsx`,
 * solo quando l'evento arriva dal wrapper stesso, mai da un discendente): il fuoco da
 * tastiera bypassa l'hit-test del punto, esattamente come {@link activateMenuItem}.
 */
export async function selectBlock(block: Locator, _label: string): Promise<void> {
  const target = block.first();
  await target.focus();
  await target.page().keyboard.press('Enter');
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

/**
 * Apre il menu contestuale (tasto destro) di un blocco, individuato dal suo wrapper nel
 * canvas (`[data-block-id]`, letto da `CanvasContextMenu.tsx`), e ne restituisce il
 * `role="menu"`.
 */
async function openBlockContextMenu(block: Locator): Promise<Locator> {
  await block.first().click({ button: 'right' });
  const menu = block.page().getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Attiva una voce del menu contestuale del canvas da tastiera (focus + Invio), mai da
 * `.click()`.
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**:
 * `CanvasContextMenu.tsx` monta il proprio `<Menu>` **senza** `zIndex={1100}` — a
 * differenza di ogni altro popover/modal montato dentro l'editor (`BlockPalette.tsx`,
 * `SectionStructureModal.tsx`, `ConfirmModal` di `EditorBlockWrapper.tsx`/
 * `EditorStructureNavigator.tsx`, tutti con quello stesso valore esplicito "sopra la chrome
 * full-screen dell'editor, z-index 1000"). **Verificato sul DOM reale** (`getComputedStyle`
 * + `document.elementFromPoint` alle coordinate della voce di menu): il suo dropdown resta a
 * z-index 300 (default Mantine) dentro un portale che sta comunque dietro
 * `FullScreenEditorLayout` (z-index 1000, ADR-32) — le voci sono presenti, visibili, ma un
 * clic reale su qualunque punto del menu può essere intercettato da un elemento del canvas
 * sottostante (`CanvasAddSectionZone`, una `dropZone`, …) invece di raggiungere il menu.
 * `.click()` su queste voci resta quindi non affidabile — a volte funziona (nessun elemento
 * del canvas nel punto esatto), a volte no, a seconda di *dove* il tasto destro è stato
 * premuto. Il focus da tastiera bypassa il problema: non dipende dall'hit-test del
 * puntatore, solo dal fuoco dell'elemento — **verificato empiricamente** che porta a
 * termine l'azione anche quando `.click()` sullo stesso elemento resterebbe bloccato in
 * attesa per sempre.
 */
export async function activateMenuItem(item: Locator): Promise<void> {
  await item.focus();
  await item.page().keyboard.press('Enter');
}

/**
 * Elimina un blocco dal menu contestuale (tasto destro, `CanvasContextMenu.tsx`, voce
 * "Elimina").
 *
 * **Deviazione dichiarata rispetto alla vecchia toolbar** (documentata a testa di
 * `EditorBlockWrapper.tsx`, "Duplica"/"Elimina" testuali spostate al menu contestuale): la
 * "x" della nuova Handle Bar di Sezione (`isSection && (isHovered || isSelected)`,
 * `EditorBlockWrapper.tsx`) apre ancora un `ConfirmModal` di conferma, ma è **un secondo
 * percorso**, distinto e più stretto (solo blocchi `section`) — nessun test qui lo esercita.
 * Questo helper passa sempre dal menu contestuale, disponibile per **ogni** tipo di blocco
 * (sezioni incluse): lì "Elimina" chiama `removeBlockAction` **direttamente**, senza alcuna
 * conferma, più `notifications.show({ message: 'Blocco eliminato.' })` — verificato sul
 * codice sorgente (`CanvasContextMenu.tsx`), nessuna eccezione per tipo. Non c'è quindi
 * alcun dialog da attendere qui: si aspetta la notifica.
 *
 * `block` deve individuare univocamente il blocco (tipicamente `blockOfType(...)`, dopo un
 * eventuale `.first()`/filtro a monte) — non più `page`+etichetta: l'`aria-label`
 * `` `Elimina il blocco ${label}` `` della vecchia toolbar non esiste più su un blocco che
 * non sia una `section` selezionata/in hover.
 */
export async function deleteBlock(block: Locator, _blockLabel: string): Promise<void> {
  const menu = await openBlockContextMenu(block);
  await activateMenuItem(menu.getByRole('menuitem', { name: 'Elimina', exact: true }));
  await expect(block.page().getByRole('alert').getByText('Blocco eliminato.')).toBeVisible();
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
 * Apre il pannello "Struttura" (`EditorStructureNavigator.tsx`, toggle in topbar
 * `aria-label="Pannello struttura"`), se non è già aperto, e ne restituisce il contenitore
 * (`<aside aria-label="Struttura della pagina">`, `FullScreenEditorLayout.tsx`).
 */
export async function openStructurePanel(page: Page): Promise<Locator> {
  const toggle = page.getByRole('button', { name: 'Pannello struttura' });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }
  const panel = page.getByRole('complementary', { name: 'Struttura della pagina' });
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * La riga di un nodo nel pannello Struttura, individuata dalla sua etichetta — la stessa
 * etichetta del registro finché la prop testuale del nodo resta vuota, es. "Sezione"/"Titolo".
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: il
 * commento di testa di `EditorStructureNavigator.tsx` (`StructureNode`) dichiara che
 * `NavLink` senza `href` rende un `<button>` — falso, verificato sul DOM reale
 * (`element.outerHTML`): Mantine qui monta un `<a class="mantine-NavLink-root">` **senza**
 * l'attributo `href`, che non porta alcun ruolo ARIA implicito (né "link", che richiede
 * `href`, né "button") — irraggiungibile da `getByRole('button', …)`. Si individua perciò la
 * riga dal testo visibile della sua etichetta (`<span class="mantine-NavLink-label">`),
 * l'unico segnale accessibile rimasto.
 */
export function treeNodeRow(page: Page, label: string): Locator {
  return page
    .getByRole('complementary', { name: 'Struttura della pagina' })
    .getByText(label, { exact: true });
}

/**
 * Trascina a puntatore, nel pannello Struttura, il nodo `sourceLabel` fino al centro della
 * riga `targetRow`.
 *
 * **Non** il sensore da tastiera di `dragBlockToZone` più sotto: questo pannello ha un
 * `DndContext` proprio (`EditorStructureNavigator.tsx`), con `PointerSensor` (nessun
 * `KeyboardSensor` registrato) e `collisionDetection={closestCenter}` — a differenza del
 * `DndContext` condiviso del canvas (`FullScreenEditorLayout.tsx`, `pointerWithin`), qui la
 * collisione è calcolata sui rettangoli misurati, non sulle coordinate dell'evento che ha
 * attivato il gesto.
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**: un
 * `page.mouse.down()` puro sul grip **non parte quasi mai** — verificato sul DOM reale
 * (listener di debug su `pointerdown`/`pointermove`): le zone di rilascio invisibili
 * "prima"/"dopo" del canvas (`.dropZone`/`EditorBlockWrapper.tsx`, mai pensate per uscire
 * dal canvas) misurano `width: 978px`, la larghezza dell'**intera** area di lavoro
 * (canvas + pannello Struttura sommati, non solo il canvas) — un contenitore senza
 * `overflow`/limite proprio che le contiene. Restano invisibili ma non `pointer-events:
 * none`, e portano `zIndex: 1` (una vera posizione nello stacking, non `auto`): quando la
 * `y` del grip nel pannello Struttura coincide con quella di **una qualsiasi** di queste
 * strisce nel canvas (frequente: sono una per ogni confine fra blocchi di radice), il
 * `pointerdown` del mouse ci finisce sopra invece che sul grip, e `PointerSensor` di
 * `EditorStructureNavigator` non si attiva mai — verificato: nessuna classe `dragging`
 * compare mai sulle righe del pannello, il trascinamento finisce in silenzio senza spostare
 * nulla. Il `pointerdown` iniziale è quindi dispatchato **direttamente** sull'elemento del
 * grip (bypassa l'hit-test del punto, mai il selettore) — dnd-kit lo accetta comunque,
 * perché legge l'evento e non si cura di *come* sia arrivato; i movimenti successivi tornano
 * a `page.mouse`, reali, perché una volta afferrato il nodo dnd-kit ascolta
 * `pointermove`/`pointerup` sul `document` intero, indifferente a quale elemento li riceva
 * per primo.
 *
 * **Limite reale, non di questo helper**: il rilascio sposta il nodo trascinato fra i figli
 * del **genitore della riga sorvolata**, alla sua stessa posizione
 * (`handleDragEnd`/`findLocation`, `EditorStructureNavigator.tsx`) — non esiste alcuna
 * semantica "dentro questo contenitore" quando si sorvola la riga del contenitore stesso: la
 * riga bersaglio dev'essere un **figlio già esistente** del contenitore di destinazione. Un
 * contenitore ancora vuoto (nessun figlio, quindi nessuna riga su cui atterrare "dentro") non
 * è raggiungibile da un trascinamento in questo pannello — né, verificato sul codice
 * sorgente, da nessun'altra superficie dell'editor attuale (Handle Bar di Sezione: solo un
 * grip di riordino, non di re-parenting; canvas: `useDraggable` collegato solo al grip della
 * Handle Bar di Sezione, quindi disponibile solo per trascinare una `section`, mai un
 * blocco al suo interno; menu contestuale: solo "Sposta su/giù" fra fratelli, mai un
 * cambio di profondità; `BlockTreeNavigator.tsx`, che offrirebbe la semantica "dentro" per
 * `allowedChildTypes(node.type).length > 0` anche a contenitore vuoto, non è montato in
 * nessun componente dell'app — dead code, verificato con una ricerca globale degli import).
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**:
 * portare un blocco dentro un contenitore ancora vuoto non ha oggi alcun percorso utente.
 */
export async function dragTreeNodeOnto(page: Page, sourceLabel: string, targetRow: Locator): Promise<void> {
  await openStructurePanel(page);
  const grip = page.getByRole('button', {
    name: `Trascina per riordinare il blocco "${sourceLabel}"`,
  });
  const gripHandle = await grip.elementHandle();
  const gripBox = await grip.boundingBox();
  const targetBox = await targetRow.boundingBox();
  if (!gripHandle || !gripBox || !targetBox) {
    throw new Error('dragTreeNodeOnto: origine o destinazione non hanno un bounding box');
  }

  const startX = gripBox.x + gripBox.width / 2;
  const startY = gripBox.y + gripBox.height / 2;

  await page.evaluate(
    ({ el, x, y }) => {
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: y,
        }),
      );
    },
    { el: gripHandle, x: startX, y: startY },
  );
  // Sincronizza la posizione "logica" del mouse di Playwright con quella appena usata per il
  // `pointerdown` sintetico sopra: i passi successivi sono `page.mouse` reali da qui in poi.
  await page.mouse.move(startX, startY);
  // Supera l'`activationConstraint: { distance: 4 }` del `PointerSensor` prima di puntare
  // alla destinazione reale, stesso principio di `dragWidgetTileToZone`
  // (`container-flexbox.spec.ts`).
  await page.mouse.move(startX + 6, startY + 6, { steps: 5 });
  await page.waitForTimeout(150);

  // Tragitto in tanti piccoli passi, ciascuno seguito da un'attesa reale — non un singolo
  // `mouse.move({ steps })`, che interpola le coordinate ma le invia tutte "a raffica" senza
  // lasciare tempo al ciclo di render di React fra l'una e l'altra. `closestCenter` di
  // dnd-kit ricalcola la collisione a ogni `pointermove` sulla base delle posizioni **misurate
  // nel DOM in quel momento** (non della coordinata target finale): con più righe sopra il
  // bersaglio (Sezione seed inclusa, vedi i commenti dei chiamanti) il tragitto è più lungo, e
  // inviare tutte le coordinate intermedie senza attese reali fa perdere a dnd-kit gli
  // aggiornamenti intermedi — **verificato empiricamente**: lo stesso gesto, con lo stesso
  // punto di partenza e arrivo, rilasciava il nodo su se stesso (nessun movimento) quando
  // inviato "a raffica", e lo spostava correttamente quando scandito con `waitForTimeout` fra
  // un micro-passo e l'altro.
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;
  const fromX = startX + 6;
  const fromY = startY + 6;
  const microSteps = 20;
  for (let step = 1; step <= microSteps; step += 1) {
    await page.mouse.move(
      fromX + ((targetX - fromX) * step) / microSteps,
      fromY + ((targetY - fromY) * step) / microSteps,
    );
    await page.waitForTimeout(30);
  }

  await page.waitForTimeout(150);
  await page.mouse.up();
}

/**
 * Sposta `blockLabel` dentro il contenitore, sorvolando (nel pannello Struttura) la riga di
 * un suo figlio già esistente `intoSiblingLabel` — mai il contenitore vuoto, vedi il limite
 * documentato in {@link dragTreeNodeOnto}. Firma diversa dal round F04b (allora un pulsante
 * autosufficiente, `Sposta il blocco … dentro il contenitore precedente`, rimosso insieme al
 * resto della vecchia toolbar): l'operazione oggi è intrinsecamente un trascinamento verso
 * un bersaglio, non più un singolo clic.
 */
export async function indentBlock(page: Page, blockLabel: string, intoSiblingLabel: string): Promise<void> {
  await dragTreeNodeOnto(page, blockLabel, treeNodeRow(page, intoSiblingLabel));
}

/**
 * Porta `blockLabel` fuori dal proprio contenitore, sorvolando (nel pannello Struttura) la
 * riga del fratello di destinazione `afterLabel` al livello superiore — stesso principio di
 * {@link indentBlock}, stesso limite: il fratello di destinazione deve già esistere.
 */
export async function outdentBlock(page: Page, blockLabel: string, afterLabel: string): Promise<void> {
  await dragTreeNodeOnto(page, blockLabel, treeNodeRow(page, afterLabel));
}

/**
 * Riordina un blocco fra i suoi fratelli dal menu contestuale (tasto destro,
 * `CanvasContextMenu.tsx`, voci "Sposta su"/"Sposta giù") — stessa `moveBlockAction` di
 * sempre (mai un cambio di profondità/genitore: per quello vedi {@link dragTreeNodeOnto}).
 * Il vecchio pulsante di toolbar `` `Sposta su il blocco ${label}` `` (e l'equivalente "giù")
 * non esiste più su un blocco che non sia una `section` selezionata/in hover — stessa Handle
 * Bar ristretta di {@link deleteBlock}, stessa deviazione.
 */
export async function reorderBlock(block: Locator, direction: 'up' | 'down'): Promise<void> {
  const menu = await openBlockContextMenu(block);
  const label = direction === 'up' ? 'Sposta su' : 'Sposta giù';
  await activateMenuItem(menu.getByRole('menuitem', { name: label, exact: true }));
}

/**
 * Duplica un blocco dal menu contestuale (tasto destro, `CanvasContextMenu.tsx`, voce
 * "Duplica") — stessa `duplicateNodeAction` di sempre (T7 § Parte 1), solo il trigger è
 * cambiato: il vecchio pulsante di toolbar `` `Duplica il blocco ${label}` `` non esiste
 * più su un blocco che non sia una `section` (vedi {@link deleteBlock}), quindi si passa
 * sempre da qui, valido per ogni tipo.
 *
 * `{ name: 'Duplica' }`, **non** `exact: true`: il nome accessibile reale della voce include
 * la scorciatoia mostrata a schermo, `` `Duplica\nCtrl+D` `` (`rightSection` di
 * `Menu.Item`, `CanvasContextMenu.tsx`) — verificato sul DOM reale — un match esatto contro
 * "Duplica" da solo non risolve mai.
 */
export async function duplicateBlock(block: Locator, _blockLabel: string): Promise<void> {
  const menu = await openBlockContextMenu(block);
  await activateMenuItem(menu.getByRole('menuitem', { name: 'Duplica' }));
}

/**
 * Trascina un blocco fino alla zona di rilascio `targetZone` nel **canvas** (non il pannello
 * Struttura, vedi {@link dragTreeNodeOnto}), usando **solo** il sensore da tastiera di
 * dnd-kit (Space per afferrare/rilasciare, frecce per muovere il "fantasma" di uno scatto
 * fisso alla volta): la via a puntatore richiederebbe passi intermedi sintetici ed è la via
 * fragile, non quella scelta per i test (PLAN-F04c-editor-maturo.md T7/T8). Ogni zona di
 * rilascio porta `data-over="true"` mentre il puntatore/fantasma ci sta sopra
 * (`EditorBlockWrapper.tsx`, `dropZoneAttrs`) — lo stesso segnale che guida l'indicatore
 * visivo di rilascio: qui si preme una freccia alla volta finché la zona attesa non è quella
 * "over", poi si rilascia con Space.
 *
 * Prova prima `primaryDirection`, poi (se non trovata entro metà del budget di passi)
 * l'opposta: il verso giusto dipende dalla posizione relativa nel DOM fra origine e
 * destinazione, che il chiamante non sempre conosce con certezza pixel per pixel.
 *
 * **Doppio bug applicativo reale, segnalato nel report del test engineer, non corretto
 * qui — questo helper non ha oggi alcun chiamante funzionante**:
 * 1. `handleLabel` presuppone un grip di trascinamento raggiungibile per `aria-label` su
 *    **qualunque** blocco (comportamento pre-restyle). Dal restyle "Elementor Pro Twin"
 *    l'unico grip del canvas (`useDraggable`, `attributes`/`listeners` di dnd-kit) vive
 *    nella Handle Bar di Sezione — montata solo per `isSection`, mai per un widget foglia
 *    (`heading`/`richText`/`image`/`button`) o per `container`: **verificato sul codice
 *    sorgente**, `EditorBlockWrapper.tsx` spreads quelle props una volta sola, sul grip
 *    della sezione. Per ogni altro tipo non esiste alcun modo di iniziare un trascinamento
 *    nel canvas.
 * 2. Anche per una `section` (che il grip ce l'ha), il `DndContext` condiviso del canvas
 *    (`FullScreenEditorLayout.tsx`) usa `collisionDetection={pointerWithin}`, che richiede
 *    `pointerCoordinates` reali (`getEventCoordinates(activatorEvent)`,
 *    `@dnd-kit/utilities`) — un `KeyboardEvent` non le porta mai
 *    (`hasViewportRelativeCoordinates` verifica proprio `clientX`/`clientY`), quindi
 *    l'attivazione da tastiera produce sempre `pointerCoordinates: null` e nessuna zona
 *    diventa mai `data-over="true"`: **stesso bug già verificato empiricamente e segnalato
 *    da `container-flexbox.spec.ts`** (`dragWidgetTileToZone`, commento di testa) per un
 *    'altro' draggable nello stesso `DndContext` — la causa è nel `DndContext` condiviso,
 *    non nell'origine del trascinamento, quindi si applica identica anche qui.
 *
 * Il trascinamento fra blocchi esistenti oggi funzionante passa dal pannello Struttura
 * (`dragTreeNodeOnto`, `PointerSensor`+`closestCenter`, un `DndContext` diverso e non
 * affetto dal punto 2). Questa funzione resta esportata, invariata nella logica, per quando
 * il bug 2 sarà risolto lato applicativo — non cancellata silenziosamente.
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
  await saveButton(page).click();
  await expect(page.getByRole('alert').getByText('Bozza salvata')).toBeVisible();
  await expect(page.getByText('Blocco non valido')).toHaveCount(0);
  await expect(page.getByText('Conflitto di editing')).toHaveCount(0);
}

/**
 * Pubblica la Pagina dalla tendina di stato dell'intestazione. La transizione è
 * una sola e vive lì: l'editor non ha un proprio pulsante di pubblicazione — men che meno
 * quello di {@link saveButton} ("Pubblica" di nome, ma solo di nome: vedi il suo commento).
 *
 * **Bug applicativo reale, segnalato nel report del test engineer, non corretto qui**:
 * `PagePageDetail.tsx` porta la tendina di stato a `style={{ zIndex: activeTab === 'content'
 * ? 0 : 1100 }}` — il commento di testa di quella riga argomenta ESATTAMENTE il contrario
 * ("senza [`zIndex 1100`]... il pulsante di stato... resta coperto... quando la scheda
 * Contenuto è attiva... l'unico modo di pubblicare da dentro l'editor sparisce"), ma il
 * ternario applica `1100` proprio quando la condizione è falsa — l'esatto contrario
 * dell'intento dichiarato dal suo stesso commento. Mentre la scheda "Contenuto" è attiva
 * (chrome full-screen dell'editor, z-index 1000, ADR-32) l'intera intestazione della Pagina,
 * `Tabs.List` incluso, resta coperta e non riceve click — **verificato sul DOM reale**:
 * anche il tentativo di cambiare scheda cliccando `Tabs.Tab` fallisce per lo stesso motivo.
 * L'unica via d'uscita è un elemento che vive DENTRO la chrome dell'editor stesso (quindi
 * sopra l'overlay): il link "Torna alla Dashboard" del topbar (`Toolbar.tsx`, un `<a
 * href="/pages/{guid}">` reale, non instradato dal router client-side) — la stessa Pagina,
 * senza `?tab=`, che fa ripartire `PagePageDetail` sulla scheda di default ("Metadati").
 */
export async function publishFromStatusMenu(page: Page): Promise<void> {
  const contentTab = page.getByRole('tab', { name: 'Contenuto' });
  if ((await contentTab.getAttribute('aria-selected')) === 'true') {
    await page.getByRole('link', { name: 'Torna alla Dashboard' }).click();
    await expect(contentTab).toHaveAttribute('aria-selected', 'false');
  }

  // `exact` obbligatorio: il badge "Pubblicata"/altre etichette possono contenere "Bozza"
  // come sottostringa in punti diversi del ciclo di vita della Pagina.
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
