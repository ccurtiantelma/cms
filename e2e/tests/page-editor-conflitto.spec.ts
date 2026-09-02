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

/**
 * Aggiunge una `section` con un `heading` compilato: la modifica minima di una sessione.
 *
 * La Pagina appena creata non parte da un canvas vuoto: il `templateSlug` di default
 * ("empty", RFC-43) porta già una Sezione seed in radice (`page-blueprints.registry.ts`).
 * `.last()`: la Sezione seed la precede sempre nel DOM, quindi la Sezione appena aggiunta
 * qui è sempre l'ultima — senza questo scoping `addChildBlock` (che sceglie il trigger
 * "Contenitore vuoto" ambiguo fra le due Sezioni vuote) rischierebbe di comporre dentro
 * quella sbagliata.
 */
async function comporreTitolo(page: Page, testo: string): Promise<void> {
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section').last();
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
    await expect(sessioneB.getByText('Trascina il widget qui')).toBeVisible();

    // ─── 3. A compone e salva: la sua bozza è ora quella persistita ─────────
    // `{ name: 'Pubblica', exact: true }`, non "Salva bozza": bug applicativo reale,
    // segnalato nel report del test engineer (vedi il commento di testa di `saveButton`,
    // `helpers/page-editor.ts`) — il pulsante che salva la bozza porta oggi l'etichetta
    // "Pubblica" (icona a dischetto), ma non pubblica nulla: `onClick` resta collegato a
    // `onSaveDraft`. `exact: true` lo distingue dall'omonimo bottone del dialog "Conferma
    // cambio di stato" (mai visibile insieme a questo).
    await comporreTitolo(sessioneA, TESTO_DI_A);
    await sessioneA.getByRole('button', { name: 'Pubblica', exact: true }).click();
    // `getByRole('alert')`, non un `getByText` nudo: la chrome full-screen
    // (`FullScreenEditorLayout.tsx`) porta nel topbar un'etichetta permanente con lo
    // stesso testo esatto quando non ci sono modifiche non salvate — una ricerca per
    // solo testo trova due elementi non appena la notifica compare sopra un salvataggio
    // già "a riposo" (stesso motivo già documentato su `saveDraft`, qui duplicato perché
    // il test non passa dall'helper).
    await expect(sessioneA.getByRole('alert').getByText('Bozza salvata')).toBeVisible();

    // ─── 4. B compone sulla version vecchia e salva: 409 ────────────────────
    await comporreTitolo(sessioneB, TESTO_DI_B);
    await sessioneB.getByRole('button', { name: 'Pubblica', exact: true }).click();

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
    // Il bottone "Ricarica" vive nell'intestazione della Pagina (`PagePageDetail.tsx`), non
    // nella chrome dell'editor: mentre la scheda "Contenuto" è attiva quell'intestazione sta
    // dietro la chrome full-screen dell'editor (z-index 1000, ADR-32) e non riceve click —
    // bug applicativo reale, segnalato nel report del test engineer (stesso di
    // `publishFromStatusMenu`, `helpers/page-editor.ts`, ma qui senza nemmeno il tentativo di
    // correzione — errato — che quella tendina porta: nessun `zIndex` esplicito affatto sul
    // `Group` che contiene "Ricarica"). Si esce prima dalla scheda con lo stesso link "Torna
    // alla Dashboard" del topbar dell'editor.
    await sessioneA.getByRole('link', { name: 'Torna alla Dashboard' }).click();
    await sessioneA.getByRole('button', { name: 'Ricarica' }).click();
    await openContentTab(sessioneA);
    await expect(sessioneA.getByText(TESTO_DI_A)).toBeVisible();
    await expect(sessioneA.getByText(TESTO_DI_B)).toHaveCount(0);

    // ─── 6. B ricarica dalla notifica e riparte dal contenuto vero ──────────
    await sessioneB.getByRole('button', { name: 'Ricarica la Pagina' }).click();
    // La notifica di conflitto è `autoClose: false` di proposito (`notifyVersionConflict`,
    // `PagePageDetail.tsx`: resta finché non si agisce consapevolmente) — cliccare la sua
    // azione non la chiude da sola. Da quando le notifiche portano `zIndex={1100}` per
    // restare sopra la chrome full-screen dell'editor, restare a schermo la mette davanti
    // al bottone "Pubblica" (che salva la bozza, vedi sopra) del passo 7 più sotto: la si chiude esplicitamente
    // (`.last()`: l'alert ha ancora il bottone d'azione appena cliccato, oltre alla X).
    await sessioneB.getByRole('alert').getByRole('button').last().click();
    await expect(sessioneB.getByRole('alert')).toHaveCount(0);
    await openContentTab(sessioneB);
    await expect(sessioneB.getByText(TESTO_DI_A)).toBeVisible();
    await expect(sessioneB.getByText(TESTO_DI_B)).toHaveCount(0);

    // ─── 7. Ripartita dalla version giusta, B può salvare ───────────────────
    // Il 409 è un invito a riprovare informati, non un vicolo cieco.
    await selectBlock(blockOfType(sessioneB, 'heading'), 'Titolo');
    await fillProp(sessioneB, 'text', `${TESTO_DI_A} — poi rivisto da B`);
    await sessioneB.getByRole('button', { name: 'Pubblica', exact: true }).click();
    await expect(sessioneB.getByRole('alert').getByText('Bozza salvata')).toBeVisible();
  } finally {
    // Pulizia dei dati di verifica dalla stessa interfaccia del test, prima di
    // chiudere le sessioni. Best-effort: un fallimento qui non deve coprire
    // l'errore vero di un test già rosso.
    await deletePageFromUi(sessioneA, TITOLO_PAGINA).catch(() => undefined);
    await contestoA.close();
    await contestoB.close();
  }
});
