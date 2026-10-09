import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: {
    coin: fileURLToPath(new URL('./index.html', import.meta.url)),
    future: fileURLToPath(new URL('./future/index.html', import.meta.url)),
    farm: fileURLToPath(new URL('./farm/index.html', import.meta.url)),
    beach: fileURLToPath(new URL('./beach/index.html', import.meta.url)),
    demo: fileURLToPath(new URL('./demo/index.html', import.meta.url)),
  } } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
