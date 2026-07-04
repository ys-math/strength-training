import Papa from 'papaparse'
import { LIFT_BY_EXERCISE, type SetRow } from './types'

export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  return weight * (1 + reps / 30)
}

interface RawRow {
  Date: string
  'Workout Name': string
  'Exercise Name': string
  'Set Order': string
  Weight: string
  Reps: string
  RPE?: string // present in Strong's header but usually blank
}

// Strong exports "2026-04-24 09:40:00" (local time, space-separated).
function parseDate(s: string): Date {
  return new Date(s.replace(' ', 'T'))
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse the raw CSV text into typed, cleaned set rows. Rows with unparseable
// dates or non-positive weight AND reps (bodyweight/cardio) are kept only if
// they carry load; e1rm is 0 for zero-load sets and never wins a max.
export function parseWorkouts(csv: string): SetRow[] {
  const { data } = Papa.parse<RawRow>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  const rows: SetRow[] = []
  for (const r of data) {
    if (!r.Date || !r['Exercise Name']) continue
    const date = parseDate(r.Date)
    if (Number.isNaN(date.getTime())) continue

    const exercise = r['Exercise Name']
    const setOrder = (r['Set Order'] ?? '').trim()
    const isWarmup = setOrder.toUpperCase() === 'W'
    const weight = Number(r.Weight) || 0
    const reps = Number(r.Reps) || 0
    const lift = LIFT_BY_EXERCISE.get(exercise)?.key ?? null
    const rpeRaw = (r.RPE ?? '').trim()
    const rpeNum = rpeRaw === '' ? NaN : Number(rpeRaw)
    const rpe = Number.isFinite(rpeNum) && rpeNum > 0 ? rpeNum : null

    rows.push({
      date,
      dateKey: dateKeyOf(date),
      workout: r['Workout Name'] ?? '',
      exercise,
      lift,
      setOrder,
      isWarmup,
      weight,
      reps,
      e1rm: epley(weight, reps),
      rpe,
    })
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime())
  return rows
}
