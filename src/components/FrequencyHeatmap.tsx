import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { dailyActivity, frequencyStats, overallStats, sessionDetails, type SessionDetail } from '../lib/metrics'
import { fmtLongDate, shortExerciseName } from '../lib/format'
import type { DayFocus } from '../lib/dayFocus'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import DayFocusToggle from './DayFocusToggle'

const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  count: number
  rect: DOMRect
}

// Rendered via a portal into document.body, positioned `fixed` from the hovered
// cell's own bounding box — this is what lets it escape the heatmap's
// overflow-x-auto scroll container. That container clips vertically too (a CSS
// quirk: overflow-x:auto forces overflow-y to auto as well when left unset), so
// an absolutely-positioned tooltip nested inside it gets cut off top/bottom, not
// just at the left/right edges.
function HeatmapTooltip({ hover, session }: { hover: HoverInfo; session?: SessionDetail }) {
  const HALF_WIDTH = 110 // half of max-w-[220px]
  const idealLeft = hover.rect.left + hover.rect.width / 2
  const left = Math.min(Math.max(idealLeft, 8 + HALF_WIDTH), window.innerWidth - 8 - HALF_WIDTH)
  const showBelow = hover.rect.top < 90

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
        {hover.count} working set{hover.count === 1 ? '' : 's'}
      </div>
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
  dayFocus,
  setDayFocus,
}: {
  rows: SetRow[]
  dayFocus: DayFocus
  setDayFocus: (f: DayFocus) => void
}) {
  const { weeks, monthLabels, stats } = useMemo(() => {
    const activity = dailyActivity(rows)
    const stats = overallStats(rows)
    type Cell = { key: string; count: number; inRange: boolean }
    if (!stats.firstDate) return { weeks: [] as Cell[][], monthLabels: [] as (string | null)[], stats }

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
        col.push({ key: k, count: activity.get(k) ?? 0, inRange: cursor >= first && cursor <= last })
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

    return { weeks, monthLabels, stats }
  }, [rows])

  const freq = useMemo(() => frequencyStats(rows), [rows])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionDetail>()
    for (const s of sessionDetails(rows)) map.set(s.dateKey, s)
    return map
  }, [rows])

  const [hover, setHover] = useState<HoverInfo | null>(null)

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', '']
  const chips: { label: string; value: string }[] = [
    { label: 'Avg / week', value: `${freq.avgSessionsPerWeek}` },
    { label: 'Most active', value: freq.mostActiveWeekday },
    { label: 'This week', value: `${freq.sessionsThisWeek}` },
  ]

  return (
    <ChartCard
      title="Training frequency"
      subtitle={`${stats.totalSessions} sessions · ${stats.totalWorkingSets} working sets`}
      right={<DayFocusToggle dayFocus={dayFocus} setDayFocus={setDayFocus} />}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="grid grid-cols-3 gap-2">
          {chips.map((c) => (
            <div key={c.label} className="rounded-lg px-2 py-1.5" style={{ border: '1px solid var(--border)' }}>
              <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {c.value}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {c.label}
              </div>
            </div>
          ))}
        </div>

        {weeks.length > 0 && (
          <div className="overflow-x-auto py-1">
            <div
              className="grid gap-[3px]"
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
                      cell.inRange && setHover({ key: cell.key, count: cell.count, rect: e.currentTarget.getBoundingClientRect() })
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className="h-[13px] w-[13px] rounded-sm"
                      style={{
                        background: cell.inRange ? SEQ[bucket(cell.count)] : 'transparent',
                        outline: cell.count > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    />
                  </div>
                )),
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>Less</span>
          {SEQ.map((c, i) => (
            <span key={i} className="h-[11px] w-[11px] rounded-sm" style={{ background: c, outline: '1px solid var(--border)' }} />
          ))}
          <span>More</span>
        </div>
      </div>

      {hover && createPortal(<HeatmapTooltip hover={hover} session={sessionsByDate.get(hover.key)} />, document.body)}
    </ChartCard>
  )
}
