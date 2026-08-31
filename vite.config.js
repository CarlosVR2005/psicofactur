import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', no 'autoUpdate': la recarga automática y silenciosa no
      // siempre la pillaba el navegador (sobre todo la PWA instalada), y
      // cuando lo hacía recargaba de golpe. Ahora `AvisoVersion` enseña
      // un aviso con botón «Actualizar».
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Permite probar la instalación de la PWA también en `npm run dev`
      devOptions: { enabled: true },
      manifest: {
        name: 'Psicofactur — Consulta de psicología',
        short_name: 'Psicofactur',
        description:
          'Pacientes, agenda, facturación y recordatorios de la consulta.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F5F2',
        theme_color: '#4F7C74',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
})
