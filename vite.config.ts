import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Demo build (VITE_DEMO=1): sample data, served from /subscription-tracker/demo/.
const isDemo = process.env.VITE_DEMO === '1';

// https://vite.dev/config/
export default defineConfig({
  // Served from https://ramazankarisan.github.io/subscription-tracker/ (GitHub
  // Pages project site), so every asset URL is prefixed with this subpath.
  base: isDemo ? '/subscription-tracker/demo/' : '/subscription-tracker/',
  plugins: [
    react(),
    VitePWA({
      // The demo is a throwaway page, not an installable app.
      disable: isDemo,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Generate all app/favicon/apple-touch icons from the single source SVG.
      pwaAssets: {
        image: 'public/favicon.svg',
        preset: 'minimal-2023',
      },
      manifest: {
        name: 'SubTrack — Subscriptions & Installments',
        short_name: 'SubTrack',
        description:
          'Track subscription renewals and installment plans, and get reminded before anything is due.',
        theme_color: '#7c3aed',
        background_color: '#131118',
        display: 'standalone',
        orientation: 'portrait',
        // Must match the GitHub Pages subpath so the installed PWA and its
        // service worker are scoped correctly.
        start_url: '/subscription-tracker/',
        scope: '/subscription-tracker/',
      },
      workbox: {
        // The demo lives under this scope; don't answer its pages with the app shell.
        navigateFallbackDenylist: [/^\/subscription-tracker\/demo\//],
      },
    }),
  ],
});
