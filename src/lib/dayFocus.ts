// Daily undulating periodization (DUP): the lifter can flag the *next* session as a
// high-rep/low-weight day or a low-rep/high-weight day, switched via a global toggle
// (Training frequency card). `nextSessionSuggestion` reads this to retarget the rep
// range/load for that session — see README "How suggestions work".
export type DayFocus = 'volume' | 'strength'

export const DAY_FOCUS_STORAGE_KEY = 'strength-training:day-focus'

export const DEFAULT_DAY_FOCUS: DayFocus = 'strength'

export const DAY_FOCUSES: { id: DayFocus; label: string }[] = [
  { id: 'strength', label: 'Low reps' },
  { id: 'volume', label: 'High reps' },
]

export function isDayFocus(value: string | null | undefined): value is DayFocus {
  return value === 'volume' || value === 'strength'
}
