import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { dailyMetrics, dayFocusMap, nextSessionSuggestion, sessionMaxSeries } from './metrics'

// The routine ends each lift with one heavy top set (~90% e1RM, 2-3 reps). It is the
// heaviest set of the day, so anything reading "the heaviest set" to ask *what kind of
// session was that* gets the top set's rep count instead of the working sets' — which
// labelled a 6-rep day `heavy`, and hid it from the engine's moderate stream entirely.
// The split is: topWorkingSets answers "what's my record", dayWorkingSets answers "what
// did I train". These tests pin both halves down.

let order = 0

function set(
  dateKey: string,
  lift: LiftKey,
  weight: number,
  reps: number,
  opts: { warmup?: boolean } = {},
): SetRow {
  return {
    date: new Date(`${dateKey}T09:00:00`),
    dateKey,
    workout: 'Test',
    exercise: lift,
    lift,
    setOrder: opts.warmup ? 'W' : String(++order),
    isWarmup: !!opts.warmup,
    weight,
    reps,
    e1rm: epley(weight, reps),
    rpe: null,
  }
}

// Three working sets at `load` x `reps`, then a single heavier top set — the shape of a
// real session (2026-07-12: squat 65x6 x3, then 70x3).
function session(dateKey: string, lift: LiftKey, load: number, reps: number, top: [number, number]): SetRow[] {
  return [
    set(dateKey, lift, load * 0.6, 5, { warmup: true }),
    set(dateKey, lift, load, reps),
    set(dateKey, lift, load, reps),
    set(dateKey, lift, load, reps),
    set(dateKey, lift, top[0], top[1]),
  ]
}

describe('day focus with a heavy top set', () => {
  it('classifies a 6-rep working day as moderate, not heavy', () => {
    const rows = session('2026-07-12', 'BP', 57.5, 6, [62.5, 2])
    expect(dayFocusMap(rows).get('2026-07-12')).toBe('moderate')
  })

  it('reports the working reps the label came from, not the top set’s', () => {
    const rows = session('2026-07-12', 'BP', 57.5, 6, [62.5, 2])
    expect(dailyMetrics(rows).get('2026-07-12')?.focusReps).toBe(6)
  })

  it('still calls a genuinely heavy day heavy', () => {
    const rows = session('2026-07-08', 'BP', 60, 5, [65, 2])
    expect(dayFocusMap(rows).get('2026-07-08')).toBe('heavy')
  })

  it('takes the modal load, so a lone heavier set never outvotes the working sets', () => {
    // 3 sets at 60, 1 at 70 — the 70 is a top set, not the day's character.
    const rows = session('2026-07-12', 'SQ', 60, 10, [70, 3])
    expect(dayFocusMap(rows).get('2026-07-12')).toBe('light')
  })

  it('falls back to the heaviest load when every load has one set (a pyramid)', () => {
    const rows = [
      set('2026-07-12', 'DL', 60, 8),
      set('2026-07-12', 'DL', 70, 6),
      set('2026-07-12', 'DL', 80, 4),
    ]
    expect(dailyMetrics(rows).get('2026-07-12')?.focusReps).toBe(4)
  })
})

describe('the top set stays visible to max-based surfaces', () => {
  it('plots the top set as the session’s heaviest working set, and records it as the PR', () => {
    const rows = session('2026-07-12', 'SQ', 65, 6, [70, 3])
    const { series, records } = sessionMaxSeries(rows)
    // The day reads `moderate` now, but the 70x3 still happened: the chart and the PR
    // chip must keep saying so. Excluding the top set here would erase a real lift.
    expect(series.find((p) => p.dateKey === '2026-07-12')?.SQ).toBe(70)
    expect(records.SQ).toBe(70)
    expect(series[0].focus).toBe('moderate')
  })
})

describe('the progression stream reads working sets', () => {
  const moderate = (dateKey: string, load: number, reps: number, top: [number, number]) =>
    session(dateKey, 'BP', load, reps, top)

  it('sees a top-set day in the matching rep window instead of dropping it', () => {
    // Every bench day is 6 reps of work (moderate) plus a 2-rep top set. Under the old
    // rule each day entered history as its 2-rep top set, which falls outside the 6-8
    // window — so the moderate stream was empty and the engine cold-started from e1RM.
    const rows = [
      ...moderate('2026-07-05', 55, 6, [60, 2]),
      ...moderate('2026-07-08', 57.5, 6, [62.5, 2]),
      ...moderate('2026-07-12', 57.5, 6, [62.5, 2]),
    ]
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.action).not.toBe('dup') // 'dup' is the cold-start branch: stream was empty
    expect(s.prev).toEqual({ load: 57.5, reps: 6, sets: 3 })
  })

  it('progresses from the working load, not from the top set', () => {
    const rows = [
      ...moderate('2026-07-05', 55, 6, [60, 2]),
      ...moderate('2026-07-12', 57.5, 6, [62.5, 2]),
    ]
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.prev?.load).toBe(57.5)
    expect(s.load).toBeGreaterThanOrEqual(57.5)
    expect(s.load).toBeLessThan(62.5) // never seeded off the top set
  })

  it('keeps detraining on the true last session, top set included', () => {
    const rows = moderate('2026-05-01', 57.5, 6, [62.5, 2])
    const now = new Date('2026-07-12T09:00:00').getTime()
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'moderate').BP
    expect(s.action).toBe('return')
    // Backed off from the true heaviest set (62.5), not the working load.
    expect(s.prev).toEqual({ load: 62.5, reps: 2, sets: 1 })
  })
})
