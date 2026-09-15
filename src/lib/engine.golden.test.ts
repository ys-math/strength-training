import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseWorkouts } from './parse'
import { BANDS, BAND_CYCLE, liftTracks, nextSession, type RepBand } from './engine'
import { LIFTS } from './types'

// A frozen copy of the real export, taken 2026-09-11. It is deliberately NOT the live
// strong_workouts.csv: the sync LaunchAgent commits a new CSV every time you train, and
// CI runs only `npm run build`, so a golden test reading the live file would sit red
// between syncs with nothing to catch it.
//
// Refresh it by copying strong_workouts.csv over it when you want more recent data in the
// test, then update the expected strings below — the diff is the point.
const csv = readFileSync(new URL('./__fixtures__/workouts.csv', import.meta.url), 'utf8')
const rows = parseWorkouts(csv)

const fmt = (n: number) => n.toFixed(1)

describe('the whole engine, over the frozen export', () => {
  // All twelve straight-set tracks, as the modal load and achieved reps the engine reads.
  // Reading this block IS reading the engine's view of your training.
  it('reads twelve tracks off the log', () => {
    const lines: string[] = []
    for (const lift of LIFTS) {
      const tracks = liftTracks(rows, lift.key)
      for (const band of ['heavy', 'moderate', 'volume'] as RepBand[]) {
        const t = tracks[band]
        lines.push(
          t
            ? `${lift.key.padEnd(4)} ${band.padEnd(9)} ${t.dateKey}  ${fmt(t.load).padStart(5)} x ${String(
                t.achieved,
              ).padStart(2)}  ${t.sets} sets`
            : `${lift.key.padEnd(4)} ${band.padEnd(9)} no history`,
        )
      }
    }
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "BP   heavy     2026-09-04   70.0 x  5  3 sets
      BP   moderate  2026-09-02   65.0 x  6  3 sets
      BP   volume    2026-09-08   60.0 x 10  3 sets
      SQ   heavy     2026-09-08   60.0 x  5  3 sets
      SQ   moderate  2026-09-02   75.0 x  6  3 sets
      SQ   volume    2026-08-07   65.0 x 11  3 sets
      DL   heavy     2026-09-08   80.0 x  5  3 sets
      DL   moderate  2026-09-02   80.0 x  6  3 sets
      DL   volume    2026-08-07   70.0 x 12  3 sets
      OHP  heavy     2026-08-24   25.0 x  5  2 sets
      OHP  moderate  2026-08-19   25.0 x  6  3 sets
      OHP  volume    2026-08-07   22.5 x 10  3 sets"
    `)
  })

  it('prescribes the next session for every lift', () => {
    const lines = nextSession(rows).map((p) => {
      if (!p.plan) return `${p.lift.padEnd(4)} ${p.band.padEnd(9)} no history`
      return [
        p.lift.padEnd(4),
        `${p.lastBand} → ${p.band}`.padEnd(22),
        `3 x ${fmt(p.plan.load).padStart(5)} x ${String(p.plan.reps).padStart(2)}`,
        p.rule.padEnd(8),
        `from ${p.reference?.dateKey}`,
      ].join('  ')
    })
    expect(lines.join('\n')).toMatchInlineSnapshot(`
      "BP    volume → moderate       3 x  65.0 x  7  rep-up    from 2026-09-02
      SQ    heavy → volume          3 x  65.0 x 12  rep-up    from 2026-08-07
      DL    heavy → volume          3 x  72.5 x 10  load-up   from 2026-08-07
      OHP   heavy → volume          3 x  22.5 x 11  rep-up    from 2026-08-07"
    `)
  })

  // Properties that must hold whatever the data says, so a fixture refresh can't quietly
  // let a broken rule through alongside a plausible-looking snapshot.
  it('always prescribes loadable weights inside the band', () => {
    for (const p of nextSession(rows)) {
      if (!p.plan) continue
      const [lo, hi] = BANDS[p.band]
      expect(p.plan.load % 2.5).toBe(0)
      expect(p.plan.reps).toBeGreaterThanOrEqual(lo)
      expect(p.plan.reps).toBeLessThanOrEqual(hi)
      expect(BAND_CYCLE).toContain(p.band)
    }
  })
})
