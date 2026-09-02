import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { ADMIN_STORAGE_STATE } from './helpers/admin-session';
import { readBackendEnv } from './helpers/backend-env';
import {
  addChildBlock,
  addRootBlock,
  blockOfType,
  createPageFromUi,
  deletePageFromUi,
  fillProp,
  openContentTab,
  publishFromStatusMenu,
  saveDraft,
  selectBlock,
  selectProp,
  uniqueSlug,
} from './helpers/page-editor';

/**
 * Ciclo completo del Form Builder (F10): composizione nell'editor visivo di un blocco
 * `form` con un `form-field` di testo e un `form-submit`, pubblicazione, compilazione e
 * invio reali sul sito pubblico (`app/public-site`, isola JS `form-submit.js`), e riscontro
 * sia della riga scritta in `form_submissions` (letta direttamente dal DB, non dedotta
 * dalla sola risposta HTTP — la rotta pubblica risponde sempre `200` generico, ADR-46 § 4)
 * sia del messaggio di successo mostrato a schermo.
 *
 * Solo l'ultimo tratto (compilazione/invio) passa dal sito pubblico reale, non da
 * `page.request.get` come le altre verifiche pubbliche della suite (`page-full-flow.spec.ts`,
 * `global-sections-ssr.spec.ts`): l'isola JS di submit ha bisogno di un browser vero che
 * esegua `fetch`, non di una lettura HTML passiva.
 */

const PUBLIC_SITE_ORIGIN = process.env.E2E_PUBLIC_SITE_URL ?? 'http://localhost:55000';

const TITOLO_PAGINA = 'Pagina modulo — E2E F10';
const NOME_CAMPO = 'nome';
const ETICHETTA_CAMPO = 'Nome';
const VALORE_COMPILATO = 'Mario Rossi E2E';

test.use({ storageState: ADMIN_STORAGE_STATE });

test.afterEach(async ({ page }) => {
  await deletePageFromUi(page, TITOLO_PAGINA).catch(() => undefined);
});

test('Form Builder: composto e pubblicato nell\'editor, compilato e inviato sul sito pubblico, riscontrato in form_submissions', async ({
  page,
}) => {
  test.slow();

  const slug = uniqueSlug('modulo-e2e');
  const formKey = uniqueSlug('form-e2e');
  const pageGuid = await createPageFromUi(page, { title: TITOLO_PAGINA, slug });

  await openContentTab(page);

  // ─── 1. Section radice, oltre l'eventuale Sezione seed del template ("empty", RFC-43) ────
  const initialSectionCount = await blockOfType(page, 'section').count();
  await addRootBlock(page, 'Sezione');
  const section = blockOfType(page, 'section').last();
  await expect(blockOfType(page, 'section')).toHaveCount(initialSectionCount + 1);

  // ─── 2. Blocco `form`, dentro la section (non ammesso a radice, ADR-46 § 1) ───────────────
  await addChildBlock(section, 'Modulo di contatto');
  const formBlock = blockOfType(section, 'form').last();
  await selectBlock(formBlock, 'Modulo di contatto');
  await fillProp(page, 'formKey', formKey);

  // ─── 3. Un campo `text`, dentro il form ────────────────────────────────────────────────────
  await addChildBlock(formBlock, 'Campo modulo');
  const fieldBlock = blockOfType(formBlock, 'form-field').last();
  await selectBlock(fieldBlock, 'Campo modulo');
  await selectProp(page, 'fieldType', 'text');
  await fillProp(page, 'name', NOME_CAMPO);
  await fillProp(page, 'label', ETICHETTA_CAMPO);

  // ─── 4. Pulsante di invio, dentro il form ──────────────────────────────────────────────────
  await addChildBlock(formBlock, 'Pulsante invio modulo');
  await expect(blockOfType(formBlock, 'form-submit')).toHaveCount(1);

  // ─── 5. Salvo la bozza e pubblico ───────────────────────────────────────────────────────────
  await saveDraft(page);
  await publishFromStatusMenu(page);

  const vediPagina = page.getByRole('link', { name: 'Vedi pagina' });
  await expect(vediPagina).toBeVisible();
  const publicUrl = (await vediPagina.getAttribute('href')) as string;
  expect(publicUrl, 'il dettaglio deve esporre l’URL pubblico di una Pagina pubblicata').toBeTruthy();

  // ─── 6. Navigazione browser reale sul sito pubblico (porta 55000 di default,
  // `PublicSiteConfig.port`), compilazione e invio del modulo — mai `page.request.get`: qui
  // serve un browser vero che esegua l'isola JS di submit (`form-submit.js`) ─────────────────
  const directUrl = `${PUBLIC_SITE_ORIGIN}${new URL(publicUrl).pathname}`;
  await page.goto(directUrl);

  await page.getByLabel(ETICHETTA_CAMPO).fill(VALORE_COMPILATO);
  await page.getByRole('button', { name: 'Invia' }).click();

  // ─── 7. Messaggio di successo a schermo (isola JS, `showSuccess`) ──────────────────────────
  await expect(
    page.getByText('Grazie, il messaggio è stato inviato con successo.'),
  ).toBeVisible();

  // ─── 8. Riscontro diretto in `form_submissions`: la rotta pubblica risponde sempre `200`
  // generico anche negli esiti "silenziosi" anti-spam (ADR-46 § 4), quindi il messaggio di
  // successo da solo non basta a provare che l'Invio sia stato scritto ─────────────────────────
  const dbClient = new Client({ connectionString: readBackendEnv('DATABASE_URL') });
  await dbClient.connect();
  try {
    const result = await dbClient.query(
      `SELECT fs.payload, p.guid AS page_guid
         FROM form_submissions fs
         JOIN pages p ON p.id = fs.page_id
        WHERE fs.form_key = $1
        ORDER BY fs.created_at DESC
        LIMIT 1`,
      [formKey],
    );

    expect(result.rowCount, 'nessun Invio scritto in form_submissions per questo formKey').toBe(1);
    const row = result.rows[0] as { payload: unknown; page_guid: string };
    expect(row.payload).toEqual({ [NOME_CAMPO]: VALORE_COMPILATO });
    expect(row.page_guid).toBe(pageGuid);
  } finally {
    await dbClient.end();
  }
});
