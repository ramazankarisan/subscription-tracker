import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
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
        start_url: '/',
        scope: '/',
      },
    }),
  ],
});
