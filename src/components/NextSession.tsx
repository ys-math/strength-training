import { useMemo } from 'react'
import { hasRpeData, type GoalPace, type Suggestion } from '../lib/metrics'
import { LIFTS, type LiftKey, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import SetChip from './SetChip'

// Short tag for the suggestion's action, so the intent reads at a glance.
const ACTION_LABEL: Record<string, string> = {
  'increase-load': 'add load',
  'add-rep': 'add rep',
  'build-reps': 'build reps',
  deload: 'deload',
  return: 'return',
  'insufficient-data': 'no data',
}

const PACE: Record<GoalPace, { label: string; color: string }> = {
  met: { label: '✓ goal met', color: 'var(--delta-good)' },
  ahead: { label: 'ahead of goal', color: 'var(--delta-good)' },
  'on-track': { label: 'on track', color: 'var(--text-muted)' },
  behind: { label: 'behind goal', color: 'var(--lift-dl)' },
}

function PaceChip({ pace }: { pace: GoalPace }) {
  const p = PACE[pace]
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ border: '1px solid var(--border)', color: p.color }}
    >
      {p.label}
    </span>
  )
}

// The one change worth highlighting vs. the previous session, colored by intent.
function DeltaBadge({ s }: { s: Suggestion }) {
  let text = 'hold'
  let color = 'var(--text-muted)'
  if (s.action === 'return' && s.loadDelta < 0) {
    text = `▼ back off ${s.loadDelta} kg`
    color = 'var(--lift-dl)'
  } else if (s.loadDelta > 0) {
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

export default function NextSession({
  rows,
  suggestions,
}: {
  rows: SetRow[]
  suggestions: Record<LiftKey, Suggestion>
}) {
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
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.goalPace && <PaceChip pace={s.goalPace} />}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ border: '1px solid var(--border)', color: isDeload ? 'var(--lift-dl)' : 'var(--text-muted)' }}
                  >
                    {ACTION_LABEL[s.action] ?? s.action}
                  </span>
                </div>
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

              {s.topSet && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    + heavy top set
                  </span>
                  <SetChip g={{ weight: s.topSet.load, reps: s.topSet.reps, count: s.topSet.sets }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    specificity (~90% e1RM)
                  </span>
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
