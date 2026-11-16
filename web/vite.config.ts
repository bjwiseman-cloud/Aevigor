import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at aevigor.com/beta/
export default defineConfig({
  base: '/beta/',
  plugins: [react()],
  // @rules: the same status and load code the server uses (one copy, shared)
  resolve: { alias: { '@rules': path.resolve(__dirname, '../supabase/functions/_shared/rules.js'), '@': path.resolve(__dirname, './src') } },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'], charts: ['recharts'], ui: ['@radix-ui/react-select', '@radix-ui/react-slider', '@radix-ui/react-alert-dialog', '@radix-ui/react-accordion', '@radix-ui/react-toggle-group', '@radix-ui/react-checkbox'] }
      }
    }
  }
});
