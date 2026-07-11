import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { SESSION_BASELINE_WINDOW, sessionVolume } from './metrics'

let order = 0

// Minimal SetRow factory. sessionVolume only reads lift, dateKey/date, isWarmup,
// weight and reps, so the rest is filler.
function set(
  dateKey: string,
  lift: LiftKey | null,
  weight: number,
  reps: number,
  opts: { warmup?: boolean; exercise?: string } = {},
): SetRow {
  return {
    date: new Date(`${dateKey}T09:00:00`),
    dateKey,
    workout: 'Test',
    exercise: opts.exercise ?? lift ?? 'Other',
    lift,
    setOrder: opts.warmup ? 'W' : String(++order),
    isWarmup: !!opts.warmup,
    weight,
    reps,
    e1rm: epley(weight, reps),
    rpe: null,
  }
}

describe('sessionVolume', () => {
  it('sums weight x reps per lift and totals them per training day', () => {
    const rows = [
      set('2026-01-05', 'BP', 100, 5), // 500
      set('2026-01-05', 'BP', 100, 3), // 300
      set('2026-01-05', 'SQ', 120, 5), // 600
      set('2026-01-07', 'DL', 140, 5), // 700
    ]
    const out = sessionVolume(rows)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ dateKey: '2026-01-05', BP: 800, SQ: 600, DL: 0, OHP: 0, total: 1400 })
    expect(out[1]).toMatchObject({ dateKey: '2026-01-07', DL: 700, total: 700 })
  })

  it('excludes warmups and non-big-4 exercises, matching weeklyVolume', () => {
    const rows = [
      set('2026-01-05', 'BP', 100, 5), // 500, counts
      set('2026-01-05', 'BP', 40, 10, { warmup: true }), // warmup, ignored
      set('2026-01-05', null, 30, 12, { exercise: 'Hammer Curl (Dumbbell)' }), // accessory, ignored
    ]
    expect(sessionVolume(rows)[0].total).toBe(500)
  })

  it('sorts ascending by date regardless of row order', () => {
    const rows = [set('2026-01-09', 'BP', 100, 1), set('2026-01-05', 'BP', 100, 1)]
    expect(sessionVolume(rows).map((s) => s.dateKey)).toEqual(['2026-01-05', '2026-01-09'])
  })

  it('leaves the first session without a baseline, delta or rest gap', () => {
    const out = sessionVolume([set('2026-01-05', 'BP', 100, 5)])
    expect(out[0]).toMatchObject({ baseline: null, deltaPct: null, restDays: null })
  })

  it('expands the baseline mean until the window fills, then holds it fixed', () => {
    // Nine sessions of 100, 200, 300 ... 900 kg of volume — one BP set each.
    const rows = Array.from({ length: 9 }, (_, i) =>
      set(`2026-01-${String(i + 1).padStart(2, '0')}`, 'BP', 100 * (i + 1), 1),
    )
    const out = sessionVolume(rows)
    expect(out.map((s) => s.total)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])

    // Expanding while fewer than 6 priors exist: mean of everything before.
    expect(out[1].baseline).toBe(100) // [100]
    expect(out[2].baseline).toBe(150) // [100,200]
    expect(out[6].baseline).toBe(350) // [100..600], exactly 6 priors

    // Window now full: sessions 8 and 9 drop the oldest instead of expanding.
    expect(out[7].baseline).toBe(450) // [200..700], not [100..700]
    expect(out[8].baseline).toBe(550) // [300..800]
    expect(SESSION_BASELINE_WINDOW).toBe(6)
  })

  it('reports the deviation from the baseline as a percentage', () => {
    const rows = [
      set('2026-01-05', 'BP', 100, 10), // 1000
      set('2026-01-07', 'BP', 100, 14), // 1400 -> +40% on a 1000 baseline
      set('2026-01-09', 'BP', 100, 6), // 600 -> -50% on a 1200 baseline
    ]
    const out = sessionVolume(rows)
    expect(out[1]).toMatchObject({ baseline: 1000, deltaPct: 40 })
    expect(out[2]).toMatchObject({ baseline: 1200, deltaPct: -50 })
  })

  it('counts whole rest days between sessions, including across a month boundary', () => {
    const rows = [
      set('2026-01-30', 'BP', 100, 5),
      set('2026-02-03', 'BP', 100, 5), // 4 days later
      set('2026-02-05', 'BP', 100, 5), // 2 days later
    ]
    expect(sessionVolume(rows).map((s) => s.restDays)).toEqual([null, 4, 2])
  })

  it('returns nothing when no big-4 working sets exist', () => {
    const rows = [
      set('2026-01-05', 'BP', 40, 10, { warmup: true }),
      set('2026-01-05', null, 30, 12, { exercise: 'Pull Up' }),
    ]
    expect(sessionVolume(rows)).toEqual([])
  })
})
