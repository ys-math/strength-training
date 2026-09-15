// The entire next-session algorithm. Read this file top to bottom and you know the
// system: there is nothing else. Rationale and a worked example live in docs/METHOD.md.
//
// Shape of one session, per lift: 3 straight sets in a rep band.
// Warmups are never part of a prescription and never enter any calculation here.
import { LIFTS, type LiftKey, type SetRow } from './types'

// ---- Bands -------------------------------------------------------------------

/** The three rep bands the engine rotates through, one per session per lift. */
export type RepBand = 'heavy' | 'moderate' | 'volume'

/** Inclusive rep windows. The straight sets live inside one of these. */
export const BANDS: Record<RepBand, [number, number]> = {
  heavy: [3, 5],
  moderate: [6, 9],
  volume: [10, 12],
}

/** Rotation order. Chosen for contrast: no two adjacent bands ever run back to back. */
export const BAND_CYCLE: RepBand[] = ['heavy', 'volume', 'moderate']

/** Labels and one-line intents, so no component invents its own wording. */
export const BAND_META: Record<RepBand, { label: string; intent: string }> = {
  heavy: { label: 'Heavy', intent: 'few reps, near-maximal load' },
  moderate: { label: 'Moderate', intent: 'mid reps, the working middle' },
  volume: { label: 'Volume', intent: 'many reps, lighter load' },
}

/** The one band → color map. Components read this, never a hex or a var of their own. */
export const BAND_COLOR: Record<RepBand, string> = {
  heavy: 'var(--band-heavy)',
  moderate: 'var(--band-moderate)',
  volume: 'var(--band-volume)',
}

export interface EngineConfig {
  /** Smallest loadable step, kg. Every prescribed weight is a multiple of it. */
  increment: number
  /** Straight sets in a complete session. Fewer than this means unfinished. */
  straightSets: number
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  increment: 2.5,
  straightSets: 3,
}

// ---- Reading history ---------------------------------------------------------

/** Snap to the plate step. Every number the engine prints passes through here. */
export function snap(kg: number, increment = DEFAULT_ENGINE_CONFIG.increment): number {
  return Math.round(kg / increment) * increment
}

/** Mean of the reps, rounded. One statistic, two jobs: it labels the band and it counts
 *  what you achieved. Half rounds up, so 9.5 reads as 10. */
export function achievedReps(reps: number[]): number {
  if (reps.length === 0) return 0
  return Math.floor(reps.reduce((a, b) => a + b, 0) / reps.length + 0.5)
}

/**
 * The band a rep count belongs to. Counts outside 3–12 clamp to the nearest band, so a
 * near-maximal day of doubles reads as heavy rather than falling out of the rotation.
 */
export function bandOf(reps: number): RepBand {
  const r = Math.max(BANDS.heavy[0], Math.min(BANDS.volume[1], reps))
  for (const band of BAND_CYCLE) {
    const [lo, hi] = BANDS[band]
    if (r >= lo && r <= hi) return band
  }
  return 'heavy'
}

/** One lift on one training day, reduced to what the engine needs. */
export interface DayWork {
  dateKey: string
  ts: number
  /** The modal load: the weight carrying the most working sets, ties to the heavier. */
  load: number
  /** Reps of the straight sets, in performed order. */
  reps: number[]
  /** round(mean(reps)) over those sets. */
  achieved: number
  /** How many straight sets were logged at that load. */
  sets: number
  /** Band this session is filed under. */
  band: RepBand
  /** Heaviest working set of the day, warmups excluded. Equals the modal load unless
   *  something heavier was logged, so every trained session has a value. This is what the
   *  trend chart plots. */
  heaviest: { weight: number; reps: number }
}

/**
 * A lift's whole history as one entry per training day, oldest first.
 *
 * The straight sets are taken *positively* as the modal load rather than by discarding the
 * heaviest set as an outlier: the Strong export marks nothing but warmups, so shape is all
 * there is, and the modal load is what survives contact with ramp-ups and drop-offs.
 */
export function liftDays(rows: SetRow[], lift: LiftKey): DayWork[] {
  const byDate = new Map<string, SetRow[]>()
  for (const r of rows) {
    if (r.lift !== lift || r.isWarmup || r.weight <= 0 || r.reps <= 0) continue
    const list = byDate.get(r.dateKey)
    if (list) list.push(r)
    else byDate.set(r.dateKey, [r])
  }

  const days: DayWork[] = []
  for (const [dateKey, sets] of byDate) {
    const counts = new Map<number, number>()
    for (const s of sets) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1)

    let load = 0
    let best = 0
    for (const [weight, n] of counts) {
      if (n > best || (n === best && weight > load)) {
        best = n
        load = weight
      }
    }

    const reps = sets.filter((s) => s.weight === load).map((s) => s.reps)

    // Taken over every working set, not just the modal load: a ramp-up can leave the day's
    // heaviest set somewhere in between.
    const heaviestWeight = Math.max(...sets.map((s) => s.weight))
    const heaviest = {
      weight: heaviestWeight,
      reps: Math.max(...sets.filter((s) => s.weight === heaviestWeight).map((s) => s.reps)),
    }

    const achieved = achievedReps(reps)
    days.push({
      dateKey,
      ts: sets[0].date.getTime(),
      load,
      reps,
      achieved,
      sets: reps.length,
      band: bandOf(achieved),
      heaviest,
    })
  }

  return days.sort((a, b) => a.ts - b.ts)
}

/** The most recent day filed under each band. Absent bands have no history yet. */
export function liftTracks(rows: SetRow[], lift: LiftKey): Partial<Record<RepBand, DayWork>> {
  const tracks: Partial<Record<RepBand, DayWork>> = {}
  for (const day of liftDays(rows, lift)) tracks[day.band] = day
  return tracks
}

/** One step along the cycle. */
export function nextBand(from: RepBand): RepBand {
  return BAND_CYCLE[(BAND_CYCLE.indexOf(from) + 1) % BAND_CYCLE.length]
}

// ---- Prescribing -------------------------------------------------------------

/** Which arm of the progression rule fired. */
export type ProgressRule =
  | 'load-up' // hit the top of the band, so add a plate step and drop to the bottom
  | 'rep-up' // inside the band, so hold the load and add a rep
  | 'repeat' // fewer than 3 straight sets last time, so do it again
  | 'no-history' // never trained this band

/** The straight sets of one prescribed session: `straightSets` sets of `reps` at `load`. */
export interface PlanSet {
  load: number
  reps: number
}

export interface Prescription {
  lift: LiftKey
  /** The band prescribed for the next session. */
  band: RepBand
  /** The band of this lift's last session, and its date. Null with no history at all. */
  lastBand: RepBand | null
  lastDateKey: string | null
  rule: ProgressRule
  /** The session to perform: 3 straight sets. Null when there's no history in the band. */
  plan: PlanSet | null
  /** The session this was progressed from, so a stale reference is visible. */
  reference: DayWork | null
}

/**
 * The whole progression rule, and the only one.
 *
 * Given the band's most recent session: an unfinished session is repeated, a session that
 * reached the top of the band earns a plate step at the bottom of the band, and anything
 * else holds the load and adds one rep.
 */
export function prescribeBand(
  band: RepBand,
  reference: DayWork | null,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
): { rule: ProgressRule; plan: PlanSet | null } {
  if (!reference) return { rule: 'no-history', plan: null }

  const [lo, hi] = BANDS[band]
  const clamp = (n: number) => Math.max(lo, Math.min(hi, n))

  let rule: ProgressRule
  let load: number
  let reps: number
  if (reference.sets < config.straightSets) {
    // Unfinished: double progression only advances off a completed session.
    rule = 'repeat'
    load = reference.load
    reps = clamp(reference.achieved)
  } else if (reference.achieved >= hi) {
    rule = 'load-up'
    load = reference.load + config.increment
    reps = lo
  } else {
    rule = 'rep-up'
    load = reference.load
    reps = clamp(reference.achieved + 1)
  }

  return { rule, plan: { load, reps } }
}

/** What to do next for one lift. */
export function prescribe(rows: SetRow[], lift: LiftKey, config: EngineConfig = DEFAULT_ENGINE_CONFIG): Prescription {
  const days = liftDays(rows, lift)
  const last = days.length > 0 ? days[days.length - 1] : null
  const band = last ? nextBand(last.band) : BAND_CYCLE[0]
  const reference = last ? (liftTracks(rows, lift)[band] ?? null) : null
  const { rule, plan } = prescribeBand(band, reference, config)

  return {
    lift,
    band,
    lastBand: last?.band ?? null,
    lastDateKey: last?.dateKey ?? null,
    rule,
    plan,
    reference,
  }
}

/** What to do next for every lift, in LIFTS order. */
export function nextSession(rows: SetRow[], config: EngineConfig = DEFAULT_ENGINE_CONFIG): Prescription[] {
  return LIFTS.map((l) => prescribe(rows, l.key, config))
}

/** Whole days between two YYYY-MM-DD keys. UTC-anchored so DST can't shift a count. */
export function daysBetween(from: string, to: string): number {
  const at = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((at(to) - at(from)) / 86400000)
}

/** The latest training day in the data, as a YYYY-MM-DD key. Empty when there is none. */
export function latestDateKey(rows: SetRow[]): string {
  let latest = ''
  for (const r of rows) {
    if (r.lift && !r.isWarmup && r.dateKey > latest) latest = r.dateKey
  }
  return latest
}

/** Every training day's band, by the one definition above. Backs the heatmap and the
 *  trend chart's tooltip, so no surface can disagree about what a day was. */
export function dayBandMap(rows: SetRow[]): Map<string, { band: RepBand; reps: number }> {
  const perDay = new Map<string, number[]>()
  for (const lift of LIFTS) {
    for (const day of liftDays(rows, lift.key)) {
      const list = perDay.get(day.dateKey)
      if (list) list.push(day.achieved)
      else perDay.set(day.dateKey, [day.achieved])
    }
  }

  // A day can hold several lifts in different bands; the day's own label is the median
  // of their achieved reps, which is what the calendar colors.
  const out = new Map<string, { band: RepBand; reps: number }>()
  for (const [dateKey, values] of perDay) {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const reps =
      sorted.length % 2 === 0 ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2 + 0.5) : sorted[mid]
    out.set(dateKey, { band: bandOf(reps), reps })
  }
  return out
}

/** How training days divide across the three bands — the mix bar under the heatmap. */
export interface BandMix {
  heavy: number
  moderate: number
  volume: number
  total: number
}

export function bandMix(rows: SetRow[]): BandMix {
  const mix: BandMix = { heavy: 0, moderate: 0, volume: 0, total: 0 }
  for (const { band } of dayBandMap(rows).values()) {
    mix[band] += 1
    mix.total += 1
  }
  return mix
}
