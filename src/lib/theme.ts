// Keep STORAGE_KEY in sync with the inline blocking script in index.html,
// which sets data-theme before first paint to avoid a flash of the wrong theme.
export const STORAGE_KEY = 'strength-training:theme'

export type ThemeId = 'modern-dark' | 'modern-light' | 'cozy'

export const DEFAULT_THEME: ThemeId = 'modern-dark'

export const THEMES: { id: ThemeId; label: string; emoji: string }[] = [
  { id: 'modern-dark', label: 'Modern Dark', emoji: '🌙' },
  { id: 'modern-light', label: 'Modern Light', emoji: '☀️' },
  { id: 'cozy', label: 'Cozy', emoji: '🧶' },
]

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}
