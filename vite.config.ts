import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '页间 · Margin Reader',
        short_name: '页间',
        description: '以文章本身为中心的交互式外文精读器',
        theme_color: '#f3f0e8',
        background_color: '#f3f0e8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\//,
          handler: 'CacheFirst',
          options: { cacheName: 'ocr-models', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 } }
        }]
      }
    })
  ]
})
