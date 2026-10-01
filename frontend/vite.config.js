import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, /api is proxied to the Express server so no CORS setup is needed.
// In production set VITE_API_URL to the deployed backend (e.g. https://smart-farm-api.onrender.com).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('recharts') || id.includes('d3-') ? 'charts' : undefined) },
    },
  },
});
