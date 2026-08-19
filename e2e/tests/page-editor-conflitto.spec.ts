import { test, expect, type Page } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  openContentTab,
  selectBlock,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * Conflitto di editing ottimistico fra due sessioni sulla stessa Pagina
 * (CLAUDE.md § Divieti assoluti: "overwrite silenzioso — sempre 409").
 *
 * Il punto del test non è che compaia un 409: quello è già coperto a livello di
 * API (`app/backend/test/e2e/pages.e2e-spec.ts`). Qui si verifica ciò che il
 * backend da solo non può dimostrare — che **nessuna modifica della prima
 * sessione vada persa** quando la seconda salva su una `version` ormai vecchia,
 * e che la seconda lo scopra da un messaggio esplicito invece che dal contenuto
 * sparito.
 *
 * L'ordine dei passaggi è l'unica parte fragile e va rispettato: la seconda
 * sessione deve **caricare la Pagina prima** che la prima salvi, altrimenti
 * partirebbe già dalla `version` aggiornata e non ci sarebbe alcun conflitto da
 * osservare.
 */

const TITOLO_PAGINA = 'Due sessioni — E2E F04';
const TESTO_DI_A = 'Titolo scritto dalla sessione A';
const TESTO_DI_B = 'Titolo scritto dalla sessione B';

/** Aggiunge una `section` con un `heading` compilato: la modifica minima di una sessione. */
async function comporreTitolo(page: Page, testo: string): Promise<void> {
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section');
  await addChildBlock(section, 'Titolo');
  await selectBlock(blockOfType(section, 'heading'), 'Titolo');
  await fillProp(page, 'text', testo);
}

test('due sessioni sulla stessa Pagina: la seconda riceve 409 e le modifiche della prima restano', async ({
  browser,
}) => {
  test.slow();

  // Due contesti distinti — due sessioni vere, con cookie e storage separati —
  // che partono entrambi dalla stessa identità già autenticata: il conflitto da
  // osservare è sulla `version` della riga, non su chi è collegato.
  const contestoA = await browser.newContext({
    storageState: ADMIN_STORAGE_STATE,
  });
  const contestoB = await browser.newContext({
    storageState: ADMIN_STORAGE_STATE,
  });
  const sessioneA = await contestoA.newPage();
  const sessioneB = await contestoB.newPage();

  try {
    // ─── 1. La sessione A crea la Pagina e apre l'editor ────────────────────
    const guid = await createPageFromUi(sessioneA, {
      title: TITOLO_PAGINA,
      slug: uniqueSlug('conflitto-e2e'),
    });
    await openContentTab(sessioneA);

    // ─── 2. La sessione B apre la stessa Pagina, PRIMA che A salvi ──────────
    // È qui che B fotografa la `version` che diventerà obsoleta.
    await sessioneB.goto(`/pages/${guid}`);
    await openContentTab(sessioneB);
    await expect(sessioneB.getByText('La bozza non contiene ancora blocchi')).toBeVisible();

    // ─── 3. A compone e salva: la sua bozza è ora quella persistita ─────────
    await comporreTitolo(sessioneA, TESTO_DI_A);
    await sessioneA.getByRole('button', { name: 'Salva bozza' }).click();
    await expect(sessioneA.getByText('Bozza salvata')).toBeVisible();

    // ─── 4. B compone sulla version vecchia e salva: 409 ────────────────────
    await comporreTitolo(sessioneB, TESTO_DI_B);
    await sessioneB.getByRole('button', { name: 'Salva bozza' }).click();

    // Messaggio dedicato al conflitto di editing, distinto da quello di slug
    // duplicato: nomina il problema e offre l'unica via d'uscita corretta.
    await expect(sessioneB.getByText('Conflitto di editing', { exact: true })).toBeVisible();
    await expect(
      sessioneB.getByText('La pagina è stata modificata da un altro utente'),
    ).toBeVisible();
    await expect(sessioneB.getByText('Bozza salvata')).toHaveCount(0);

    // Nessun overwrite silenzioso *nemmeno lato client*: B tiene ancora in mano
    // il proprio lavoro non salvato, non se lo vede sostituire di soppiatto.
    await expect(sessioneB.getByText(TESTO_DI_B)).toBeVisible();

    // ─── 5. Il lavoro di A è intatto: lo si verifica ricaricando davvero ────
    await sessioneA.getByRole('button', { name: 'Ricarica' }).click();
    await openContentTab(sessioneA);
    await expect(sessioneA.getByText(TESTO_DI_A)).toBeVisible();
    await expect(sessioneA.getByText(TESTO_DI_B)).toHaveCount(0);

    // ─── 6. B ricarica dalla notifica e riparte dal contenuto vero ──────────
    await sessioneB.getByRole('button', { name: 'Ricarica la Pagina' }).click();
    await openContentTab(sessioneB);
    await expect(sessioneB.getByText(TESTO_DI_A)).toBeVisible();
    await expect(sessioneB.getByText(TESTO_DI_B)).toHaveCount(0);

    // ─── 7. Ripartita dalla version giusta, B può salvare ───────────────────
    // Il 409 è un invito a riprovare informati, non un vicolo cieco.
    await selectBlock(blockOfType(sessioneB, 'heading'), 'Titolo');
    await fillProp(sessioneB, 'text', `${TESTO_DI_A} — poi rivisto da B`);
    await sessioneB.getByRole('button', { name: 'Salva bozza' }).click();
    await expect(sessioneB.getByText('Bozza salvata')).toBeVisible();
  } finally {
    // Pulizia dei dati di verifica dalla stessa interfaccia del test, prima di
    // chiudere le sessioni. Best-effort: un fallimento qui non deve coprire
    // l'errore vero di un test già rosso.
    await deletePageFromUi(sessioneA, TITOLO_PAGINA).catch(() => undefined);
    await contestoA.close();
    await contestoB.close();
  }
});
