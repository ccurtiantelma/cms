import { test as setup } from '@playwright/test';
import { loginAsSuperAdmin, ADMIN_STORAGE_STATE } from './helpers/admin-session';

/**
 * Autenticazione eseguita **una volta sola** per l'intera suite, con lo stato
 * salvato su file e riusato dai test che partono da dentro l'area
 * amministrativa (pattern `storageState` di Playwright).
 *
 * Non è un'ottimizzazione di comodo: `POST /auth/login` è protetto da un rate
 * limit anti brute-force di 5 tentativi al minuto per IP (`auth.controller.ts`).
 * Con una login per test la suite completa lo supererebbe e fallirebbe per
 * `429`, cioè per un motivo che non ha niente a che vedere con ciò che i test
 * verificano. Il percorso di login vero e proprio resta comunque sotto test:
 * è l'oggetto di `auth-flow.spec.ts`, che parte apposta da sessione anonima.
 */
setup('autentica il SuperAdmin una volta per tutta la suite', async ({ page }) => {
  await loginAsSuperAdmin(page);
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
