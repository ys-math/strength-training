import { useMemo, useState } from 'react'
import { LIFT_BY_KEY, type LiftKey } from '../lib/types'
import { liftGrowth, liftPR, liftSessions, liftSetSeries, type LiftSetSession } from '../lib/metrics'
import { fmtDate, fmtLongDate, fmtPlate } from '../lib/format'
import type { SetRow } from '../lib/types'

// The plot area. Every block height is `weight * pxPerKg`, so the tallest column —
// the lift's biggest session — is exactly this tall.
const BODY_H = 480
const Y_TICKS = 4 // → 5 gridlines counting zero

// Tray and rep separators are drawn with `outline` and `inset box-shadow`, both of
// which are zero-height chrome. That is the point: a column's pixel height stays
// *exactly* `volume * pxPerKg`, instead of `volume + nSets * padding`. Inserting real
// gaps would make a 5-set session render taller than a 3-set session of the same
// volume, and the chart's whole claim is that height IS volume.
//
// The two separators must not look alike, or the sets can't be counted — which is the
// tray's whole job. So they're split by *colour*, not just by width: a set boundary is
// the gray tray itself (`--surface-2`, the same gray as the rails down each side), and
// a rep boundary is a translucent score line *within* the block. Gray = new set; score
// = another rep. Don't unify them.
const REP_GROUT = 'inset 0 1px 0 rgba(0, 0, 0, 0.3)'

// Blocks and trays are **square-cornered on purpose**. A block's height is the weight, and a
// corner radius eats the ends of the very rectangle that encodes it — worst on a light load
// at a squashed scale, where a block is only a few px tall.
//
// The two separators have to differ in *kind*, or the sets can't be counted — which is the
// tray's entire job. Because the blocks are square and butted, gray appears **only** at a
// set's edges, never between reps: **gray = the tray around one set**, **a translucent dark
// score line = the next rep**. Keep gray exclusive to set edges.
function SetTray({ set, color, pxPerKg }: { set: LiftSetSession['sets'][number]; color: string; pxPerKg: number }) {
  const blockH = set.weight * pxPerKg
  return (
    <div
      className="w-full px-[3px]"
      style={{
        background: 'var(--surface-2)',
        // Zero-height chrome: the tray band must not add pixels, or a 5-set session would
        // out-measure a 3-set one of the same volume and "height IS volume" would be false.
        outline: '3px solid var(--surface-2)',
        outlineOffset: '-1px',
      }}
    >
      {Array.from({ length: set.reps }, (_, i) => (
        <div key={i} style={{ height: blockH, background: color, boxShadow: i > 0 ? REP_GROUT : undefined }} />
      ))}
    </div>
  )
}

// A level plus its rate of change. `rate` is null when the window is too short to have
// one (under a week / under two weeks), which reads as "—" rather than a fake 0.
function GrowthStat({
  label,
  value,
  rate,
  unit,
}: {
  label: string
  value: string
  rate: number | null
  unit: string
}) {
  const tone = rate == null ? 'var(--text-muted)' : rate > 0 ? 'var(--delta-good)' : 'var(--text-secondary)'
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
      <span className="text-xs font-medium tabular-nums" style={{ color: tone }}>
        {rate == null ? '—' : `${rate > 0 ? '▲ ' : ''}${rate} ${unit}`}
      </span>
    </div>
  )
}

// One session. `flex-col-reverse` puts set 1 at the bottom, so the column builds up in
// the order the sets were performed.
function SessionColumn({
  session,
  color,
  pxPerKg,
  hovered,
  onHover,
}: {
  session: LiftSetSession
  color: string
  pxPerKg: number
  hovered: boolean
  onHover: (dateKey: string | null) => void
}) {
  return (
    <div
      className="flex h-full min-w-0 flex-1 cursor-default flex-col-reverse justify-start transition-opacity"
      style={{ opacity: hovered ? 1 : undefined }}
      onMouseEnter={() => onHover(session.dateKey)}
      onMouseLeave={() => onHover(null)}
    >
      {session.sets.map((set, i) => (
        <SetTray key={i} set={set} color={color} pxPerKg={pxPerKg} />
      ))}
    </div>
  )
}

// Weight is NOT readable off this chart — the axis is volume, and at ~0.25 px/kg a
// 60 kg block and a 50 kg block differ by about 2 px. That trade was made deliberately
// (see CLAUDE.md). This tooltip and the PR headline are therefore the *only* places the
// actual load appears, so the tooltip lists every set in full.
function SessionTooltip({
  session,
  color,
  align,
  columnH,
}: {
  session: LiftSetSession
  color: string
  align: 'left' | 'right'
  columnH: number
}) {
  // Anchored just above the column it describes — NOT to the column's wrapper, which is
  // full-height, and would float every tooltip up over the card header where it gets
  // clipped. Clamped so a tall column's tooltip drops inside the plot instead of escaping
  // out of the top. The estimate is deliberately rough; it only has to stay in bounds.
  const estH = 46 + 21 * session.sets.length
  const bottom = Math.max(0, Math.min(columnH + 8, BODY_H - estH))
  return (
    <div
      className="pointer-events-none absolute z-10 w-max rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: 'var(--page)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        bottom,
        left: align === 'left' ? 0 : undefined,
        right: align === 'right' ? 0 : undefined,
      }}
    >
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {fmtLongDate(session.dateKey)}
      </div>
      {session.sets.map((set, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          <span style={{ color: 'var(--text-muted)' }}>Set {i + 1}</span>
          <span className="ml-auto pl-4 tabular-nums font-medium">
            {fmtPlate(set.weight)} kg × {set.reps}
          </span>
        </div>
      ))}
      <div
        className="mt-1 flex items-center gap-2 border-t pt-1 tabular-nums"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        <span>
          {session.workingSets} {session.workingSets === 1 ? 'set' : 'sets'}
        </span>
        <span className="ml-auto font-semibold" style={{ color: 'var(--text-primary)' }}>
          {session.volume.toLocaleString()} kg
        </span>
      </div>
    </div>
  )
}

// The single-lift drill-down of the Progress card: a set-block chart.
//
// One column per session, one gray tray per set, one coloured block per rep, each block
// as tall as the set's weight — so a column's height IS that session's volume for this
// lift, and weight / reps / sets / volume all read off one picture.
//
// Three consequences are deliberate, and all three look like bugs if you don't know:
//
//   1. The y-axis is VOLUME, so weight is near-invisible (~2 px between a 60 kg and a
//      50 kg block). Don't "fix" it with a weight axis, a shade ramp, or a second panel;
//      the tooltip and the PR headline carry the load.
//   2. Weight and volume are anti-correlated under DUP, so the TALLEST column is usually
//      the LIGHTEST session (Jul 8 bench: 60 kg, 900 kg volume — a short column; Jul 10:
//      50 kg, 1700 kg — the tallest). Correct by definition.
//   3. The domain is the lift's biggest session over FULL history, never the visible
//      slice. Fitting it to the slice would resize every block as you drag the span
//      slider — the same trap the volume card's baseline avoids.
export default function LiftDetailView({ rows, lift: liftKey }: { rows: SetRow[]; lift: LiftKey }) {
  const lift = LIFT_BY_KEY.get(liftKey)!

  const data = useMemo(() => liftSetSeries(rows, liftKey), [rows, liftKey])
  const pr = useMemo(() => liftPR(liftSessions(rows, liftKey)), [rows, liftKey])

  const [startIdx, setStartIdx] = useState(0)
  const [hover, setHover] = useState<string | null>(null)

  const maxStart = Math.max(0, data.length - 2)
  const start = Math.min(startIdx, maxStart)
  const shown = start > 0 ? data.slice(start) : data
  const canSlide = data.length >= 3

  // The axis tops out at the biggest session ON SCREEN, so the tallest visible column
  // always fills the plot. Consequence to know: dragging the slider past an outlier
  // rescales every block, so a block's pixel height is only comparable *within* one view.
  // The growth stats above are scoped to the same window, so the whole card describes the
  // sessions you can actually see.
  const domainMax = useMemo(() => Math.max(1, ...shown.map((s) => s.volume)), [shown])
  const pxPerKg = BODY_H / domainMax

  const growth = useMemo(
    () => liftGrowth(rows, liftKey, shown[0]?.dateKey),
    [rows, liftKey, shown],
  )

  // Thin the date labels to ~8 so they never overprint at any span.
  const labelEvery = Math.max(1, Math.ceil(shown.length / 8))

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No {lift.label} sets logged yet.
      </p>
    )
  }

  return (
    <>
      <div
        className="mb-3 rounded-xl p-3"
        style={{ background: 'var(--page)', border: '1px solid var(--border)' }}
      >
        {pr && (
          <div className="flex items-baseline gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {fmtPlate(pr.maxWeight)} kg × {pr.maxWeightReps}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              heaviest {lift.label} set · {fmtLongDate(pr.maxWeightDate)}
            </span>
          </div>
        )}
        {/* The two rates the blocks can't show: the record's climb (the axis is volume, so
            weight is invisible here) and the workload's trend (a single column can't have
            one). Both scoped to the visible span, like the axis. */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <GrowthStat
            label="Max weight"
            value={`${fmtPlate(growth.maxWeight)} kg`}
            rate={growth.maxWeightPerWeek}
            unit="kg/wk"
          />
          <GrowthStat
            label="Weekly volume"
            value={`${growth.weeklyVolume.toLocaleString()} kg/wk`}
            rate={growth.weeklyVolumePctPerWeek}
            unit="%/wk"
          />
        </div>
      </div>

      {/* The topmost y-tick straddles the plot's top edge, so the plot needs clearance
          from the headline above it or the two collide (worst at narrow widths). */}
      <div className="mt-6 flex" style={{ height: BODY_H }}>
        {/* Y gutter — kg of volume. */}
        <div className="relative w-11 shrink-0">
          {Array.from({ length: Y_TICKS + 1 }, (_, i) => {
            const v = (domainMax / Y_TICKS) * i
            return (
              <span
                key={i}
                className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums"
                style={{ bottom: `${(i / Y_TICKS) * 100}%`, color: 'var(--text-muted)' }}
              >
                {Math.round(v)}
              </span>
            )
          })}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines, behind the columns. */}
          {Array.from({ length: Y_TICKS + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute inset-x-0 border-t"
              style={{ bottom: `${(i / Y_TICKS) * 100}%`, borderColor: 'var(--gridline)' }}
            />
          ))}

          <div className="flex h-full items-end gap-[5px]">
            {shown.map((session, i) => (
              <div key={session.dateKey} className="relative flex h-full min-w-0 flex-1 items-end">
                <SessionColumn
                  session={session}
                  color={lift.color}
                  pxPerKg={pxPerKg}
                  hovered={hover === session.dateKey}
                  onHover={setHover}
                />
                {hover === session.dateKey && (
                  <SessionTooltip
                    session={session}
                    color={lift.color}
                    align={i < shown.length / 2 ? 'left' : 'right'}
                    columnH={session.volume * pxPerKg}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* X labels, aligned to the columns (same gutter offset, same gap). A label is wider
          than its column at narrow widths, so it is allowed to spill — its neighbours are
          blank by construction (`labelEvery`), which is what makes that safe. Truncating
          instead would print "6/…". */}
      <div className="mt-1 flex gap-[5px] pl-11">
        {shown.map((session, i) => (
          <span
            key={session.dateKey}
            className="min-w-0 flex-1 whitespace-nowrap text-center text-[11px] tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {i % labelEvery === 0 ? fmtDate(session.dateKey) : ''}
          </span>
        ))}
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
            style={{ accentColor: lift.color, background: 'var(--surface-2)' }}
          />
          <span className="shrink-0 text-right text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {shown.length} of {data.length} sessions
          </span>
        </div>
      )}

      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        One column per session, one gray tray per set, one block per rep — each block as tall as the
        weight lifted, so a column's height <em>is</em> that session's {lift.label} volume. Working sets
        only; warmups are excluded, so a day's kg here matches the Session-volume card exactly. The axis
        tops out at the biggest session <em>on screen</em>, and the two rates above cover the same span
        — so dragging the slider rescales the blocks. Hover a column for the loads: the axis measures
        volume, not weight, so a heavy session can be a short column.
      </p>
    </>
  )
}
