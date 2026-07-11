import { useMemo, useState } from 'react'
import { sessionDetails, type ExerciseSessionDetail } from '../lib/metrics'
import { fmtLongDate, fmtTonnage } from '../lib/format'
import { LIFT_BY_KEY, type SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import SetChip, { groupSets } from './SetChip'

// Deliberately the same grammar as NextSession's per-lift row — color chip + name, a
// tag on the right, then one wrapping row of groupSets-collapsed SetChip pills (warmups
// first, W-prefixed, in the order they're actually done). The two cards sit side by side,
// so "what I did" and "what to do" must be legible in one visual language.
function ExerciseRow({ ex }: { ex: ExerciseSessionDetail }) {
  const color = ex.lift ? LIFT_BY_KEY.get(ex.lift)?.color : undefined
  const warmups = groupSets(ex.sets.filter((s) => s.isWarmup))
  const working = groupSets(ex.sets.filter((s) => !s.isWarmup))
  return (
    <div className="border-t pt-2.5 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {color && <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {ex.exercise}
          </span>
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          {ex.workingSets} sets · {fmtTonnage(ex.volume)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {warmups.map((g, i) => (
          <SetChip key={`w${i}`} g={g} warmup />
        ))}
        {working.map((g, i) => (
          <SetChip key={`k${i}`} g={g} />
        ))}
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
      {/* h-full lets the log stretch to whatever height Next session sets beside it; the
          max-h keeps a long history from dictating the row height instead. */}
      <div className="h-full max-h-[30rem] space-y-0 overflow-y-auto pr-1">
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
