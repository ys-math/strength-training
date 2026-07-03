import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LIFTS, type LiftKey } from '../lib/types'
import { maxWeightSeries, type E1rmPoint } from '../lib/metrics'
import { fmtDate, fmtLongDate } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import ChartTooltip from './Tooltip'

// Direct end-label: renders the lift code at its final defined point only.
// `dyExtra` nudges labels apart when two lifts end at the same weight (common
// here — kg values are discrete plate increments, unlike the continuous e1RM
// formula — and would otherwise render one directly on top of the other).
function makeEndLabel(lastIndex: number, color: string, text: string, dyExtra: number) {
  return function EndLabel(props: { x?: number; y?: number; index?: number }) {
    if (props.index !== lastIndex || props.x == null || props.y == null) return null
    return (
      <text x={props.x + 8} y={props.y} dy={4 + dyExtra} fontSize={11} fontWeight={700} fill={color}>
        {text}
      </text>
    )
  }
}

// Groups lifts whose final plotted value ties (within rounding) and spreads
// their end-labels vertically so they don't overlap.
function endLabelOffsets(
  data: E1rmPoint[],
  lastIndex: Record<string, number>,
  keys: LiftKey[],
): Record<string, number> {
  const groups = new Map<number, string[]>()
  for (const key of keys) {
    const idx = lastIndex[key]
    const value = idx != null ? data[idx]?.[key] : undefined
    if (value == null) continue
    const rounded = Math.round(value * 10) / 10
    const group = groups.get(rounded) ?? []
    group.push(key)
    groups.set(rounded, group)
  }
  const offsets: Record<string, number> = {}
  const step = 12
  for (const group of groups.values()) {
    const mid = (group.length - 1) / 2
    group.forEach((key, i) => {
      offsets[key] = Math.round((i - mid) * step)
    })
  }
  return offsets
}

export default function MaxWeightChart({ rows }: { rows: SetRow[] }) {
  const data = useMemo(() => maxWeightSeries(rows), [rows])
  const [hidden, setHidden] = useState<Set<LiftKey>>(new Set())

  const lastIndex = useMemo(() => {
    const map: Record<string, number> = {}
    for (const lift of LIFTS) {
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i][lift.key] != null) {
          map[lift.key] = i
          break
        }
      }
    }
    return map
  }, [data])

  const labelOffsets = useMemo(
    () => endLabelOffsets(data, lastIndex, LIFTS.map((l) => l.key)),
    [data, lastIndex],
  )

  const toggle = (k: LiftKey) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const legend = (
    <div className="flex flex-wrap gap-1.5">
      {LIFTS.map((lift) => {
        const off = hidden.has(lift.key)
        const current = data[lastIndex[lift.key]]?.[lift.key]
        return (
          <button
            key={lift.key}
            onClick={() => toggle(lift.key)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-opacity"
            style={{
              border: '1px solid var(--border)',
              opacity: off ? 0.4 : 1,
              color: 'var(--text-secondary)',
            }}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: lift.color }} />
            {lift.label}
            {current != null && (
              <span className="tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                {Math.round(current)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <ChartCard
      title="Max weight lifted"
      subtitle="Actual heaviest set to date, per lift — not an estimate"
      right={legend}
    >
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 44, bottom: 4, left: 4 }}>
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
              tickFormatter={(v: number) => `${v}`}
              unit=""
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={fmtLongDate}
                  valueFormatter={(v) => `${Math.round(v * 10) / 10} kg`}
                />
              }
            />
            {LIFTS.map((lift) =>
              hidden.has(lift.key) ? null : (
                <Line
                  key={lift.key}
                  type="stepAfter"
                  dataKey={lift.key}
                  name={lift.label}
                  stroke={lift.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                  label={makeEndLabel(lastIndex[lift.key], lift.color, lift.key, labelOffsets[lift.key] ?? 0) as never}
                />
              ),
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
