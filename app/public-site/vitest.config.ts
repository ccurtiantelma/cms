/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Config Vitest separata da vite.config.ts (build SSR), sullo stesso modello
 * di app/frontend: non accoppia la configurazione di produzione a quella di
 * test. Ambiente `node`, non `jsdom`: qui si asserisce sulla stringa HTML
 * prodotta da `renderToStaticMarkup`, non su un DOM montato.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@blocks': fileURLToPath(new URL('../frontend/src/components/blocks', import.meta.url)),
      '@api-types': fileURLToPath(new URL('../frontend/src/types/api.types.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    /**
     * Il default di Vitest (`false`) sostituisce ogni import CSS con una
     * stringa vuota, `critical-css.ts` incluso: il CSS critico iniettato
     * nell'HTML dipende dal testo *reale* già processato dai CSS Modules
     * (`?inline`, stesse classi hashate del bundle esterno). `true` fa
     * girare la stessa pipeline CSS della build di produzione anche in
     * test, coerente con l'ambiente `node` di questa config, che già
     * asserisce sulla stringa HTML prodotta e non su un DOM montato.
     */
    css: true,
  },
});
