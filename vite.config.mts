import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const dir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : path.resolve('.');
  return {
    root: path.resolve(dir, 'expense-tracker'),
    build: {
      outDir: path.resolve(dir, 'dist'),
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
