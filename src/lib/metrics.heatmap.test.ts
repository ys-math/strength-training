import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { dailyMetrics, dayFocusMap, nextSessionFocus, quantileThresholds, volumeBucket } from './metrics'

let order = 0

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
    exercise: opts.exercise ?? lift ?? 'Accessory',
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

describe('dailyMetrics', () => {
  it('counts big-four working sets and their tonnage per day', () => {
    const rows = [...session('2026-01-10', 'BP', 100, 5, 3), ...session('2026-01-10', 'SQ', 140, 5, 2)]
    const day = dailyMetrics(rows).get('2026-01-10')!
    expect(day.sets).toBe(5)
    expect(day.volume).toBe(100 * 5 * 3 + 140 * 5 * 2)
  })

  it('excludes warmups from sets and volume', () => {
    const rows = [
      set('2026-01-10', 'BP', 40, 10, { warmup: true }),
      set('2026-01-10', 'BP', 60, 8, { warmup: true }),
      ...session('2026-01-10', 'BP', 100, 5, 3),
    ]
    const day = dailyMetrics(rows).get('2026-01-10')!
    expect(day.sets).toBe(3)
    expect(day.volume).toBe(100 * 5 * 3)
  })

  it('excludes accessory lifts, so its tonnage matches the volume cards', () => {
    const rows = [
      ...session('2026-01-10', 'BP', 100, 5, 3),
      set('2026-01-10', null, 20, 12, { exercise: 'Preacher Curl (Barbell)' }),
      set('2026-01-10', null, 0, 15, { exercise: 'Ab Wheel' }),
    ]
    const day = dailyMetrics(rows).get('2026-01-10')!
    expect(day.sets).toBe(3)
    expect(day.volume).toBe(100 * 5 * 3)
  })

  it('has no entry for a rest day', () => {
    const rows = session('2026-01-10', 'BP', 100, 5, 3)
    expect(dailyMetrics(rows).get('2026-01-11')).toBeUndefined()
  })

  it('tags each day with its focus (median of per-lift top-set reps)', () => {
    const rows = [
      ...session('2026-01-10', 'BP', 100, 5, 3), // heavy window (3–5)
      ...session('2026-01-12', 'BP', 70, 10, 3), // light window (9–12)
    ]
    const days = dailyMetrics(rows)
    expect(days.get('2026-01-10')!.focus).toBe('heavy')
    expect(days.get('2026-01-12')!.focus).toBe('light')
  })
})

describe('dayFocusMap — one definition of heavy/moderate/light', () => {
  it('agrees with the focus nextSessionFocus reports for the latest day', () => {
    const rows = [
      ...session('2026-01-10', 'BP', 100, 7, 3),
      ...session('2026-01-12', 'BP', 100, 4, 3),
      ...session('2026-01-12', 'SQ', 140, 4, 3),
    ]
    const { from } = nextSessionFocus(rows)
    expect(from).toBe('heavy')
    expect(dayFocusMap(rows).get('2026-01-12')).toBe(from)
  })

  it('takes the median across lifts, not the first lift', () => {
    // 3 / 10 / 10 reps → median 10 → light, even though the day opened heavy.
    const rows = [
      ...session('2026-01-10', 'BP', 100, 3, 1),
      ...session('2026-01-10', 'SQ', 100, 10, 1),
      ...session('2026-01-10', 'DL', 120, 10, 1),
    ]
    expect(dayFocusMap(rows).get('2026-01-10')).toBe('light')
  })
})

describe('volume bucketing', () => {
  it('spreads a normal range across all four data shades', () => {
    const t = quantileThresholds([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000])
    expect(volumeBucket(1000, t)).toBe(1)
    expect(volumeBucket(8000, t)).toBe(4)
    const buckets = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map((v) => volumeBucket(v, t))
    expect(new Set(buckets)).toEqual(new Set([1, 2, 3, 4]))
  })

  it('never puts a real training day in the empty shade', () => {
    // All-equal days and a lone day are the cases that could collapse the ramp.
    for (const values of [[5000, 5000, 5000], [5000], [1, 9999]]) {
      const t = quantileThresholds(values)
      for (const v of values) expect(volumeBucket(v, t)).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps bucket 0 for days with no training', () => {
    const t = quantileThresholds([1000, 5000])
    expect(volumeBucket(0, t)).toBe(0)
  })

  it('survives an empty history', () => {
    expect(quantileThresholds([])).toEqual([0, 0, 0])
    expect(volumeBucket(0, quantileThresholds([]))).toBe(0)
  })
})
