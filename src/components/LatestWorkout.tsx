import { useMemo } from 'react'
import { sessionDetails } from '../lib/metrics'
import { fmtLongDate, fmtTonnage } from '../lib/format'
import { LIFT_BY_KEY, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import SetChip, { groupSets } from './SetChip'

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
                {warmups.map((g, i) => (
                  <SetChip key={`u${i}`} g={g} warmup />
                ))}
                {working.map((g, i) => (
                  <SetChip key={`w${i}`} g={g} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}
