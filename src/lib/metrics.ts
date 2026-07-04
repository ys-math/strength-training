import { LIFTS, LIFT_BY_KEY, type LiftKey, type LiftPR, type LiftSession, type SetRow } from './types'
import type { MetricMode } from './mode'
import { epley } from './parse'

export const round1 = (n: number) => Math.round(n * 10) / 10
export const round0 = (n: number) => Math.round(n)

// The per-session value a given metric mode reads off a LiftSession.
const sessionMetric = (s: LiftSession, mode: MetricMode) => (mode === 'e1rm' ? s.bestE1rm : s.maxWeight)

// From a series of "best-to-date" values (non-decreasing), the current value and
// the previous record just before the most recent increase — for a progress delta.
export function currentPrev(values: number[]): { current: number; prev: number } {
  const current = values.length ? values[values.length - 1] : 0
  let prev = current
  for (let i = values.length - 2; i >= 0; i--) {
    prev = values[i]
    if (values[i] < current) break
  }
  return { current, prev }
}

// Aggregate a lift's sets into one entry per workout date, chronologically.
export function liftSessions(rows: SetRow[], lift: LiftKey): LiftSession[] {
  const byDate = new Map<string, SetRow[]>()
  for (const r of rows) {
    if (r.lift !== lift) continue
    const list = byDate.get(r.dateKey)
    if (list) list.push(r)
    else byDate.set(r.dateKey, [r])
  }

  const sessions: LiftSession[] = []
  for (const [dateKey, sets] of byDate) {
    let bestE1rm = 0
    let maxWeight = 0
    let maxWeightReps = 0
    let volume = 0
    let workingSets = 0
    for (const s of sets) {
      // Tracked independently of e1RM: a lighter, higher-rep set can score a
      // better Epley estimate than the session's true heaviest single, so
      // these must not share one comparison.
      if (s.e1rm > bestE1rm) bestE1rm = s.e1rm
      if (s.weight > maxWeight) {
        maxWeight = s.weight
        maxWeightReps = s.reps
      }
      if (!s.isWarmup) {
        volume += s.weight * s.reps
        workingSets += 1
      }
    }
    sessions.push({ date: sets[0].date, dateKey, bestE1rm, maxWeight, maxWeightReps, volume, workingSets })
  }

  sessions.sort((a, b) => a.date.getTime() - b.date.getTime())
  return sessions
}

export function liftPR(sessions: LiftSession[]): LiftPR | null {
  if (sessions.length === 0) return null
  let best = sessions[0]
  let heaviest = sessions[0]
  for (const s of sessions) {
    if (s.bestE1rm > best.bestE1rm) best = s
    if (s.maxWeight > heaviest.maxWeight) heaviest = s
  }
  // What the record was immediately before it was broken, for a progress delta.
  let prevMaxWeight = 0
  for (const s of sessions) {
    if (s.date.getTime() < heaviest.date.getTime() && s.maxWeight > prevMaxWeight) prevMaxWeight = s.maxWeight
  }
  return {
    maxE1rm: best.bestE1rm,
    maxE1rmDate: best.dateKey,
    maxWeight: heaviest.maxWeight,
    maxWeightReps: heaviest.maxWeightReps,
    maxWeightDate: heaviest.dateKey,
    prevMaxWeight,
  }
}

export interface E1rmPoint {
  dateKey: string
  ts: number
  BP?: number
  SQ?: number
  DL?: number
  OHP?: number
}

// A row per workout date, carrying whichever lifts were trained that day.
// Used directly by the multi-line e1RM chart.
export function e1rmSeries(rows: SetRow[]): E1rmPoint[] {
  const byDate = new Map<string, E1rmPoint>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) {
      let point = byDate.get(s.dateKey)
      if (!point) {
        point = { dateKey: s.dateKey, ts: s.date.getTime() }
        byDate.set(s.dateKey, point)
      }
      point[lift.key] = round1(s.bestE1rm)
    }
  }
  return [...byDate.values()].sort((a, b) => a.ts - b.ts)
}

// Sum of each lift's *best-to-date* value (in the chosen metric), tracked over
// time so it only climbs.
export interface Big4Point {
  dateKey: string
  ts: number
  total: number
}

export function big4Series(rows: SetRow[], mode: MetricMode): { series: Big4Point[]; current: number; prev: number } {
  const dates = [...new Set(rows.filter((r) => r.lift).map((r) => r.dateKey))].sort()
  const bestToDate: Record<LiftKey, number> = { BP: 0, SQ: 0, DL: 0, OHP: 0 }

  const byLiftDate = new Map<string, number>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) {
      byLiftDate.set(`${lift.key}|${s.dateKey}`, sessionMetric(s, mode))
    }
  }

  const series: Big4Point[] = []
  for (const dateKey of dates) {
    for (const lift of LIFTS) {
      const v = byLiftDate.get(`${lift.key}|${dateKey}`)
      if (v && v > bestToDate[lift.key]) bestToDate[lift.key] = v
    }
    const total = LIFTS.reduce((sum, l) => sum + bestToDate[l.key], 0)
    series.push({ dateKey, ts: new Date(dateKey).getTime(), total: round1(total) })
  }

  const { current, prev } = currentPrev(series.map((p) => p.total))
  return { series, current, prev }
}

// Each lift's *best-to-date* value in the chosen metric, per workout date, so
// each series only climbs. Backs the per-lift "current PR" figure in StatCards.
export function cumulativeSeries(rows: SetRow[], mode: MetricMode): E1rmPoint[] {
  const dates = [...new Set(rows.filter((r) => r.lift).map((r) => r.dateKey))].sort()
  const bestToDate: Record<LiftKey, number> = { BP: 0, SQ: 0, DL: 0, OHP: 0 }

  const byLiftDate = new Map<string, number>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) {
      byLiftDate.set(`${lift.key}|${s.dateKey}`, sessionMetric(s, mode))
    }
  }

  const series: E1rmPoint[] = []
  for (const dateKey of dates) {
    for (const lift of LIFTS) {
      const v = byLiftDate.get(`${lift.key}|${dateKey}`)
      if (v && v > bestToDate[lift.key]) bestToDate[lift.key] = v
    }
    const point: E1rmPoint = { dateKey, ts: new Date(dateKey).getTime() }
    for (const lift of LIFTS) {
      if (bestToDate[lift.key] > 0) point[lift.key] = round1(bestToDate[lift.key])
    }
    series.push(point)
  }
  return series
}

// Per-session heaviest set for each lift (raw kg, not cumulative — it can rise or
// fall session to session). Carries the reps of that heaviest set and the lift's
// working-set count that day so the chart tooltip can show both.
export interface MaxWeightPoint {
  dateKey: string
  ts: number
  BP?: number
  SQ?: number
  DL?: number
  OHP?: number
  detail: Partial<Record<LiftKey, { reps: number; sets: number }>>
}

export function maxWeightSeries(rows: SetRow[]): MaxWeightPoint[] {
  const byDate = new Map<string, MaxWeightPoint>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) {
      let point = byDate.get(s.dateKey)
      if (!point) {
        point = { dateKey: s.dateKey, ts: s.date.getTime(), detail: {} }
        byDate.set(s.dateKey, point)
      }
      point[lift.key] = round1(s.maxWeight)
      point.detail[lift.key] = { reps: s.maxWeightReps, sets: s.workingSets }
    }
  }
  return [...byDate.values()].sort((a, b) => a.ts - b.ts)
}

// ---- Weekly volume (ISO week) -------------------------------------------------

// Returns [ISO year, ISO week, Monday date] for a given date.
function isoWeek(d: Date): { key: string; monday: Date } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7 // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day) // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const monday = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  monday.setUTCDate(monday.getUTCDate() - (day - 1))
  return { key: `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monday }
}

export interface WeekVolume {
  week: string
  label: string
  ts: number
  BP: number
  SQ: number
  DL: number
  OHP: number
  total: number
}

export function weeklyVolume(rows: SetRow[]): WeekVolume[] {
  const byWeek = new Map<string, WeekVolume>()
  for (const r of rows) {
    if (!r.lift || r.isWarmup) continue
    const { key, monday } = isoWeek(r.date)
    let w = byWeek.get(key)
    if (!w) {
      const label = `${monday.getUTCMonth() + 1}/${monday.getUTCDate()}`
      w = { week: key, label, ts: monday.getTime(), BP: 0, SQ: 0, DL: 0, OHP: 0, total: 0 }
      byWeek.set(key, w)
    }
    const vol = r.weight * r.reps
    w[r.lift] += vol
    w.total += vol
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.ts - b.ts)
  for (const w of weeks) {
    w.BP = round0(w.BP)
    w.SQ = round0(w.SQ)
    w.DL = round0(w.DL)
    w.OHP = round0(w.OHP)
    w.total = round0(w.total)
  }
  return weeks
}

// ---- Training frequency (calendar heatmap) -----------------------------------

export interface DayActivity {
  dateKey: string
  workingSets: number
}

export function dailyActivity(rows: SetRow[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const r of rows) {
    if (r.isWarmup) continue
    byDay.set(r.dateKey, (byDay.get(r.dateKey) ?? 0) + 1)
  }
  return byDay
}

export interface OverallStats {
  totalSessions: number
  firstDate: string
  lastDate: string
  totalWorkingSets: number
}

export function overallStats(rows: SetRow[]): OverallStats {
  const days = new Set(rows.map((r) => r.dateKey))
  const sorted = [...days].sort()
  return {
    totalSessions: days.size,
    firstDate: sorted[0] ?? '',
    lastDate: sorted[sorted.length - 1] ?? '',
    totalWorkingSets: rows.filter((r) => !r.isWarmup).length,
  }
}

// ---- Full session detail (all exercises, not just the big 4) ------------------

export interface SetDetail {
  setOrder: string
  isWarmup: boolean
  weight: number
  reps: number
}

export interface ExerciseSessionDetail {
  exercise: string
  lift: LiftKey | null
  sets: SetDetail[]
  workingSets: number
  volume: number // working tonnage (kg), warmups excluded
}

export interface SessionDetail {
  dateKey: string
  date: Date
  workout: string
  exercises: ExerciseSessionDetail[]
  totalVolume: number
  totalWorkingSets: number
}

// Every exercise performed in every session, in original workout order (Map
// insertion order, since rows already arrive date-sorted from parse.ts). Sorted
// most-recent-first, since a session log reads newest-first.
export function sessionDetails(rows: SetRow[]): SessionDetail[] {
  const byDate = new Map<string, SetRow[]>()
  for (const r of rows) {
    const list = byDate.get(r.dateKey)
    if (list) list.push(r)
    else byDate.set(r.dateKey, [r])
  }

  const sessions: SessionDetail[] = []
  for (const [dateKey, dateRows] of byDate) {
    const byExercise = new Map<string, SetRow[]>()
    for (const r of dateRows) {
      const list = byExercise.get(r.exercise)
      if (list) list.push(r)
      else byExercise.set(r.exercise, [r])
    }

    const exercises: ExerciseSessionDetail[] = []
    for (const [exercise, exRows] of byExercise) {
      let volume = 0
      let workingSets = 0
      const sets: SetDetail[] = exRows.map((r) => {
        if (!r.isWarmup) {
          volume += r.weight * r.reps
          workingSets += 1
        }
        return { setOrder: r.setOrder, isWarmup: r.isWarmup, weight: r.weight, reps: r.reps }
      })
      exercises.push({ exercise, lift: exRows[0].lift, sets, workingSets, volume: round0(volume) })
    }

    sessions.push({
      dateKey,
      date: dateRows[0].date,
      workout: dateRows[0].workout,
      exercises,
      totalVolume: exercises.reduce((sum, e) => sum + e.volume, 0),
      totalWorkingSets: exercises.reduce((sum, e) => sum + e.workingSets, 0),
    })
  }

  sessions.sort((a, b) => b.date.getTime() - a.date.getTime())
  return sessions
}

// ---- Frequency stats (fills out the Training Frequency card) ------------------

export interface FrequencyStats {
  avgSessionsPerWeek: number
  mostActiveWeekday: string
  sessionsThisWeek: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function frequencyStats(rows: SetRow[]): FrequencyStats {
  if (rows.length === 0) return { avgSessionsPerWeek: 0, mostActiveWeekday: '—', sessionsThisWeek: 0 }

  // One representative Date per session day, taken from the rows themselves
  // (already correct local time) rather than re-parsing dateKey strings.
  const byDay = new Map<string, Date>()
  for (const r of rows) {
    if (!byDay.has(r.dateKey)) byDay.set(r.dateKey, r.date)
  }
  const days = [...byDay.values()].sort((a, b) => a.getTime() - b.getTime())

  const spanDays = Math.max(1, Math.round((days[days.length - 1].getTime() - days[0].getTime()) / 86400000) + 1)
  const avgSessionsPerWeek = round1(days.length / (spanDays / 7))

  const weekdayCounts = new Array(7).fill(0)
  for (const d of days) weekdayCounts[d.getDay()]++
  const mostActiveWeekday = WEEKDAY_LABELS[weekdayCounts.indexOf(Math.max(...weekdayCounts))]

  const now = new Date()
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)) // Monday
  const sessionsThisWeek = days.filter((d) => d >= weekStart).length

  return { avgSessionsPerWeek, mostActiveWeekday, sessionsThisWeek }
}

// ---- Next-session suggestion --------------------------------------------------
//
// A per-lift "what to do next" heuristic computed purely from set history. The
// rules and the theory behind each are documented in README.md ("How suggestions
// work"). All tunable thresholds live in DEFAULT_SUGGESTION_CONFIG — no magic
// numbers scattered through the branching.

export interface SuggestionConfig {
  repRange: [number, number] // default working-rep window (inclusive)
  repRangeByLift: Partial<Record<LiftKey, [number, number]>> // per-lift overrides
  loadIncrement: number // smallest plate jump, kg
  stagnationWindow: number // sessions inspected for the e1RM plateau check
  belowRangeRepeat: number // consecutive below-range sessions that trigger a deload
  deloadSetFactor: number // fraction of working sets kept on a deload
}

export const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig = {
  repRange: [6, 10],
  repRangeByLift: {},
  loadIncrement: 2.5,
  stagnationWindow: 3,
  belowRangeRepeat: 2,
  deloadSetFactor: 0.5,
}

export type SuggestionAction = 'increase-load' | 'add-rep' | 'build-reps' | 'deload' | 'insufficient-data'

export interface TopSetSummary {
  load: number
  reps: number
  sets: number
}

export interface Suggestion {
  lift: LiftKey
  action: SuggestionAction
  // Target prescription for the next session (0s when there's no history).
  load: number
  reps: number
  sets: number
  prev: TopSetSummary | null // last session's top working set
  loadDelta: number // target − prev, kg (0 when prev is null)
  repsDelta: number // target − prev reps
  setsDelta: number // target − prev sets
  projectedWeight: number | null // target.load if the goal advances the trend, else null
  projectedE1rm: number | null // epley(target.load, target.reps) if it advances, else null
  rationale: string // one-line explanation
}

// True once any row carries an RPE value. Strong always emits the RPE *column*,
// so header presence alone means nothing — we key off populated data.
export function hasRpeData(rows: SetRow[]): boolean {
  return rows.some((r) => r.rpe != null)
}

// The heaviest working set of each session for a lift, tie-broken by reps, with
// the count of working sets sharing that top load, the session's best e1RM, and
// the hardest RPE logged at that load (null when RPE isn't tracked).
interface TopSet {
  dateKey: string
  ts: number
  load: number
  reps: number
  sets: number
  bestE1rm: number
  rpe: number | null
}

function topWorkingSets(rows: SetRow[], lift: LiftKey): TopSet[] {
  const byDate = new Map<string, SetRow[]>()
  for (const r of rows) {
    if (r.lift !== lift || r.isWarmup) continue
    const list = byDate.get(r.dateKey)
    if (list) list.push(r)
    else byDate.set(r.dateKey, [r])
  }

  const out: TopSet[] = []
  for (const [dateKey, sets] of byDate) {
    let load = 0
    let reps = 0
    let bestE1rm = 0
    for (const s of sets) {
      if (s.e1rm > bestE1rm) bestE1rm = s.e1rm
      if (s.weight > load || (s.weight === load && s.reps > reps)) {
        load = s.weight
        reps = s.reps
      }
    }
    const atTop = sets.filter((s) => s.weight === load)
    const rpes = atTop.map((s) => s.rpe).filter((v): v is number => v != null)
    out.push({
      dateKey,
      ts: sets[0].date.getTime(),
      load,
      reps,
      sets: atTop.length,
      bestE1rm,
      rpe: rpes.length ? Math.max(...rpes) : null,
    })
  }
  out.sort((a, b) => a.ts - b.ts)
  return out
}

// e1RM flat or declining across the trailing `window` sessions (no net gain).
function isStagnant(tops: TopSet[], window: number): boolean {
  if (tops.length < window) return false
  const recent = tops.slice(-window)
  return recent[recent.length - 1].bestE1rm <= recent[0].bestE1rm
}

// How many of the most recent sessions in a row landed below the rep range.
function trailingBelowRange(tops: TopSet[], lo: number): number {
  let n = 0
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i].reps < lo) n += 1
    else break
  }
  return n
}

// RPE climbing at an unchanged top load & reps between the last two sessions.
function rpeRisingAtConstant(tops: TopSet[]): boolean {
  if (tops.length < 2) return false
  const a = tops[tops.length - 2]
  const b = tops[tops.length - 1]
  if (a.rpe == null || b.rpe == null) return false
  return b.load === a.load && b.reps === a.reps && b.rpe > a.rpe
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Assemble a Suggestion from a target prescription: fills deltas vs. `prev` and,
// when the goal advances the trend, the projected next-session weight & e1RM.
function buildSuggestion(
  lift: LiftKey,
  action: SuggestionAction,
  target: TopSetSummary,
  prev: TopSetSummary | null,
  rationale: string,
  advances: boolean,
): Suggestion {
  return {
    lift,
    action,
    load: target.load,
    reps: target.reps,
    sets: target.sets,
    prev,
    loadDelta: prev ? round1(target.load - prev.load) : 0,
    repsDelta: prev ? target.reps - prev.reps : 0,
    setsDelta: prev ? target.sets - prev.sets : 0,
    projectedWeight: advances ? target.load : null,
    projectedE1rm: advances ? round1(epley(target.load, target.reps)) : null,
    rationale,
  }
}

function deloadSuggestion(lift: LiftKey, last: TopSet, config: SuggestionConfig, why: string): Suggestion {
  const sets = Math.max(1, Math.round(last.sets * config.deloadSetFactor))
  const prev: TopSetSummary = { load: last.load, reps: last.reps, sets: last.sets }
  return buildSuggestion(
    lift,
    'deload',
    { load: last.load, reps: last.reps, sets },
    prev,
    `${cap(why)}; ease off for a session or two. Heuristic (e1RM trend), not a fatigue model.`,
    false,
  )
}

function suggestForLift(
  rows: SetRow[],
  lift: LiftKey,
  config: SuggestionConfig,
  rpeAvailable: boolean,
): Suggestion {
  const label = LIFT_BY_KEY.get(lift)?.label ?? lift
  const tops = topWorkingSets(rows, lift)
  if (tops.length === 0) {
    return {
      lift,
      action: 'insufficient-data',
      load: 0,
      reps: 0,
      sets: 0,
      prev: null,
      loadDelta: 0,
      repsDelta: 0,
      setsDelta: 0,
      projectedWeight: null,
      projectedE1rm: null,
      rationale: `No ${label} history in the data yet.`,
    }
  }

  const last = tops[tops.length - 1]
  const prev: TopSetSummary = { load: last.load, reps: last.reps, sets: last.sets }
  const [lo, hi] = config.repRangeByLift[lift] ?? config.repRange
  const inc = config.loadIncrement
  const sets = Math.max(1, last.sets)
  const stagnant = isStagnant(tops, config.stagnationWindow)

  // 1. Double progression on the top working set — strongest signal.
  if (last.reps >= hi) {
    // 3. RPE (only if tracked): rising effort at the same load/reps → hold.
    if (rpeAvailable && rpeRisingAtConstant(tops)) {
      return buildSuggestion(
        lift,
        'add-rep',
        { load: last.load, reps: last.reps, sets },
        prev,
        `Hit the top of the ${lo}–${hi} range, but RPE is rising at the same load — hold before adding weight.`,
        false,
      )
    }
    return buildSuggestion(
      lift,
      'increase-load',
      { load: last.load + inc, reps: lo, sets },
      prev,
      `Hit ${sets}×${last.reps} @ ${last.load}kg last session (top of ${lo}–${hi} range).`,
      true,
    )
  }

  if (last.reps >= lo) {
    // Within range: add a rep, unless e1RM has plateaued (2. deload).
    if (stagnant) {
      return deloadSuggestion(lift, last, config, `est. 1RM flat over the last ${config.stagnationWindow} sessions`)
    }
    return buildSuggestion(
      lift,
      'add-rep',
      { load: last.load, reps: last.reps + 1, sets },
      prev,
      `Reps within the ${lo}–${hi} range but not at the top yet.`,
      true,
    )
  }

  // Below range: hold and build reps, unless it's dragging on (2. deload).
  const belowRepeated = trailingBelowRange(tops, lo) >= config.belowRangeRepeat
  if (belowRepeated || stagnant) {
    const why = belowRepeated
      ? `stuck below ${lo} reps ${config.belowRangeRepeat}+ sessions running`
      : `est. 1RM flat over the last ${config.stagnationWindow} sessions`
    return deloadSuggestion(lift, last, config, why)
  }
  return buildSuggestion(
    lift,
    'build-reps',
    { load: last.load, reps: last.reps + 1, sets },
    prev,
    `Below the ${lo}–${hi} range — rebuild reps at this load before adding weight.`,
    true,
  )
}

// Per-lift next-session suggestion, computed purely from set history.
export function nextSessionSuggestion(
  rows: SetRow[],
  config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG,
): Record<LiftKey, Suggestion> {
  const rpeAvailable = hasRpeData(rows)
  const result = {} as Record<LiftKey, Suggestion>
  for (const lift of LIFTS) {
    result[lift.key] = suggestForLift(rows, lift.key, config, rpeAvailable)
  }
  return result
}
