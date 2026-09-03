import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // Porta host non standard di proposito: il progetto gira sempre in
    // parallelo con altri stack sulla stessa macchina, vedi il commento di
    // testa di docker-compose.yml (root).
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
