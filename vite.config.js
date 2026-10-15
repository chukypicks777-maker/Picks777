import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// One id per deployment: the running app compares it with /version.json.
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12)
const versionFile = () => ({
  name: 'picks-version-file',
  apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }) }
})

// https://vite.dev/config/
export default defineConfig({
  build: { target: 'chrome111' },
  define: { __APP_BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
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
