/// <reference types="vitest/config" />
import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => ({
  // Read VITE_* values from the monorepo root .env (only VITE_-prefixed vars reach the bundle).
  envDir: rootDir,
  plugins: [react(), tailwindcss()],
  // The root .env sets NODE_ENV=development for the API; without this pin it leaks into `vite build`.
  define: { 'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development') },
  resolve: {
    // Consume workspace packages from TypeScript source for fast HMR.
    conditions: ['source', ...defaultClientConditions],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Same-origin API calls (D-011): session cookies stay first-party and no CORS is needed.
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } } },
  preview: { port: 5173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } } },
  test: { environment: 'happy-dom', setupFiles: ['./src/test/setup.ts'], css: false },
}));
