import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { nextSessionSuggestion, hasRpeData } from './metrics'

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

describe('nextSessionSuggestion — double progression', () => {
  it('adds load (smallest increment) when the top set hits the top of the range', () => {
    const rows = session('2026-01-01', 'BP', 60, 10, 3)
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('increase-load')
    expect(s.load).toBe(62.5)
    expect(s.reps).toBe(6) // dropped to bottom of the 6–10 range
    expect(s.sets).toBe(3)
    expect(s.loadDelta).toBe(2.5)
    expect(s.prev).toEqual({ load: 60, reps: 10, sets: 3 })
    expect(s.projectedWeight).toBe(62.5)
    expect(s.projectedE1rm).toBe(epley(62.5, 6)) // 75
  })

  it('holds load and adds a rep when reps are within range but not at the top', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 3)
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('add-rep')
    expect(s.load).toBe(60)
    expect(s.reps).toBe(9) // target = previous + 1
    expect(s.repsDelta).toBe(1)
    expect(s.loadDelta).toBe(0)
    expect(s.projectedE1rm).toBe(epley(60, 9)) // 78
  })

  it('builds reps when below the range (single session, no plateau)', () => {
    const rows = session('2026-01-01', 'BP', 60, 4, 3)
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('build-reps')
    expect(s.load).toBe(60)
    expect(s.reps).toBe(5)
    expect(s.repsDelta).toBe(1)
  })

  it('ignores warmup sets when picking the top working set', () => {
    const rows = [set('2026-01-01', 'BP', 100, 1, { warmup: true }), ...session('2026-01-01', 'BP', 60, 8, 3)]
    const s = nextSessionSuggestion(rows).BP
    expect(s.load).toBe(60) // not the 100kg warmup
  })
})

describe('nextSessionSuggestion — plateau / deload', () => {
  it('deloads when stuck below the range two sessions running', () => {
    const rows = [...session('2026-01-01', 'BP', 60, 4, 3), ...session('2026-01-03', 'BP', 60, 5, 3)]
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('deload')
    expect(s.sets).toBe(2) // ~half of 3, rounded
    expect(s.setsDelta).toBeLessThan(0)
    expect(s.projectedWeight).toBe(60) // a deload holds the load — flat projection
    expect(s.rationale).toMatch(/heuristic/i)
  })

  it('deloads when e1RM is flat across the stagnation window despite reps in range', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 8, 3),
      ...session('2026-01-03', 'BP', 60, 8, 3),
      ...session('2026-01-05', 'BP', 60, 8, 3),
    ]
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('deload')
    expect(s.projectedWeight).toBe(60)
    expect(s.rationale).toMatch(/flat/i)
  })
})

describe('nextSessionSuggestion — RPE autoregulation', () => {
  it('is a no-op when the export has no RPE: still adds load at top of range', () => {
    const rows = [...session('2026-01-01', 'BP', 60, 10, 3), ...session('2026-01-03', 'BP', 60, 10, 3)]
    expect(hasRpeData(rows)).toBe(false)
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('increase-load')
  })

  it('holds (no rep gain, no projection) when RPE rises at the same load/reps', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 10, 3, 7),
      ...session('2026-01-03', 'BP', 60, 10, 3, 9),
    ]
    expect(hasRpeData(rows)).toBe(true)
    const s = nextSessionSuggestion(rows).BP
    expect(s.action).toBe('add-rep')
    expect(s.repsDelta).toBe(0) // a hold: no rep gain
    expect(s.projectedWeight).toBe(60) // flat projection at the held load
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
