import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FOCUS_COLOR,
  FOCUS_META,
  dailyMetrics,
  focusMix,
  frequencyStats,
  overallStats,
  quantileThresholds,
  sessionDetails,
  volumeBucket,
  type DayFocus,
  type DayMetrics,
  type SessionDetail,
} from '../lib/metrics'
import { fmtLongDate, fmtTonnage, shortExerciseName } from '../lib/format'
import type { HeatmapMetric } from '../lib/heatmapMetric'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import HeatmapMetricToggle from './HeatmapMetricToggle'

const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const EMPTY_DAY: DayMetrics = { sets: 0, volume: 0, focus: null, focusReps: null }

// Focus labels for the legend. Deliberately the DayFocus keys, not FOCUS_META's labels
// (whose `light` reads "Volume day") — a legend wants the scale's own vocabulary.
const FOCUS_LEGEND: { focus: DayFocus; label: string }[] = [
  { focus: 'light', label: 'Light' },
  { focus: 'moderate', label: 'Moderate' },
  { focus: 'heavy', label: 'Heavy' },
]

// Working-set count → sequential bucket (single blue hue, light→dark).
function bucket(count: number): number {
  if (count <= 0) return 0
  if (count <= 4) return 1
  if (count <= 9) return 2
  if (count <= 14) return 3
  return 4
}

function keyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface HoverInfo {
  key: string
  day: DayMetrics
  rect: DOMRect
}

// Rendered via a portal into document.body, positioned `fixed` from the hovered
// cell's own bounding box — this is what lets it escape the heatmap's
// overflow-x-auto scroll container. That container clips vertically too (a CSS
// quirk: overflow-x:auto forces overflow-y to auto as well when left unset), so
// an absolutely-positioned tooltip nested inside it gets cut off top/bottom, not
// just at the left/right edges.
//
// It prints all three metrics whatever the active mode is: color is for scanning the
// calendar, so nobody should have to switch modes just to read one day.
function HeatmapTooltip({ hover, session }: { hover: HoverInfo; session?: SessionDetail }) {
  const HALF_WIDTH = 110 // half of max-w-[220px]
  const idealLeft = hover.rect.left + hover.rect.width / 2
  const left = Math.min(Math.max(idealLeft, 8 + HALF_WIDTH), window.innerWidth - 8 - HALF_WIDTH)
  const showBelow = hover.rect.top < 90

  const { sets, volume, focus, focusReps } = hover.day
  const activeExercises = session?.exercises.filter((e) => e.workingSets > 0) ?? []

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[220px] rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg"
      style={{
        left,
        top: showBelow ? hover.rect.bottom + 8 : hover.rect.top - 8,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        background: 'var(--page)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(hover.key)}
      </div>
      <div>
        {sets} working set{sets === 1 ? '' : 's'}
        {sets > 0 && ` · ${fmtTonnage(volume)}`}
      </div>
      {/* The reps are the whole of the evidence behind the label — printing them makes it
          auditable, so a day that disagrees with what you remember lifting is one glance
          from being settled. */}
      {focus && (
        <div style={{ color: 'var(--text-secondary)' }}>
          {FOCUS_META[focus].label}
          {focusReps != null && ` · ${focusReps} reps at working load`}
        </div>
      )}
      {activeExercises.length > 0 && (
        <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {activeExercises.map((e) => `${shortExerciseName(e.exercise)}×${e.workingSets}`).join(', ')}
        </div>
      )}
    </div>
  )
}

export default function FrequencyHeatmap({
  rows,
  metric,
  setMetric,
}: {
  rows: SetRow[]
  metric: HeatmapMetric
  setMetric: (m: HeatmapMetric) => void
}) {
  const { weeks, monthLabels, stats, totalSets, volumeThresholds } = useMemo(() => {
    const days = dailyMetrics(rows)
    const stats = overallStats(rows)
    const totalSets = [...days.values()].reduce((sum, d) => sum + d.sets, 0)
    // Bucketed against the whole history, never the rendered slice — otherwise a day's
    // shade would depend on what else happens to be on screen.
    const volumeThresholds = quantileThresholds([...days.values()].map((d) => d.volume))

    type Cell = { key: string; day: DayMetrics; inRange: boolean }
    if (!stats.firstDate) {
      return { weeks: [] as Cell[][], monthLabels: [] as (string | null)[], stats, totalSets, volumeThresholds }
    }

    const first = new Date(stats.firstDate)
    const last = new Date(stats.lastDate)
    // Back up to Monday of the first week.
    const start = new Date(first)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    // Advance to Sunday of the last week.
    const end = new Date(last)
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7))

    const weeks: Cell[][] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const col: Cell[] = []
      for (let i = 0; i < 7; i++) {
        const k = keyOf(cursor)
        col.push({ key: k, day: days.get(k) ?? EMPTY_DAY, inRange: cursor >= first && cursor <= last })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(col)
    }

    // A month label appears once, above whichever week-column contains that
    // month's 1st day (GitHub-style contribution graph convention) — checking
    // only the column's Monday would miss months that start mid-week. Labels
    // closer than 2 columns apart are suppressed (rather than overlapping) —
    // with only a few weeks of data, two month starts can land almost adjacent.
    let prevMonth = ''
    let lastLabelIndex = -Infinity
    const monthLabels = weeks.map((col, ci) => {
      const firstOfMonth = col.find((d) => d.key.endsWith('-01'))
      const candidate = firstOfMonth ?? (prevMonth === '' ? col[0] : null)
      if (!candidate) return null
      const month = candidate.key.slice(0, 7) // "YYYY-MM"
      if (month === prevMonth) return null
      prevMonth = month
      if (ci - lastLabelIndex < 2) return null
      lastLabelIndex = ci
      return MONTH_SHORT[Number(candidate.key.slice(5, 7)) - 1]
    })

    return { weeks, monthLabels, stats, totalSets, volumeThresholds }
  }, [rows])

  const freq = useMemo(() => frequencyStats(rows), [rows])
  const mix = useMemo(() => focusMix(rows), [rows])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionDetail>()
    for (const s of sessionDetails(rows)) map.set(s.dateKey, s)
    return map
  }, [rows])

  const [hover, setHover] = useState<HoverInfo | null>(null)

  // --seq-0 always means "didn't train", in every mode. Sets and volume are ordinal, so
  // they read off the sequential ramp; intensity is categorical, so it reads off its own
  // hues (see FOCUS_COLOR).
  const colorOf = (day: DayMetrics): string => {
    if (day.sets === 0) return SEQ[0]
    if (metric === 'volume') return SEQ[volumeBucket(day.volume, volumeThresholds)]
    if (metric === 'intensity') return day.focus ? FOCUS_COLOR[day.focus] : SEQ[0]
    return SEQ[bucket(day.sets)]
  }

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', '']
  const chips: { label: string; value: string }[] = [
    { label: 'Avg / week', value: `${freq.avgSessionsPerWeek}` },
    { label: 'Most active', value: freq.mostActiveWeekday },
    { label: 'This week', value: `${freq.sessionsThisWeek}` },
  ]

  return (
    <ChartCard
      title="Training frequency"
      subtitle={`${stats.totalSessions} sessions · ${totalSets} working sets`}
      right={<HeatmapMetricToggle metric={metric} setMetric={setMetric} />}
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="grid grid-cols-3 gap-2">
          {chips.map((c) => (
            <div
              key={c.label}
              className="flex flex-col justify-center rounded-lg px-3 py-4"
              style={{ border: '1px solid var(--border)' }}
            >
              <div className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {c.value}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {c.label}
              </div>
            </div>
          ))}
        </div>

        {/* The distribution behind the Intensity mode, as a proportion — a row of three
            counts tells you the numbers but not the *balance*, which is the thing you'd act
            on ("I'm two-thirds heavy"). Same hues as the grid's intensity mode and the
            Next-session focus banner (FOCUS_COLOR is the one map), and it names all three,
            so in intensity mode it does the legend's job with counts attached — which is
            why the legend below drops its swatches in that mode rather than repeating them. */}
        {mix.total > 0 && (
          <div className="rounded-lg px-3 py-4" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Intensity mix
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {mix.total} training days
              </span>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--seq-0)' }}>
              {FOCUS_LEGEND.map(({ focus }) => {
                const pct = (mix[focus] / mix.total) * 100
                if (pct === 0) return null
                return (
                  <div key={focus} style={{ width: `${pct}%`, background: FOCUS_COLOR[focus] }} />
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              {FOCUS_LEGEND.map(({ focus, label }) => (
                <span key={focus} className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className="h-[9px] w-[9px] shrink-0 rounded-sm"
                    style={{ background: FOCUS_COLOR[focus], outline: '1px solid var(--border)' }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {mix[focus]}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    ({Math.round((mix[focus] / mix.total) * 100)}%)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {weeks.length > 0 && (
          <div className="overflow-x-auto py-1">
            {/* inline-grid, not grid: a block grid fills the container and the leading
                `auto` column (the weekday labels) absorbs all the slack, shoving the cells
                to the right edge. Shrink-to-fit keeps the calendar left-aligned.
                Cells stay a fixed 13px — a GitHub-style calendar, deliberately small. The
                card's leftover height is filled by the stat chips and the intensity-mix bar
                above, NOT by inflating the cells (that was tried and read as oversized). */}
            <div
              className="inline-grid gap-[3px]"
              style={{ gridTemplateColumns: `auto repeat(${weeks.length}, 13px)`, gridTemplateRows: `13px repeat(7, 13px)` }}
            >
              {monthLabels.map((label, ci) => (
                <div
                  key={`m-${ci}`}
                  className="overflow-visible whitespace-nowrap text-[10px] leading-[13px]"
                  style={{ gridColumn: ci + 2, gridRow: 1, color: 'var(--text-muted)' }}
                >
                  {label}
                </div>
              ))}

              {dayLabels.map((d, di) => (
                <div
                  key={`d-${di}`}
                  className="pr-1 text-[10px] leading-[13px]"
                  style={{ gridColumn: 1, gridRow: di + 2, color: 'var(--text-muted)' }}
                >
                  {d}
                </div>
              ))}

              {weeks.map((col, ci) =>
                col.map((cell, di) => (
                  <div
                    key={cell.key}
                    style={{ gridColumn: ci + 2, gridRow: di + 2 }}
                    onMouseEnter={(e) =>
                      cell.inRange && setHover({ key: cell.key, day: cell.day, rect: e.currentTarget.getBoundingClientRect() })
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className="h-[13px] w-[13px] rounded-sm"
                      style={{
                        background: cell.inRange ? colorOf(cell.day) : 'transparent',
                        outline: cell.day.sets > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    />
                  </div>
                )),
              )}
            </div>
          </div>
        )}

        {/* Ordinal modes need a captioned ramp. The categorical mode doesn't need a legend
            here at all any more: the Intensity-mix bar above already names all three hues
            AND gives their counts, so repeating bare swatches would just say it twice. */}
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {metric === 'intensity' ? (
            <span>Shade = the day’s intensity — see the mix above.</span>
          ) : (
            <>
              <span>Less</span>
              {SEQ.map((c, i) => (
                <span
                  key={i}
                  className="h-[11px] w-[11px] rounded-sm"
                  style={{ background: c, outline: '1px solid var(--border)' }}
                />
              ))}
              <span>More</span>
            </>
          )}
        </div>
      </div>

      {hover && createPortal(<HeatmapTooltip hover={hover} session={sessionsByDate.get(hover.key)} />, document.body)}
    </ChartCard>
  )
}
