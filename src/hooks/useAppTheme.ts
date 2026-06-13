import { useEffect, useState } from 'react'
import { applyTheme, THEME_STORAGE_KEY, type AppTheme } from '../lib/theme'

function readCachedTheme(): AppTheme {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>(readCachedTheme)

  useEffect(() => {
    window.api.settings.getTheme().then(saved => {
      applyTheme(saved)
      setThemeState(saved)
    })
  }, [])

  const setTheme = async (next: AppTheme) => {
    const saved = await window.api.settings.setTheme(next)
    applyTheme(saved)
    setThemeState(saved)
  }

  return { theme, setTheme }
}
