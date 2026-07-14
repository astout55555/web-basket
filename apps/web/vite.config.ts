import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, Vite serves the SPA and forwards API calls to the Fastify server.
      '/api': 'http://localhost:3000',
    },
  },
});
