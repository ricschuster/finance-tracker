import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme, readThemePref } from './theme'

applyTheme(readThemePref())

// Only the import drop area accepts files; a drop anywhere else does nothing.
for (const type of ['dragover', 'drop'] as const)
  window.addEventListener(type, (e) => e.preventDefault())

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
