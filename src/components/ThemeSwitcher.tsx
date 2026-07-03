import { THEMES } from '../lib/theme'
import { useTheme } from '../hooks/useTheme'

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="UI theme">
      {THEMES.map((t) => {
        const on = t.id === theme
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            title={t.label}
            aria-pressed={on}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              border: '1px solid var(--border)',
              background: on ? 'var(--surface-1)' : 'transparent',
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <span aria-hidden="true">{t.emoji}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
