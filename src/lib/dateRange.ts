import type { SetRow } from './types'

/** An inclusive span of training days, as YYYY-MM-DD keys. */
export interface DateRange {
  from: string
  to: string
}

export interface RangePreset {
  id: string
  label: string
  /** Months back from the latest training day. Null means the whole history. */
  months: number | null
}

export const RANGE_PRESETS: RangePreset[] = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: 'all', label: 'All', months: null },
]

/** Every training day in the data, sorted. The range's handles index into this, so a
 *  handle always lands on a day you actually trained. */
export function trainingDays(rows: SetRow[]): string[] {
  return [...new Set(rows.map((r) => r.dateKey))].sort()
}

/** The first day at or after `months` back from `to`. Clamped to the data's own start. */
export function presetFrom(days: string[], to: string, months: number | null): string {
  if (days.length === 0) return to
  if (months === null) return days[0]
  const [y, m, d] = to.split('-').map(Number)
  const cutoff = new Date(y, m - 1 - months, d)
  const key = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(
    cutoff.getDate(),
  ).padStart(2, '0')}`
  return days.find((x) => x >= key) ?? days[0]
}

/** The full span of the data. */
export function fullRange(days: string[]): DateRange {
  return { from: days[0] ?? '', to: days[days.length - 1] ?? '' }
}

/** True when the range still reaches the most recent training day. The chart's
 *  next-session projection is only meaningful while this holds. */
export function includesLatest(range: DateRange, days: string[]): boolean {
  return days.length === 0 || range.to >= days[days.length - 1]
}

/** Keep only the rows inside the range. Charts filter; the engine never does. */
export function rowsInRange(rows: SetRow[], range: DateRange): SetRow[] {
  if (!range.from && !range.to) return rows
  return rows.filter((r) => r.dateKey >= range.from && r.dateKey <= range.to)
}
