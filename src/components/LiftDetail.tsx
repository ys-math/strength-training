import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LIFTS, type LiftKey } from '../lib/types'
import { liftSessions, round1 } from '../lib/metrics'
import { fmtDate, fmtLongDate } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import ChartTooltip from './Tooltip'

export default function LiftDetail({ rows }: { rows: SetRow[] }) {
  const [selected, setSelected] = useState<LiftKey>('BP')
  const lift = LIFTS.find((l) => l.key === selected)!

  const data = useMemo(
    () =>
      liftSessions(rows, selected).map((s) => ({
        dateKey: s.dateKey,
        e1rm: round1(s.bestE1rm),
        weight: s.topWeight,
      })),
    [rows, selected],
  )

  const selector = (
    <div className="flex gap-1.5">
      {LIFTS.map((l) => {
        const on = l.key === selected
        return (
          <button
            key={l.key}
            onClick={() => setSelected(l.key)}
            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{
              border: '1px solid var(--border)',
              background: on ? l.color : 'transparent',
              color: on ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {l.key}
          </button>
        )
      })}
    </div>
  )

  return (
    <ChartCard title={`${lift.label} detail`} subtitle="Est. 1RM vs. heaviest set (kg)" right={selector}>
      <div style={{ width: '100%', height: 300 }}>
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
            <Tooltip
              content={
                <ChartTooltip labelFormatter={fmtLongDate} valueFormatter={(v) => `${round1(v)} kg`} />
              }
            />
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
    </ChartCard>
  )
}
