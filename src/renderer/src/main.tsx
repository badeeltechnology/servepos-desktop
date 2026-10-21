import React from 'react'
import ReactDOM from 'react-dom/client'
// Fonts are bundled (offline POS): no CDN at runtime.
import '@fontsource/readex-pro/400.css'
import '@fontsource/readex-pro/500.css'
import '@fontsource/readex-pro/600.css'
import '@fontsource/readex-pro/700.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import App from './App'
import './index.css'

async function start() {
  // Dev-only browser harness: when the renderer runs under plain Vite (no Electron preload),
  // install a mock window.api. VITE_MOCK_API is only defined by vite.renderer.dev.config.ts,
  // so this branch and the mock module are stripped from the Electron build.
  if (import.meta.env.VITE_MOCK_API === '1' && !(window as any).api) {
    const { installMockApi } = await import('./dev/mockApi')
    installMockApi()
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

start()
