import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  build: { target: 'chrome111' },
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    watch: { ignored: ['**/.tools/**', '**/android/**', '**/artifacts/**', '**/test-results/**'] },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
