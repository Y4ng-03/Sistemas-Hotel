import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/backend': {
        target: 'http://localhost/Sistema%20hotel',
        changeOrigin: true,
      }
    }
  }
});
