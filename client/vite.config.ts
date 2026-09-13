/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run build:pages` builds with --mode pages: static assets are served from
// /cachemesh/ on GitHub Pages, and the client switches to the in-browser demo
// adapter instead of calling the Express API.
export default defineConfig(({ mode }) => {
  const isPagesBuild = mode === 'pages';

  return {
    plugins: [react()],
    base: isPagesBuild ? '/cachemesh/' : '/',
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(isPagesBuild ? 'true' : 'false'),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          // Override with VITE_API_TARGET when the server runs on a non-default port.
          target: process.env.VITE_API_TARGET || 'http://localhost:4002',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
