import { useMemo } from 'react'
import { LIFTS, type LiftKey, type SetRow } from '../lib/types'
import {
  currentMaxWeight,
  goalPace,
  recommendedGoals,
  recentRatePerWeek,
  type GoalPace,
} from '../lib/metrics'
import { HORIZONS, horizonDate, weeksUntil, type GoalHorizon, type GoalMap } from '../lib/goals'
import { fmtPlate } from '../lib/format'
import ChartCard from './ChartCard'

const PACE: Record<GoalPace, { label: string; color: string }> = {
  met: { label: '✓ met', color: 'var(--delta-good)' },
  ahead: { label: 'ahead', color: 'var(--delta-good)' },
  'on-track': { label: 'on track', color: 'var(--text-secondary)' },
  behind: { label: 'behind', color: 'var(--lift-dl)' },
}

// Weeks remaining to each horizon, computed once at render (runtime "now").
function horizonWeeks(): Record<GoalHorizon, number> {
  const w = {} as Record<GoalHorizon, number>
  for (const h of HORIZONS) w[h.id] = weeksUntil(horizonDate(h.months))
  return w
}

export default function Roadmap({
  rows,
  goals,
  setGoal,
  resetLift,
}: {
  rows: SetRow[]
  goals: GoalMap
  setGoal: (lift: LiftKey, horizon: GoalHorizon, kg: number | null) => void
  resetLift: (lift: LiftKey) => void
}) {
  const weeks = useMemo(horizonWeeks, [])

  const lifts = useMemo(
    () =>
      LIFTS.map((lift) => {
        const current = currentMaxWeight(rows, lift.key)
        const recommended = recommendedGoals(rows, lift.key)
        const rate = recentRatePerWeek(rows, lift.key)
        const target = (h: GoalHorizon) => goals[lift.key]?.[h] ?? recommended[h]
        const pace = current > 0 ? goalPace(current, target('short'), weeks.short, rate) : null
        return { lift, current, recommended, rate, target, pace }
      }),
    [rows, goals, weeks],
  )

  return (
    <ChartCard
      title="Goals & roadmap"
      subtitle="Max-weight targets · short (3 mo) · mid (6 mo) · long (1 yr) — edit any target, empty uses the recommendation"
    >
      <div className="space-y-4">
        {lifts.map(({ lift, current, recommended, rate, target, pace }) => {
          if (current <= 0) {
            return (
              <div key={lift.key} className="border-t pt-3 text-xs first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: lift.color }} />
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{lift.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>— no history yet</span>
                </div>
              </div>
            )
          }
          const shortTarget = target('short')
          const fill = Math.max(0, Math.min(100, Math.round((current / shortTarget) * 100)))
          const edited = goals[lift.key] && Object.keys(goals[lift.key]!).length > 0
          return (
            <div key={lift.key} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: lift.color }} />
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{lift.label}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    · {rate > 0 ? `~${rate} kg/wk recently` : 'flat recently'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {pace && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ border: '1px solid var(--border)', color: PACE[pace].color }}
                    >
                      {PACE[pace].label}
                    </span>
                  )}
                  {edited && (
                    <button
                      onClick={() => resetLift(lift.key)}
                      className="text-[10px] underline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>

              {/* timeline: Now → 3 mo → 6 mo → 1 yr */}
              <div className="relative mb-2">
                <div className="absolute left-[12.5%] right-[12.5%] top-[7px] h-px" style={{ background: 'var(--border)' }} />
                <div className="relative grid grid-cols-4 gap-1 text-center">
                  <Node label="Now" dotColor={lift.color} filled>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmtPlate(current)}<span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}> kg</span>
                    </span>
                  </Node>
                  {HORIZONS.map((h) => {
                    const userVal = goals[lift.key]?.[h.id]
                    return (
                      <Node key={h.id} label={h.short} dotColor={lift.color}>
                        <input
                          type="number"
                          step="2.5"
                          min="0"
                          inputMode="decimal"
                          value={userVal ?? ''}
                          placeholder={String(recommended[h.id])}
                          onChange={(e) => {
                            const v = e.target.value.trim()
                            setGoal(lift.key, h.id, v === '' ? null : Number(v))
                          }}
                          aria-label={`${lift.label} ${h.label} target (kg)`}
                          className="w-14 rounded-md border bg-transparent px-1 py-0.5 text-center text-sm font-semibold tabular-nums outline-none"
                          style={{
                            borderColor: 'var(--border)',
                            color: userVal != null ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                        />
                      </Node>
                    )
                  })}
                </div>
              </div>

              {/* progress toward the short-term target */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                  <div className="h-full rounded-full" style={{ width: `${fill}%`, background: lift.color }} />
                </div>
                <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {fmtPlate(current)} / {fmtPlate(shortTarget)} kg (3 mo)
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Recommended targets assume gains that slow over time — a rough guide, not a promise. See
        “How goals work” in the README. Goals are saved in your browser.
      </p>
    </ChartCard>
  )
}

function Node({
  label,
  dotColor,
  filled,
  children,
}: {
  label: string
  dotColor: string
  filled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="inline-block h-3.5 w-3.5 rounded-full"
        style={{
          background: filled ? dotColor : 'var(--surface-1)',
          border: `2px solid ${dotColor}`,
        }}
      />
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </div>
  )
}
