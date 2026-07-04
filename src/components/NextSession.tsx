import { useMemo } from 'react'
import { nextSessionSuggestion, hasRpeData } from '../lib/metrics'
import { LIFTS, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'

// Small colored tag for the suggestion's action, so the intent reads at a glance.
const ACTION_LABEL: Record<string, string> = {
  'increase-load': 'add load',
  'add-rep': 'add rep',
  'build-reps': 'build reps',
  deload: 'deload',
  'insufficient-data': '—',
}

export default function NextSession({ rows }: { rows: SetRow[] }) {
  const suggestions = useMemo(() => nextSessionSuggestion(rows), [rows])
  const rpe = useMemo(() => hasRpeData(rows), [rows])

  return (
    <ChartCard
      title="Next session"
      subtitle="Suggested load × reps per lift — double progression from your history"
    >
      <div className="space-y-3">
        {LIFTS.map((lift) => {
          const s = suggestions[lift.key]
          const isDeload = s.action === 'deload'
          return (
            <div
              key={lift.key}
              className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-baseline sm:gap-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex shrink-0 items-center gap-2 sm:w-40">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: lift.color }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {lift.label}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {s.headline}
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      border: '1px solid var(--border)',
                      color: isDeload ? 'var(--lift-dl)' : 'var(--text-muted)',
                    }}
                  >
                    {ACTION_LABEL[s.action] ?? s.action}
                  </span>
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {s.rationale}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Heuristic guidance from set history — see “How suggestions work” in the README for the reasoning and
        its limits.{' '}
        {rpe
          ? 'RPE data detected: rising effort at a fixed load nudges toward holding.'
          : 'No RPE logged in your export, so RPE-based autoregulation is skipped.'}
      </p>
    </ChartCard>
  )
}
