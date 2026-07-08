import { DAY_FOCUSES, type DayFocus } from '../lib/dayFocus'

// Segmented control that filters the Training-frequency heatmap to the days you
// trained with low reps (heavy) or high reps (light). Purely a view filter for the
// heatmap grid — it doesn't affect the next-session suggestion.
export default function DayFocusToggle({
  dayFocus,
  setDayFocus,
}: {
  dayFocus: DayFocus
  setDayFocus: (f: DayFocus) => void
}) {
  return (
    <div
      className="inline-flex rounded-full p-0.5"
      role="group"
      aria-label="Heatmap rep focus"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      {DAY_FOCUSES.map((f) => {
        const on = f.id === dayFocus
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setDayFocus(f.id)}
            aria-pressed={on}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{
              background: on ? 'var(--lift-bp)' : 'transparent',
              color: on ? '#fff' : 'var(--text-muted)',
            }}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
