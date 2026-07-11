import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { LIFT_BY_KEY, type LiftKey } from '../lib/types'
import { liftSessions, round1 } from '../lib/metrics'
import { fmtDate, fmtLongDate, fmtPlate } from '../lib/format'
import type { SetRow } from '../lib/types'

interface DetailPoint {
  dateKey: string
  ts: number
  e1rm: number
  weight: number
  reps: number
  sets: number
}

// Tooltip carrying the reps and working-set count behind each session's heaviest
// point, which the generic value tooltip can't show.
function DetailTooltip({ active, payload, label, color }: TooltipProps<number, string> & { color: string }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload as DetailPoint
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(String(label))}
      </div>
      <div className="flex items-center gap-2 py-0.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        <span style={{ color: 'var(--text-muted)' }}>Est. 1RM</span>
        <span className="ml-auto tabular-nums font-medium">{round1(p.e1rm)} kg</span>
      </div>
      <div className="flex items-center gap-2 py-0.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--text-secondary)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Heaviest set</span>
        <span className="ml-auto tabular-nums font-medium">
          {p.weight} kg × {p.reps}
          <span style={{ color: 'var(--text-muted)' }}> · {p.sets} {p.sets === 1 ? 'set' : 'sets'}</span>
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: tone ?? 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  )
}

// The single-lift drill-down of the Progress card: est. 1RM and the heaviest set on ONE
// kg axis (never a dual axis — see CLAUDE.md), which is the only view that shows whether
// e1RM gains are real load or rep inflation. Deliberately independent of MetricMode: it
// always plots BOTH series, so the header's mode toggle doesn't drive it.
export default function LiftDetailView({
  rows,
  lift: liftKey,
  goal,
}: {
  rows: SetRow[]
  lift: LiftKey
  goal?: number | null
}) {
  const lift = LIFT_BY_KEY.get(liftKey)!

  const data = useMemo<DetailPoint[]>(
    () =>
      liftSessions(rows, liftKey).map((s) => ({
        dateKey: s.dateKey,
        ts: s.date.getTime(),
        e1rm: round1(s.bestE1rm),
        weight: s.maxWeight,
        reps: s.maxWeightReps,
        sets: s.workingSets,
      })),
    [rows, liftKey],
  )

  // Progress summary over the plotted span, based on the heaviest set per session.
  const summary = useMemo(() => {
    if (data.length === 0) return null
    const first = data[0]
    const last = data[data.length - 1]
    const gain = round1(last.weight - first.weight)
    const pct = first.weight > 0 ? Math.round((gain / first.weight) * 100) : 0
    const weeks = (last.ts - first.ts) / (7 * 86400000)
    const perWeek = weeks >= 1 ? round1(gain / weeks) : null
    const bestE1rm = round1(Math.max(...data.map((d) => d.e1rm)))
    return { current: last, gain, pct, perWeek, bestE1rm, sessions: data.length }
  }, [data])

  const gainTone = summary && summary.gain > 0 ? 'var(--delta-good)' : undefined
  const goalOn = goal != null && goal > 0

  return (
    <>
      {summary && (
        <div
          className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl p-3 sm:grid-cols-5"
          style={{ background: 'var(--page)', border: '1px solid var(--border)' }}
        >
          <Stat label="Heaviest now" value={`${summary.current.weight} kg × ${summary.current.reps}`} />
          <Stat
            label="Gain over span"
            value={`${summary.gain > 0 ? '▲ ' : ''}${summary.gain} kg`}
            tone={gainTone}
          />
          <Stat label="Change" value={`${summary.pct > 0 ? '+' : ''}${summary.pct}%`} tone={gainTone} />
          <Stat label="Rate" value={summary.perWeek != null ? `${summary.perWeek} kg/wk` : '—'} />
          <Stat label="Best est. 1RM" value={`${summary.bestE1rm} kg`} />
        </div>
      )}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="e1rmFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lift.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={lift.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="dateKey"
              tickFormatter={fmtDate}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--baseline)"
              minTickGap={28}
            />
            <YAxis
              width={40}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--baseline)"
            />
            <Tooltip content={<DetailTooltip color={lift.color} />} />
            {/* The 3-month target is a max-weight quantity, and the heaviest-set line is
                always plotted here — so the goal is meaningful in this view regardless of
                the header's metric mode. */}
            {goalOn && (
              <ReferenceLine
                y={goal}
                stroke={lift.color}
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                ifOverflow="extendDomain"
                label={{
                  value: `Goal ${fmtPlate(goal)}`,
                  position: 'insideTopLeft',
                  fill: lift.color,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="e1rm"
              name="Est. 1RM"
              stroke={lift.color}
              strokeWidth={2}
              fill="url(#e1rmFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="weight"
              name="Heaviest set"
              stroke="var(--text-secondary)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
