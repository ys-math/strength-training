import { describe, it, expect } from 'vitest'
import { epley } from './parse'
import type { LiftKey, SetRow } from './types'
import { classifyFocus, cumulativeSeries, liftGrowth, liftSetSeries, sessionVolume } from './metrics'

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

describe('liftSetSeries — the set-block chart', () => {
  // The chart's central claim: a column's height IS the session's volume. That only holds
  // if the blocks it stacks (reps × weight) sum to the number the tooltip prints.
  it('stacks to its own volume: Σ (weight × reps) over the sets', () => {
    // 50×11, 50×11, 50×6, 50×6 — the real Jul 10 bench session.
    const rows = [
      ...session('2026-07-10', 'BP', 50, 11, 2),
      ...session('2026-07-10', 'BP', 50, 6, 2),
    ]
    const [day] = liftSetSeries(rows, 'BP')

    expect(day.workingSets).toBe(4)
    expect(day.volume).toBe(1700)
    expect(day.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)).toBe(day.volume)
  })

  // The agreement that makes warmup exclusion non-negotiable. A column's kg must equal
  // this lift's segment of the Session-volume card's bar for the same date, or the
  // dashboard contradicts itself about what a day was worth.
  it('reports the same kg for a day that sessionVolume attributes to the lift', () => {
    const rows = [
      set('2026-07-10', 'BP', 20, 5, { warmup: true }),
      set('2026-07-10', 'BP', 40, 5, { warmup: true }),
      set('2026-07-10', 'BP', 50, 5, { warmup: true }),
      ...session('2026-07-10', 'BP', 50, 11, 2),
      ...session('2026-07-10', 'BP', 50, 6, 2),
      ...session('2026-07-10', 'SQ', 80, 8),
      set('2026-07-10', null, 200, 10), // accessory — counted by neither
    ]

    const [day] = liftSetSeries(rows, 'BP')
    const [bar] = sessionVolume(rows)

    expect(day.volume).toBe(bar.BP)
    // The warmups (500 kg over 3 sets) are in neither, which is the whole point.
    expect(day.volume).toBe(1700)
    expect(day.workingSets).toBe(4)
  })

  it('excludes warmups, other lifts and accessories from the sets themselves', () => {
    const rows = [
      set('2026-01-05', 'BP', 120, 5, { warmup: true }),
      set('2026-01-05', 'BP', 90, 5),
      set('2026-01-05', 'SQ', 140, 5),
      set('2026-01-05', null, 200, 5),
    ]
    const [day] = liftSetSeries(rows, 'BP')
    expect(day.sets).toEqual([{ weight: 90, reps: 5, volume: 450 }])
  })

  // A session's sets are not uniform — the engine prescribes a heavy top set after the
  // working sets — and every one of them is its own tray with its own block height.
  it('keeps a mixed-load session as separate sets, in performed order', () => {
    // The real Jul 5 bench session: 57.5×5 ×3, then a 62.5×2 top set.
    const rows = [...session('2026-07-05', 'BP', 57.5, 5), set('2026-07-05', 'BP', 62.5, 2)]
    const [day] = liftSetSeries(rows, 'BP')

    expect(day.sets.map((s) => s.weight)).toEqual([57.5, 57.5, 57.5, 62.5])
    expect(day.sets.map((s) => s.reps)).toEqual([5, 5, 5, 2])
    expect(day.volume).toBe(988) // 862.5 + 125, rounded as sessionVolume rounds
  })

  it('is chronological, so the columns read left-to-right in time', () => {
    const rows = [...session('2026-02-01', 'BP', 70, 5), ...session('2026-01-05', 'BP', 65, 5)]
    expect(liftSetSeries(rows, 'BP').map((s) => s.dateKey)).toEqual(['2026-01-05', '2026-02-01'])
  })

  it('is empty for a lift with no history, rather than throwing', () => {
    expect(liftSetSeries(session('2026-01-05', 'BP', 60, 5), 'OHP')).toEqual([])
  })
})

describe('liftGrowth — the two rates above the blocks', () => {
  // The reason max weight uses a running max and not a fit through the per-session tops.
  // The engine alternates heavy/light by design, so a window that happens to END on a
  // light day would print a LOSS from a fit — while the record never fell at all.
  it('does not read the DUP zigzag as a loss', () => {
    const rows = [
      ...session('2026-01-05', 'BP', 100, 4), // heavy
      ...session('2026-01-12', 'BP', 60, 10), // light
      ...session('2026-01-19', 'BP', 105, 4), // heavy — record advances
      ...session('2026-01-26', 'BP', 60, 10), // light: window ends here
    ]
    const g = liftGrowth(rows, 'BP')
    expect(g.maxWeight).toBe(105)
    expect(g.maxWeightPerWeek).toBe(1.7) // +5 kg over 3 weeks — never negative
  })

  it('scopes both rates to the window, so the card describes what is on screen', () => {
    const rows = [
      ...session('2026-01-05', 'BP', 60, 5),
      ...session('2026-02-02', 'BP', 100, 5),
      ...session('2026-02-09', 'BP', 110, 5),
    ]
    const all = liftGrowth(rows, 'BP')
    const windowed = liftGrowth(rows, 'BP', '2026-02-02')

    expect(all.maxWeight).toBe(110)
    expect(windowed.maxWeight).toBe(110)
    // The window drops the 60 kg start, so the record's climb is +10 over 1 week, not +50 over 5.
    expect(all.maxWeightPerWeek).toBe(10)
    expect(windowed.maxWeightPerWeek).toBe(10)
    expect(windowed.weeklyVolume).toBeGreaterThan(all.weeklyVolume)
  })

  it('leaves a rate null rather than printing a fake zero on too short a window', () => {
    const g = liftGrowth(session('2026-01-05', 'BP', 60, 5), 'BP')
    expect(g.maxWeight).toBe(60)
    expect(g.maxWeightPerWeek).toBeNull()
    expect(g.weeklyVolumePctPerWeek).toBeNull()
  })

  it('counts a rest week as zero volume, so a skipped week tells against the trend', () => {
    const climbing = [
      ...session('2026-01-05', 'BP', 60, 5),
      ...session('2026-01-12', 'BP', 60, 5),
      ...session('2026-01-19', 'BP', 60, 5),
    ]
    // Same three sessions, but a week off in the middle.
    const skipped = [
      ...session('2026-01-05', 'BP', 60, 5),
      ...session('2026-01-19', 'BP', 60, 5),
      ...session('2026-01-26', 'BP', 60, 5),
    ]
    expect(liftGrowth(climbing, 'BP').weeklyVolume).toBeGreaterThan(liftGrowth(skipped, 'BP').weeklyVolume)
  })

  it('is empty for a lift with no history', () => {
    expect(liftGrowth(session('2026-01-05', 'BP', 60, 5), 'OHP')).toMatchObject({
      maxWeight: 0,
      maxWeightPerWeek: null,
    })
  })
})

// classifyFocus still grades every training day for the heatmap, the mix bar and the DUP
// engine, even though the drill-down no longer colors by it.
describe('classifyFocus', () => {
  it('buckets by window ceilings, so no rep count falls through', () => {
    expect(classifyFocus(5)).toBe('heavy')
    expect(classifyFocus(8)).toBe('moderate')
    expect(classifyFocus(9)).toBe('light')
  })

  it('keeps reps that fall outside every DUP window', () => {
    expect(classifyFocus(1)).toBe('heavy')
    expect(classifyFocus(2)).toBe('heavy')
    expect(classifyFocus(15)).toBe('light')
  })
})

describe('cumulativeSeries', () => {
  it('never descends, and carries the set that established the standing record', () => {
    const rows = [
      ...session('2026-01-05', 'BP', 100, 5),
      ...session('2026-01-12', 'BP', 60, 10), // a light day must not pull the line down
      ...session('2026-01-19', 'BP', 110, 3),
    ]
    const series = cumulativeSeries(rows)
    expect(series.map((p) => p.BP)).toEqual([100, 100, 110])
    expect(series[1].detail.BP).toEqual({ reps: 5, setOn: '2026-01-05' })
    expect(series[2].detail.BP).toEqual({ reps: 3, setOn: '2026-01-19' })
  })
})
