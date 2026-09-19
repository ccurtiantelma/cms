import { defineConfig } from 'vitest/config';

/**
 * Config Vitest di monorepo: senza di essa `npx vitest run` dalla radice usava l'ambiente
 * `node` di default (nessun `jsdom`, nessun `setupFiles`) e ogni test React falliva con
 * `document is not defined`. Ogni workspace mantiene la propria config (ambiente jsdom,
 * setup, CSS `?inline`, ADR-72): la radice si limita a delegarvi come "project", così i
 * percorsi (`npx vitest run app/frontend/src/...`) vengono risolti sul project corretto.
 * Il backend usa Jest e resta escluso.
 */
export default defineConfig({
  test: {
    projects: ['app/frontend', 'app/public-site'],
  },
});
