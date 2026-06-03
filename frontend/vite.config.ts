import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// ---------------------------------------------------------------------------
// Routes to prerender at build time (public / SEO-critical pages)
// ---------------------------------------------------------------------------

const blogSlugs = [
  'why-car-wash-needs-software',
  'online-booking-for-car-wash',
  'managing-multiple-car-wash-locations',
  '5-mistakes-car-wash-owners-make',
  'car-wash-analytics-guide',
  'yak-avtomatyzuvaty-avtomyiku',
  'roli-ta-dozvoly-na-avtomyitsi',
  'yak-zbilshyty-dokhid-avtomyiky',
  'onlain-zapys-na-myiku',
  'pomylky-pry-vidkrytti-avtomyiky',
  'analityka-avtomyiky-shcho-vidstezhuvaty',
  'yak-motyvuvaty-komandu-avtomyiky',
  'yak-obraty-programu-dlya-avtomyiky',
  'yak-pracyuvaty-z-sezonnistyu',
  'google-maps-dlya-avtomyiky',
  'best-car-wash-management-software-2026',
  'how-to-start-car-wash-business',
  'car-wash-pos-vs-management-software',
  'increase-car-wash-revenue-online-booking',
  'car-wash-employee-scheduling-tips',
  'self-serve-vs-full-service-car-wash-software',
  'yak-vidkryty-avtomyiku-z-nulya',
  'skilky-koshtuye-avtomyika-2026',
  'crm-dlya-avtomyiky-porivnyannya',
  'yak-zaluchyty-kliyentiv-na-avtomyiku',
  'avtomyika-yak-biznes-rentabelnist',
  'yak-vesty-oblik-na-avtomyitsi',
];

const howToTopics = [
  'getting-started',
  'dashboard',
  'orders',
  'clients',
  'vehicles',
  'services',
  'branches',
  'users-roles',
  'workforce',
  'analytics',
  'subscription',
  'public-booking',
  'flow-client-via-order',
  'flow-client-via-tabs',
  'flow-online-booking',
  'flow-new-employee',
  'flow-branch-setup',
];

const prerenderRoutes: readonly string[] = [
  '/',
  '/blog',
  ...blogSlugs.map((slug) => `/blog/${slug}`),
  ...howToTopics.map((topic) => `/how-to/${topic}`),
  '/legal/privacy',
  '/legal/terms',
  '/legal/refund',
];

async function prerenderPlugin(): Promise<PluginOption> {
  const vitePrerender = (await import('vite-plugin-prerender')).default;
  const PuppeteerRenderer = vitePrerender.PuppeteerRenderer;

  return vitePrerender({
    staticDir: path.join(__dirname, 'dist'),
    routes: [...prerenderRoutes],
    renderer: new PuppeteerRenderer({
      headless: true,
      renderAfterTime: 500,
      maxConcurrentRoutes: 4,
    }),
    postProcess(renderedRoute) {
      renderedRoute.route = renderedRoute.originalRoute;
      return renderedRoute;
    },
  });
}

export default defineConfig(async ({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(command === 'build' ? [await prerenderPlugin()] : []),
  ],
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
