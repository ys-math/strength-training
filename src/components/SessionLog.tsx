import { useMemo, useState } from 'react'
import { sessionDetails, type ExerciseSessionDetail, type SetDetail } from '../lib/metrics'
import { fmtLongDate, fmtTonnage } from '../lib/format'
import { LIFT_BY_KEY, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'

function formatSets(sets: SetDetail[]): string {
  return sets.map((s) => `${s.isWarmup ? 'W ' : ''}${s.weight}×${s.reps}`).join(', ')
}

function ExerciseRow({ ex }: { ex: ExerciseSessionDetail }) {
  const color = ex.lift ? LIFT_BY_KEY.get(ex.lift)?.color : undefined
  return (
    <div className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {color && <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {ex.exercise}
          </span>
        </div>
        <div className="shrink-0 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {ex.workingSets} sets · {fmtTonnage(ex.volume)}
        </div>
      </div>
      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {formatSets(ex.sets)}
      </div>
    </div>
  )
}

export default function SessionLog({ rows }: { rows: SetRow[] }) {
  const sessions = useMemo(() => sessionDetails(rows), [rows])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(sessions[0] ? [sessions[0].dateKey] : []))

  const toggle = (dateKey: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey)
      return next
    })

  return (
    <ChartCard title="Session log" subtitle={`${sessions.length} sessions · every exercise, set, and volume`}>
      <div className="max-h-[28rem] space-y-0 overflow-y-auto pr-1">
        {sessions.map((s) => {
          const isOpen = expanded.has(s.dateKey)
          return (
            <div key={s.dateKey} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => toggle(s.dateKey)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 shrink-0 text-center text-sm font-bold transition-transform"
                    style={{ color: 'var(--text-secondary)', transform: isOpen ? 'rotate(90deg)' : 'none' }}
                  >
                    ›
                  </span>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmtLongDate(s.dateKey)}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {s.workout}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums">
                  <div style={{ color: 'var(--text-primary)' }}>{fmtTonnage(s.totalVolume)}</div>
                  <div style={{ color: 'var(--text-muted)' }}>{s.totalWorkingSets} sets</div>
                </div>
              </button>
              {isOpen && (
                <div className="space-y-2 pb-3 pl-4">
                  {s.exercises.map((ex) => (
                    <ExerciseRow key={ex.exercise} ex={ex} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}
