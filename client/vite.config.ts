import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    // Shipping guard (2026-10-11): client/dist holds the live vanilla frontend
    // served by the server. Never build the React preview into it — keep the
    // output in a separate directory that is not served by default.
    outDir: 'react-dist',
  },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
