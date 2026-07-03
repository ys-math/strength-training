import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THEME, STORAGE_KEY, isThemeId, type ThemeId } from '../lib/theme'

function readInitialTheme(): ThemeId {
  const attr = document.documentElement.getAttribute('data-theme')
  if (isThemeId(attr)) return attr
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isThemeId(stored)) return stored
  return DEFAULT_THEME
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => setThemeState(next), [])

  return { theme, setTheme }
}
