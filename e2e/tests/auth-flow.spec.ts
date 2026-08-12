import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import { authenticator } from 'otplib';
import { readBackendEnv } from './helpers/backend-env';

/**
 * E2E browser (ADR-16): login → verifica MFA → azione autenticata → logout,
 * nel browser reale, contro backend+frontend realmente in esecuzione.
 *
 * Il setup/teardown della MFA sull'utente SUPERADMIN demo passa dalle API REST
 * dirette (non dal browser): evita la fragilità del componente `PinInput` di
 * Mantine nello step di attivazione/disattivazione (non sotto test qui) e
 * mantiene l'account demo nello stato originale (MFA disabilitata) a fine
 * suite, per non intaccare gli altri usi manuali dello stesso ambiente dev.
 * Lo step MFA *durante il login*, invece, usa davvero il browser: in
 * `PageLogin.tsx` è un semplice campo di testo ("Codice TOTP"), non un
 * `PinInput` — quello sì è sotto test.
 */
// Trailing slash necessario: `APIRequestContext` risolve i path relativi delle
// singole richieste (es. 'auth/login') come URL WHATWG standard — senza `/`
// finale sul base, l'ultimo segmento ('v1') verrebbe sostituito invece che
// preceduto, risultando in `/api/auth/login` invece di `/api/v1/auth/login`.
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000/api/v1/';

let api: APIRequestContext;
let superadminEmail: string;
let superadminPassword: string;
let mfaSecret: string;

test.beforeAll(async () => {
  superadminEmail = readBackendEnv('SUPERADMIN_EMAIL');
  superadminPassword = readBackendEnv('SUPERADMIN_PASSWORD');

  api = await apiRequest.newContext({ baseURL: BACKEND_URL });

  const loginRes = await api.post('auth/login', {
    data: { email: superadminEmail, password: superadminPassword },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `setup: login SUPERADMIN fallito (HTTP ${loginRes.status()}): ${await loginRes.text()}`,
    );
  }
  const loginBody = await loginRes.json();
  if (loginBody.mfaRequired) {
    // Stato sporco lasciato da un run precedente interrotto prima del
    // teardown (`afterAll`): la MFA è già abilitata ma questo processo non
    // conosce il secret per completarla né disabilitarla via API. Fallire
    // subito con un messaggio azionabile invece di proseguire con un token
    // assente e fallire più a valle in modo confuso (verificato empiricamente
    // in fase di sviluppo di questo test — vedi ADR-16, Conseguenze).
    throw new Error(
      `setup: l'utente SUPERADMIN ha già la MFA abilitata (stato sporco da un run precedente interrotto). ` +
        `Sblocca manualmente con: docker exec <container_postgres> psql -U app -d app_db -c ` +
        `"UPDATE users SET is_mfa_enabled=false, totp_secret=NULL WHERE email='${superadminEmail}';"`,
    );
  }
  const { accessToken } = loginBody;

  const setupRes = await api.post('auth/mfa-setup', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(setupRes.ok(), 'setup: generazione secret MFA').toBeTruthy();
  const { secret } = await setupRes.json();
  mfaSecret = secret;

  const enableRes = await api.post('auth/mfa-enable', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: authenticator.generate(mfaSecret) },
  });
  expect(enableRes.ok(), 'setup: abilitazione MFA').toBeTruthy();
});

test.afterAll(async () => {
  // Ripristina lo stato originale (MFA disabilitata): login completo via
  // API (credenziali + verifica MFA) per ottenere un access token valido, poi
  // disabilita la MFA con un codice TOTP fresco. Ogni chiamata è verificata
  // esplicitamente (niente destructuring "alla cieca" su una risposta di
  // errore): se il teardown fallisce, l'utente SUPERADMIN resta con la MFA
  // abilitata e nessun run successivo può saperne il secret — un warning
  // esplicito e azionabile è preferibile a un fallimento silenzioso qui
  // (verificato empiricamente in fase di sviluppo di questo test).
  try {
    const loginRes = await api.post('auth/login', {
      data: { email: superadminEmail, password: superadminPassword },
    });
    if (!loginRes.ok()) {
      throw new Error(`login fallito (HTTP ${loginRes.status()}): ${await loginRes.text()}`);
    }
    const { tmpToken } = await loginRes.json();

    const verifyRes = await api.post('auth/mfa-verify', {
      data: { tmpToken, code: authenticator.generate(mfaSecret) },
    });
    if (!verifyRes.ok()) {
      throw new Error(
        `verifica MFA fallita (HTTP ${verifyRes.status()}): ${await verifyRes.text()}`,
      );
    }
    const { accessToken } = await verifyRes.json();

    const disableRes = await api.post('auth/mfa-disable', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { code: authenticator.generate(mfaSecret) },
    });
    if (!disableRes.ok()) {
      throw new Error(
        `disabilitazione MFA fallita (HTTP ${disableRes.status()}): ${await disableRes.text()}`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console -- teardown di test, non codice applicativo backend/frontend (niente Logger NestJS qui)
    console.error(
      `[auth-flow.spec.ts] ATTENZIONE: teardown MFA fallito, SUPERADMIN resta con la MFA abilitata. ` +
        `Sblocca manualmente con: docker exec <container_postgres> psql -U app -d app_db -c ` +
        `"UPDATE users SET is_mfa_enabled=false, totp_secret=NULL WHERE email='${superadminEmail}';". ` +
        `Dettaglio: ${(err as Error).message}`,
    );
    throw err;
  } finally {
    await api.dispose();
  }
});

test('login con MFA, azione autenticata (Profilo) e logout', async ({ page }) => {
  // Il tour guidato (driver.js, `AppTour.tsx`) parte automaticamente al primo
  // accesso e il suo overlay intercetta i click: non è oggetto di questo test,
  // quindi lo si segna già "visto" prima di qualunque navigazione.
  await page.addInitScript(() => window.localStorage.setItem('tour_completed', 'true'));

  await page.goto('/login');

  await page.getByLabel('Email').fill(superadminEmail);
  await page.getByLabel('Password').fill(superadminPassword);
  await page.getByRole('button', { name: 'Accedi' }).click();

  // Step 2: verifica MFA (campo di testo semplice in PageLogin.tsx, non PinInput).
  await expect(page.getByText('Verifica MFA')).toBeVisible();
  await page.getByLabel('Codice TOTP').fill(authenticator.generate(mfaSecret));
  await page.getByRole('button', { name: 'Verifica' }).click();

  // Login completato: redirect alla home per ruolo (SuperAdmin → /dashboard).
  await expect(page).toHaveURL(/\/dashboard/);

  // Azione autenticata: apre la pagina Profilo e verifica che la MFA
  // risulti "Attiva" (conferma che il setup via API sia stato letto correttamente).
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Profilo Utente' })).toBeVisible();
  await page.getByRole('tab', { name: 'Sicurezza MFA' }).click();
  await expect(page.getByText('Attiva', { exact: true })).toBeVisible();

  // Logout.
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
});
