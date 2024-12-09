import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, './index.html'),
        camera: resolve(__dirname, './camera.html'),        
        texture: resolve(__dirname, './texture.html'),
        client: resolve(__dirname, './client.html'),

      },
    },
  },
  base: './',
});
