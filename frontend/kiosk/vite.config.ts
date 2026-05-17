import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite Configuration for EVOLTTOUCH Kiosk
 * 
 * Optimized for embedded devices (Raspberry Pi).
 * PWA enabled for kiosk mode and offline resilience.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'EVOLTTOUCH Kiosk',
        short_name: 'EVOLTTOUCH',
        description: 'Smart Display for EV Charging Stations',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 3005,
    host: true
  }
});
