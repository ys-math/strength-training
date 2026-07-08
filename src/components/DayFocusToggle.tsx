import { DAY_FOCUSES, type DayFocus } from '../lib/dayFocus'

// Segmented control flagging the next session as a low-rep/heavy day or a
// high-rep/light day — daily undulating periodization. Feeds nextSessionSuggestion
// via Dashboard so the Next-session card retargets its rep range/load to match.
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
      aria-label="Next session focus"
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
