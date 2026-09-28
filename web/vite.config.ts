import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Live reader backend (server/app.py)
      '/api': 'http://127.0.0.1:18787',
      '/ws': { target: 'ws://127.0.0.1:18787', ws: true },
    },
  },
  worker: { format: 'es' },
});
