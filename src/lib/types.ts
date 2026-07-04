// The four barbell lifts this dashboard focuses on. `key` is the short code used
// across the UI; `exercise` is the exact Strong-export "Exercise Name" to match.
export type LiftKey = 'BP' | 'SQ' | 'DL' | 'OHP'

export interface LiftDef {
  key: LiftKey
  label: string
  exercise: string
  color: string // CSS var reference, resolved at render time
}

export const LIFTS: LiftDef[] = [
  { key: 'BP', label: 'Bench Press', exercise: 'Bench Press (Barbell)', color: 'var(--lift-bp)' },
  { key: 'SQ', label: 'Squat', exercise: 'Squat (Barbell)', color: 'var(--lift-sq)' },
  { key: 'DL', label: 'Deadlift', exercise: 'Deadlift (Barbell)', color: 'var(--lift-dl)' },
  { key: 'OHP', label: 'Overhead Press', exercise: 'Overhead Press (Barbell)', color: 'var(--lift-ohp)' },
]

export const LIFT_BY_EXERCISE = new Map(LIFTS.map((l) => [l.exercise, l]))
export const LIFT_BY_KEY = new Map(LIFTS.map((l) => [l.key, l]))

// One performed set from the CSV.
export interface SetRow {
  date: Date
  dateKey: string // YYYY-MM-DD
  workout: string
  exercise: string
  lift: LiftKey | null // set when the exercise is one of the big 4
  setOrder: string // "W" for warmup, otherwise a 1-based index
  isWarmup: boolean
  weight: number // kg
  reps: number
  e1rm: number // estimated 1-rep max for this set (Epley)
  rpe: number | null // Strong's optional RPE column; null when the export omits it
}

// One lift performed on one date (all its sets aggregated).
export interface LiftSession {
  date: Date
  dateKey: string
  bestE1rm: number
  maxWeight: number // heaviest weight actually lifted this session (independent of e1RM)
  maxWeightReps: number // reps of that set
  volume: number // working tonnage (kg), warmups excluded
  workingSets: number
}

export interface LiftPR {
  maxE1rm: number
  maxE1rmDate: string
  maxWeight: number
  maxWeightReps: number
  maxWeightDate: string
  prevMaxWeight: number // the record immediately before maxWeight was set (0 if none)
}
