import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Docker Desktop on Windows doesn't forward file events into bind mounts.
    watch: { usePolling: Boolean(process.env['VITE_USE_POLLING']) },
    // The app calls relative /api URLs; in dev they are forwarded to FastAPI.
    proxy: {
      '/api': process.env['VITE_API_PROXY_TARGET'] ?? 'http://localhost:8000',
    },
  },
});
