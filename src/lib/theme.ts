export type AppTheme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'app-theme'

export function applyTheme(theme: AppTheme): void {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light'
  } else {
    delete document.documentElement.dataset.theme
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function applyCachedTheme(): void {
  const cached = localStorage.getItem(THEME_STORAGE_KEY)
  if (cached === 'light') {
    document.documentElement.dataset.theme = 'light'
  }
}
