import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { nextSessionFocus, nextSessionSuggestion, hasRpeData, sessionPlan, warmupRamp } from './metrics'

let order = 0

// Minimal SetRow factory — the suggestion engine only reads lift, dateKey/date,
// isWarmup, weight, reps, e1rm and rpe, so the rest is filler.
function set(
  dateKey: string,
  lift: LiftKey,
  weight: number,
  reps: number,
  opts: { warmup?: boolean; rpe?: number } = {},
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
    rpe: opts.rpe ?? null,
  }
}

// N identical working sets on one day.
function session(dateKey: string, lift: LiftKey, weight: number, reps: number, n = 3, rpe?: number): SetRow[] {
  return Array.from({ length: n }, () => set(dateKey, lift, weight, reps, { rpe }))
}

// Focus windows (see DEFAULT_SUGGESTION_CONFIG.dup): heavy 3–5, moderate 6–8, light 9–12.
// Most progression tests pin an explicit focus (5th arg) so the rep numbers exercise a
// known window; the auto-inferred focus is covered separately below.

describe('nextSessionFocus — DUP inference', () => {
  it('classifies the latest training day and undulates one step (heavy → light)', () => {
    const rows = [
      ...session('2026-01-10', 'BP', 100, 5, 3),
      ...session('2026-01-10', 'SQ', 140, 5, 3),
      ...session('2026-01-10', 'DL', 180, 5, 3),
    ]
    const plan = nextSessionFocus(rows)
    expect(plan.from).toBe('heavy') // 5-rep day
    expect(plan.focus).toBe('light') // heavy → light in the cycle
  })

  it('takes the median across the lifts trained on the latest day', () => {
    const rows = [...session('2026-01-10', 'BP', 100, 8, 3), ...session('2026-01-10', 'SQ', 140, 6, 3)]
    const plan = nextSessionFocus(rows) // median(6,8)=7 → moderate
    expect(plan.from).toBe('moderate')
    expect(plan.focus).toBe('heavy') // moderate → heavy in the cycle
  })

  it('defaults to the first cycle entry with no history', () => {
    const plan = nextSessionFocus([])
    expect(plan.from).toBeNull()
    expect(plan.focus).toBe('heavy')
  })

  it('reclassifies the same history differently depending on the flagged focus', () => {
    const rows = session('2026-01-01', 'BP', 100, 5, 3)
    // Heavy window [3,5]: 5 reps sits at the top → double progression.
    const heavy = nextSessionSuggestion(rows, undefined, undefined, undefined, 'heavy').BP
    expect(heavy.action).toBe('increase-load')
    expect(heavy.load).toBe(102.5)
    expect(heavy.reps).toBe(3)
    // Moderate window [6,8]: no matching history → a fresh DUP seed.
    const mod = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(mod.action).toBe('dup')
  })
})

describe('nextSessionSuggestion — double progression', () => {
  it('adds load (smallest increment) when the top set hits the top of the window', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 3) // top of moderate [6,8]
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.action).toBe('increase-load')
    expect(s.load).toBe(62.5)
    expect(s.reps).toBe(6) // dropped to bottom of the window
    expect(s.sets).toBe(3)
    expect(s.loadDelta).toBe(2.5)
    expect(s.prev).toEqual({ load: 60, reps: 8, sets: 3 })
    expect(s.projectedWeight).toBe(62.5)
    expect(s.projectedE1rm).toBe(epley(62.5, 6)) // 75
  })

  it('targets the 3-set baseline regardless of how many sets were actually logged last time', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 2) // only 2 sets logged
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.sets).toBe(3) // baseline, not a copy of last session's count
    expect(s.prev).toEqual({ load: 60, reps: 8, sets: 2 }) // prev still reports what actually happened
  })

  it('holds load and adds a rep when reps are within the window but not at the top', () => {
    const rows = session('2026-01-01', 'BP', 60, 7, 3)
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.action).toBe('add-rep')
    expect(s.load).toBe(60)
    expect(s.reps).toBe(8) // target = previous + 1
    expect(s.repsDelta).toBe(1)
    expect(s.loadDelta).toBe(0)
    expect(s.projectedE1rm).toBe(epley(60, 8))
  })

  it('ignores warmup sets when picking the top working set', () => {
    const rows = [set('2026-01-01', 'BP', 100, 1, { warmup: true }), ...session('2026-01-01', 'BP', 60, 7, 3)]
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.load).toBe(60) // not the 100kg warmup
  })
})

describe('nextSessionSuggestion — plateau / deload', () => {
  it('deloads when e1RM is flat across the stagnation window despite reps in the window', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 7, 3),
      ...session('2026-01-03', 'BP', 60, 7, 3),
      ...session('2026-01-05', 'BP', 60, 7, 3),
    ]
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.action).toBe('deload')
    expect(s.sets).toBe(2) // ~half of 3, rounded
    expect(s.setsDelta).toBeLessThan(0)
    expect(s.projectedWeight).toBe(60) // a deload holds the load — flat projection
    expect(s.rationale).toMatch(/flat/i)
  })
})

describe('nextSessionSuggestion — RPE autoregulation', () => {
  it('is a no-op when the export has no RPE: still adds load at top of the window', () => {
    const rows = [...session('2026-01-01', 'BP', 60, 8, 3), ...session('2026-01-03', 'BP', 60, 8, 3)]
    expect(hasRpeData(rows)).toBe(false)
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.action).toBe('increase-load')
  })

  it('holds (no rep gain, no projection) when RPE rises at the same load/reps', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 8, 3, 7),
      ...session('2026-01-03', 'BP', 60, 8, 3, 9),
    ]
    expect(hasRpeData(rows)).toBe(true)
    const s = nextSessionSuggestion(rows, undefined, undefined, undefined, 'moderate').BP
    expect(s.action).toBe('add-rep')
    expect(s.repsDelta).toBe(0) // a hold: no rep gain
    expect(s.projectedWeight).toBe(60) // flat projection at the held load
  })
})

describe('nextSessionSuggestion — DUP cold start', () => {
  const now = new Date('2026-01-01T09:00:00').getTime()

  it('seeds a fresh prescription from current e1RM when the focus has no matching history', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 3) // e1RM = 76, no sets in the light window
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'light').BP
    expect(s.action).toBe('dup')
    expect(s.reps).toBe(11) // midpoint of 9–12, rounded
    const e1rm = epley(60, 8)
    expect(s.load).toBe(Math.round(e1rm / (1 + 11 / 30) / 2.5) * 2.5)
    expect(s.sets).toBe(3)
    expect(s.topSet).not.toBeNull()
    expect(s.rationale).toMatch(/undulating/i)
  })
})

describe('nextSessionSuggestion — heavy top set (specificity)', () => {
  const now = new Date('2026-01-01T09:00:00').getTime()

  it('attaches a heavy low-rep top set (~90% e1RM, heavier than the working set)', () => {
    const rows = session('2026-01-01', 'BP', 60, 7, 3)
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'moderate').BP
    expect(s.action).toBe('add-rep')
    expect(s.topSet).not.toBeNull()
    expect(s.topSet!.load).toBeGreaterThan(s.load) // heavier than the working set
    expect(s.topSet!.reps).toBeLessThanOrEqual(3) // low-rep, strength-specific
    expect(s.topSet!.sets).toBe(1)
    const e1rm = epley(60, 7)
    expect(s.topSet!.load).toBe(Math.round((e1rm * 0.9) / 2.5) * 2.5)
  })

  it('omits the top set on a deload', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 7, 3),
      ...session('2026-01-03', 'BP', 60, 7, 3),
      ...session('2026-01-05', 'BP', 60, 7, 3),
    ]
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'moderate').BP
    expect(s.action).toBe('deload')
    expect(s.topSet).toBeNull()
  })
})

describe('nextSessionSuggestion — detraining / reversibility', () => {
  const WEEK = 7 * 86400000
  const lastTs = new Date('2026-01-05T09:00:00').getTime()

  it('backs the load off and marks a return after a gap past the grace window', () => {
    const rows = session('2026-01-05', 'BP', 60, 8, 3)
    const now = lastTs + 6 * WEEK // 6 weeks off: exp(−(6−2)/10)=0.67 → floored to 0.70
    const s = nextSessionSuggestion(rows, undefined, undefined, now).BP
    expect(s.action).toBe('return')
    expect(s.load).toBeLessThan(60)
    expect(s.load).toBeGreaterThanOrEqual(60 * 0.7) // retention floor
    expect(s.loadDelta).toBeLessThan(0)
    expect(s.topSet).toBeNull()
    expect(s.rationale).toMatch(/reversibility|time off/i)
  })

  it('does not back off within the grace window', () => {
    const rows = session('2026-01-05', 'BP', 60, 8, 3)
    const now = lastTs + 1 * WEEK // within 2-week grace
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'moderate').BP
    expect(s.action).not.toBe('return')
    expect(s.load).toBe(62.5) // ordinary progression, not a back-off
  })
})

describe('warmupRamp', () => {
  it('ramps empty bar → ~60/85 %, a 2–3 set baseline, strictly increasing and lighter than the work load', () => {
    const ramp = warmupRamp(100)
    expect(ramp.map((s) => s.weight)).toEqual([20, 60, 85])
    expect(ramp.map((s) => s.reps)).toEqual([5, 3, 2])
    expect(ramp.every((s) => s.kind === 'warmup')).toBe(true)
    expect(ramp.length).toBeGreaterThanOrEqual(2)
    expect(ramp.length).toBeLessThanOrEqual(3)
    for (const s of ramp) expect(s.weight).toBeLessThan(100)
  })

  it('collapses toward 2 sets for a light working load', () => {
    const ramp = warmupRamp(27.5)
    expect(ramp.length).toBeLessThanOrEqual(2)
    for (const s of ramp) expect(s.weight).toBeLessThan(27.5)
  })

  it('is empty at or below the bar (nothing to ramp through)', () => {
    expect(warmupRamp(20)).toEqual([])
    expect(warmupRamp(15)).toEqual([])
  })
})

describe('sessionPlan', () => {
  const now = new Date('2026-01-01T09:00:00').getTime()

  it('lays out warmup ramp → each working set (expanded) → the heavy top set, in order', () => {
    const rows = session('2026-01-01', 'BP', 60, 7, 3) // add-rep → 60×8 ×3, with a top set
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'moderate').BP
    const plan = sessionPlan(s)
    const kinds = plan.map((p) => p.kind)
    // warmups first, then exactly `sets` work sets, then the top set — never interleaved.
    expect(kinds.filter((k) => k === 'work')).toHaveLength(s.sets)
    expect(kinds.slice(0, kinds.indexOf('work')).every((k) => k === 'warmup')).toBe(true)
    expect(kinds[kinds.length - 1]).toBe('top')
    const work = plan.filter((p) => p.kind === 'work')
    for (const w of work) expect(w).toMatchObject({ weight: s.load, reps: s.reps })
    expect(plan.filter((p) => p.kind === 'top')[0]).toMatchObject({
      weight: s.topSet!.load,
      reps: s.topSet!.reps,
    })
  })

  it('omits the top set on a deload but still ramps + expands the working sets', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 7, 3),
      ...session('2026-01-03', 'BP', 60, 7, 3),
      ...session('2026-01-05', 'BP', 60, 7, 3),
    ]
    const s = nextSessionSuggestion(rows, undefined, undefined, now, 'moderate').BP
    const plan = sessionPlan(s)
    expect(s.action).toBe('deload')
    expect(plan.some((p) => p.kind === 'top')).toBe(false)
    expect(plan.filter((p) => p.kind === 'work')).toHaveLength(s.sets)
  })

  it('is empty when there is no history to prescribe from', () => {
    const s = nextSessionSuggestion(session('2026-01-01', 'BP', 60, 8, 3), undefined, undefined, now).SQ
    expect(s.action).toBe('insufficient-data')
    expect(sessionPlan(s)).toEqual([])
  })
})

describe('nextSessionSuggestion — coverage & edges', () => {
  it('reports insufficient data for a lift with no history', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 3)
    const s = nextSessionSuggestion(rows).SQ
    expect(s.action).toBe('insufficient-data')
    expect(s.prev).toBeNull()
    expect(s.projectedWeight).toBeNull()
  })

  it('returns a suggestion for all four lifts', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 3)
    const all = nextSessionSuggestion(rows)
    expect(Object.keys(all).sort()).toEqual(['BP', 'DL', 'OHP', 'SQ'])
  })
})
