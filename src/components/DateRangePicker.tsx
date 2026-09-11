import { useRef } from 'react'
import { fmtLongDate } from '../lib/format'
import { presetFrom, RANGE_PRESETS, type DateRange } from '../lib/dateRange'

interface Props {
  /** Every training day, sorted. The handles index into this. */
  days: string[]
  range: DateRange
  setRange: (r: DateRange) => void
}

// One control for the whole dashboard. It sits in the header rather than on each card
// because the four charts count different things — training days, ISO weeks, one lift's
// sessions — and per-card index sliders could never agree on a period. Dates are the one
// unit all four share.
//
// It filters charts only. The next-session engine, the all-time records and the heatmap's
// colour cut points always read full history, so narrowing the view can never change what
// you are told to lift.
export default function DateRangePicker({ days, range, setRange }: Props) {
  if (days.length < 2) return null

  const last = days[days.length - 1]
  const fromIdx = Math.max(0, days.indexOf(range.from))
  const toIdx = range.to ? days.indexOf(range.to) : days.length - 1
  const end = toIdx < 0 ? days.length - 1 : toIdx

  const trackRef = useRef<HTMLDivElement>(null)
  // Where the pan started: the pointer's x and the window it grabbed. Held in a ref, not
  // state, because it changes on every pointermove and must not re-render.
  const panFrom = useRef<{ x: number; from: number; to: number } | null>(null)

  const lastIdx = days.length - 1
  const pct = (i: number) => (i / lastIdx) * 100

  // Shift the whole window, keeping its width. Clamped to the ends rather than squashed:
  // a pan must never silently change the span you chose, only where it sits.
  //
  // "Width" is in TRAINING DAYS, not calendar days, because that is what the handles index
  // — a handle can only land on a day you actually trained. So a pan keeps the same number
  // of sessions on screen while the calendar length breathes a little with how densely you
  // were training back then. That is the consistent reading: the charts are drawn per
  // session, so session count is what decides how much is on screen.
  const panBy = (steps: number, base = { from: fromIdx, to: end }) => {
    const shift = Math.max(-base.from, Math.min(lastIdx - base.to, steps))
    if (shift === 0) return
    setRange({ from: days[base.from + shift], to: days[base.to + shift] })
  }

  const canPan = end - fromIdx < lastIdx

  // Searched from the broadest end: when the history is shorter than a preset's window it
  // clamps to the first training day, so several presets resolve to the same range. "All"
  // is the honest label for that, and it sits last.
  const matches = RANGE_PRESETS.filter(
    (p) => range.to === last && range.from === presetFrom(days, last, p.months),
  )
  const activePreset = matches[matches.length - 1]

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex gap-1">
        {RANGE_PRESETS.map((p) => {
          const on = activePreset?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setRange({ from: presetFrom(days, last, p.months), to: last })}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: on ? 'var(--surface-2)' : 'transparent',
                color: on ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Both handles ride one track. Each clamps against the other so they can't
            cross, which would invert the range. */}
        <div ref={trackRef} className="span-range min-w-0 flex-1">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full"
            style={{ background: 'var(--surface-2)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
            style={{
              background: 'var(--text-muted)',
              left: `${pct(fromIdx)}%`,
              width: `${pct(end - fromIdx)}%`,
            }}
          />
          {/* The grab area for panning: full track height so a narrow window is still
              catchable, and rendered BEFORE the inputs so their thumbs stack on top and
              keep winning the pointer at the window's own edges. */}
          <div
            role="button"
            tabIndex={canPan ? 0 : -1}
            aria-label="Pan the range, keeping its length"
            aria-disabled={!canPan}
            className="absolute inset-y-0 touch-none rounded-sm focus-visible:outline focus-visible:outline-2"
            style={{
              left: `${pct(fromIdx)}%`,
              width: `${pct(end - fromIdx)}%`,
              cursor: canPan ? 'grab' : 'default',
              outlineColor: 'var(--text-muted)',
            }}
            onPointerDown={(e) => {
              if (!canPan) return
              e.currentTarget.setPointerCapture(e.pointerId)
              e.currentTarget.style.cursor = 'grabbing'
              panFrom.current = { x: e.clientX, from: fromIdx, to: end }
            }}
            onPointerMove={(e) => {
              const base = panFrom.current
              const track = trackRef.current
              if (!base || !track) return
              // Pixels per index off the live track width, so the pan tracks the pointer
              // at any card width.
              const perIndex = track.getBoundingClientRect().width / lastIdx
              if (perIndex <= 0) return
              panBy(Math.round((e.clientX - base.x) / perIndex), base)
            }}
            onPointerUp={(e) => {
              panFrom.current = null
              e.currentTarget.style.cursor = 'grab'
            }}
            onPointerCancel={(e) => {
              panFrom.current = null
              e.currentTarget.style.cursor = 'grab'
            }}
            onKeyDown={(e) => {
              // The two handles already give full keyboard control of each end; this makes
              // panning reachable without a pointer too.
              const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
              if (step) {
                e.preventDefault()
                panBy(e.shiftKey ? step * 7 : step)
              } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault()
                panBy(e.key === 'Home' ? -lastIdx : lastIdx)
              }
            }}
          />
          <input
            type="range"
            aria-label="Range start"
            min={0}
            max={days.length - 1}
            value={fromIdx}
            onChange={(e) => setRange({ from: days[Math.min(Number(e.target.value), end - 1)], to: days[end] })}
          />
          <input
            type="range"
            aria-label="Range end"
            min={0}
            max={days.length - 1}
            value={end}
            onChange={(e) =>
              setRange({ from: days[fromIdx], to: days[Math.max(Number(e.target.value), fromIdx + 1)] })
            }
          />
        </div>

        <span
          className="shrink-0 text-right text-[11px] tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          {fmtLongDate(days[fromIdx])} – {fmtLongDate(days[end])}
        </span>
      </div>
    </div>
  )
}
