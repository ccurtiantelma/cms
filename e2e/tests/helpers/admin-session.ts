import { expect, type Page } from '@playwright/test';
import { resolve } from 'path';
import { readBackendEnv } from './backend-env';

/**
 * File in cui `admin.setup.ts` deposita la sessione autenticata e da cui i test
 * amministrativi la rileggono (`test.use({ storageState })`). Contiene il token
 * di accesso e il cookie di refresh dell'utente demo: sta fuori dal repository
 * (`e2e/.auth/` è in `.gitignore`) e viene riscritto a ogni run.
 */
export const ADMIN_STORAGE_STATE = resolve(__dirname, '../../.auth/admin.json');

/**
 * Credenziali dell'utente SuperAdmin demo, lette dall'ambiente o da
 * `app/backend/.env` (stesso meccanismo di `auth-flow.spec.ts`, ADR-16): mai
 * duplicate in un file di config solo per l'E2E.
 *
 * L'account demo nasce **senza MFA**; `auth-flow.spec.ts` la abilita e la
 * disabilita nel proprio ciclo di vita. I test che usano questo helper
 * presuppongono lo stato di riposo (MFA disattiva) e falliscono con un
 * messaggio esplicito se trovano lo step di verifica, invece di scadere sul
 * primo `expect` della pagina successiva.
 */
export function superAdminCredentials(): { email: string; password: string } {
  return {
    email: readBackendEnv('SUPERADMIN_EMAIL'),
    password: readBackendEnv('SUPERADMIN_PASSWORD'),
  };
}

/**
 * Porta `page` dentro l'area amministrativa autenticata come SuperAdmin,
 * passando dal form di login reale (nessuna iniezione di token: l'E2E verifica
 * il percorso che percorre una persona).
 *
 * Due sovrapposizioni del primo accesso vengono segnate "già viste" prima di
 * qualunque navigazione: il tour guidato (`driver.js`) e l'invito ad attivare la
 * MFA (`MfaPromptModal`). Entrambe intercettano i click con un overlay e nessuna
 * delle due è oggetto di questi test.
 */
export async function loginAsSuperAdmin(page: Page): Promise<void> {
  const { email, password } = superAdminCredentials();

  await page.addInitScript(() => {
    window.localStorage.setItem('tour_completed', 'true');
    window.localStorage.setItem('mfaPromptShown', 'true');
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();

  if (
    await page
      .getByText('Verifica MFA')
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error(
      "loginAsSuperAdmin: l'utente SuperAdmin ha la MFA attiva. Questi test la presuppongono " +
        "disattiva (stato di riposo dell'account demo): probabilmente un run di auth-flow.spec.ts " +
        'è stato interrotto prima del teardown.',
    );
  }

  await expect(page).toHaveURL(/\/dashboard/);
}
