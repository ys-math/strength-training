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
import { sessionVolume, SESSION_BASELINE_WINDOW, type SessionVolume } from '../lib/metrics'
import { fmtLongDate, fmtTonnage } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'

const BASELINE_KEY = 'baseline'

function fmtDelta(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct}%`
}

// Custom rather than the shared ChartTooltip: this card has to say more than a list of
// series — the session's standing against its trailing baseline, and the rest that
// preceded it, are the whole point of the card.
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

export default function SessionVolumeChart({ rows }: { rows: SetRow[] }) {
  // Computed over the full history, then sliced for display — so the baseline a session
  // is judged against never changes as the span slider moves.
  const data = useMemo(() => sessionVolume(rows), [rows])
  const [startIdx, setStartIdx] = useState(0)

  const lastKey = LIFTS[LIFTS.length - 1].key
  const maxStart = Math.max(0, data.length - 2)
  const start = Math.min(startIdx, maxStart)
  const shown = start > 0 ? data.slice(start) : data
  const canSlide = data.length >= 3
  const windowStart = shown.length ? fmtLongDate(shown[0].dateKey) : ''
  const windowEnd = data.length ? fmtLongDate(data[data.length - 1].dateKey) : ''

  const last = data[data.length - 1]
  const chip =
    last?.deltaPct != null ? (
      <div className="rounded-lg px-2.5 py-1.5 text-right" style={{ border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {fmtDelta(last.deltaPct)}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Last session vs. usual
        </div>
      </div>
    ) : undefined

  return (
    <ChartCard
      title="Session volume"
      subtitle={`Working tonnage per session (weight × reps), warmups excluded — dashed line is your previous-${SESSION_BASELINE_WINDOW}-session average`}
      right={chip}
    >
      <div style={{ width: '100%', height: 300 }}>
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
            <Tooltip cursor={{ fill: 'var(--hover-tint)' }} content={<SessionTooltip />} />
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
            {/* A moving reference the bars are measured against — not a restatement of the
                stack (that would just retrace the bar tops). Muted and dashed so it reads
                as a gridline-like benchmark, not as a fifth series. */}
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
    </ChartCard>
  )
}
