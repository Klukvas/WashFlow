import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.match(/\/react\//)
            ) {
              return 'react-vendor';
            }
            if (id.includes('@radix-ui')) {
              return 'ui-vendor';
            }
            if (
              id.includes('@tanstack') ||
              id.includes('zustand') ||
              id.includes('axios')
            ) {
              return 'data-vendor';
            }
            if (
              id.includes('react-hook-form') ||
              id.includes('@hookform') ||
              id.includes('/zod/')
            ) {
              return 'form-vendor';
            }
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'i18n-vendor';
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'charts-vendor';
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3003',
        ws: true,
      },
    },
  },
});
