import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import {
  goalPace,
  nextSessionSuggestion,
  recentRatePerWeek,
  recommendedGoals,
  type GoalContext,
} from './metrics'

let order = 0
function set(dateKey: string, lift: LiftKey, weight: number, reps: number): SetRow {
  return {
    date: new Date(`${dateKey}T09:00:00`),
    dateKey,
    workout: 'Test',
    exercise: lift,
    lift,
    setOrder: String(++order),
    isWarmup: false,
    weight,
    reps,
    e1rm: epley(weight, reps),
    rpe: null,
  }
}
function session(dateKey: string, lift: LiftKey, weight: number, reps: number, n = 3): SetRow[] {
  return Array.from({ length: n }, () => set(dateKey, lift, weight, reps))
}

describe('recommendedGoals', () => {
  it('is strictly increasing, at least +2.5 short-term, and snapped to 2.5 kg', () => {
    const rows = session('2026-01-01', 'BP', 60, 5, 3) // current max weight 60
    const g = recommendedGoals(rows, 'BP')
    expect(g.short).toBeGreaterThanOrEqual(62.5)
    expect(g.mid).toBeGreaterThan(g.short)
    expect(g.long).toBeGreaterThan(g.mid)
    for (const v of [g.short, g.mid, g.long]) expect(v % 2.5).toBe(0)
  })

  it('returns zeros with no history', () => {
    expect(recommendedGoals([], 'BP')).toEqual({ short: 0, mid: 0, long: 0 })
  })

  it('responds to recent progress, decelerates, and stays bounded by diminishing returns', () => {
    const current = 100
    const flat = [...session('2026-01-01', 'BP', current, 3)] // no recent rate
    // +30 kg over 8 weeks → a hot ~3.75 kg/wk streak that must NOT project linearly.
    const fast = [
      ...session('2026-01-01', 'BP', current - 30, 3),
      ...session('2026-02-26', 'BP', current, 3),
    ]
    const flatG = recommendedGoals(flat, 'BP')
    const fastG = recommendedGoals(fast, 'BP')

    // History responds: a fast gainer earns a higher short-term target than a flat lift.
    expect(fastG.short).toBeGreaterThan(flatG.short)
    // Diminishing returns: the whole-year per-quarter gain is no larger than the first
    // quarter's, and the cumulative long gain is capped near capPct.long (25 %).
    expect((fastG.long - current) / 4).toBeLessThanOrEqual(fastG.short - current)
    expect(fastG.long - current).toBeLessThanOrEqual(current * 0.25 + 2.5)
    // Still strictly increasing and snapped to 2.5 kg.
    expect(fastG.mid).toBeGreaterThan(fastG.short)
    expect(fastG.long).toBeGreaterThan(fastG.mid)
    for (const v of [fastG.short, fastG.mid, fastG.long]) expect(v % 2.5).toBe(0)
  })
})

describe('recommendedGoals — biological scaling', () => {
  // Shared recent 8-week climb 94 → 100 (rate ≈ 0.75 kg/wk), same for both lifters.
  const recent = [
    ...session('2026-04-06', 'BP', 94, 5),
    ...session('2026-05-04', 'BP', 97.5, 5),
    ...session('2026-06-01', 'BP', 100, 5),
  ]
  const sum = (g: { short: number; mid: number; long: number }) => g.short + g.mid + g.long

  it('neural phase: an advanced (long-history) lifter gets smaller goals than a novice at the same current & rate', () => {
    const novice = recommendedGoals(recent, 'BP')
    // Same recent block, but a long prior history → older training age → smaller ψ.
    const advanced = recommendedGoals([...session('2025-01-01', 'BP', 80, 5), ...recent], 'BP')
    expect(advanced.long).toBeLessThan(novice.long)
    expect(sum(advanced)).toBeLessThan(sum(novice))
    // Both still strictly increasing.
    for (const g of [novice, advanced]) {
      expect(g.mid).toBeGreaterThan(g.short)
      expect(g.long).toBeGreaterThan(g.mid)
    }
  })

  it('stimulus: a higher training frequency yields larger goals than sparse training at the same rate', () => {
    // Both climb 96 → 100 over 8 weeks (rate 0.5), same training age; only frequency differs.
    const dense = [
      ...session('2026-04-06', 'BP', 96, 5),
      ...session('2026-04-13', 'BP', 97.5, 5),
      ...session('2026-04-20', 'BP', 97.5, 5),
      ...session('2026-04-27', 'BP', 97.5, 5),
      ...session('2026-05-04', 'BP', 100, 5),
      ...session('2026-05-11', 'BP', 100, 5),
      ...session('2026-05-18', 'BP', 100, 5),
      ...session('2026-05-25', 'BP', 100, 5),
      ...session('2026-06-01', 'BP', 100, 5),
    ]
    const sparse = [...session('2026-04-06', 'BP', 96, 5), ...session('2026-06-01', 'BP', 100, 5)]
    const dg = recommendedGoals(dense, 'BP')
    const sg = recommendedGoals(sparse, 'BP')
    expect(dg.long).toBeGreaterThan(sg.long)
    expect(sum(dg)).toBeGreaterThan(sum(sg))
  })
})

describe('goalPace', () => {
  it('classifies met / ahead / on-track / behind', () => {
    expect(goalPace(80, 80, 13, 0)).toBe('met')
    expect(goalPace(70, 80, 10, 1.5)).toBe('ahead') // required 1.0/wk, rate 1.5
    expect(goalPace(70, 80, 10, 0.7)).toBe('on-track') // ratio 0.7
    expect(goalPace(70, 80, 10, 0.1)).toBe('behind') // ratio 0.1
  })
})

describe('recentRatePerWeek', () => {
  it('measures best-to-date max-weight gain per week, floored at 0', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 50, 5),
      ...session('2026-02-26', 'BP', 60, 5), // ~8 weeks later, +10 kg
    ]
    const r = recentRatePerWeek(rows, 'BP')
    expect(r).toBeGreaterThan(0.8)
    expect(r).toBeLessThan(2)
  })
})

describe('goal-aware next session', () => {
  const ctx = (target: number, weeksLeft = 13): GoalContext => ({ target: { BP: target }, weeksLeft })

  it('pushes reps instead of a mild-stagnation deload when behind pace', () => {
    // Within range (8 in 6–10), e1RM flat over 3 sessions → normally a deload.
    const rows = [
      ...session('2026-01-01', 'BP', 60, 8),
      ...session('2026-01-03', 'BP', 60, 8),
      ...session('2026-01-05', 'BP', 60, 8),
    ]
    expect(nextSessionSuggestion(rows).BP.action).toBe('deload') // no goal → unchanged
    const withGoal = nextSessionSuggestion(rows, ctx(80)).BP // far target, flat rate → behind
    expect(withGoal.goalPace).toBe('behind')
    expect(withGoal.action).toBe('add-rep')
  })

  it('still deloads a hard below-range stall regardless of goal', () => {
    const rows = [
      ...session('2026-01-01', 'BP', 60, 4),
      ...session('2026-01-03', 'BP', 60, 5),
    ]
    expect(nextSessionSuggestion(rows, ctx(80)).BP.action).toBe('deload')
  })

  it('leaves goalPace null when no goal context is given', () => {
    const rows = session('2026-01-01', 'BP', 60, 8, 3)
    expect(nextSessionSuggestion(rows).BP.goalPace).toBeNull()
  })
})
