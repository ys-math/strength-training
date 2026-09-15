// Chart aggregation. Every function here is pure and takes SetRow[]; the algorithm that
// decides what to lift next lives in engine.ts, not here.
//
// Units are kg throughout, straight from the export. Nothing on this dashboard is
// estimated — there is no e1RM, no conversion, no projection beyond the one the engine
// actually prescribes.
import { LIFTS, type LiftKey, type LiftPR, type LiftSession, type SetRow } from './types'
import { dayBandMap, liftDays, type RepBand } from './engine'

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
    let maxWeight = 0
    let maxWeightReps = 0
    let volume = 0
    let workingSets = 0
    for (const s of sets) {
      if (s.weight > maxWeight) {
        maxWeight = s.weight
        maxWeightReps = s.reps
      }
      if (!s.isWarmup) {
        volume += s.weight * s.reps
        workingSets += 1
      }
    }
    sessions.push({ date: sets[0].date, dateKey, maxWeight, maxWeightReps, volume, workingSets })
  }

  sessions.sort((a, b) => a.date.getTime() - b.date.getTime())
  return sessions
}

export function liftPR(sessions: LiftSession[]): LiftPR | null {
  if (sessions.length === 0) return null
  let heaviest = sessions[0]
  for (const s of sessions) {
    if (s.maxWeight > heaviest.maxWeight) heaviest = s
  }
  // What the record was immediately before it was broken, for a progress delta.
  let prevMaxWeight = 0
  for (const s of sessions) {
    if (s.date.getTime() < heaviest.date.getTime() && s.maxWeight > prevMaxWeight) prevMaxWeight = s.maxWeight
  }
  return {
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

// ---- Session-max trend (the main ProgressChart) -------------------------------

// Each lift's HEAVIEST WORKING SET per training day — the weight actually lifted that
// session, warmups excluded. Every session a lift was trained has a value, so the line is
// as dense as the training: overhead press logged a set above its working load on only 2
// days in five months but was trained on 30.
//
// The cost of that density is that the line moves with the band — a heavy single and a
// light set of twelve both plot at the weight on the bar. `band` heads the tooltip so a dip
// reads as a band change rather than lost strength, and `records` feeds the legend, which
// must show the record — the line's own last point is not guaranteed to be one.
export interface SessionMaxPoint {
  dateKey: string
  ts: number
  band?: RepBand
  BP?: number
  SQ?: number
  DL?: number
  OHP?: number
  detail: Partial<Record<LiftKey, { reps: number; isPR: boolean }>>
}

export function sessionMaxSeries(rows: SetRow[]): { series: SessionMaxPoint[]; records: Record<LiftKey, number> } {
  const byLiftDate = new Map<string, { weight: number; reps: number }>()
  const bandByDate = new Map<string, RepBand>()
  const dates = new Set<string>()

  for (const lift of LIFTS) {
    for (const day of liftDays(rows, lift.key)) {
      byLiftDate.set(`${lift.key}|${day.dateKey}`, day.heaviest)
      dates.add(day.dateKey)
    }
  }
  for (const [dateKey, d] of dayBandMap(rows)) bandByDate.set(dateKey, d.band)

  const records: Record<LiftKey, number> = { BP: 0, SQ: 0, DL: 0, OHP: 0 }
  const series: SessionMaxPoint[] = []

  for (const dateKey of [...dates].sort()) {
    const point: SessionMaxPoint = { dateKey, ts: new Date(dateKey).getTime(), band: bandByDate.get(dateKey), detail: {} }
    for (const lift of LIFTS) {
      const t = byLiftDate.get(`${lift.key}|${dateKey}`)
      if (!t || t.weight <= 0) continue
      const isPR = t.weight > records[lift.key]
      if (isPR) records[lift.key] = t.weight
      point[lift.key] = round1(t.weight)
      point.detail[lift.key] = { reps: t.reps, isPR }
    }
    series.push(point)
  }

  return {
    series,
    records: { BP: round1(records.BP), SQ: round1(records.SQ), DL: round1(records.DL), OHP: round1(records.OHP) },
  }
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
  /** The day's rep band, by the one definition in engine.ts (dayBandMap). */
  band: RepBand | null
  /** The rep count `band` was decided from — the tooltip prints it so the label can be
   *  checked against what you remember lifting. */
  bandReps: number | null
}

export function dailyMetrics(rows: SetRow[]): Map<string, DayMetrics> {
  const byDay = new Map<string, DayMetrics>()

  for (const r of rows) {
    if (!r.lift || r.isWarmup) continue
    const d = byDay.get(r.dateKey)
    if (d) d.sets += 1
    else byDay.set(r.dateKey, { sets: 1, volume: 0, band: null, bandReps: null })
  }

  // Tonnage comes straight from sessionVolume rather than being re-summed here, so
  // the heatmap and the Session-volume card can't disagree by a rounding step.
  for (const s of sessionVolume(rows)) {
    const d = byDay.get(s.dateKey)
    if (d) d.volume = s.total
  }

  for (const [dateKey, { band, reps }] of dayBandMap(rows)) {
    const d = byDay.get(dateKey)
    if (d) {
      d.band = band
      d.bandReps = reps
    }
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
