import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  indentBlock,
  openContentTab,
  outdentBlock,
  redoLastChange,
  saveDraft,
  selectBlock,
  uniqueSlug,
  undoLastChange,
} from './helpers/page-editor';

/**
 * E2E dell'upgrade editor di F04b (round F04b, voce TODO 3.11 — implementato senza alcun
 * test end-to-end). Copre, dal solo browser e senza mai passare dallo store direttamente:
 *
 * 1. Un giro reale undo → redo → salva, sulla toolbar in cima al canvas.
 * 2. L'inserimento posizionale fra contenitori (`moveNodeToAction`).
 *
 * **Deviazione dal round F04b originale, dichiarata nel report del test engineer**: allora
 * l'operazione era esposta da una coppia di pulsanti di toolbar, autosufficienti ("porta
 * dentro il contenitore precedente" / "porta fuori dal contenitore"). Dal restyle "Elementor
 * Pro Twin" quella toolbar (e quei due pulsanti) non esiste più — verificato sul codice
 * sorgente, nessuna voce equivalente nel menu contestuale (`CanvasContextMenu.tsx`, solo
 * "Sposta su/giù" fra fratelli, mai un cambio di profondità). L'unico percorso oggi
 * funzionante per cambiare il genitore di un blocco è il trascinamento a puntatore nel
 * pannello Struttura (`indentBlock`/`outdentBlock`, ora basati su
 * `dragTreeNodeOnto`/`treeNodeRow`, `helpers/page-editor.ts`) — con un limite reale, non di
 * questo test: il bersaglio del trascinamento dev'essere un **figlio già esistente** del
 * contenitore di destinazione, mai il contenitore vuoto stesso (vedi il commento di testa di
 * `dragTreeNodeOnto`). Il test compone quindi la Pagina con due blocchi "ancora" in più
 * (un'Immagine dentro la Sezione, un Pulsante di radice dopo il Titolo) al solo scopo di
 * avere bersagli validi per il trascinamento — mai controllati dalle asserzioni oltre alla
 * loro presenza.
 *
 * Non ripete la copertura di `page-editor.spec.ts` (percorso completo di creazione/
 * composizione/pubblicazione) né quella di `page-editor-conflitto.spec.ts` (409
 * ottimistico): qui il fuoco è solo sulla history e sullo spostamento fra contenitori.
 */

const TITOLO_PAGINA = 'Undo redo e spostamento — E2E F04b';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('undo → redo → salva: la modifica annullata e poi ripristinata sopravvive al salvataggio', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('undo-redo-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // Annulla/ripristina partono disabilitati: storia vuota.
  await expect(page.getByRole('button', { name: "Annulla l'ultima modifica" })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ripristina la modifica annullata' })).toBeDisabled();

  // La Pagina appena creata non parte da un canvas vuoto: il `templateSlug` di default
  // ("empty", RFC-43) porta già una Sezione seed in radice (`page-blueprints.registry.ts`).
  // Si legge il conteggio iniziale per calcolare il delta invece di assumere una radice che
  // parte da zero — stesso principio di `page-editor-elementor.spec.ts`.
  const initialSectionCount = await blockOfType(page, 'section').count();

  // Una modifica: aggiungo una section in radice.
  await addRootBlock(page, 'Sezione');
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);
  await expect(page.getByRole('button', { name: "Annulla l'ultima modifica" })).toBeEnabled();

  // Annullo: la section sparisce, "Ripristina" ora è disponibile.
  await undoLastChange(page);
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount);
  await expect(page.getByRole('button', { name: "Annulla l'ultima modifica" })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ripristina la modifica annullata' })).toBeEnabled();

  // Ripristino: la section torna.
  await redoLastChange(page);
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);
  await expect(page.getByRole('button', { name: 'Ripristina la modifica annullata' })).toBeDisabled();

  // Salvo: nessun 400/409, e il contenuto ripristinato (non quello annullato) è ciò che
  // sopravvive al reload — la prova che "annulla poi ripristina" non è un no-op nella UI
  // ma nello store che alimenta il salvataggio.
  await saveDraft(page);
  await page.reload();
  await openContentTab(page);
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);
});

test('inserimento posizionale: porto un blocco dentro il contenitore precedente e poi fuori di nuovo', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('indent-outdent-e2e');
  await createPageFromUi(page, { title: TITOLO_PAGINA, slug });
  await openContentTab(page);

  // Sezione con un figlio "sacrificale" (Testo/richText — scelto apposta: unico tipo la cui
  // prop obbligatoria ammette esplicitamente la stringa vuota, `rich-text.block.ts`,
  // "Stringa vuota ammessa"; un'Immagine richiederebbe un `mediaRef` reale mai impostato, un
  // Pulsante un `href` che il validatore respinge comunque vuoto — nessuno dei due
  // salverebbe mai la bozza senza compilare prop non pertinenti a questo test; mai
  // controllato dalle asserzioni oltre alla sua presenza): il pannello Struttura sposta il
  // nodo trascinato accanto alla riga sorvolata, mai "dentro" la riga di un contenitore
  // ancora privo di figli — un contenitore vuoto non è oggi raggiungibile da nessun percorso
  // "indent" dell'editor (bug applicativo reale, segnalato nel report del test engineer,
  // vedi il commento di testa di `dragTreeNodeOnto`, `helpers/page-editor.ts`). Un secondo
  // blocco di radice, dopo il Titolo (qui un Pulsante, mai controllato dalle asserzioni oltre
  // alla sua presenza — la sua prop obbligatoria non viene mai letta, solo la sua posizione),
  // è l'ancora su cui atterra l'"outdent": senza una riga di radice **dopo** la Sezione, non
  // c'è modo di far rientrare il Titolo esattamente dopo di lei (il trascinamento inserisce
  // sempre "prima della riga sorvolata", mai "in fondo alla lista" — stesso limite).
  // La Pagina appena creata non parte da un canvas vuoto: il `templateSlug` di default
  // ("empty", RFC-43) porta già una Sezione seed in radice, mai toccata da questo test
  // (`page-blueprints.registry.ts`).
  await addRootBlock(page, 'Sezione');
  // `.last()`: la Sezione seed la precede sempre nel DOM (mai spostata, resta prima in
  // radice), quindi la Sezione di questo test è sempre l'ultima — stesso principio di
  // `newSection` in `page-editor-navigator-layouts.spec.ts`.
  const section = blockOfType(page, 'section').last();
  await addChildBlock(section, 'Testo');
  await addRootBlock(page, 'Titolo');
  await addRootBlock(page, 'Pulsante');
  // L'ancora "Pulsante" ha due prop obbligatorie che il validatore server-side respinge
  // vuote per davvero (`href`, `kind: 'url'`: una stringa vuota non è uno schema ammesso,
  // indipendentemente da `nonEmpty` — a differenza di `richText`/`heading.text`, che quel
  // flag non lo dichiarano affatto): a differenza del filler "Testo" sopra, questa non può
  // restare mai toccata, va compilata subito o il salvataggio finale fallirebbe per
  // validazione, non per lo spostamento.
  await selectBlock(blockOfType(page, 'button'), 'Pulsante');
  await fillProp(page, 'label', 'Ancora');
  await fillProp(page, 'href', 'https://esempio.test/ancora');

  // Tipi dei soli blocchi di radice: quelli il cui `[data-block-type]` più vicino, salendo
  // nel DOM, è se stesso — un blocco annidato ha sempre un antenato `[data-block-type]`.
  const tipiDiRadice = () =>
    page.locator('[data-block-type]').evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.parentElement?.closest('[data-block-type]') ?? null) === null)
        .map((node) => node.getAttribute('data-block-type')),
    );
  // La Sezione seed (mai toccata, sempre prima in radice) va come prefisso di ogni sequenza
  // attesa — vedi il commento sopra `section`.
  await expect.poll(tipiDiRadice).toEqual(['section', 'section', 'heading', 'button']);
  await expect(blockOfType(section, 'heading')).toHaveCount(0);

  // "Porta dentro": il titolo di radice entra nella Sezione, sorvolando (nel pannello
  // Struttura) la riga del suo figlio Testo già presente.
  await indentBlock(page, 'Titolo', 'Testo');

  await expect.poll(tipiDiRadice).toEqual(['section', 'section', 'button']);
  await expect(blockOfType(section, 'heading')).toHaveCount(1);

  // "Porta fuori": lo riporto al livello di radice, sorvolando la riga del Pulsante — che
  // lo fa atterrare esattamente fra la Sezione e il Pulsante, cioè subito dopo la Sezione.
  await outdentBlock(page, 'Titolo', 'Pulsante');

  await expect.poll(tipiDiRadice).toEqual(['section', 'section', 'heading', 'button']);
  await expect(blockOfType(section, 'heading')).toHaveCount(0);

  // Compilo la prop richiesta (altrimenti il salvataggio è respinto per validazione, non
  // per lo spostamento) e salvo: la posizione finale sopravvive al reload.
  await selectBlock(blockOfType(page, 'heading'), 'Titolo');
  await fillProp(page, 'text', 'Titolo portato fuori');

  await saveDraft(page);
  await page.reload();
  await openContentTab(page);
  await expect.poll(tipiDiRadice).toEqual(['section', 'section', 'heading', 'button']);
});
