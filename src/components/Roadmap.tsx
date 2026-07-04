import { useMemo } from 'react'
import { LIFTS, type SetRow } from '../lib/types'
import {
  currentMaxWeight,
  goalPace,
  recommendedGoals,
  recentRatePerWeek,
  type GoalPace,
} from '../lib/metrics'
import { HORIZONS, quarterCheckpoints, weeksUntil, type GoalHorizon } from '../lib/goals'
import { fmtPlate } from '../lib/format'
import ChartCard from './ChartCard'

const PACE: Record<GoalPace, { label: string; color: string }> = {
  met: { label: '✓ met', color: 'var(--delta-good)' },
  ahead: { label: 'ahead', color: 'var(--delta-good)' },
  'on-track': { label: 'on track', color: 'var(--text-secondary)' },
  behind: { label: 'behind', color: 'var(--lift-dl)' },
}

// Which quarter boundary each horizon lands on (0-indexed among the four columns):
// short = end of the 1st quarter, mid = 2nd, long = 4th.
const HORIZON_COL: Record<GoalHorizon, number> = { short: 1, mid: 2, long: 4 }

const fmtDue = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function Roadmap({ rows }: { rows: SetRow[] }) {
  const { quarters, horizonDate } = useMemo(() => quarterCheckpoints(), [])

  // "You are here" — today's fractional position inside the current (first) quarter,
  // mapped onto the four equal-width columns.
  const todayLeft = useMemo(() => {
    const q0 = quarters[0]
    const frac = (Date.now() - q0.start.getTime()) / (q0.end.getTime() - q0.start.getTime())
    return Math.max(0, Math.min(1, frac)) * (100 / quarters.length)
  }, [quarters])

  const lifts = useMemo(
    () =>
      LIFTS.map((lift) => {
        const current = currentMaxWeight(rows, lift.key)
        const recommended = recommendedGoals(rows, lift.key)
        const rate = recentRatePerWeek(rows, lift.key)
        const bars = HORIZONS.map((h) => {
          const target = recommended[h.id]
          const pace = current > 0 ? goalPace(current, target, weeksUntil(horizonDate[h.id]), rate) : null
          const fill = target > 0 ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0
          return { h, target, pace, fill, due: horizonDate[h.id] }
        })
        return { lift, current, rate, bars }
      }),
    [rows, horizonDate],
  )

  return (
    <ChartCard
      title="Goals & roadmap"
      subtitle="Recommended max-weight targets across the year's fixed calendar quarters — short (3 mo) · mid (6 mo) · long (1 yr)"
    >
      {/* Fixed-quarter timeline with a "today" marker and short/mid/long flags */}
      <div className="overflow-x-auto">
        <div className="min-w-[340px]">
          <div className="relative mb-1 h-9">
            <div className="absolute left-0 right-0 top-4 h-px" style={{ background: 'var(--border)' }} />
            {/* quarter columns */}
            <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${quarters.length}, 1fr)` }}>
              {quarters.map((q, i) => (
                <div key={i} className="relative flex flex-col items-center justify-start">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{q.label}</span>
                  <span className="mt-0.5 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--border)', outline: '2px solid var(--surface-2)' }} />
                  {/* divider at the right edge of each column */}
                  <div className="absolute right-0 top-3 h-3 w-px" style={{ background: 'var(--border)' }} />
                </div>
              ))}
            </div>
            {/* horizon flags at fixed quarter-ends */}
            {HORIZONS.map((h) => {
              const leftPct = (HORIZON_COL[h.id] / quarters.length) * 100
              const transform = leftPct >= 100 ? 'translateX(-100%)' : 'translateX(-50%)'
              return (
                <span
                  key={h.id}
                  className="absolute top-[18px] whitespace-nowrap rounded-full px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
                  style={{
                    left: `${leftPct}%`,
                    transform,
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {h.short}
                </span>
              )
            })}
            {/* today marker */}
            <div className="absolute top-1 bottom-1 w-px" style={{ left: `${todayLeft}%`, background: 'var(--text-primary)' }} />
            <span
              className="absolute top-0 -translate-x-1/2 rounded px-1 text-[9px] font-semibold"
              style={{ left: `${todayLeft}%`, background: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              now
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-4">
        {lifts.map(({ lift, current, rate, bars }) => (
          <div key={lift.key} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 flex items-center gap-1.5 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: lift.color }} />
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{lift.label}</span>
              {current > 0 ? (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  · now {fmtPlate(current)} kg · {rate > 0 ? `~${rate} kg/wk recently` : 'flat recently'}
                </span>
              ) : (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>— no history yet</span>
              )}
            </div>

            {current > 0 && (
              <div className="space-y-1.5">
                {bars.map(({ h, target, pace, fill, due }) => (
                  <div key={h.id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {h.short} · {fmtDue(due)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${fill}%`, background: lift.color }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtPlate(target)}
                    </span>
                    {pace && (
                      <span
                        className="w-14 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold"
                        style={{ border: '1px solid var(--border)', color: PACE[pace].color }}
                      >
                        {PACE[pace].label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Targets are projected from your recent rate of progress with diminishing returns over time —
        a rough guide, not a promise. Bars show where your current max sits against each target; the
        chip reads your recent pace against the time left to that quarter-end. See “How goals work” in
        the README.
      </p>
    </ChartCard>
  )
}
