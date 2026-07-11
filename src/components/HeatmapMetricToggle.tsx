import { HEATMAP_METRICS, type HeatmapMetric } from '../lib/heatmapMetric'

// Segmented control choosing what the Training-frequency heatmap's shade encodes.
// Sits in the card header; re-colors the grid without adding or removing any cell.
export default function HeatmapMetricToggle({
  metric,
  setMetric,
}: {
  metric: HeatmapMetric
  setMetric: (m: HeatmapMetric) => void
}) {
  return (
    <div
      className="inline-flex rounded-full p-0.5"
      role="group"
      aria-label="Heatmap color metric"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      {HEATMAP_METRICS.map((m) => {
        const on = m.id === metric
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMetric(m.id)}
            aria-pressed={on}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
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
