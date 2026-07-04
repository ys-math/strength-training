// Per-lift max-weight (actual heaviest single) targets at three horizons. Goals are
// recommendation-only (no editing, no persistence): the roadmap divides the year into
// fixed calendar quarters and shows where you stand against the recommended targets.
export type GoalHorizon = 'short' | 'mid' | 'long'

export const HORIZONS: { id: GoalHorizon; label: string; short: string; months: number }[] = [
  { id: 'short', label: 'Short term', short: '3 mo', months: 3 },
  { id: 'mid', label: 'Mid term', short: '6 mo', months: 6 },
  { id: 'long', label: 'Long term', short: '1 yr', months: 12 },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface Quarter {
  label: string // e.g. "Jul–Sep"
  start: Date
  end: Date
}

// Whole weeks (fractional) between now and a due date, floored at 0.
export function weeksUntil(date: Date, from: Date = new Date()): number {
  return Math.max(0, (date.getTime() - from.getTime()) / (7 * 86400000))
}

// Last moment of the given calendar quarter (0 = Jan–Mar … 3 = Oct–Dec).
function quarterEndOf(year: number, quarterIndex: number): Date {
  const endMonth = quarterIndex * 3 + 2 // Mar, Jun, Sep, Dec
  return new Date(year, endMonth + 1, 0, 23, 59, 59, 999) // day 0 of next month = last day
}

function quarterFromEnd(end: Date): Quarter {
  const endMonth = end.getMonth()
  const startMonth = endMonth - 2
  const start = new Date(end.getFullYear(), startMonth, 1, 0, 0, 0, 0)
  return { label: `${MONTHS[startMonth]}–${MONTHS[endMonth]}`, start, end }
}

// The roadmap is anchored to fixed calendar quarters (Jan–Mar / Apr–Jun / Jul–Sep /
// Oct–Dec). `quarters` are the four upcoming quarters (the current one first); the goal
// horizons fall on fixed quarter-ends: short = 1st (≤3 mo), mid = 2nd (≤6 mo),
// long = 4th (≤12 mo).
export function quarterCheckpoints(from: Date = new Date()): {
  quarters: Quarter[]
  horizonDate: Record<GoalHorizon, Date>
} {
  const ends: Date[] = []
  let year = from.getFullYear()
  let qi = Math.floor(from.getMonth() / 3)
  while (ends.length < 4) {
    const end = quarterEndOf(year, qi)
    if (end.getTime() > from.getTime()) ends.push(end)
    qi += 1
    if (qi > 3) {
      qi = 0
      year += 1
    }
  }
  const quarters = ends.map(quarterFromEnd)
  return {
    quarters,
    horizonDate: { short: ends[0], mid: ends[1], long: ends[3] },
  }
}
