import { MODES, type MetricMode } from '../lib/mode'

// Segmented control switching the dashboard's primary metric between estimated
// 1RM and actual max weight. Drives StatCards and the ProgressChart.
export default function ModeToggle({
  mode,
  setMode,
}: {
  mode: MetricMode
  setMode: (m: MetricMode) => void
}) {
  return (
    <div
      className="inline-flex rounded-full p-0.5"
      role="group"
      aria-label="Metric mode"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      {MODES.map((m) => {
        const on = m.id === mode
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={on}
            className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              background: on ? 'var(--lift-bp)' : 'transparent',
              color: on ? '#fff' : 'var(--text-muted)',
            }}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
