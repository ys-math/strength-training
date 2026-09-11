import { describe, it, expect } from 'vitest'
import type { LiftKey, SetRow } from './types'
import {
  achievedReps,
  bandOf,
  liftDays,
  liftTracks,
  nextBand,
  prescribe,
  snap,
  topSetLoad,
} from './engine'

let order = 0

function set(dateKey: string, lift: LiftKey | null, weight: number, reps: number, warmup = false): SetRow {
  return {
    date: new Date(`${dateKey}T09:00:00`),
    dateKey,
    workout: 'Test',
    exercise: lift ?? 'Accessory',
    lift,
    setOrder: warmup ? 'W' : String(++order),
    isWarmup: warmup,
    weight,
    reps,
  }
}

/** n identical straight sets on one day. */
function day(dateKey: string, lift: LiftKey, weight: number, reps: number, n = 3): SetRow[] {
  return Array.from({ length: n }, () => set(dateKey, lift, weight, reps))
}

const straightOf = (rows: SetRow[], lift: LiftKey) =>
  prescribe(rows, lift).plan.find((s) => s.kind === 'straight')
const topOf = (rows: SetRow[], lift: LiftKey) => prescribe(rows, lift).plan.find((s) => s.kind === 'top')

describe('achievedReps — round(mean)', () => {
  it('rounds the mean, half up', () => {
    expect(achievedReps([10, 10, 10])).toBe(10)
    expect(achievedReps([10, 10, 8])).toBe(9) // 9.33
    expect(achievedReps([6, 6, 5, 6, 6, 6])).toBe(6) // 5.83 — floor would say 5
    expect(achievedReps([10, 5, 5])).toBe(7) // 6.67
    expect(achievedReps([6, 5])).toBe(6) // 5.5 rounds up
  })
})

describe('bandOf — labels and clamps', () => {
  it('maps each window to its band', () => {
    expect(bandOf(3)).toBe('heavy')
    expect(bandOf(5)).toBe('heavy')
    expect(bandOf(6)).toBe('moderate')
    expect(bandOf(9)).toBe('moderate')
    expect(bandOf(10)).toBe('volume')
    expect(bandOf(12)).toBe('volume')
  })

  // Doubles and singles are real sessions, but top is not a rotation state, so they clamp
  // to heavy rather than falling out of the cycle.
  it('clamps below 3 to heavy and above 12 to volume', () => {
    expect(bandOf(2)).toBe('heavy')
    expect(bandOf(1)).toBe('heavy')
    expect(bandOf(15)).toBe('volume')
  })
})

describe('liftDays — reading a messy log', () => {
  it('takes the straight sets as the modal load, ties going to the heavier', () => {
    // Apr 25 squat: a ramp-up, then the work, then a heavier single set.
    const rows = [
      set('2026-04-25', 'SQ', 40, 12),
      set('2026-04-25', 'SQ', 50, 10),
      set('2026-04-25', 'SQ', 50, 10),
      set('2026-04-25', 'SQ', 60, 8),
    ]
    const [d] = liftDays(rows, 'SQ')
    expect(d.load).toBe(50)
    expect(d.reps).toEqual([10, 10])
    expect(d.sets).toBe(2)
  })

  it('reads the top set as the heaviest set above the modal load', () => {
    const rows = [...day('2026-09-08', 'BP', 60, 10), set('2026-09-08', 'BP', 70, 2)]
    const [d] = liftDays(rows, 'BP')
    expect(d.load).toBe(60)
    expect(d.topSet).toEqual({ weight: 70, reps: 2 })
    expect(d.band).toBe('volume')
  })

  it('has no top set when nothing was logged above the straight sets', () => {
    expect(liftDays(day('2026-09-08', 'SQ', 60, 5), 'SQ')[0].topSet).toBeNull()
  })

  // What the trend chart plots. It falls back to the working load so every trained session
  // has a point, which matters most for overhead press: 30 sessions, only 2 top sets.
  it('always has a heaviest working set, top set or not', () => {
    const withTop = [...day('2026-09-08', 'BP', 60, 10), set('2026-09-08', 'BP', 70, 2)]
    expect(liftDays(withTop, 'BP')[0].heaviest).toEqual({ weight: 70, reps: 2 })

    const without = day('2026-09-08', 'SQ', 60, 5)
    expect(liftDays(without, 'SQ')[0].heaviest).toEqual({ weight: 60, reps: 5 })
  })

  it('finds a heaviest set that is neither the modal load nor the top set', () => {
    // Apr 25 squat ramps 40 -> 50 -> 60; the modal load is 50 and the heaviest is 60.
    const rows = [
      set('2026-04-25', 'SQ', 40, 12),
      set('2026-04-25', 'SQ', 50, 10),
      set('2026-04-25', 'SQ', 50, 10),
      set('2026-04-25', 'SQ', 60, 8),
    ]
    expect(liftDays(rows, 'SQ')[0].heaviest).toEqual({ weight: 60, reps: 8 })
  })

  it('never lets a warmup be the heaviest set', () => {
    const rows = [set('2026-06-04', 'SQ', 95, 1, true), ...day('2026-06-04', 'SQ', 80, 5)]
    expect(liftDays(rows, 'SQ')[0].heaviest.weight).toBe(80)
  })

  // Warmups are excluded everywhere in the engine. Two real squat days logged warmups only.
  it('excludes warmups from the straight sets', () => {
    const rows = [
      set('2026-06-04', 'SQ', 50, 5, true),
      set('2026-06-04', 'SQ', 50, 5, true),
      ...day('2026-06-04', 'SQ', 80, 5),
    ]
    const [d] = liftDays(rows, 'SQ')
    expect(d.load).toBe(80)
    expect(d.sets).toBe(3)
  })
})

describe('nextBand — the rotation', () => {
  it('runs heavy → volume → moderate → heavy', () => {
    expect(nextBand('heavy')).toBe('volume')
    expect(nextBand('volume')).toBe('moderate')
    expect(nextBand('moderate')).toBe('heavy')
  })

  it('rotates each lift off its own last session, not a shared clock', () => {
    // The real Sep 8: bench was a volume day while squat was heavy, on the same date.
    const rows = [
      ...day('2026-09-08', 'BP', 60, 10),
      ...day('2026-09-08', 'SQ', 60, 5),
      ...day('2026-08-01', 'BP', 65, 7),
      ...day('2026-08-01', 'SQ', 65, 11),
    ]
    expect(prescribe(rows, 'BP').band).toBe('moderate')
    expect(prescribe(rows, 'SQ').band).toBe('volume')
  })
})

describe('liftTracks — one reference per band', () => {
  it('keeps the most recent session in each band, independently', () => {
    const rows = [
      ...day('2026-08-01', 'BP', 60, 11), // volume
      ...day('2026-08-05', 'BP', 70, 5), // heavy
      ...day('2026-08-09', 'BP', 62.5, 11), // volume again, supersedes Aug 1
    ]
    const tracks = liftTracks(rows, 'BP')
    expect(tracks.volume?.dateKey).toBe('2026-08-09')
    expect(tracks.volume?.load).toBe(62.5)
    expect(tracks.heavy?.dateKey).toBe('2026-08-05')
    expect(tracks.moderate).toBeUndefined()
  })
})

describe('the progression rule', () => {
  it('adds a rep when inside the band', () => {
    // Last session was moderate, so the next band is heavy.
    const rows = [...day('2026-08-01', 'BP', 70, 4), ...day('2026-08-05', 'BP', 65, 7)]
    const p = prescribe(rows, 'BP')
    expect(p.band).toBe('heavy')
    expect(p.rule).toBe('rep-up')
    expect(straightOf(rows, 'BP')).toMatchObject({ load: 70, reps: 5 })
  })

  it('adds a plate step and drops to the bottom of the band at the top of it', () => {
    const rows = [...day('2026-08-01', 'BP', 70, 5), ...day('2026-08-05', 'BP', 65, 7)]
    const p = prescribe(rows, 'BP')
    expect(p.rule).toBe('load-up')
    expect(straightOf(rows, 'BP')).toMatchObject({ load: 72.5, reps: 3 })
  })

  // Double progression only advances off a completed session. Sep 4 squat was 60x5, 60x5.
  it('repeats an unfinished session instead of advancing', () => {
    // Sep 4 is the unfinished heavy session; Sep 6 is moderate, so the rotation lands
    // back on heavy and picks Sep 4 up as its reference.
    const rows = [...day('2026-09-04', 'SQ', 60, 5, 2), ...day('2026-09-06', 'SQ', 65, 7)]
    const p = prescribe(rows, 'SQ')
    expect(p.band).toBe('heavy')
    expect(p.rule).toBe('repeat')
    // 5 is the top of heavy, so without the unfinished check this would have been 62.5 x 3.
    expect(straightOf(rows, 'SQ')).toMatchObject({ load: 60, reps: 5 })
  })

  it('starts a clamped near-max session at the bottom of the heavy band', () => {
    // 67.5 x 2,2,1 averages 2, which clamps to heavy; +1 rep would leave the band.
    const rows = [
      ...day('2026-08-01', 'BP', 65, 7),
      set('2026-06-26', 'BP', 67.5, 2),
      set('2026-06-26', 'BP', 67.5, 2),
      set('2026-06-26', 'BP', 67.5, 1),
    ]
    expect(straightOf(rows, 'BP')).toMatchObject({ load: 67.5, reps: 3 })
  })

  it('prescribes nothing for a band with no history', () => {
    const rows = day('2026-08-01', 'OHP', 25, 5) // heavy only
    const p = prescribe(rows, 'OHP')
    expect(p.band).toBe('volume')
    expect(p.rule).toBe('no-history')
    expect(p.plan).toEqual([])
    expect(p.reference).toBeNull()
  })

  it('reports the session it progressed from, however old', () => {
    const rows = [...day('2026-07-01', 'DL', 70, 12), ...day('2026-09-08', 'DL', 80, 5)]
    const p = prescribe(rows, 'DL')
    expect(p.band).toBe('volume')
    expect(p.reference?.dateKey).toBe('2026-07-01')
    expect(p.rule).toBe('load-up') // stale, but never quietly backed off
  })
})

describe('the top set', () => {
  it('snaps load / factor to the plate step, at 2 reps', () => {
    expect(topSetLoad(65, 'volume')).toBe(77.5) // 76.47
    expect(topSetLoad(65, 'moderate')).toBe(72.5) // 72.22
    expect(topSetLoad(72.5, 'volume')).toBe(85) // 85.29
    expect(topSetLoad(80, 'heavy')).toBe(85) // 84.21
  })

  // The heavy factor is only 1.05x, which snaps back onto the straight-set load itself at
  // the two lightest loadable weights. Without the floor the card would print a fourth
  // identical set and call it a top set.
  it('floors one plate step above the straight sets when the factor collapses', () => {
    expect(topSetLoad(22.5, 'heavy')).toBe(25)
    expect(topSetLoad(20, 'heavy')).toBe(22.5)
  })

  it('always follows the straight sets in the plan, at 2 reps', () => {
    const rows = [...day('2026-08-01', 'BP', 70, 4), ...day('2026-08-05', 'BP', 65, 7)]
    // Straight sets land on 70 kg heavy; 70 / 0.95 = 73.68, which snaps down to 72.5.
    expect(topOf(rows, 'BP')).toEqual({ kind: 'top', load: 72.5, reps: 2 })
  })
})

describe('snap', () => {
  it('rounds to the plate step', () => {
    expect(snap(76.47)).toBe(77.5)
    expect(snap(85.29)).toBe(85)
    expect(snap(26.47)).toBe(27.5)
  })
})
