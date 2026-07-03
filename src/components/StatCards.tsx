import { useMemo } from 'react'
import { LIFTS, type SetRow } from '../lib/types'
import { big4Series, liftPR, liftSessions, round1 } from '../lib/metrics'
import { fmtKg, fmtLongDate } from '../lib/format'

export default function StatCards({ rows }: { rows: SetRow[] }) {
  const big4 = useMemo(() => big4Series(rows), [rows])
  const cards = useMemo(
    () =>
      LIFTS.map((lift) => {
        const sessions = liftSessions(rows, lift.key)
        return { lift, pr: liftPR(sessions), latest: sessions[sessions.length - 1] }
      }),
    [rows],
  )

  const delta = round1(big4.current - big4.prev)

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {/* Hero: Big-4 combined estimated total */}
      <div
        className="col-span-2 rounded-2xl p-5 lg:col-span-1"
        style={{
          background: 'linear-gradient(160deg, rgba(57,135,229,0.18), var(--surface-1))',
          border: '1px solid var(--border)',
        }}
      >
        <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Big 4 total (est. 1RM)
        </div>
        <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {Math.round(big4.current)}
          <span className="ml-1 text-lg font-medium" style={{ color: 'var(--text-muted)' }}>
            kg
          </span>
        </div>
        {delta > 0 && (
          <div className="mt-1 text-xs font-medium" style={{ color: 'var(--delta-good)' }}>
            ▲ {delta} kg from previous best
          </div>
        )}
      </div>

      {cards.map(({ lift, pr, latest }) => (
        <div
          key={lift.key}
          className="rounded-2xl p-4"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: lift.color }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {lift.key}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {pr ? Math.round(pr.maxE1rm) : '—'}
            <span className="ml-1 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              kg
            </span>
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            est. 1RM PR
          </div>
          {pr && (
            <div className="mt-2 border-t pt-2 text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <div>
                Heaviest: <span style={{ color: 'var(--text-secondary)' }}>{fmtKg(pr.maxWeight)} × {pr.maxWeightReps}</span>
              </div>
              {latest && (
                <div className="mt-0.5">Last: {fmtLongDate(latest.dateKey)}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
