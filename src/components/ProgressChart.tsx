import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { LIFT_BY_KEY, LIFTS, type LiftKey } from '../lib/types'
import {
  e1rmSeries,
  maxWeightSeries,
  recommendedGoals,
  type MaxWeightPoint,
  type Suggestion,
} from '../lib/metrics'
import { quarterCheckpoints } from '../lib/goals'
import { fmtDate, fmtLongDate, fmtPlate } from '../lib/format'
import type { SetRow } from '../lib/types'
import type { MetricMode } from '../lib/mode'
import ChartCard from './ChartCard'

const tipClass = 'rounded-lg px-3 py-2 text-xs shadow-lg'
const tipStyle = { background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

// One tooltip for the whole chart. On the synthetic projected column it lists each
// lift's suggested next-session target; on a real session it shows that session's
// per-lift value (with reps · sets in max-weight mode). Projection series (dataKeys
// ending "__p") never surface as their own rows.
function ProgressTooltip({
  active,
  payload,
  label,
  mode,
  suggestions,
}: TooltipProps<number, string> & { mode: MetricMode; suggestions: Record<LiftKey, Suggestion> }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload as Record<string, unknown>

  const metricNote = mode === 'e1rm' ? 'est. 1RM' : 'heaviest set'

  if (row.__projection === true) {
    const items = LIFTS.filter((l) => row[`${l.key}__p`] != null && suggestions[l.key].prev != null)
    if (items.length === 0) return null
    return (
      <div className={tipClass} style={tipStyle}>
        <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Next session · projected {metricNote}
        </div>
        {items.map((l) => {
          const s = suggestions[l.key]
          return (
            <div key={l.key} className="flex items-center gap-2 py-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
              <span className="ml-auto tabular-nums font-medium">
                {mode === 'e1rm' ? (
                  <>
                    est. 1RM {s.projectedE1rm} kg
                    <span style={{ color: 'var(--text-muted)' }}> · {s.load}×{s.reps}</span>
                  </>
                ) : (
                  <>
                    {s.load} kg × {s.reps}
                    <span style={{ color: 'var(--text-muted)' }}> · {s.sets} {s.sets === 1 ? 'set' : 'sets'}</span>
                  </>
                )}
              </span>
            </div>
          )
        })}
        <div className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          If you hit the suggested goal.
        </div>
      </div>
    )
  }

  const items = payload.filter((p) => p.value != null && !String(p.dataKey).endsWith('__p'))
  if (items.length === 0) return null
  return (
    <div className={tipClass} style={tipStyle}>
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(String(label))} <span style={{ color: 'var(--text-muted)' }}>· {metricNote}</span>
      </div>
      {items.map((p) => {
        const key = p.dataKey as LiftKey
        const d = mode === 'maxWeight' ? (p.payload as MaxWeightPoint).detail?.[key] : undefined
        return (
          <div key={key} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-muted)' }}>{LIFT_BY_KEY.get(key)?.label ?? p.name}</span>
            <span className="ml-auto tabular-nums font-medium">
              {mode === 'maxWeight' ? (
                <>
                  {p.value} kg{d ? ` × ${d.reps}` : ''}
                  {d && d.sets > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}> · {d.sets} {d.sets === 1 ? 'set' : 'sets'}</span>
                  )}
                </>
              ) : (
                `${Math.round(Number(p.value) * 10) / 10} kg`
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

// Hollow "target" ring drawn only at the projected point (the dashed line's tip),
// so it reads as a goal rather than a logged set.
function makeProjDot(projIndex: number, color: string) {
  return function ProjDot(props: { cx?: number; cy?: number; index?: number }) {
    if (props.index !== projIndex || props.cx == null || props.cy == null) return null
    return <circle cx={props.cx} cy={props.cy} r={4} fill="var(--surface-1)" stroke={color} strokeWidth={2} />
  }
}

// Spread tied end-labels vertically (12px) so lifts finishing at the same value
// don't overprint. `points` is each lift's rightmost { value } to label.
function labelOffsetsFor(points: Partial<Record<LiftKey, number>>): Record<string, number> {
  const groups = new Map<number, LiftKey[]>()
  for (const key of Object.keys(points) as LiftKey[]) {
    const value = points[key]
    if (value == null) continue
    const rounded = Math.round(value * 10) / 10
    const group = groups.get(rounded) ?? []
    group.push(key)
    groups.set(rounded, group)
  }
  const offsets: Record<string, number> = {}
  for (const group of groups.values()) {
    const mid = (group.length - 1) / 2
    group.forEach((key, i) => {
      offsets[key] = Math.round((i - mid) * 12)
    })
  }
  return offsets
}

export default function ProgressChart({
  rows,
  mode,
  suggestions,
}: {
  rows: SetRow[]
  mode: MetricMode
  suggestions: Record<LiftKey, Suggestion>
}) {
  const data = useMemo(
    () => (mode === 'e1rm' ? e1rmSeries(rows) : maxWeightSeries(rows)),
    [rows, mode],
  )
  const [hidden, setHidden] = useState<Set<LiftKey>>(new Set())
  const [showGoals, setShowGoals] = useState(true)
  const [startIdx, setStartIdx] = useState(0)

  // Short-term (next fixed calendar quarter) recommended max-weight goal per lift, and
  // its due date — drawn as horizontal target lines in max-weight mode.
  const goals = useMemo(
    () => Object.fromEntries(LIFTS.map((l) => [l.key, recommendedGoals(rows, l.key).short])) as Record<LiftKey, number>,
    [rows],
  )
  const goalDate = useMemo(() => quarterCheckpoints().horizonDate.short, [])
  const goalsOn = mode === 'maxWeight' && showGoals

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

  // The per-lift projection value in the current metric (null when the goal doesn't
  // advance the trend — deload / hold / no history).
  const projValue = (key: LiftKey): number | null => {
    const s = suggestions[key]
    return mode === 'e1rm' ? s.projectedE1rm : s.projectedWeight
  }

  // Chart data with a synthetic future column: each lift's dashed `${key}__p` series
  // runs from its last real value to the projected next-session value.
  const { chartData, projected } = useMemo(() => {
    type Row = Record<string, number | string | boolean | undefined>
    const base = data as unknown as Row[]
    if (base.length === 0) return { chartData: base, projected: false }

    const tsList = data.map((d) => d.ts).slice().sort((a, b) => a - b)
    const diffs: number[] = []
    for (let i = 1; i < tsList.length; i++) diffs.push(tsList[i] - tsList[i - 1])
    diffs.sort((a, b) => a - b)
    const DAY = 86400000
    const gap = diffs.length ? Math.max(DAY, diffs[Math.floor(diffs.length / 2)]) : 3 * DAY
    const projTs = tsList[tsList.length - 1] + gap
    const pd = new Date(projTs)
    const projKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`

    const aug = base.map((row) => ({ ...row }))
    const projRow: Row = { dateKey: projKey, ts: projTs, __projection: true }
    let any = false
    for (const lift of LIFTS) {
      const value = projValue(lift.key)
      const li = lastIndex[lift.key]
      if (value == null || li == null) continue
      const start = (data[li] as unknown as Row)[lift.key]
      if (start == null) continue
      aug[li][`${lift.key}__p`] = start as number
      projRow[`${lift.key}__p`] = value
      any = true
    }
    if (!any) return { chartData: aug, projected: false }
    aug.push(projRow)
    return { chartData: aug, projected: true }
  }, [data, lastIndex, suggestions, mode])

  // Index of the appended projected row within chartData (a projected lift's dashed
  // series and its end-label live at this index).
  const projIndex = data.length

  // Each lift's rightmost plotted value — the projected tip when it projects, else
  // its last real point — used to place and de-collide the end labels.
  const rightMost = useMemo<Partial<Record<LiftKey, number>>>(() => {
    const m: Partial<Record<LiftKey, number>> = {}
    for (const lift of LIFTS) {
      const pv = projValue(lift.key)
      if (projected && pv != null) m[lift.key] = pv
      else {
        const li = lastIndex[lift.key]
        const v = li != null ? (data[li] as unknown as Record<string, number | undefined>)[lift.key] : undefined
        if (v != null) m[lift.key] = v
      }
    }
    return m
  }, [data, lastIndex, projected, suggestions, mode])

  const labelOffsets = useMemo(() => labelOffsetsFor(rightMost), [rightMost])

  // Span slider: `start` clamps the history-depth handle; `shown` is the visible slice
  // (right edge pinned to the latest point / projection). Index-keyed labels & dots are
  // offset by `start` so they still land on the right rows after slicing.
  const maxStart = Math.max(0, chartData.length - 2)
  const start = Math.min(startIdx, maxStart)
  const shown = start > 0 ? chartData.slice(start) : chartData
  const canSlide = data.length >= 3
  const windowStart = shown.length ? fmtLongDate(String((shown[0] as { dateKey: string }).dateKey)) : ''
  const windowEnd = data.length ? fmtLongDate(data[data.length - 1].dateKey) : ''

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

  const goalSwitch = (
    <button
      type="button"
      role="switch"
      aria-checked={showGoals}
      onClick={() => setShowGoals((v) => !v)}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
      style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      <span
        className="relative inline-block h-3.5 w-6 rounded-full transition-colors"
        style={{ background: showGoals ? 'var(--lift-bp)' : 'var(--surface-2)' }}
      >
        <span
          className="absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all"
          style={{ background: '#fff', left: showGoals ? '12px' : '2px' }}
        />
      </span>
      Goals
    </button>
  )

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      {legend}
      {mode === 'maxWeight' && goalSwitch}
    </div>
  )

  const title = mode === 'e1rm' ? 'Estimated 1RM over time' : 'Max weight lifted'
  const subtitle =
    mode === 'e1rm'
      ? 'Epley formula · best working set per session'
      : 'Heaviest set each session, per lift — actual weight, not an estimate'
  const lineType = 'monotone'

  return (
    <ChartCard title={title} subtitle={subtitle} right={controls}>
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer>
          <LineChart data={shown} margin={{ top: 8, right: 56, bottom: 4, left: 4 }}>
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
            <Tooltip content={<ProgressTooltip mode={mode} suggestions={suggestions} />} />
            {goalsOn &&
              LIFTS.map((lift, i) =>
                hidden.has(lift.key) || !(goals[lift.key] > 0) ? null : (
                  <ReferenceLine
                    key={`${lift.key}__goal`}
                    y={goals[lift.key]}
                    stroke={lift.color}
                    strokeDasharray="4 4"
                    strokeOpacity={0.7}
                    ifOverflow="extendDomain"
                    label={{
                      value: `${lift.key} ${fmtPlate(goals[lift.key])}`,
                      // Alternate sides so lifts sharing a goal value don't overprint.
                      position: i % 2 === 0 ? 'insideLeft' : 'insideRight',
                      fill: lift.color,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                ),
              )}
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
                  label={
                    // Non-projecting lifts (deload / no history) keep the code label at
                    // their last real point; projecting lifts label the dashed tip instead.
                    projected && projValue(lift.key) != null
                      ? undefined
                      : (makeEndLabel(lastIndex[lift.key] - start, lift.color, lift.key, labelOffsets[lift.key] ?? 0) as never)
                  }
                />
              ),
            )}
            {projected &&
              LIFTS.map((lift) =>
                hidden.has(lift.key) || projValue(lift.key) == null ? null : (
                  <Line
                    key={`${lift.key}__p`}
                    type="monotone"
                    dataKey={`${lift.key}__p`}
                    stroke={lift.color}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={makeProjDot(projIndex - start, lift.color) as never}
                    activeDot={false}
                    connectNulls
                    isAnimationActive={false}
                    legendType="none"
                    label={makeEndLabel(projIndex - start, lift.color, lift.key, labelOffsets[lift.key] ?? 0) as never}
                  />
                ),
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {canSlide && (
        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Span
          </span>
          <input
            type="range"
            min={0}
            max={maxStart}
            value={start}
            onChange={(e) => setStartIdx(Number(e.target.value))}
            aria-label="Show from"
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
            style={{ accentColor: 'var(--lift-bp)', background: 'var(--surface-2)' }}
          />
          <span className="shrink-0 text-right text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {windowStart} – {windowEnd}
          </span>
        </div>
      )}

      {(projected || goalsOn) && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {projected && 'Dotted = projected next session if you hit the suggested goal (see Next session). '}
          {goalsOn &&
            `Dashed horizontal = 3-month goal (by ${goalDate.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}, this fixed quarter).`}
        </p>
      )}
    </ChartCard>
  )
}
