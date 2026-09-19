/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Config Vitest separata da vite.config.ts (build) per non accoppiare la
 * configurazione di produzione a quella di test.
 *
 * `css`: non un booleano (era `false`) — Vitest tratta `css` booleano come switch globale
 * (`vitest/dist/chunks/cli-api.*.js`, `CSSEnablerPlugin`/`shouldProcessCSS`: se `typeof css ===
 * 'boolean'` ritorna quel valore *senza mai controllare* `include`/`exclude`) e un
 * `transform` "pre" azzera il codice sorgente di *qualunque* file `.css` — incluse le
 * richieste esplicite `?inline` di `import.meta.glob` (`IframeCanvas.tsx`, ADR-72) — prima
 * ancora che la pipeline CSS reale di Vite possa risolvere quella query, quindi anche un
 * `?inline` tornava sempre stringa vuota sotto test (bug scoperto validando
 * `IframeCanvas.test.tsx`, non solo un'assunzione). L'oggetto `{ include: [...] }` sotto
 * riattiva la pipeline CSS reale **solo** per gli id che terminano in `?inline` (stessa regex
 * di riconoscimento usata internamente da Vitest, `cssInlineRE`), lasciando invariato per
 * ogni altro import di CSS "normale" (senza `?inline`) il comportamento preesistente — proxy
 * di classi vuoto, nessuna iniezione, stesso principio di `css: false` — su cui contano gli
 * altri test dei componenti di blocco/chrome.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Radice del workspace, per `src/test/setup.ts`: alcuni test risolvono i sorgenti con
    // `process.cwd()`, che lanciando Vitest dalla radice del monorepo non è `app/frontend`.
    env: { FRONTEND_ROOT: fileURLToPath(new URL('.', import.meta.url)) },
    globals: false,
    setupFiles: './src/test/setup.ts',
    css: {
      include: [/\?inline$/],
    },
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
