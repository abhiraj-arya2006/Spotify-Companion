import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy all /auth, /spotify, /data, /ai, /health calls to the backend
      '/auth': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/spotify': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/data': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/ai': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
})
