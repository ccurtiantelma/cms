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
    baseURL: process.env.E2E_FRONTEND_URL ?? 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
