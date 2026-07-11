import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { LIFTS } from '../lib/types'
import {
  sessionVolume,
  weeklyVolume,
  SESSION_BASELINE_WINDOW,
  type SessionVolume,
  type WeekVolume,
} from '../lib/metrics'
import { fmtLongDate, fmtTonnage } from '../lib/format'
import type { SetRow } from '../lib/types'
import type { VolumeGrain } from '../lib/volumeGrain'
import ChartCard from './ChartCard'
import ChartTooltip from './Tooltip'
import VolumeGrainToggle from './VolumeGrainToggle'

const BASELINE_KEY = 'baseline'

function fmtDelta(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct}%`
}

// Custom rather than the shared ChartTooltip: the session grain has to say more than a
// list of series — the session's standing against its trailing baseline, and the rest
// that preceded it, are the whole point of that grain.
function SessionTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const s = payload[0].payload as SessionVolume
  const lifts = payload.filter((p) => p.value != null && p.dataKey !== BASELINE_KEY && Number(p.value) > 0)

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(s.dateKey)}
      </div>
      {lifts.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}</span>
          <span className="ml-auto tabular-nums font-medium">{fmtTonnage(Number(p.value))}</span>
        </div>
      ))}
      <div
        className="mt-1.5 flex items-center gap-2 border-t pt-1.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <span style={{ color: 'var(--text-muted)' }}>Session total</span>
        <span className="ml-auto tabular-nums font-semibold">{fmtTonnage(s.total)}</span>
      </div>
      {s.deltaPct != null && (
        <div className="flex items-center gap-2 py-0.5">
          <span style={{ color: 'var(--text-muted)' }}>vs. usual</span>
          <span className="ml-auto tabular-nums font-medium">{fmtDelta(s.deltaPct)}</span>
        </div>
      )}
      {s.restDays != null && (
        <div className="flex items-center gap-2 py-0.5">
          <span style={{ color: 'var(--text-muted)' }}>Rest before</span>
          <span className="ml-auto tabular-nums font-medium">
            {s.restDays} {s.restDays === 1 ? 'day' : 'days'}
          </span>
        </div>
      )}
    </div>
  )
}

// One card, one quantity (working tonnage — big four, warmups excluded), two grains.
// A week's bar is the sum of its sessions' bars, so the two readings always agree.
export default function VolumeCard({
  rows,
  grain,
  setGrain,
}: {
  rows: SetRow[]
  grain: VolumeGrain
  setGrain: (g: VolumeGrain) => void
}) {
  const weeks = useMemo(() => weeklyVolume(rows), [rows])
  // Computed over the full history, then sliced for display — so the baseline a session
  // is judged against never changes as the span slider moves.
  const sessions = useMemo(() => sessionVolume(rows), [rows])
  // One slider position per grain: reusing a single index across grains would silently
  // reframe the other chart (session 20 is a very different date than week 20).
  const [weekStart, setWeekStart] = useState(0)
  const [sessionStart, setSessionStart] = useState(0)

  const isSession = grain === 'session'
  const lastKey = LIFTS[LIFTS.length - 1].key

  // The two grains are built to be structurally IDENTICAL — same subtitle shape, same
  // header chip, same slider, same footnote — so the card's height cannot change when you
  // toggle. That matters beyond this card: it shares a grid row with the heatmap, which is
  // h-full and would otherwise resize in sympathy every time you flipped the grain.
  const data = isSession ? sessions : weeks
  const startIdx = isSession ? sessionStart : weekStart
  const setStartIdx = isSession ? setSessionStart : setWeekStart
  const maxStart = Math.max(0, data.length - 2)
  const start = Math.min(startIdx, maxStart)
  const canSlide = data.length >= 3
  const shown = start > 0 ? data.slice(start) : data

  // Both grains label the visible window; session by date, week by its Monday label.
  const spanLabel = (d: (typeof data)[number] | undefined) => {
    if (!d) return ''
    return isSession ? fmtLongDate((d as SessionVolume).dateKey) : (d as WeekVolume).label
  }
  const windowStart = spanLabel(shown[0])
  const windowEnd = spanLabel(data[data.length - 1])

  const lastSession = sessions[sessions.length - 1]
  const lastWeek = weeks[weeks.length - 1]

  // The grain toggle is a *control* and stays pinned to the same corner; the readout chip
  // sits beneath it. Both grains carry a chip of the same two-line shape, so neither the
  // toggle nor the card's height moves — the week grain reads its last week's tonnage,
  // the session grain how that session stood against its trailing baseline.
  const chip = (
    <div className="flex flex-col items-end gap-1.5">
      <VolumeGrainToggle grain={grain} setGrain={setGrain} />
      <div className="rounded-lg px-2.5 py-1.5 text-right" style={{ border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {isSession
            ? lastSession?.deltaPct != null
              ? fmtDelta(lastSession.deltaPct)
              : '—'
            : lastWeek
              ? fmtTonnage(lastWeek.total)
              : '—'}
        </div>
        <div className="whitespace-nowrap text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {isSession ? 'Last session vs. usual' : 'Last week’s tonnage'}
        </div>
      </div>
    </div>
  )

  // Kept to one line in BOTH grains (see the height note above) — the dashed baseline is
  // explained in the footnote, which likewise exists in both.
  const subtitle = isSession
    ? 'Working tonnage (weight × reps) per session, warmups excluded'
    : 'Working tonnage (weight × reps) per week, warmups excluded'
  const footnote = isSession
    ? `Dashed = your previous-${SESSION_BASELINE_WINDOW}-session average · rest days collapsed.`
    : 'ISO weeks, Monday-started · a week = the sum of its sessions.'

  return (
    <ChartCard title="Volume" subtitle={subtitle} right={chip}>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={shown} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="20%">
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--baseline)" />
            <YAxis
              width={44}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--baseline)"
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}t` : `${v}`)}
            />
            <Tooltip
              cursor={{ fill: 'var(--hover-tint)' }}
              content={isSession ? <SessionTooltip /> : <ChartTooltip valueFormatter={fmtTonnage} />}
            />
            {LIFTS.map((lift) => (
              <Bar
                key={lift.key}
                dataKey={lift.key}
                name={lift.label}
                stackId="vol"
                fill={lift.color}
                stroke="var(--surface-1)"
                strokeWidth={1}
                radius={lift.key === lastKey ? [4, 4, 0, 0] : undefined}
                isAnimationActive={false}
              />
            ))}
            {/* Session grain only: a moving reference the bars are measured against — not a
                restatement of the stack (that would just retrace the bar tops). Muted and
                dashed so it reads as a gridline-like benchmark, not as a fifth series.
                A week has no such baseline — the weekly question is "enough?", not "unusual?". */}
            {isSession && (
              <Line
                dataKey={BASELINE_KEY}
                name="Usual"
                stroke="var(--text-muted)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
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

      <p className="mt-2 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {footnote}
      </p>
    </ChartCard>
  )
}
