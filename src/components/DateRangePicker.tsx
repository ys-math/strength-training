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
        <div className="span-range min-w-0 flex-1">
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
              left: `${(fromIdx / (days.length - 1)) * 100}%`,
              width: `${((end - fromIdx) / (days.length - 1)) * 100}%`,
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
