import { useEffect, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'ft-theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

/** Set data-theme on <html>. Called before the first render to avoid a flash. */
export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
}

/** The saved theme preference, kept in localStorage; "system" follows the OS. */
export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref)
  useEffect(() => {
    applyTheme(pref)
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
    if (pref !== 'system') return
    const m = media()
    const onChange = () => applyTheme('system')
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [pref])
  return [pref, setPref]
}
