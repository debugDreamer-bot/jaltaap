import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Mock mode is only ever enabled by setting VITE_USE_MOCK=true explicitly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
