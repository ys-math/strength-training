import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { LIFT_BY_KEY, LIFTS, type LiftKey } from '../lib/types'
import { e1rmSeries, maxWeightSeries, type MaxWeightPoint } from '../lib/metrics'
import { fmtDate, fmtLongDate } from '../lib/format'
import type { SetRow } from '../lib/types'
import type { MetricMode } from '../lib/mode'
import ChartCard from './ChartCard'
import ChartTooltip from './Tooltip'

// Max-weight mode tooltip: each lift's heaviest set that session as weight × reps,
// plus its working-set count — the number the generic value tooltip can't carry.
function MaxWeightTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload as MaxWeightPoint
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(String(label))}
      </div>
      {payload
        .filter((p) => p.value != null)
        .map((p) => {
          const key = p.dataKey as LiftKey
          const d = point.detail[key]
          return (
            <div key={key} className="flex items-center gap-2 py-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              <span style={{ color: 'var(--text-muted)' }}>{LIFT_BY_KEY.get(key)?.label ?? p.name}</span>
              <span className="ml-auto tabular-nums font-medium">
                {p.value} kg{d ? ` × ${d.reps}` : ''}
                {d && d.sets > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}> · {d.sets} {d.sets === 1 ? 'set' : 'sets'}</span>
                )}
              </span>
            </div>
          )
        })}
    </div>
  )
}

// Direct end-label: renders the lift code at its final defined point only.
// `dyExtra` nudges labels apart when two lifts end at the same value (common in
// max-weight mode, where kg are discrete plate increments) so they don't overlap.
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

// Groups lifts whose final plotted value ties (within rounding) and spreads their
// end-labels vertically so they don't render on top of one another.
function endLabelOffsets(
  data: Array<Partial<Record<LiftKey, number>>>,
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

export default function ProgressChart({ rows, mode }: { rows: SetRow[]; mode: MetricMode }) {
  const data = useMemo(
    () => (mode === 'e1rm' ? e1rmSeries(rows) : maxWeightSeries(rows)),
    [rows, mode],
  )
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
            style={{ border: '1px solid var(--border)', opacity: off ? 0.4 : 1, color: 'var(--text-secondary)' }}
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

  const title = mode === 'e1rm' ? 'Estimated 1RM over time' : 'Max weight lifted'
  const subtitle =
    mode === 'e1rm'
      ? 'Epley formula · best working set per session'
      : 'Heaviest set each session, per lift — actual weight, not an estimate'
  const lineType = 'monotone'

  return (
    <ChartCard title={title} subtitle={subtitle} right={legend}>
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
            />
            <Tooltip
              content={
                mode === 'e1rm' ? (
                  <ChartTooltip labelFormatter={fmtLongDate} valueFormatter={(v) => `${Math.round(v * 10) / 10} kg`} />
                ) : (
                  <MaxWeightTooltip />
                )
              }
            />
            {LIFTS.map((lift) =>
              hidden.has(lift.key) ? null : (
                <Line
                  key={lift.key}
                  type={lineType}
                  dataKey={lift.key}
                  name={lift.label}
                  stroke={lift.color}
                  strokeWidth={2}
                  dot={mode === 'e1rm' ? false : { r: 2.5, strokeWidth: 0, fill: lift.color }}
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
