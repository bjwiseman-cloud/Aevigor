import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at aevigor.com/beta/
export default defineConfig({
  base: '/beta/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'], ui: ['@radix-ui/react-select', '@radix-ui/react-alert-dialog', '@radix-ui/react-accordion', '@radix-ui/react-toggle-group', '@radix-ui/react-checkbox'] }
      }
    }
  }
});
