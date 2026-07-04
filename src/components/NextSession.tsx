import { useMemo } from 'react'
import { nextSessionSuggestion, hasRpeData, type Suggestion } from '../lib/metrics'
import { LIFTS, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import SetChip from './SetChip'

// Short tag for the suggestion's action, so the intent reads at a glance.
const ACTION_LABEL: Record<string, string> = {
  'increase-load': 'add load',
  'add-rep': 'add rep',
  'build-reps': 'build reps',
  deload: 'deload',
  'insufficient-data': 'no data',
}

// The one change worth highlighting vs. the previous session, colored by intent.
function DeltaBadge({ s }: { s: Suggestion }) {
  let text = 'hold'
  let color = 'var(--text-muted)'
  if (s.loadDelta > 0) {
    text = `▲ +${s.loadDelta} kg`
    color = 'var(--delta-good)'
  } else if (s.repsDelta > 0) {
    text = `▲ +${s.repsDelta} rep${s.repsDelta > 1 ? 's' : ''}`
    color = 'var(--delta-good)'
  } else if (s.setsDelta < 0) {
    text = '▼ deload'
    color = 'var(--lift-dl)'
  }
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
      {text}
    </span>
  )
}

export default function NextSession({ rows }: { rows: SetRow[] }) {
  const suggestions = useMemo(() => nextSessionSuggestion(rows), [rows])
  const rpe = useMemo(() => hasRpeData(rows), [rows])

  return (
    <ChartCard
      title="Next session"
      subtitle="Suggested load × reps per lift — double progression from your history"
    >
      <div className="space-y-2">
        {LIFTS.map((lift) => {
          const s = suggestions[lift.key]
          const isDeload = s.action === 'deload'
          const noData = s.action === 'insufficient-data'
          return (
            <div
              key={lift.key}
              className="border-t pt-2.5 first:border-t-0 first:pt-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: lift.color }} />
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {lift.label}
                  </span>
                </div>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ border: '1px solid var(--border)', color: isDeload ? 'var(--lift-dl)' : 'var(--text-muted)' }}
                >
                  {ACTION_LABEL[s.action] ?? s.action}
                </span>
              </div>

              {!noData && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {s.prev && (
                    <>
                      <SetChip g={{ weight: s.prev.load, reps: s.prev.reps, count: s.prev.sets }} dim />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        →
                      </span>
                    </>
                  )}
                  <SetChip g={{ weight: s.load, reps: s.reps, count: s.sets }} />
                  <DeltaBadge s={s} />
                </div>
              )}

              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {s.rationale}
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
