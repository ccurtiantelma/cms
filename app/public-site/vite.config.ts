import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Workspace SSR senza framework (ADR-22). Un'unica build,
 * `vite build --ssr src/server.ts`: bundla il server Node ed estrae comunque
 * il CSS attraversato dall'import chain (`entry-server → App → @blocks`) in
 * un asset separato, letto a runtime da `server.ts`.
 *
 * L'alias verso `app/frontend/src/components/blocks/` è l'unica copia dei
 * componenti di blocco ammessa (ADR-22 § 3): risolto a build time, finisce
 * bundlato nell'output SSR, nessun pacchetto/symlink condiviso.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@blocks': fileURLToPath(new URL('../frontend/src/components/blocks', import.meta.url)),
      '@api-types': fileURLToPath(new URL('../frontend/src/types/api.types.ts', import.meta.url)),
    },
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/style.[hash].css',
      },
    },
  },
});
