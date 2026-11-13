import { useEffect, useState } from 'react'
import type { Api } from '../../preload'

declare global {
  interface Window {
    api: Api
  }
}

export function App() {
  const [info, setInfo] = useState<{ version: string; schemaVersion: number } | null>(null)
  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Finance Tracker</h1>
      <p>{info ? `v${info.version}, database schema ${info.schemaVersion}` : 'Starting...'}</p>
    </main>
  )
}
