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
  FOCUS_META,
  recommendedGoals,
  sessionMaxSeries,
  type SessionMaxPoint,
  type Suggestion,
} from '../lib/metrics'
import { quarterCheckpoints } from '../lib/goals'
import { fmtDate, fmtLongDate, fmtPlate } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import LiftDetailView from './LiftDetail'

// What the card plots: all four lifts against each other, or one lift in depth.
type Scope = 'all' | LiftKey

const tipClass = 'rounded-lg px-3 py-2 text-xs shadow-lg'
const tipStyle = { background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

// One tooltip for the whole chart. On the synthetic projected column it lists each
// lift's suggested next-session target; on a real date it shows what was lifted that
// day, headed by the day's focus — "Light day" is what stops a planned 50 kg bench from
// reading as a collapse, and it's the only place that answer appears on this card.
// Projection series (dataKeys ending "__p") never surface as their own rows.
function ProgressTooltip({
  active,
  payload,
  label,
  suggestions,
}: TooltipProps<number, string> & { suggestions: Record<LiftKey, Suggestion> }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload as Record<string, unknown>

  if (row.__projection === true) {
    const items = LIFTS.filter((l) => row[`${l.key}__p`] != null && suggestions[l.key].prev != null)
    if (items.length === 0) return null
    return (
      <div className={tipClass} style={tipStyle}>
        <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
          Next session · projected heaviest set
        </div>
        {items.map((l) => {
          const s = suggestions[l.key]
          return (
            <div key={l.key} className="flex items-center gap-2 py-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              <span style={{ color: 'var(--text-muted)' }}>{l.label}</span>
              <span className="ml-auto tabular-nums font-medium">
                {s.load} kg × {s.reps}
                <span style={{ color: 'var(--text-muted)' }}> · {s.sets} {s.sets === 1 ? 'set' : 'sets'}</span>
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
  const focus = (row as unknown as SessionMaxPoint).focus
  return (
    <div className={tipClass} style={tipStyle}>
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(String(label))}
        {/* FOCUS_META.label already carries the word "day" — Heavy day / Moderate day / Volume day. */}
        {focus && <span style={{ color: 'var(--text-muted)' }}> · {FOCUS_META[focus].label}</span>}
      </div>
      {items.map((p) => {
        const key = p.dataKey as LiftKey
        const d = (p.payload as SessionMaxPoint).detail?.[key]
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

// Goal target label: renders "{code} {kg}" at the left edge of a horizontal
// ReferenceLine, on the same translucent chip treatment as end-labels. Always on
// the left (end-of-line labels live on the right) so the two groups never collide;
// `dy` fans out labels whose targets are close in value (see declutterByValue).
function makeGoalLabel(color: string, text: string, dy: number) {
  return function GoalLabel(props: { viewBox?: { x?: number; y?: number } }) {
    const vb = props.viewBox
    if (vb?.x == null || vb.y == null) return null
    const x = vb.x + 10
    const y = vb.y + dy
    const w = text.length * 5.6 + 8
    return (
      <g>
        <rect x={x - 4} y={y - 9} width={w} height={14} rx={3} fill="var(--page)" fillOpacity={0.85} />
        <text x={x} y={y + 3} fontSize={10} fontWeight={700} fill={color}>
          {text}
        </text>
      </g>
    )
  }
}

// Two dots in one renderer, because they answer two different questions.
//
// The plain dot marks a session this lift was ACTUALLY trained. That is not decoration: the
// x-axis has one slot per *training day* (any big-four day), so a lift not trained that day is
// `undefined` and `connectNulls` bridges straight over it. Without dots, that bridge is drawn
// identically to real data — and it is not a rare edge case: OHP is logged on 14 of 32 days, so
// **over half** its line is interpolation. The dots are what separate the measured points from
// the drawn-through ones.
//
// The haloed dot marks a session where the record actually *advanced*. The line plots each
// session's own top set, so it rises and falls; dotting every up-tick would call a rebound off
// a light day a PR (60 → 50 → 60 sets no record). `isPR` is therefore a running max over the
// full history, decided in `sessionMaxSeries`, not by comparing neighbouring points here.
//
// The two must not be told apart by *fill alone* — at 4 lines × 32 points they'd blur together.
// A PR is bigger AND carries a `--surface-1` ring that punches a gap out of the line behind it,
// so it reads as an event rather than a slightly fatter dot.
//
// `all` is the FULL history and `start` the slice offset, so a zoomed span still reads the
// right row.
function makeSessionDot(key: LiftKey, all: readonly SessionMaxPoint[], start: number, color: string) {
  return function SessionDot(props: { cx?: number; cy?: number; index?: number }) {
    if (props.index == null || props.cx == null || props.cy == null) return null
    const d = all[props.index + start]?.detail?.[key]
    // No entry = this lift wasn't trained that day; the line here is connectNulls' guess, and
    // it must stay bare.
    if (!d) return null
    return d.isPR ? (
      <circle cx={props.cx} cy={props.cy} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
    ) : (
      <circle cx={props.cx} cy={props.cy} r={2} fill={color} />
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
  suggestions,
}: {
  rows: SetRow[]
  suggestions: Record<LiftKey, Suggestion>
}) {
  // Each session's own heaviest working set — every point a weight lifted *that day*.
  // The line therefore zigzags under DUP, and that is the trade taken: best-to-date could
  // never descend, so a deload or a light block read as flat and the chart went dead for
  // weeks. The cost accepted in exchange is that the top of the line is no longer the
  // record — hence `records` on the legend chips, `isPR` on the dots, and the focus label
  // in the tooltip. Don't "fix" this back to a monotone series.
  const { series: data, records } = useMemo(() => sessionMaxSeries(rows), [rows])
  const [hidden, setHidden] = useState<Set<LiftKey>>(new Set())
  const [showGoals, setShowGoals] = useState(true)
  const [startIdx, setStartIdx] = useState(0)
  const [scope, setScope] = useState<Scope>('all')

  // Short-term (next fixed calendar quarter) recommended max-weight goal per lift, and
  // its due date — drawn as horizontal target lines in max-weight mode.
  const goals = useMemo(
    () => Object.fromEntries(LIFTS.map((l) => [l.key, recommendedGoals(rows, l.key).short])) as Record<LiftKey, number>,
    [rows],
  )
  const goalDate = useMemo(() => quarterCheckpoints().horizonDate.short, [])
  const goalsOn = showGoals

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

  // The per-lift projected top set, drawn whether it rises or falls. It used to be
  // suppressed unless it beat the standing record — necessary when the line couldn't
  // descend, but it meant the suggestion was hidden most of the time, since under DUP the
  // next session is usually *lighter* than the record. A projected light day is a real
  // prediction and this axis can now say so.
  const projValue = (key: LiftKey): number | null => suggestions[key].projectedWeight

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
  }, [data, lastIndex, suggestions])

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
  }, [data, lastIndex, projected, suggestions])

  // Rough value scale of the chart (end points + visible goals) used only to size the
  // "close enough to collide" threshold below — doesn't need to match the axis exactly.
  const domainMax = useMemo(() => {
    const vals = [...Object.values(rightMost), ...(goalsOn ? Object.values(goals) : [])].filter(
      (v): v is number => v != null && v > 0,
    )
    return vals.length ? Math.max(...vals) : 100
  }, [rightMost, goals, goalsOn])

  const labelOffsets = useMemo(
    () => declutterByValue(rightMost, Math.max(4, domainMax * 0.05)),
    [rightMost, domainMax],
  )

  const visibleGoals = useMemo<Partial<Record<LiftKey, number>>>(() => {
    if (!goalsOn) return {}
    const m: Partial<Record<LiftKey, number>> = {}
    for (const lift of LIFTS) if (!hidden.has(lift.key) && goals[lift.key] > 0) m[lift.key] = goals[lift.key]
    return m
  }, [goalsOn, goals, hidden])
  const goalLabelOffsets = useMemo(
    () => declutterByValue(visibleGoals, Math.max(4, domainMax * 0.06), 14),
    [visibleGoals, domainMax],
  )

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
    <div className="flex flex-wrap justify-end gap-1.5">
      {LIFTS.map((lift) => {
        const off = hidden.has(lift.key)
        // The all-time record, NOT the last point. On a best-to-date line those were the
        // same number; on this one the last point is the last session's top set, so a
        // light day would print "BP 50" and read as "my bench is 50 kg". With the record
        // no longer drawn as a line, this chip is the only place the card states it.
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

  // Two fixed rows, not one wrapping cluster. The scope selector is LAST on the top row
  // and the row is right-aligned, so it stays pinned to the same corner whether or not the
  // legend exists — the controls never shift under you when you change scope.
  const detailLift = scope !== 'all' ? LIFT_BY_KEY.get(scope)! : null

  // The Goals switch is hidden in a lift scope, not merely inert: a goal is a
  // *max-weight* kg number (65 kg), and the drill-down's axis is kg of *volume*
  // (0–~2000). The target has no coordinate there, so the control has nothing to toggle.
  const controls = (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {!detailLift && goalSwitch}
        {scopeSelector}
      </div>
      {!detailLift && legend}
    </div>
  )

  const title = detailLift ? `${detailLift.label} detail` : 'Max weight lifted'
  const subtitle = detailLift
    ? 'Every set performed — block height is the weight, so a column is the session’s volume'
    : 'Heaviest working set each session, per lift — actual weight, never an estimate'

  if (detailLift) {
    return (
      <ChartCard title={title} subtitle={subtitle} right={controls}>
        <LiftDetailView rows={rows} lift={detailLift.key} />
      </ChartCard>
    )
  }

  return (
    <ChartCard title={title} subtitle={subtitle} right={controls}>
      <div style={{ width: '100%', height: 280 }}>
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
            <Tooltip content={<ProgressTooltip suggestions={suggestions} />} />
            {goalsOn &&
              LIFTS.map((lift) =>
                hidden.has(lift.key) || !(goals[lift.key] > 0) ? null : (
                  <ReferenceLine
                    key={`${lift.key}__goal`}
                    y={goals[lift.key]}
                    stroke={lift.color}
                    strokeDasharray="4 4"
                    strokeOpacity={0.7}
                    ifOverflow="extendDomain"
                    // Always on the left — end-of-line labels live on the right — so the
                    // two label groups never collide; declutter fans out close targets.
                    label={
                      makeGoalLabel(
                        lift.color,
                        `${lift.key} ${fmtPlate(goals[lift.key])}`,
                        goalLabelOffsets[lift.key] ?? 0,
                      ) as never
                    }
                  />
                ),
              )}
            {LIFTS.map((lift) =>
              hidden.has(lift.key) ? null : (
                <Line
                  key={lift.key}
                  type="monotone"
                  dataKey={lift.key}
                  name={lift.label}
                  stroke={lift.color}
                  strokeWidth={2}
                  dot={makeSessionDot(lift.key, data, start, lift.color) as never}
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

      {/* The chart's one hazard, stated where it's read: under DUP the engine *plans* light
          days, so a drop here is usually the program working, not lost strength. */}
      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Dips are planned light days, not lost strength — the program undulates heavy/moderate/light.
        A dot = a session that lift was trained; a ringed dot = a new record. Between dots the line is
        drawn through, not measured.
      </p>

      {(projected || goalsOn) && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
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
