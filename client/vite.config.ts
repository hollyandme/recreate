import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs on its own port in development; proxying keeps the client
    // same-origin so uploaded screenshots load without any CORS involvement.
    proxy: {
      '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
});
