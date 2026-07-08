// A view filter for the Training-frequency heatmap: show the days you trained with
// low reps (heavy) or high reps (light). Switched via a segmented toggle on the card;
// state is persisted in localStorage like the metric mode. This only re-filters the
// heatmap — it does not touch the next-session suggestion.
export type DayFocus = 'strength' | 'volume'

export const DAY_FOCUS_STORAGE_KEY = 'strength-training:day-focus'

export const DEFAULT_DAY_FOCUS: DayFocus = 'strength'

export const DAY_FOCUSES: { id: DayFocus; label: string }[] = [
  { id: 'strength', label: 'Low reps' },
  { id: 'volume', label: 'High reps' },
]

// A working set with reps at or below this counts as a low-rep (heavy) set; above it
// is a high-rep (light) set. The split sits mid-way between typical heavy and light
// working ranges.
export const LOW_REP_MAX = 8

// Does a working set of `reps` reps belong to the selected focus?
export function repMatchesFocus(reps: number, focus: DayFocus): boolean {
  return focus === 'strength' ? reps <= LOW_REP_MAX : reps > LOW_REP_MAX
}

export function isDayFocus(value: string | null | undefined): value is DayFocus {
  return value === 'volume' || value === 'strength'
}
