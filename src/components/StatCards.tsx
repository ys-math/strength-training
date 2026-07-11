import { useMemo } from 'react'
import { LIFTS, type SetRow } from '../lib/types'
import { big4Series, cumulativeSeries, currentPrev, liftPR, liftSessions, round1 } from '../lib/metrics'
import { fmtKg, fmtLongDate, fmtPlate } from '../lib/format'
import type { MetricMode } from '../lib/mode'

export default function StatCards({ rows, mode }: { rows: SetRow[]; mode: MetricMode }) {
  const big4 = useMemo(() => big4Series(rows, mode), [rows, mode])
  const cumulative = useMemo(() => cumulativeSeries(rows, mode), [rows, mode])

  const cards = useMemo(
    () =>
      LIFTS.map((lift) => {
        const sessions = liftSessions(rows, lift.key)
        const values = cumulative
          .map((p) => p[lift.key])
          .filter((v): v is number => v != null)
        const { current, prev } = currentPrev(values)
        return { lift, pr: liftPR(sessions), latest: sessions[sessions.length - 1], current, prev }
      }),
    [rows, cumulative],
  )

  const big4Delta = round1(big4.current - big4.prev)
  const heroTitle = mode === 'e1rm' ? 'Big 4 total (est. 1RM)' : 'Big 4 total (max weight)'
  const cardLabel = mode === 'e1rm' ? 'est. 1RM PR' : 'max weight PR'

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {/* Hero: Big-4 combined total in the selected metric */}
      <div
        className="col-span-2 flex flex-col rounded-2xl p-3 lg:col-span-1"
        style={{
          background: 'var(--hero-gradient)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {heroTitle}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {mode === 'e1rm' ? Math.round(big4.current) : fmtPlate(big4.current)}
          <span className="ml-1 text-base font-medium" style={{ color: 'var(--text-muted)' }}>
            kg
          </span>
        </div>
        {big4Delta > 0 && (
          <div className="mt-1 text-xs font-medium" style={{ color: 'var(--delta-good)' }}>
            ▲ {big4Delta} kg from previous best
          </div>
        )}
      </div>

      {cards.map(({ lift, pr, latest, current, prev }) => {
        const delta = round1(current - prev)
        return (
          <div
            key={lift.key}
            className="flex flex-col rounded-2xl p-3"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: lift.color }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {lift.key}
              </span>
            </div>
            <div className="mt-1.5 text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {current > 0 ? (mode === 'e1rm' ? Math.round(current) : fmtPlate(current)) : '—'}
              <span className="ml-1 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                kg
              </span>
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {cardLabel}
            </div>
            {pr && (
              <div
                className="mt-2 border-t pt-2 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {mode === 'e1rm' ? (
                  <div>
                    Heaviest: <span style={{ color: 'var(--text-secondary)' }}>{fmtKg(pr.maxWeight)} × {pr.maxWeightReps}</span>
                  </div>
                ) : (
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>{pr.maxWeightReps} reps</span> · est. 1RM {Math.round(pr.maxE1rm)} kg
                  </div>
                )}
                {delta > 0 && (
                  <div className="mt-0.5 font-medium" style={{ color: 'var(--delta-good)' }}>
                    ▲ {delta} kg from previous PR
                  </div>
                )}
                {latest && <div className="mt-0.5">Last: {fmtLongDate(latest.dateKey)}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
