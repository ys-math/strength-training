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
import { topSetSeries, type TopSetPoint } from '../lib/metrics'
import { BAND_META, type Prescription } from '../lib/engine'
import { fmtDate, fmtLongDate } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import DateRangePicker from './DateRangePicker'
import LiftDetailView from './LiftDetail'
import type { DateRange } from '../lib/dateRange'

// What the card plots: all four lifts against each other, or one lift in depth.
type Scope = 'all' | LiftKey

const tipClass = 'rounded-lg px-3 py-2 text-xs shadow-lg'
const tipStyle = { background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

/** The top set a prescription asks for, or null when the band has no history. */
function topOf(p: Prescription): { load: number; reps: number } | null {
  const set = p.plan.find((s) => s.kind === 'top')
  return set ? { load: set.load, reps: set.reps } : null
}

// One tooltip for the whole chart. On the synthetic projected column it lists each lift's
// prescribed top set; on a real date it shows the top set logged that day, headed by the
// day's band — that heading is what stops a planned volume day from reading as a collapse,
// and it is the only place that answer appears on this card.
// Projection series (dataKeys ending "__p") never surface as their own rows.
function ProgressTooltip({
  active,
  payload,
  label,
  prescriptions,
}: TooltipProps<number, string> & { prescriptions: Record<LiftKey, Prescription> }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload as Record<string, unknown>

  if (row.__projection === true) {
    const items = LIFTS.filter((l) => row[`${l.key}__p`] != null)
    if (items.length === 0) return null
    return (
      <div className={tipClass} style={tipStyle}>
        <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Next session · prescribed top set
        </div>
        {items.map((l) => {
          const p = prescriptions[l.key]
          const top = topOf(p)
          if (!top) return null
          return (
            <div key={l.key} className="flex items-center gap-2 py-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
              <span className="ml-auto tabular-nums font-medium">
                {top.load} kg × {top.reps}
                <span style={{ color: 'var(--text-muted)' }}> · {BAND_META[p.band].label.toLowerCase()} day</span>
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const items = payload.filter((p) => p.value != null && !String(p.dataKey).endsWith('__p'))
  if (items.length === 0) return null
  const band = (row as unknown as TopSetPoint).band
  return (
    <div className={tipClass} style={tipStyle}>
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(String(label))}
        {band && <span style={{ color: 'var(--text-muted)' }}> · {BAND_META[band].label} day</span>}
      </div>
      {items.map((p) => {
        const key = p.dataKey as LiftKey
        const d = (p.payload as TopSetPoint).detail?.[key]
        return (
          <div key={key} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            <span style={{ color: 'var(--text-muted)' }}>{LIFT_BY_KEY.get(key)?.label ?? p.name}</span>
            <span className="ml-auto tabular-nums font-medium">
              {p.value} kg{d ? ` × ${d.reps}` : ''}
              {d?.isPR && <span style={{ color: 'var(--text-muted)' }}> · PR</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Direct end-label: renders the lift code at its final defined point only, on a
// translucent chip so it stays legible over gridlines and other lines. `dyExtra`
// nudges labels apart when two lifts end at close values so they don't overlap.
function makeEndLabel(lastIndex: number, color: string, text: string, dyExtra: number) {
  return function EndLabel(props: { x?: number; y?: number; index?: number }) {
    if (props.index !== lastIndex || props.x == null || props.y == null) return null
    const x = props.x + 8
    const y = props.y + 4 + dyExtra
    const w = text.length * 7 + 6
    return (
      <g>
        <rect x={x - 3} y={y - 10} width={w} height={14} rx={3} fill="var(--page)" fillOpacity={0.85} />
        <text x={x} y={y} fontSize={11} fontWeight={700} fill={color}>
          {text}
        </text>
      </g>
    )
  }
}

// Two dots in one renderer, because they answer two different questions.
//
// The plain dot marks a session this lift logged a top set. That is not decoration: the
// x-axis has one slot per training day that produced any top set, so a lift without one
// that day is `undefined` and `connectNulls` bridges straight over it. Without dots the
// bridge is drawn identically to real data.
//
// The haloed dot marks a session where the record actually advanced. The line rises and
// falls with the band, so dotting every up-tick would call a rebound off a volume day a
// PR. `isPR` is therefore a running max over the full history, decided in `topSetSeries`,
// not by comparing neighbouring points here.
//
// The two must not be told apart by fill alone — at 4 lines they'd blur. A PR is bigger
// AND carries a `--surface-1` ring that punches a gap out of the line behind it.
function makeSessionDot(key: LiftKey, all: readonly TopSetPoint[], color: string) {
  return function SessionDot(props: { cx?: number; cy?: number; index?: number }) {
    if (props.index == null || props.cx == null || props.cy == null) return null
    const d = all[props.index]?.detail?.[key]
    if (!d) return null
    return d.isPR ? (
      <circle cx={props.cx} cy={props.cy} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
    ) : (
      <circle cx={props.cx} cy={props.cy} r={2} fill={color} />
    )
  }
}

// Hollow "target" ring drawn only at the projected point (the dashed line's tip),
// so it reads as a plan rather than a logged set.
function makeProjDot(projIndex: number, color: string) {
  return function ProjDot(props: { cx?: number; cy?: number; index?: number }) {
    if (props.index !== projIndex || props.cx == null || props.cy == null) return null
    return <circle cx={props.cx} cy={props.cy} r={4} fill="var(--surface-1)" stroke={color} strokeWidth={2} />
  }
}

// Vertical label decluttering: chain-clusters values that fall within `minGap` of
// their neighbor (not just exact ties — e.g. 67.5 and 70 are visually close on a
// compressed axis) and fans each cluster out symmetrically by `step` px so labels
// never overprint. `points` is each lift's value to label.
function declutterByValue(points: Partial<Record<LiftKey, number>>, minGap: number, step = 12): Record<string, number> {
  const entries = (Object.entries(points) as [LiftKey, number | undefined][])
    .filter((e): e is [LiftKey, number] => e[1] != null)
    .sort((a, b) => b[1] - a[1])
  const offsets: Record<string, number> = {}
  let i = 0
  while (i < entries.length) {
    let j = i
    while (j + 1 < entries.length && entries[j][1] - entries[j + 1][1] < minGap) j++
    const group = entries.slice(i, j + 1)
    const mid = (group.length - 1) / 2
    group.forEach(([key], k) => {
      offsets[key] = Math.round((k - mid) * step)
    })
    i = j + 1
  }
  return offsets
}

export default function ProgressChart({
  rows,
  prescriptions,
  showProjection,
  days,
  range,
  setRange,
}: {
  /** Already sliced to `range`. */
  rows: SetRow[]
  prescriptions: Record<LiftKey, Prescription>
  /** False when the range has been pulled back off the latest session, where a
   *  next-session projection would be drawn beyond the window's own right edge. */
  showProjection: boolean
  /** The span control. It sits in this card but drives the volume and frequency cards too,
   *  which is why it is owned by Dashboard rather than by local state here. */
  days: string[]
  range: DateRange
  setRange: (r: DateRange) => void
}) {
  // Each session's logged TOP SET — one rep band rather than whichever band the session
  // ran, so the line compares like with like. It still moves with the band, because the
  // top set is derived from the band's load; the tooltip names the band so a dip reads as
  // a volume day rather than as lost strength.
  const { series: data, records } = useMemo(() => topSetSeries(rows), [rows])
  const [hidden, setHidden] = useState<Set<LiftKey>>(new Set())
  const [scope, setScope] = useState<Scope>('all')

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

  // The prescribed top set, drawn whether it rises or falls. A lighter next session is a
  // real prediction under this program and the axis can say so.
  const projValue = (key: LiftKey): number | null =>
    showProjection ? (topOf(prescriptions[key])?.load ?? null) : null

  // Chart data with a synthetic future column: each lift's dashed `${key}__p` series
  // runs from its last real value to the prescribed next-session top set.
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
  }, [data, lastIndex, prescriptions, showProjection])

  // Index of the appended projected row within chartData.
  const projIndex = data.length

  // Each lift's rightmost plotted value — the projected tip when it projects, else its
  // last real point — used to place and de-collide the end labels.
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
  }, [data, lastIndex, projected, prescriptions, showProjection])

  const domainMax = useMemo(() => {
    const vals = Object.values(rightMost).filter((v): v is number => v != null && v > 0)
    return vals.length ? Math.max(...vals) : 100
  }, [rightMost])

  const labelOffsets = useMemo(
    () => declutterByValue(rightMost, Math.max(4, domainMax * 0.05)),
    [rightMost, domainMax],
  )

  const toggle = (k: LiftKey) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const legend = (
    <div className="flex flex-wrap justify-end gap-1.5">
      {LIFTS.map((lift) => {
        const off = hidden.has(lift.key)
        // The record within the visible range, NOT the last point: the line rises and
        // falls with the band, so a volume day would otherwise print "BP 60" and read as
        // "my bench is 60 kg".
        const current = records[lift.key] > 0 ? records[lift.key] : undefined
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

  // Scope selector — a *separate* control from the legend chips on purpose. The chips
  // multi-select (hide/show lines); drilling down is a different interaction, and
  // overloading a chip click with both would make neither predictable.
  const scopeSelector = (
    <div
      className="inline-flex rounded-full p-0.5"
      role="group"
      aria-label="Chart scope"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      {([{ key: 'all' as const, label: 'All' }, ...LIFTS.map((l) => ({ key: l.key, label: l.key }))]).map((s) => {
        const on = s.key === scope
        const tint = s.key === 'all' ? 'var(--text-primary)' : LIFT_BY_KEY.get(s.key as LiftKey)!.color
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => setScope(s.key as Scope)}
            aria-pressed={on}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{
              background: on ? tint : 'transparent',
              color: on ? (s.key === 'all' ? 'var(--page)' : '#fff') : 'var(--text-muted)',
            }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )

  const detailLift = scope !== 'all' ? LIFT_BY_KEY.get(scope)! : null

  // Two fixed rows, not one wrapping cluster. The scope selector is LAST on the top row
  // and the row is right-aligned, so it stays pinned to the same corner whether or not the
  // legend exists — the controls never shift under you when you change scope.
  const controls = (
    <div className="flex flex-col items-end gap-1.5">
      {scopeSelector}
      {!detailLift && legend}
    </div>
  )


  // Sits below the plot in both scopes, where the old per-card slider used to live.
  const spanControl = (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <DateRangePicker days={days} range={range} setRange={setRange} />
    </div>
  )

  const title = detailLift ? `${detailLift.label} detail` : 'Top set lifted'
  const subtitle = detailLift
    ? 'Every set performed — block height is the weight, so a column is the session’s volume'
    : 'The heavy top set each session, per lift — actual weight, never an estimate'

  if (detailLift) {
    return (
      <ChartCard title={title} subtitle={subtitle} right={controls}>
        <LiftDetailView rows={rows} lift={detailLift.key} />
        {spanControl}
      </ChartCard>
    )
  }

  return (
    <ChartCard title={title} subtitle={subtitle} right={controls}>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 56, bottom: 4, left: 4 }}>
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
            <Tooltip content={<ProgressTooltip prescriptions={prescriptions} />} />
            {LIFTS.map((lift) =>
              hidden.has(lift.key) ? null : (
                <Line
                  key={lift.key}
                  type="monotone"
                  dataKey={lift.key}
                  name={lift.label}
                  stroke={lift.color}
                  strokeWidth={2}
                  dot={makeSessionDot(lift.key, data, lift.color) as never}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                  label={
                    // Projecting lifts label the dashed tip instead of their last real point.
                    projected && projValue(lift.key) != null
                      ? undefined
                      : (makeEndLabel(lastIndex[lift.key], lift.color, lift.key, labelOffsets[lift.key] ?? 0) as never)
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
                    dot={makeProjDot(projIndex, lift.color) as never}
                    activeDot={false}
                    connectNulls
                    isAnimationActive={false}
                    legendType="none"
                    label={makeEndLabel(projIndex, lift.color, lift.key, labelOffsets[lift.key] ?? 0) as never}
                  />
                ),
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* The chart's one hazard, stated where it's read. */}
      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        The top set follows the day’s band, so a dip is usually a volume day rather than lost
        strength. A dot = a session with a logged top set; a ringed dot = a new record. Between
        dots the line is drawn through, not measured.
      </p>

      {projected && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Dotted = the top set prescribed for your next session (see Next session).
        </p>
      )}

      {spanControl}
      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Span drives the Volume and Training-frequency cards too. It never changes what Next session
        tells you to lift.
      </p>
    </ChartCard>
  )
}
