import { LIFTS, LIFT_BY_KEY, type LiftKey, type LiftPR, type LiftSession, type SetRow } from './types'
import type { GoalHorizon } from './goals'
import { epley } from './parse'

export const round1 = (n: number) => Math.round(n * 10) / 10
export const round0 = (n: number) => Math.round(n)

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

// Sum of each lift's best-to-date heaviest set, tracked over time so it only climbs.
export interface Big4Point {
  dateKey: string
  ts: number
  total: number
}

export function big4Series(rows: SetRow[]): { series: Big4Point[]; current: number; prev: number } {
  const dates = [...new Set(rows.filter((r) => r.lift).map((r) => r.dateKey))].sort()
  const bestToDate: Record<LiftKey, number> = { BP: 0, SQ: 0, DL: 0, OHP: 0 }

  const byLiftDate = new Map<string, number>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) {
      byLiftDate.set(`${lift.key}|${s.dateKey}`, s.maxWeight)
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

// Each lift's *best-to-date* heaviest set, per workout date, so each series only
// climbs. `detail` carries the reps of the set that established the standing
// record and the date it was set, so a point can be read without a second lookup.
// Backs the main ProgressChart and the per-lift "current PR" figure in StatCards.
export interface BestToDatePoint {
  dateKey: string
  ts: number
  BP?: number
  SQ?: number
  DL?: number
  OHP?: number
  detail: Partial<Record<LiftKey, { reps: number; setOn: string }>>
}

export function cumulativeSeries(rows: SetRow[]): BestToDatePoint[] {
  const dates = [...new Set(rows.filter((r) => r.lift).map((r) => r.dateKey))].sort()
  const best: Partial<Record<LiftKey, { weight: number; reps: number; setOn: string }>> = {}

  const byLiftDate = new Map<string, LiftSession>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) byLiftDate.set(`${lift.key}|${s.dateKey}`, s)
  }

  const series: BestToDatePoint[] = []
  for (const dateKey of dates) {
    for (const lift of LIFTS) {
      const s = byLiftDate.get(`${lift.key}|${dateKey}`)
      if (!s || s.maxWeight <= 0) continue
      const standing = best[lift.key]
      if (!standing || s.maxWeight > standing.weight) {
        best[lift.key] = { weight: s.maxWeight, reps: s.maxWeightReps, setOn: s.dateKey }
      }
    }
    const point: BestToDatePoint = { dateKey, ts: new Date(dateKey).getTime(), detail: {} }
    for (const lift of LIFTS) {
      const standing = best[lift.key]
      if (!standing) continue
      point[lift.key] = round1(standing.weight)
      point.detail[lift.key] = { reps: standing.reps, setOn: standing.setOn }
    }
    series.push(point)
  }
  return series
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

// ---- Session volume (per training day) ---------------------------------------

// How many prior sessions define "usual". ~2 weeks at a 2-3x/week cadence: long
// enough to be stable against the large session-to-session spread, short enough to
// follow a progression block rather than lag behind it.
export const SESSION_BASELINE_WINDOW = 6

// UTC midnight for a "YYYY-MM-DD" key. Anchoring to UTC keeps a day-count subtraction
// exact across a DST boundary, where local midnights are 23 or 25 hours apart.
function dayTs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export interface SessionVolume {
  dateKey: string
  label: string
  ts: number
  BP: number
  SQ: number
  DL: number
  OHP: number
  total: number
  /** Mean total of the previous <=6 sessions. Null on the very first session. */
  baseline: number | null
  /** Percent above/below the baseline. Null wherever baseline is. */
  deltaPct: number | null
  /** Whole days since the previous session. Null on the very first session. */
  restDays: number | null
}

// Same accumulation rule as weeklyVolume (big four, working sets only), grouped by
// training day instead of ISO week, plus a trailing baseline each session is read
// against. Rest days are absent rather than zero: the caller plots training days.
export function sessionVolume(rows: SetRow[]): SessionVolume[] {
  const byDay = new Map<string, SessionVolume>()
  for (const r of rows) {
    if (!r.lift || r.isWarmup) continue
    let s = byDay.get(r.dateKey)
    if (!s) {
      s = {
        dateKey: r.dateKey,
        label: `${r.date.getMonth() + 1}/${r.date.getDate()}`,
        ts: dayTs(r.dateKey),
        BP: 0,
        SQ: 0,
        DL: 0,
        OHP: 0,
        total: 0,
        baseline: null,
        deltaPct: null,
        restDays: null,
      }
      byDay.set(r.dateKey, s)
    }
    const vol = r.weight * r.reps
    s[r.lift] += vol
    s.total += vol
  }

  const sessions = [...byDay.values()].sort((a, b) => a.ts - b.ts)
  for (const s of sessions) {
    s.BP = round0(s.BP)
    s.SQ = round0(s.SQ)
    s.DL = round0(s.DL)
    s.OHP = round0(s.OHP)
    // Sum the rounded parts rather than rounding the true sum: the tooltip prints the
    // per-lift rows next to this total, so they have to add up on screen. Costs at most
    // ~1 kg of drift against weeklyVolume, which rounds the other way round.
    s.total = s.BP + s.SQ + s.DL + s.OHP
  }

  // Baseline runs over the whole history, so it stays the same no matter how the
  // view is later sliced. An expanding mean until the window fills, so only the
  // first session (which has nothing to compare against) goes without one.
  sessions.forEach((s, i) => {
    if (i === 0) return
    const prev = sessions.slice(Math.max(0, i - SESSION_BASELINE_WINDOW), i)
    const mean = prev.reduce((sum, p) => sum + p.total, 0) / prev.length
    s.baseline = round0(mean)
    s.deltaPct = mean > 0 ? round0(((s.total - mean) / mean) * 100) : null
    s.restDays = Math.round((s.ts - sessions[i - 1].ts) / 86400000)
  })

  return sessions
}

// ---- Training frequency (calendar heatmap) -----------------------------------

/** Everything the heatmap can color a day by. Big four, working sets only — so the
 *  tonnage here is the same number the Session-volume card prints for that day. */
export interface DayMetrics {
  sets: number
  volume: number
  /** The day's rep character, by the same rule the DUP engine uses (see dayFocusMap). */
  focus: DayFocus | null
}

export function dailyMetrics(rows: SetRow[], config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG): Map<string, DayMetrics> {
  const byDay = new Map<string, DayMetrics>()

  for (const r of rows) {
    if (!r.lift || r.isWarmup) continue
    const d = byDay.get(r.dateKey)
    if (d) d.sets += 1
    else byDay.set(r.dateKey, { sets: 1, volume: 0, focus: null })
  }

  // Tonnage comes straight from sessionVolume rather than being re-summed here, so
  // the heatmap and the Session-volume card can't disagree by a rounding step.
  for (const s of sessionVolume(rows)) {
    const d = byDay.get(s.dateKey)
    if (d) d.volume = s.total
  }

  for (const [dateKey, focus] of dayFocusMap(rows, config)) {
    const d = byDay.get(dateKey)
    if (d) d.focus = focus
  }

  return byDay
}

// The four cut points of the sequential ramp are seq-1..seq-4 — seq-0 means "didn't
// train" — so ranking tonnage needs three cuts (quartiles), not four. Absolute kg
// thresholds would go stale as the lifter grows; quantiles over their own history
// self-calibrate and always spend the whole ramp.
export function quantileThresholds(values: number[]): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return [0, 0, 0]
  return [0.25, 0.5, 0.75].map((q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))])
}

/** How your training days divide across the three intensity bands. */
export interface FocusMix {
  light: number
  moderate: number
  heavy: number
  /** Days that carried a focus at all — the denominator for the proportion bar. */
  total: number
}

// The distribution behind the heatmap's Intensity mode: the same per-day classification
// (dayFocusMap → classifyFocus) the grid colors by and the DUP engine undulates on, just
// counted. So the mix bar, the calendar, and the Next-session focus banner can never
// disagree about what a day was. Days with no classifiable top set are skipped, so
// `total` may be < the session count.
export function focusMix(rows: SetRow[], config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG): FocusMix {
  const mix: FocusMix = { light: 0, moderate: 0, heavy: 0, total: 0 }
  for (const day of dailyMetrics(rows, config).values()) {
    if (!day.focus) continue
    mix[day.focus] += 1
    mix.total += 1
  }
  return mix
}

// Bucket 0 is reserved for "no training". Any day with tonnage lands in 1..4, even
// when every day is identical (all thresholds equal) — a real session must never
// render in the empty color.
export function volumeBucket(volume: number, thresholds: number[]): number {
  if (volume <= 0) return 0
  let b = 1
  for (const t of thresholds) if (volume > t) b += 1
  return Math.min(b, 4)
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
// rules and the theory behind each are documented in docs/METHOD.md ("How
// suggestions work"). All tunable thresholds live in DEFAULT_SUGGESTION_CONFIG — no magic
// numbers scattered through the branching.

// Daily undulating periodization (DUP): each session carries one of three
// rep/intensity focuses. The engine infers the *next* session's focus from your
// most recent training day and undulates one step along `cycle` (see
// nextSessionFocus). The chosen focus swaps the working rep window and scopes
// progression to that focus's slice of history.
export type DayFocus = 'heavy' | 'moderate' | 'light'

export interface SuggestionConfig {
  loadIncrement: number // smallest plate jump, kg
  stagnationWindow: number // sessions inspected for the e1RM plateau check
  belowRangeRepeat: number // consecutive below-range sessions that trigger a deload
  workingSets: number // baseline number of main working sets per session
  deloadSetFactor: number // fraction of the baseline working sets kept on a deload
  topSetIntensity: number // fraction of e1RM for the heavy specificity top set (Size Principle)
  detraining: {
    graceWeeks: number // gap tolerated before any strength loss is assumed
    tauWeeks: number // detraining decay time-constant, weeks
    minRetention: number // floor on the retention factor (don't back off more than this)
  }
  dup: {
    windows: Record<DayFocus, [number, number]> // working-rep window per focus (inclusive)
    cycle: DayFocus[] // order the focus undulates through, session to session
  }
}

// Baseline routine shape: 2–3 warmup sets (see warmupRamp), 3 main working
// sets, 1 heavy top set — trimmed on a deload or omitted where noted (see
// docs/METHOD.md "How suggestions work").
export const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig = {
  loadIncrement: 2.5,
  stagnationWindow: 3,
  belowRangeRepeat: 2,
  workingSets: 3,
  deloadSetFactor: 0.5,
  topSetIntensity: 0.9,
  detraining: { graceWeeks: 2, tauWeeks: 10, minRetention: 0.7 },
  dup: {
    // Windows fit to real logged training; cycle undulates for max session-to-session
    // contrast (never heavy → heavy). See docs/METHOD.md "How suggestions work".
    windows: { heavy: [3, 5], moderate: [6, 8], light: [9, 12] },
    cycle: ['heavy', 'light', 'moderate'],
  },
}

export type SuggestionAction =
  | 'increase-load'
  | 'add-rep'
  | 'build-reps'
  | 'deload'
  | 'return'
  | 'dup'
  | 'insufficient-data'

// How the lift's recent trajectory tracks against its short-term max-weight goal.
export type GoalPace = 'met' | 'ahead' | 'on-track' | 'behind'

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
  topSet: TopSetSummary | null // heavy low-rep specificity set to add (null on deload/return/no-data)
  loadDelta: number // target − prev, kg (0 when prev is null)
  repsDelta: number // target − prev reps
  setsDelta: number // target − prev sets
  projectedWeight: number | null // where the trend lands next session if the target is met (null only w/o history)
  projectedE1rm: number | null // epley(target.load, target.reps) (flat for a hold/deload)
  goalPace: GoalPace | null // vs. the short-term max-weight goal (null when no goal is set)
  requiredPerWeek: number | null // kg/week still needed to hit that goal on time
  rationale: string // one-line explanation
}

// Short-term goal context threaded into the suggestion engine.
export interface GoalContext {
  target: Partial<Record<LiftKey, number>> // per-lift short-term max-weight target, kg
  weeksLeft: number // weeks until the short-term horizon
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

// Assemble a Suggestion from a target prescription: fills deltas vs. `prev` and the
// projected next-session weight & e1RM (where the trend lands if the target is met —
// flat for a hold/deload, up for a progression).
function buildSuggestion(
  lift: LiftKey,
  action: SuggestionAction,
  target: TopSetSummary,
  prev: TopSetSummary | null,
  rationale: string,
  topSet: TopSetSummary | null = null,
): Suggestion {
  return {
    lift,
    action,
    load: target.load,
    reps: target.reps,
    sets: target.sets,
    prev,
    topSet,
    loadDelta: prev ? round1(target.load - prev.load) : 0,
    repsDelta: prev ? target.reps - prev.reps : 0,
    setsDelta: prev ? target.sets - prev.sets : 0,
    projectedWeight: target.load,
    projectedE1rm: round1(epley(target.load, target.reps)),
    goalPace: null,
    requiredPerWeek: null,
    rationale,
  }
}

// ---- Theory-grounded helpers (see docs/METHOD.md "How suggestions work") -----

// Reversibility / detraining: strength is retained for a short grace period, then
// decays roughly exponentially with time off. Retention R(g) ∈ [minRetention, 1].
export function retentionFactor(gapWeeks: number, cfg: SuggestionConfig['detraining']): number {
  if (gapWeeks <= cfg.graceWeeks) return 1
  return Math.max(cfg.minRetention, Math.exp(-(gapWeeks - cfg.graceWeeks) / cfg.tauWeeks))
}

// SAID / Size Principle / Rate coding: a heavy, low-rep top set at ~`intensity` of
// current e1RM to recruit high-threshold motor units. Reps come from inverting Epley
// (e1RM = load·(1+r/30) ⇒ r = 30·(1/intensity − 1)). Returns null when such a set
// wouldn't be heavier than the working set (already specific enough).
export function heavyTopSet(
  bestE1rm: number,
  workingLoad: number,
  intensity: number,
  plate: number,
): TopSetSummary | null {
  if (bestE1rm <= 0) return null
  const load = Math.round((bestE1rm * intensity) / plate) * plate
  if (load <= workingLoad) return null
  const reps = Math.min(5, Math.max(1, Math.round(30 * (1 / intensity - 1))))
  return { load, reps, sets: 1 }
}

// Latest logged session timestamp across all rows — the default "now" for detraining
// so the engine stays pure/deterministic (the live dashboard passes Date.now()).
export function latestTs(rows: SetRow[]): number {
  let max = 0
  for (const r of rows) {
    const t = r.date.getTime()
    if (t > max) max = t
  }
  return max
}

function deloadSuggestion(lift: LiftKey, last: TopSet, config: SuggestionConfig, why: string): Suggestion {
  // Cut from what was *actually* done last time, not the idealized baseline —
  // a deload is a deviation from your real recent volume, not a recomputed plan.
  const sets = Math.max(1, Math.round(last.sets * config.deloadSetFactor))
  const prev: TopSetSummary = { load: last.load, reps: last.reps, sets: last.sets }
  return buildSuggestion(
    lift,
    'deload',
    { load: last.load, reps: last.reps, sets },
    prev,
    `${cap(why)}; ease off for a session or two. Heuristic (e1RM trend), not a fatigue model.`,
  )
}

// ---- DUP focus inference -----------------------------------------------------

// UI-facing labels for a focus: a banner title and a one-word training intent.
export const FOCUS_META: Record<DayFocus, { label: string; intent: string }> = {
  heavy: { label: 'Heavy day', intent: 'strength' },
  moderate: { label: 'Moderate day', intent: 'volume' },
  light: { label: 'Volume day', intent: 'hypertrophy' },
}

// The one focus → color mapping, the twin of FOCUS_META: wherever a focus is drawn
// (heatmap cell, Next-session banner chip) it wears this hue, so the two cards can't
// disagree about what "heavy" looks like.
//
// Intensity is colored *categorically* — one hue per focus, cool → hot — not as steps of
// the sequential ramp: at 13px, three shades of one blue don't separate, and a darker blue
// says nothing about what "heavy" means. Red/green is a known color-vision collision
// (moderate and heavy are the pair that merges under deuteranopia); on a single-reader
// dashboard that cost was weighed and accepted. It's a choice, not an oversight — the
// tooltip names the focus in words in every mode, which is the fallback.
export const FOCUS_COLOR: Record<DayFocus, string> = {
  heavy: 'var(--focus-heavy)',
  moderate: 'var(--focus-moderate)',
  light: 'var(--focus-light)',
}

// Heaviest → lightest. The order every focus-keyed list is rendered in.
export const FOCUSES: DayFocus[] = ['heavy', 'moderate', 'light']

// Classify a rep count into its focus by the configured window ceilings: at/below
// the heavy window's top is heavy, at/below the moderate window's top is moderate,
// otherwise light. Uses ceilings (not full ranges) so reps that fall between two
// windows still classify into the lower one.
export function classifyFocus(reps: number, config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG): DayFocus {
  if (reps <= config.dup.windows.heavy[1]) return 'heavy'
  if (reps <= config.dup.windows.moderate[1]) return 'moderate'
  return 'light'
}

// The focus one step further along the undulation cycle.
function advanceFocus(f: DayFocus, cycle: DayFocus[]): DayFocus {
  const i = cycle.indexOf(f)
  return cycle[(i + 1) % cycle.length]
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface FocusPlan {
  focus: DayFocus // the inferred focus for the next session
  from: DayFocus | null // the focus of your most recent training day (null with no history)
}

// The rep character of *every* training day: the median of that day's per-lift
// top-set reps, classified into a DUP window. This is the single definition of what
// makes a day heavy/moderate/light — both the next-session undulation below and the
// heatmap's Intensity mode read it here, so the FocusBanner and the calendar can
// never label the same day differently.
export function dayFocusMap(rows: SetRow[], config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG): Map<string, DayFocus> {
  const repsByDay = new Map<string, number[]>()
  for (const lift of LIFTS) {
    for (const t of topWorkingSets(rows, lift.key)) {
      const list = repsByDay.get(t.dateKey)
      if (list) list.push(t.reps)
      else repsByDay.set(t.dateKey, [t.reps])
    }
  }

  const out = new Map<string, DayFocus>()
  for (const [dateKey, reps] of repsByDay) out.set(dateKey, classifyFocus(median(reps), config))
  return out
}

// ---- Per-set series (the per-lift drill-down) ---------------------------------

export interface LiftSetSession {
  dateKey: string
  ts: number
  /** Working sets in performed order — one rendered tray each. */
  sets: { weight: number; reps: number; volume: number }[]
  volume: number // Σ weight × reps, warmups excluded
  workingSets: number
}

// A lift's history as the sets actually performed, session by session — the shape the
// drill-down draws: a column per session, a tray per set, a block per rep at the set's
// weight, so the column's height *is* `volume`.
//
// The guard is the same one `sessionVolume` and `dailyMetrics` use, and `volume` is
// rounded the same way (round0, per lift). That is load-bearing, not incidental: it
// makes a column's kg equal that lift's segment of the Session-volume card's bar for
// the same date, exactly — the dashboard agrees on one number for a day. Warmups are
// excluded for the same reason; counting them would inflate a Bench day by ~29 % and
// put this card at odds with the volume card and the heatmap.
export function liftSetSeries(rows: SetRow[], lift: LiftKey): LiftSetSession[] {
  const byDate = new Map<string, LiftSetSession>()
  for (const r of rows) {
    if (r.lift !== lift || r.isWarmup || r.weight <= 0) continue
    let s = byDate.get(r.dateKey)
    if (!s) {
      s = { dateKey: r.dateKey, ts: r.date.getTime(), sets: [], volume: 0, workingSets: 0 }
      byDate.set(r.dateKey, s)
    }
    const volume = r.weight * r.reps
    s.sets.push({ weight: r.weight, reps: r.reps, volume })
    s.volume += volume
    s.workingSets += 1
  }

  const sessions = [...byDate.values()].sort((a, b) => a.ts - b.ts)
  for (const s of sessions) s.volume = round0(s.volume)
  return sessions
}

export interface LiftGrowth {
  /** Heaviest working set in the window. */
  maxWeight: number
  /** kg/week the *record* advanced across the window. Null until the window spans a week. */
  maxWeightPerWeek: number | null
  /** Mean working tonnage per ISO week in the window (rest weeks count as 0). */
  weeklyVolume: number
  /** Trend of that weekly tonnage, as % of its own mean per week. Null under 2 weeks. */
  weeklyVolumePctPerWeek: number | null
}

// The two rates the drill-down prints above the blocks — one for each thing the chart
// can't say on its own. The blocks show volume; the axis can't show weight (a block is
// ~2 px per 10 kg). So: how fast is the *record* climbing, and how fast is the *workload*.
//
// `from` scopes both to the span slider's window, so every number on the card describes
// the sessions actually on screen.
//
// Max weight uses the window's RUNNING MAX, not a fit through the per-session tops. The
// engine runs DUP, so per-session top weight alternates heavy/light by design; a fit
// through it measures where the window happened to start and end in the cycle, not
// progress. A running max only climbs, so its slope is "how fast did the record advance".
//
// Weekly volume is the opposite case — it's a *level*, not a record — so it takes a
// least-squares slope, expressed as a % of its own mean so it's readable next to a kg/wk.
// Rest weeks inside the window are filled in as 0: a week you didn't train really was a
// zero-volume week, and dropping it would flatter the trend.
export function liftGrowth(rows: SetRow[], lift: LiftKey, from?: string): LiftGrowth {
  const sessions = liftSetSeries(rows, lift).filter((s) => !from || s.dateKey >= from)
  const empty: LiftGrowth = { maxWeight: 0, maxWeightPerWeek: null, weeklyVolume: 0, weeklyVolumePctPerWeek: null }
  if (sessions.length === 0) return empty

  // --- record advance (kg/wk) ---
  let running = 0
  const runningMax = sessions.map((s) => (running = Math.max(running, ...s.sets.map((x) => x.weight))))
  const first = runningMax[0]
  const last = runningMax[runningMax.length - 1]
  const spanWeeks = (sessions[sessions.length - 1].ts - sessions[0].ts) / (7 * 86400000)
  const maxWeightPerWeek = spanWeeks >= 1 ? round1((last - first) / spanWeeks) : null

  // --- weekly workload level and its trend (%/wk) ---
  const WEEK = 7 * 86400000
  const inWindow = weeklyVolume(rows).filter((w) => w.ts >= sessions[0].ts - WEEK && w.ts <= sessions[sessions.length - 1].ts)
  let weeklyVolumeMean = 0
  let weeklyVolumePctPerWeek: number | null = null
  if (inWindow.length > 0) {
    // Fill rest weeks with 0 so a skipped week counts against the trend, as it should.
    const start = inWindow[0].ts
    const nWeeks = Math.round((inWindow[inWindow.length - 1].ts - start) / WEEK) + 1
    const series = Array.from({ length: nWeeks }, (_, i) => {
      const w = inWindow.find((x) => Math.round((x.ts - start) / WEEK) === i)
      return w ? w[lift] : 0
    })
    const mean = series.reduce((a, b) => a + b, 0) / series.length
    weeklyVolumeMean = round0(mean)
    if (series.length >= 2 && mean > 0) {
      const xBar = (series.length - 1) / 2
      let num = 0
      let den = 0
      series.forEach((y, x) => {
        num += (x - xBar) * (y - mean)
        den += (x - xBar) ** 2
      })
      if (den > 0) weeklyVolumePctPerWeek = round1((num / den / mean) * 100)
    }
  }

  return { maxWeight: last, maxWeightPerWeek, weeklyVolume: weeklyVolumeMean, weeklyVolumePctPerWeek }
}

// Infer the next session's DUP focus: classify your most recent training day and
// undulate one step along the cycle. Global — one focus for the whole next session —
// matching whole-day undulation. Defaults to the first cycle entry when there's
// nothing to classify.
export function nextSessionFocus(rows: SetRow[], config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG): FocusPlan {
  let latest = ''
  for (const r of rows) {
    if (r.lift && !r.isWarmup && r.dateKey > latest) latest = r.dateKey
  }
  const from = latest ? (dayFocusMap(rows, config).get(latest) ?? null) : null
  if (!from) return { focus: config.dup.cycle[0], from: null }
  return { focus: advanceFocus(from, config.dup.cycle), from }
}

function suggestForLift(
  rows: SetRow[],
  lift: LiftKey,
  config: SuggestionConfig,
  rpeAvailable: boolean,
  now: number,
  focus: DayFocus,
  goalCtx?: GoalContext,
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
      topSet: null,
      loadDelta: 0,
      repsDelta: 0,
      setsDelta: 0,
      projectedWeight: null,
      projectedE1rm: null,
      goalPace: null,
      requiredPerWeek: null,
      rationale: `No ${label} history in the data yet.`,
    }
  }

  // `trueLast` is the actual most-recent session (drives detraining, which ignores
  // focus); `stream` is the focus-scoped slice of history that progression tracks,
  // so a heavy day and a light day each follow their own trend instead of blending.
  const trueLast = tops[tops.length - 1]
  const truePrev: TopSetSummary = { load: trueLast.load, reps: trueLast.reps, sets: trueLast.sets }
  const [lo, hi] = config.dup.windows[focus]
  const inc = config.loadIncrement
  const sets = config.workingSets // baseline main-set count for progression/hold/return
  const stream = tops.filter((t) => t.reps >= lo && t.reps <= hi)

  // Goal pace vs. the short-term max-weight target, if one is set. Goal fields are
  // spread onto every returned suggestion via `g`.
  let pace: GoalPace | null = null
  let requiredPerWeek: number | null = null
  const target = goalCtx?.target[lift]
  if (goalCtx && target != null && target > 0) {
    const currentBest = Math.max(...tops.map((t) => t.load))
    pace = goalPace(currentBest, target, goalCtx.weeksLeft, recentRatePerWeek(rows, lift))
    requiredPerWeek = goalCtx.weeksLeft > 0 ? round1(Math.max(0, (target - currentBest) / goalCtx.weeksLeft)) : null
  }
  const g = { goalPace: pace, requiredPerWeek }

  // 0. Reversibility / detraining — takes priority. After a layoff past the grace
  // window, back the load off by the retention factor and ramp in, rather than
  // pushing a PR on cold tissue. R(g) = exp(−(g−grace)/τ), floored at minRetention.
  const gapWeeks = Math.max(0, (now - trueLast.ts) / (7 * 86400000))
  if (gapWeeks > config.detraining.graceWeeks) {
    const R = retentionFactor(gapWeeks, config.detraining)
    const load = Math.max(inc, Math.round((trueLast.load * R) / inc) * inc)
    const reps = Math.min(hi, Math.max(lo, trueLast.reps))
    return {
      ...buildSuggestion(
        lift,
        'return',
        { load, reps, sets },
        truePrev,
        `~${Math.round(gapWeeks)} wk since your last ${label} — strength fades with time off ` +
          `(reversibility). Ease back to ~${Math.round(R * 100)}% of your last load and rebuild.`,
      ),
      ...g,
    }
  }

  // Cold start for this focus: no sets logged yet in its rep window. Seed a fresh
  // prescription from current e1RM via the Epley inverse (load = e1RM/(1+r/30)) at
  // the window's midpoint reps, rather than echoing a session at a different range.
  if (stream.length === 0) {
    const reps = Math.round((lo + hi) / 2)
    const load = Math.max(inc, Math.round(trueLast.bestE1rm / (1 + reps / 30) / inc) * inc)
    return {
      ...buildSuggestion(
        lift,
        'dup',
        { load, reps, sets },
        truePrev,
        `No ${FOCUS_META[focus].label.toLowerCase()} ${label} sets logged yet — starting from your current ` +
          `e1RM (~${round1(trueLast.bestE1rm)}kg) at ${reps} reps (daily undulating periodization).`,
        heavyTopSet(trueLast.bestE1rm, load, config.topSetIntensity, inc),
      ),
      ...g,
    }
  }

  // Progression tracks the focus stream's own most-recent session.
  const last = stream[stream.length - 1]
  const prev: TopSetSummary = { load: last.load, reps: last.reps, sets: last.sets }
  const stagnant = isStagnant(stream, config.stagnationWindow)

  // The heavy specificity top set (SAID / Size Principle) attached to progression &
  // hold suggestions — null on deload/return where the intent is to ease off. Surfaced
  // as its own chip on the card, so it stays out of the working-set rationale text.
  const topSet = heavyTopSet(last.bestE1rm, last.load, config.topSetIntensity, inc)

  // 1. Double progression on the top working set — strongest signal.
  if (last.reps >= hi) {
    // 3. RPE (only if tracked): rising effort at the same load/reps → hold.
    if (rpeAvailable && rpeRisingAtConstant(stream)) {
      return {
        ...buildSuggestion(
          lift,
          'add-rep',
          { load: last.load, reps: last.reps, sets },
          prev,
          `Hit the top of the ${lo}–${hi} range, but RPE is rising at the same load — hold before adding weight.`,
          topSet,
        ),
        ...g,
      }
    }
    return {
      ...buildSuggestion(
        lift,
        'increase-load',
        { load: last.load + inc, reps: lo, sets },
        prev,
        `Hit ${sets}×${last.reps} @ ${last.load}kg last session (top of ${lo}–${hi} range).`,
        topSet,
      ),
      ...g,
    }
  }

  if (last.reps >= lo) {
    // Within range: add a rep, unless e1RM has plateaued (2. deload).
    if (stagnant) {
      // Goal-aware refinement: if you're behind pace and only *mildly* stalled
      // (still within range, not a hard below-range failure), push one more rep
      // before easing off. Load jumps and hard deloads are never touched.
      if (pace === 'behind') {
        return {
          ...buildSuggestion(
            lift,
            'add-rep',
            { load: last.load, reps: last.reps + 1, sets },
            prev,
            `Behind your goal pace and only mildly stalled — push +1 rep before easing off.`,
            topSet,
          ),
          ...g,
        }
      }
      return {
        ...deloadSuggestion(lift, last, config, `est. 1RM flat over the last ${config.stagnationWindow} sessions`),
        ...g,
      }
    }
    return {
      ...buildSuggestion(
        lift,
        'add-rep',
        { load: last.load, reps: last.reps + 1, sets },
        prev,
        `Reps within the ${lo}–${hi} range but not at the top yet.`,
        topSet,
      ),
      ...g,
    }
  }

  // Below range fallback. In practice unreachable — `stream` is scoped to reps in
  // [lo, hi], so `last.reps >= lo` above always holds and returns. Kept as the
  // required return and as a safety net if the stream definition ever widens.
  const belowRepeated = trailingBelowRange(stream, lo) >= config.belowRangeRepeat
  if (belowRepeated || stagnant) {
    const why = belowRepeated
      ? `stuck below ${lo} reps ${config.belowRangeRepeat}+ sessions running`
      : `est. 1RM flat over the last ${config.stagnationWindow} sessions`
    return { ...deloadSuggestion(lift, last, config, why), ...g }
  }
  return {
    ...buildSuggestion(
      lift,
      'build-reps',
      { load: last.load, reps: last.reps + 1, sets },
      prev,
      `Below the ${lo}–${hi} range — rebuild reps at this load before adding weight.`,
      topSet,
    ),
    ...g,
  }
}

// Per-lift next-session suggestion, computed purely from set history. Pass a
// `goalCtx` to make it goal-aware (adds `goalPace`/`requiredPerWeek` and the
// behind-pace refinement); omit it and behavior is unchanged.
export function nextSessionSuggestion(
  rows: SetRow[],
  goalCtx?: GoalContext,
  config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG,
  now: number = latestTs(rows),
  focus: DayFocus = nextSessionFocus(rows, config).focus,
): Record<LiftKey, Suggestion> {
  const rpeAvailable = hasRpeData(rows)
  const result = {} as Record<LiftKey, Suggestion>
  for (const lift of LIFTS) {
    result[lift.key] = suggestForLift(rows, lift.key, config, rpeAvailable, now, focus, goalCtx)
  }
  return result
}

// ---- Session plan: the full ordered set list for the next session ------------

export type PlanSetKind = 'warmup' | 'work' | 'top'

// One prescribed set in the next-session plan.
export interface PlanSet {
  kind: PlanSetKind
  weight: number
  reps: number
}

// A progressive warmup ramp up to `workLoad`: an empty-bar set, then ~60 % and
// ~85 % of the working load with descending reps — 2–3 sets as a baseline
// (light loads collapse to 2 or fewer once a step would be redundant with the
// bar or the working load). Weights snap to the plate increment and only sets
// strictly lighter than the working load (and strictly increasing) are kept.
// Returns an empty ramp for loads at or below the bar (nothing to ramp through).
export function warmupRamp(workLoad: number, plate = 2.5, bar = 20): PlanSet[] {
  if (!(workLoad > bar)) return []
  const snap = (w: number) => Math.round(w / plate) * plate
  const steps: Array<{ w: number; reps: number }> = [
    { w: bar, reps: 5 },
    { w: snap(0.6 * workLoad), reps: 3 },
    { w: snap(0.85 * workLoad), reps: 2 },
  ]
  const ramp: PlanSet[] = []
  let prev = 0
  for (const st of steps) {
    if (st.w > prev && st.w < workLoad) {
      ramp.push({ kind: 'warmup', weight: st.w, reps: st.reps })
      prev = st.w
    }
  }
  return ramp
}

// The complete, ordered set list for a suggestion — warmup ramp → the working
// sets → the heavy specificity top set. Baseline shape is 2–3 warmup sets, 3
// working sets, 1 top set; a deload trims the working sets and drops the top
// set, same as `return`. Empty when there's no history to prescribe from. Pure:
// derived entirely from the Suggestion, so the card renders every set the
// session calls for.
export function sessionPlan(s: Suggestion, config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG): PlanSet[] {
  if (s.action === 'insufficient-data' || s.sets <= 0) return []
  const plan: PlanSet[] = warmupRamp(s.load, config.loadIncrement)
  for (let i = 0; i < s.sets; i++) plan.push({ kind: 'work', weight: s.load, reps: s.reps })
  if (s.topSet) {
    for (let i = 0; i < s.topSet.sets; i++) plan.push({ kind: 'top', weight: s.topSet.load, reps: s.topSet.reps })
  }
  return plan
}

// ---- Goals: recommended targets, progress pace -------------------------------

export interface GoalConfig {
  quarterWeeks: number // weeks of runway credited per calendar quarter
  decay: { mid: number; long: number } // decay on later periods' share of recent rate
  floorPct: Record<GoalHorizon, number> // min cumulative gain as a fraction of current
  capPct: Record<GoalHorizon, number> // max cumulative gain — diminishing-returns ceiling
  minShortGain: number // never recommend less than this for the short-term (kg)
  round: number // snap targets to this plate increment (kg)
  neural: {
    ageGraceWeeks: number // logged training age below which no neural discount applies
    tauWeeks: number // decay constant for the neural-phase factor
    psiMin: number // floor on ψ (advanced lifters still gain, just slower)
  }
  stimulus: {
    windowWeeks: number // recent window used to measure training frequency
    freqTarget: number // sessions/week at/above which stimulus is considered full
    sigmaFloor: number // floor on σ (even sparse training keeps this share of the gain)
  }
}

// History-driven recommendation, bounded by diminishing returns. We project the lifter's
// recent kg/week forward (decaying its contribution each later period), scale it by two
// biological factors — the neural-phase factor ψ (fast early gains slow with training age)
// and the stimulus factor σ (adaptation tracks imposed frequency/tension) — then clamp the
// cumulative gain between a small %-of-current floor (so a plateaued lift still gets a
// target) and a %-of-current ceiling that itself decelerates per quarter (8 % in one
// quarter, 15 % over two, 25 % over four — a hot streak can't project to absurd numbers).
// Rough guide only — see docs/METHOD.md "How goals work".
export const DEFAULT_GOAL_CONFIG: GoalConfig = {
  quarterWeeks: 13,
  decay: { mid: 0.7, long: 0.5 },
  floorPct: { short: 0.03, mid: 0.05, long: 0.08 },
  capPct: { short: 0.08, mid: 0.15, long: 0.25 },
  minShortGain: 2.5,
  round: 2.5,
  neural: { ageGraceWeeks: 12, tauWeeks: 40, psiMin: 0.55 },
  stimulus: { windowWeeks: 8, freqTarget: 1.5, sigmaFloor: 0.6 },
}

const snapTo = (v: number, step: number) => Math.round(v / step) * step

// Current all-time heaviest single for a lift (0 when no history).
export function currentMaxWeight(rows: SetRow[], lift: LiftKey): number {
  const pr = liftPR(liftSessions(rows, lift))
  return pr ? pr.maxWeight : 0
}

// Logged training age for a lift (weeks from first to last working session). Only a
// lower bound on true training age — we can't see training before the export.
export function trainingAgeWeeks(rows: SetRow[], lift: LiftKey): number {
  const tops = topWorkingSets(rows, lift)
  if (tops.length < 2) return 0
  return (tops[tops.length - 1].ts - tops[0].ts) / (7 * 86400000)
}

// Sessions per week for a lift over the trailing `windowWeeks` (0 when too little data).
export function sessionFrequency(rows: SetRow[], lift: LiftKey, windowWeeks: number): number {
  const tops = topWorkingSets(rows, lift)
  if (tops.length < 2) return 0
  const W = 7 * 86400000
  const lastTs = tops[tops.length - 1].ts
  const cutoff = lastTs - windowWeeks * W
  const inWindow = tops.filter((t) => t.ts >= cutoff)
  if (inWindow.length < 2) return 0
  const span = (lastTs - inWindow[0].ts) / W
  return span >= 1 ? inWindow.length / span : 0
}

// Neural-adaptation / diminishing-returns factor ψ ∈ [psiMin, 1]. ≈1 for a novice
// (early gains are largely neural and fast); decays toward psiMin as logged training
// age grows (later gains lean on slower structural change).
export function neuralFactor(ageWeeks: number, cfg: GoalConfig['neural']): number {
  if (ageWeeks <= cfg.ageGraceWeeks) return 1
  return Math.max(cfg.psiMin, Math.exp(-(ageWeeks - cfg.ageGraceWeeks) / cfg.tauWeeks))
}

// Stimulus factor σ ∈ [sigmaFloor, 1] from training frequency — a proxy for the imposed
// mechanical-tension / MPS dose (SAID, mTOR, mechanotransduction). Full at freqTarget,
// tempered (not zeroed) below it. Guards to 1 when frequency is unmeasurable.
export function stimulusFactor(freqPerWeek: number, cfg: GoalConfig['stimulus']): number {
  if (freqPerWeek <= 0) return 1
  return Math.max(cfg.sigmaFloor, Math.min(1, cfg.sigmaFloor + (1 - cfg.sigmaFloor) * (freqPerWeek / cfg.freqTarget)))
}

// Recommended max-weight target per horizon (see DEFAULT_GOAL_CONFIG). Short covers ~one
// quarter, mid one more, long two more (to the fourth quarter-end); each cumulative gain
// is the decayed rate projection clamped into [floor%, cap%] of current, then snapped to
// the plate step and forced strictly increasing with short ≥ current + minShortGain.
export function recommendedGoals(
  rows: SetRow[],
  lift: LiftKey,
  config: GoalConfig = DEFAULT_GOAL_CONFIG,
): Record<GoalHorizon, number> {
  const current = currentMaxWeight(rows, lift)
  if (current <= 0) return { short: 0, mid: 0, long: 0 }
  const rate = recentRatePerWeek(rows, lift)
  const step = config.round
  const q = config.quarterWeeks

  // Biological scaling of the raw rate projection: ψ (neural phase, by training age)
  // and σ (stimulus, by training frequency). Both ≤ 1, so they only temper — the floor
  // still guarantees a minimum target and the cap still bounds the maximum.
  const psi = neuralFactor(trainingAgeWeeks(rows, lift), config.neural)
  const sigma = stimulusFactor(sessionFrequency(rows, lift, config.stimulus.windowWeeks), config.stimulus)
  const scale = psi * sigma

  // Cumulative gain projected from recent rate, its later share decayed, then scaled.
  const proj: Record<GoalHorizon, number> = {
    short: rate * q * scale,
    mid: rate * q * (1 + config.decay.mid) * scale,
    long: rate * q * (1 + config.decay.mid + 2 * config.decay.long) * scale,
  }
  const clampGain = (h: GoalHorizon) => {
    const floor = Math.max(current * config.floorPct[h], h === 'short' ? config.minShortGain : 0)
    return Math.min(Math.max(proj[h], floor), current * config.capPct[h])
  }

  let short = snapTo(current + clampGain('short'), step)
  if (short < current + config.minShortGain) short = snapTo(current + config.minShortGain, step)
  let mid = snapTo(current + clampGain('mid'), step)
  if (mid <= short) mid = short + step
  let long = snapTo(current + clampGain('long'), step)
  if (long <= mid) long = mid + step
  return { short, mid, long }
}

// Max-weight change per week over the trailing ~`weeksWindow` weeks (best-to-date,
// so it only reflects genuine PRs; floored at 0).
export function recentRatePerWeek(rows: SetRow[], lift: LiftKey, weeksWindow = 8): number {
  const tops = topWorkingSets(rows, lift)
  if (tops.length < 2) return 0
  const W = 7 * 86400000
  const lastTs = tops[tops.length - 1].ts
  const cutoff = lastTs - weeksWindow * W
  let current = 0
  let baseline = 0
  let haveBaseline = false
  for (const t of tops) {
    if (t.load > current) current = t.load
    if (t.ts <= cutoff) {
      if (t.load > baseline) baseline = t.load
      haveBaseline = true
    }
  }
  let weeks = weeksWindow
  if (!haveBaseline) {
    baseline = tops[0].load
    weeks = (lastTs - tops[0].ts) / W
  }
  if (weeks < 1) return 0
  return Math.max(0, round1((current - baseline) / weeks))
}

// Where the lift's recent rate puts it against the short-term target.
export function goalPace(current: number, target: number, weeksLeft: number, recentRate: number): GoalPace {
  if (current >= target) return 'met'
  if (weeksLeft <= 0) return 'behind'
  const required = (target - current) / weeksLeft
  if (required <= 0) return 'met'
  const ratio = recentRate / required
  if (ratio >= 1) return 'ahead'
  if (ratio >= 0.6) return 'on-track'
  return 'behind'
}
