import type { LiftKey } from './types'

// Per-lift max-weight (actual heaviest single) targets, at three horizons. A goal
// is user state with no backend, so it lives in localStorage (see useGoals).
export type GoalHorizon = 'short' | 'mid' | 'long'

export const HORIZONS: { id: GoalHorizon; label: string; short: string; months: number }[] = [
  { id: 'short', label: 'Short term', short: '3 mo', months: 3 },
  { id: 'mid', label: 'Mid term', short: '6 mo', months: 6 },
  { id: 'long', label: 'Long term', short: '1 yr', months: 12 },
]

export const GOALS_STORAGE_KEY = 'strength-training:goals'

// A user-entered target (kg) per lift per horizon. An absent entry means "use the
// recommended value" — we never persist recommendations, only explicit overrides.
export type GoalMap = Partial<Record<LiftKey, Partial<Record<GoalHorizon, number>>>>

// The date a horizon falls due, from now (runtime), for weeks-remaining math.
export function horizonDate(months: number, from: Date = new Date()): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d
}

export function weeksUntil(date: Date, from: Date = new Date()): number {
  return Math.max(0, (date.getTime() - from.getTime()) / (7 * 86400000))
}

export function parseGoals(raw: string | null): GoalMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: GoalMap = {}
    for (const [lift, byHorizon] of Object.entries(parsed as Record<string, unknown>)) {
      if (!byHorizon || typeof byHorizon !== 'object') continue
      const clean: Partial<Record<GoalHorizon, number>> = {}
      for (const h of ['short', 'mid', 'long'] as GoalHorizon[]) {
        const v = (byHorizon as Record<string, unknown>)[h]
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[h] = v
      }
      if (Object.keys(clean).length) out[lift as LiftKey] = clean
    }
    return out
  } catch {
    return {}
  }
}
