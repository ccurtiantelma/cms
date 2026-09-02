import { test, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  openContentTab,
  publishFromStatusMenu,
  saveDraft,
  selectBlock,
  selectProp,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * Percorso integrato che nessuno spec esistente copre insieme: uno slug **nidificato**
 * (`/test-parent-.../test-child-...`, ADR-24 § 1) risolto sul sito pubblico, una `section`
 * a **due colonne** (ADR-31) con un `heading` figlio modificato con l'**editing inline** nel
 * canvas (non dall'ispettore, PLAN-F04c-editor-maturo.md T9), e uno **switch di viewport**
 * verso mobile con una prop di stile responsive scritta sotto la chiave `mobile` (ADR-29 § 2)
 * mentre quel viewport è attivo — poi pubblicazione e verifica sul sito pubblico reale
 * (`app/public-site`, F03/ADR-22), incluse le classi CSS delle colonne e dello stile mobile
 * nell'HTML servito (ADR-31 § 7 / ADR-29 Conseguenza).
 *
 * **Il genitore resta in bozza, di proposito, per tutto il test.** ADR-24 § 1 risolve un
 * percorso pubblico scendendo un segmento alla volta su `(locale, parentId, slug)` fra le
 * righe **attive** — non fra le righe **pubblicate**: lo stato (`status`) del genitore non
 * entra nel predicato della query di un segmento intermedio
 * (`public-pages.service.ts`, `resolvePageRow`/`loadActiveBySlugAndParent`, verificato sul
 * codice sorgente, non assunto dall'ADR). Solo l'ultimo segmento — la Pagina foglia — deve
 * essere `published` (`resolveByPath`, controllo su `page.status` dopo la risoluzione). Un
 * genitore in bozza è quindi la verifica più severa di questa regola, non una scorciatoia: se
 * la risoluzione richiedesse (a torto) un antenato pubblicato, questo test fallirebbe con
 * `404` sul passo 7, non silenziosamente.
 */

const TITOLO_GENITORE = 'Pagina genitore — E2E ADR-24/29/31';
const TITOLO_FIGLIA = 'Pagina figlia — E2E ADR-24/29/31';
const TESTO_TITOLO_INLINE = 'Titolo modificato in linea — nidificato, colonne, mobile';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  // La figlia prima del genitore: elimina (soft-delete) la riga che referenzia `parentId`
  // prima della riga referenziata, stesso ordine con cui si romperebbe un vincolo FK reale.
  await deletePageFromUi(page, TITOLO_FIGLIA).catch(() => undefined);
  await deletePageFromUi(page, TITOLO_GENITORE).catch(() => undefined);
});

test('slug nidificato, section a due colonne, editing inline e prop responsive mobile: pubblicato e verificato sul pubblico', async ({
  page,
}) => {
  test.slow();

  // ─── 1. Pagina genitore, creata e lasciata in bozza (vedi commento di testa) ──────────────
  const parentSlug = uniqueSlug('test-parent');
  const parentGuid = await createPageFromUi(page, { title: TITOLO_GENITORE, slug: parentSlug });

  // ─── 2. Pagina figlia, annidata sotto il genitore in bozza (drawer "Nuova Pagina", campo
  // "Pagina genitore (guid)") ─────────────────────────────────────────────────────────────
  const childSlug = uniqueSlug('test-child');
  await createPageFromUi(page, { title: TITOLO_FIGLIA, slug: childSlug, parentGuid });

  await openContentTab(page);

  // ─── 3. Section radice a due colonne (ADR-31, Tab Stile) ──────────────────────────────────
  // `section` non ha alcuna prop `tab:'content'` nel registro (solo le sette di stile,
  // ADR-29/ADR-31): l'ispettore mostra un unico elenco, senza schede — "Colonne" è
  // raggiungibile subito dopo la selezione, senza cliccare "Stile".
  // La Pagina figlia appena creata non parte da un canvas vuoto: il `templateSlug` di
  // default ("empty", RFC-43) porta già una Sezione seed in radice
  // (`page-blueprints.registry.ts`), mai toccata da questo test. `.last()`: la Sezione seed
  // la precede sempre nel DOM, quindi la Sezione di questo test — quella su cui si imposta
  // `columns`/`stylePadding` sotto — è sempre l'ultima, stesso principio di `newSection` in
  // `page-editor-navigator-layouts.spec.ts`. Senza questo scoping `selectBlock`
  // (`.first()` interno) selezionerebbe la Sezione seed invece di quella appena composta.
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section').last();
  await selectBlock(section, 'Sezione');
  await selectProp(page, 'columns', '2');

  // ─── 4. Titolo dentro la section, testo modificato con l'editing inline nel canvas ────────
  // Il nodo è `contentEditable` quando selezionato (`Heading.tsx`, `editable`/`onTextChange`
  // passati da `EditorBlockWrapper.tsx` solo sul blocco selezionato): niente ispettore per il
  // testo, il commit avviene al `blur`.
  await addChildBlock(section, 'Titolo');
  const heading = blockOfType(section, 'heading');
  await selectBlock(heading, 'Titolo');
  const headingText = heading.locator('[contenteditable="true"]');
  await headingText.fill(TESTO_TITOLO_INLINE);
  await headingText.blur();

  // ─── 5. Viewport mobile, poi una prop di stile responsive della section ───────────────────
  // Cambiare il controllo mentre il viewport attivo è "mobile" scrive
  // `{ ...valore, mobile: 'md' }`, mai un valore scalare che sovrascriverebbe `default`
  // (`PropertyInspector.tsx`, `breakpointKey`/`activeBreakpoint`, ADR-29 § 2).
  await page.getByRole('button', { name: 'Viewport Mobile' }).click();
  // Il Titolo resta il nodo selezionato dal passo 4. Il pulsante di toolbar "Seleziona il
  // blocco padre", che risaliva alla section senza un secondo click sul canvas, non esiste
  // più (bug applicativo reale — la vecchia toolbar per-blocco che lo esponeva è stata
  // rimossa dal restyle "Elementor Pro Twin", segnalato nel report del test engineer): si
  // riseleziona la section direttamente, dal locator già in scope dal passo 3.
  await selectBlock(section, 'Sezione');
  await selectProp(page, 'stylePadding', 'md');

  // ─── 6. Salvo la bozza (nessun 400, nessun 409) ────────────────────────────────────────────
  await saveDraft(page);

  // ─── 7. Pubblico — solo la foglia. Il genitore resta in bozza per l'intero test ───────────
  await publishFromStatusMenu(page);

  const vediPagina = page.getByRole('link', { name: 'Vedi pagina' });
  await expect(vediPagina).toBeVisible();
  const publicUrl = (await vediPagina.getAttribute('href')) as string;
  expect(publicUrl, 'il dettaglio deve esporre l’URL pubblico nidificato di una Pagina pubblicata').toBeTruthy();
  // La catena degli antenati (`usePublicPageUrl`) risale fino al genitore in bozza: la
  // ownership/leggibilità admin del genitore non richiede che sia pubblicato.
  expect(publicUrl).toContain(`/${parentSlug}/${childSlug}`);

  // ─── 8. Verifica sul sito pubblico reale: 200, testo modificato, colonne e stile mobile ───
  const publicResponse = await page.request.get(publicUrl);
  expect(publicResponse.status()).toBe(200);
  const html = await publicResponse.text();

  // Il testo modificato con l'editing inline è quello davvero pubblicato.
  expect(html).toContain(TESTO_TITOLO_INLINE);

  // Layout a griglia a due colonne (ADR-31 § 7): il renderer emette una classe per
  // `columns_default_2` — verificato sul CSS Modules realmente prodotto dalla build di
  // `app/public-site` (il generatore preserva slot/breakpoint/token nel nome della classe
  // anche in produzione, solo l'hash finale cambia a ogni build).
  expect(html).toContain('_columns_default_2_');

  // Prop responsive scritta sotto `mobile` (ADR-29 Conseguenza): il renderer deve emettere
  // anche questa classe, non solo quella di `default` — un renderer che la ignorasse
  // perderebbe in silenzio il valore salvato per il breakpoint mobile.
  expect(html).toContain('_padding_mobile_md_');
});
