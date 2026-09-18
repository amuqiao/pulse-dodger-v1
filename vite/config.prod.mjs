import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  logLevel: 'warn',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
        drop_debugger: true,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
  },
});
