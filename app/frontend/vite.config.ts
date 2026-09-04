import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Non specificare 'host' (come fanno backend e public-site, che infatti
    // vengono agganciati dal relay localhost di WSL2/Windows): '0.0.0.0'
    // forzava il bind al solo IPv4 e wslrelay.exe su Windows non creava il
    // listener per questa porta — verificato con `netstat` lato Windows,
    // le altre due porte comparivano, questa no.
    host: true,
    port: 55173,
    proxy: {
      '/api': {
        target: 'http://localhost:53000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mantine: ['@mantine/core', '@mantine/dates', '@mantine/form', '@mantine/hooks', '@mantine/notifications'],
        },
      },
    },
  },
});
