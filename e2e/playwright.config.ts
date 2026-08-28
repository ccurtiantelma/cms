import { defineConfig, devices } from '@playwright/test';

/**
 * Config Playwright per l'E2E browser (ADR-16). Precondizione: backend e
 * frontend già avviati (docker compose dev + `npm run dev`, o l'equivalente in
 * CI) — nessun `webServer` qui, a differenza dei tipici setup Playwright: il
 * backend richiede Postgres/Redis reali, fuori dal ciclo di vita che
 * Playwright può gestire da solo. Vedi `docs/ai/adr/ADR-16-e2e-browser-playwright.md`.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // i test condividono lo stato MFA dell'utente SUPERADMIN: seriali per evitare interferenze
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Autenticazione una volta sola per l'intera suite: `POST /auth/login` ha un
    // rate limit anti brute-force di 5 tentativi al minuto per IP, che una login
    // per test supererebbe facendo fallire la suite per `429` — un motivo che
    // non ha nulla a che vedere con ciò che i test verificano. Vedi
    // `tests/admin.setup.ts`. Lo `storageState` prodotto qui è **opt-in**, non un
    // default del progetto: `auth-flow.spec.ts` deve poter partire anonimo.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
