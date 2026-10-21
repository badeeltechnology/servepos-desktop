// Dev-only: runs the renderer in a plain browser with the mock window.api
// (src/renderer/src/dev/mockApi.ts). Not used by electron-vite or the packaged app.
//
//   npx vite --config vite.renderer.dev.config.ts            # http://127.0.0.1:5199
//   npx vite build --config vite.renderer.dev.config.ts && npx vite preview --config vite.renderer.dev.config.ts
//   node scripts/ui-screens.cjs                              # Playwright screenshots + flow checks
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react()],
  define: { 'import.meta.env.VITE_MOCK_API': JSON.stringify('1') },
  build: { outDir: resolve(__dirname, 'out/renderer-mock'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true }
})
