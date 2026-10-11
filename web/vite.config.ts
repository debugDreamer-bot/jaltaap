import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Mock mode is only ever enabled by setting VITE_USE_MOCK=true explicitly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev only: with VITE_API_URL=/api the page and the local dev API share one origin, so a
  // single tunnel (e.g. cloudflared) can share the whole app.
  server: {
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // MapLibre's worker ships as .mjs. Emit it as .js so Amplify's standard SPA rewrite
        // rule (which only exempts known extensions such as .js) does not rewrite it.
        assetFileNames: (info) =>
          (info.names?.[0] ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
