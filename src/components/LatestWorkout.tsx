import { useMemo } from 'react'
import { sessionDetails, type SetDetail } from '../lib/metrics'
import { fmtLongDate, fmtTonnage } from '../lib/format'
import { LIFT_BY_KEY, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'

interface SetGroup {
  weight: number
  reps: number
  count: number
}

// Collapse consecutive identical sets into one "weight × reps ×count" chip, so a
// run of three matching working sets reads as one pill instead of three.
function groupSets(sets: SetDetail[]): SetGroup[] {
  const groups: SetGroup[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.weight === s.weight && last.reps === s.reps) last.count += 1
    else groups.push({ weight: s.weight, reps: s.reps, count: 1 })
  }
  return groups
}

function SetChip({ g, warmup }: { g: SetGroup; warmup?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums"
      style={{
        border: '1px solid var(--border)',
        background: warmup ? 'transparent' : 'var(--page)',
        color: warmup ? 'var(--text-muted)' : 'var(--text-secondary)',
      }}
    >
      {warmup && <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>W</span>}
      <span>
        {g.weight}<span style={{ color: 'var(--text-muted)' }}> kg × </span>{g.reps}
      </span>
      {g.count > 1 && <span style={{ color: 'var(--text-muted)' }}>×{g.count}</span>}
    </span>
  )
}

// The most recent workout, shown in full and always expanded — a quick "what did I
// just do?" glance, distinct from the collapsible full Session log below.
export default function LatestWorkout({ rows }: { rows: SetRow[] }) {
  const latest = useMemo(() => sessionDetails(rows)[0], [rows])
  if (!latest) return null

  return (
    <ChartCard
      title="Latest workout"
      subtitle={`${fmtLongDate(latest.dateKey)} · ${latest.workout}`}
      right={
        <div className="text-right text-xs tabular-nums">
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmtTonnage(latest.totalVolume)}</div>
          <div style={{ color: 'var(--text-muted)' }}>{latest.totalWorkingSets} working sets</div>
        </div>
      }
    >
      <div className="space-y-2">
        {latest.exercises.map((ex) => {
          const color = ex.lift ? LIFT_BY_KEY.get(ex.lift)?.color : undefined
          const warmups = groupSets(ex.sets.filter((s) => s.isWarmup))
          const working = groupSets(ex.sets.filter((s) => !s.isWarmup))
          return (
            <div
              key={ex.exercise}
              className="border-t pt-2.5 first:border-t-0 first:pt-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {color && <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {ex.exercise}
                  </span>
                </div>
                <div className="shrink-0 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {ex.workingSets} {ex.workingSets === 1 ? 'set' : 'sets'} · {fmtTonnage(ex.volume)}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {working.map((g, i) => (
                  <SetChip key={`w${i}`} g={g} />
                ))}
                {warmups.length > 0 && (
                  <>
                    {working.length > 0 && (
                      <span className="mx-0.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        warmup
                      </span>
                    )}
                    {warmups.map((g, i) => (
                      <SetChip key={`u${i}`} g={g} warmup />
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}
