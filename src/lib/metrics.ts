import { LIFTS, type LiftKey, type LiftPR, type LiftSession, type SetRow } from './types'

export const round1 = (n: number) => Math.round(n * 10) / 10
export const round0 = (n: number) => Math.round(n)

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
    let topWeight = 0
    let topReps = 0
    let volume = 0
    let workingSets = 0
    for (const s of sets) {
      if (s.e1rm > bestE1rm) {
        bestE1rm = s.e1rm
        topWeight = s.weight
        topReps = s.reps
      }
      if (!s.isWarmup) {
        volume += s.weight * s.reps
        workingSets += 1
      }
    }
    sessions.push({ date: sets[0].date, dateKey, bestE1rm, topWeight, topReps, volume, workingSets })
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
    if (s.topWeight > heaviest.topWeight) heaviest = s
  }
  return {
    maxE1rm: best.bestE1rm,
    maxE1rmDate: best.dateKey,
    maxWeight: heaviest.topWeight,
    maxWeightReps: heaviest.topReps,
    maxWeightDate: heaviest.dateKey,
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

// Sum of each lift's *best-to-date* e1RM, tracked over time so it only climbs.
export interface Big4Point {
  dateKey: string
  ts: number
  total: number
}

export function big4Series(rows: SetRow[]): { series: Big4Point[]; current: number; prev: number } {
  const dates = [...new Set(rows.filter((r) => r.lift).map((r) => r.dateKey))].sort()
  const bestToDate: Record<LiftKey, number> = { BP: 0, SQ: 0, DL: 0, OHP: 0 }

  // Precompute best-e1rm per lift per date.
  const byLiftDate = new Map<string, number>()
  for (const lift of LIFTS) {
    for (const s of liftSessions(rows, lift.key)) {
      byLiftDate.set(`${lift.key}|${s.dateKey}`, s.bestE1rm)
    }
  }

  const series: Big4Point[] = []
  for (const dateKey of dates) {
    for (const lift of LIFTS) {
      const v = byLiftDate.get(`${lift.key}|${dateKey}`)
      if (v && v > bestToDate[lift.key]) bestToDate[lift.key] = v
    }
    const total = LIFTS.reduce((sum, l) => sum + bestToDate[l.key], 0)
    const ts = new Date(dateKey).getTime()
    series.push({ dateKey, ts, total: round1(total) })
  }

  const current = series.length ? series[series.length - 1].total : 0
  // Previous distinct total (before the most recent increase), for a delta.
  let prev = current
  for (let i = series.length - 2; i >= 0; i--) {
    if (series[i].total < current) {
      prev = series[i].total
      break
    }
    prev = series[i].total
  }
  return { series, current, prev }
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
