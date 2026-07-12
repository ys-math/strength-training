import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { sessionMaxSeries } from './metrics'

let order = 0

function set(
  dateKey: string,
  lift: LiftKey | null,
  weight: number,
  reps: number,
  opts: { warmup?: boolean } = {},
): SetRow {
  return {
    date: new Date(`${dateKey}T09:00:00`),
    dateKey,
    workout: 'Test',
    exercise: lift ?? 'Accessory',
    lift,
    setOrder: opts.warmup ? 'W' : String(++order),
    isWarmup: !!opts.warmup,
    weight,
    reps,
    e1rm: epley(weight, reps),
    rpe: null,
  }
}

function session(dateKey: string, lift: LiftKey, weight: number, reps: number, n = 3): SetRow[] {
  return Array.from({ length: n }, () => set(dateKey, lift, weight, reps))
}

describe('sessionMaxSeries — the per-session max-weight line', () => {
  it('plots the heaviest WORKING set, not the heaviest set', () => {
    // A deload: the ramp-up warmup is heavier than the working load. Counting warmups
    // would print 60 — a weight lifted, but not the session's work.
    const rows = [
      set('2026-06-01', 'BP', 20, 5, { warmup: true }),
      set('2026-06-01', 'BP', 60, 3, { warmup: true }),
      ...session('2026-06-01', 'BP', 50, 8),
    ]
    const { series } = sessionMaxSeries(rows)
    expect(series[0].BP).toBe(50)
    expect(series[0].detail.BP?.reps).toBe(8)
  })

  it('omits a lift entirely on a warmup-only day (the 6/4 squat case)', () => {
    // Two real squat days logged warmups and no working sets. They must not plot as a
    // 50 kg dip; the lift simply has no point that date and connectNulls bridges it.
    const rows = [
      ...session('2026-06-02', 'SQ', 70, 5),
      set('2026-06-04', 'SQ', 40, 5, { warmup: true }),
      set('2026-06-04', 'SQ', 50, 5, { warmup: true }),
      ...session('2026-06-07', 'SQ', 70, 5),
    ]
    const { series } = sessionMaxSeries(rows)
    expect(series.map((p) => p.dateKey)).toEqual(['2026-06-02', '2026-06-07'])
    expect(series.some((p) => p.SQ === 50)).toBe(false)
  })

  it('flags isPR only on a true all-time advance — a rebound is not a record', () => {
    // 60 → 50 (light day) → 60 (rebound). The old dot rule compared with the previous
    // point, so the rebound would have dotted as a PR. It sets no record.
    const rows = [
      ...session('2026-06-01', 'BP', 60, 5),
      ...session('2026-06-03', 'BP', 50, 10),
      ...session('2026-06-05', 'BP', 60, 5),
      ...session('2026-06-07', 'BP', 65, 3),
    ]
    const { series } = sessionMaxSeries(rows)
    expect(series.map((p) => p.detail.BP?.isPR)).toEqual([true, false, false, true])
  })

  it('reports each lift’s all-time working record, which the last point need not equal', () => {
    // The legend chip reads this, not the end of the line: bench ends on a light day at
    // 50 kg while the record stands at 67.5.
    const rows = [
      ...session('2026-06-26', 'BP', 67.5, 2),
      ...session('2026-07-10', 'BP', 50, 11),
      ...session('2026-07-10', 'SQ', 70, 5),
    ]
    const { series, records } = sessionMaxSeries(rows)
    expect(records.BP).toBe(67.5)
    expect(records.SQ).toBe(70)
    expect(records.DL).toBe(0) // never trained — the chip hides a zero
    expect(series[series.length - 1].BP).toBe(50)
  })

  it('carries the day’s focus, from the same map the heatmap and FocusBanner read', () => {
    // 11 reps is a light day; 3 reps is a heavy one. This is what lets the tooltip explain
    // a dip in place rather than leaving it looking like a regression.
    const rows = [...session('2026-07-08', 'BP', 60, 3), ...session('2026-07-10', 'BP', 50, 11)]
    const { series } = sessionMaxSeries(rows)
    expect(series[0].focus).toBe('heavy')
    expect(series[1].focus).toBe('light')
  })
})
