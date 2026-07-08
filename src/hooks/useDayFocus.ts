import { useCallback, useEffect, useState } from 'react'
import { DAY_FOCUS_STORAGE_KEY, DEFAULT_DAY_FOCUS, isDayFocus, type DayFocus } from '../lib/dayFocus'

function readInitialDayFocus(): DayFocus {
  const stored = localStorage.getItem(DAY_FOCUS_STORAGE_KEY)
  return isDayFocus(stored) ? stored : DEFAULT_DAY_FOCUS
}

export function useDayFocus() {
  const [dayFocus, setDayFocusState] = useState<DayFocus>(readInitialDayFocus)

  useEffect(() => {
    localStorage.setItem(DAY_FOCUS_STORAGE_KEY, dayFocus)
  }, [dayFocus])

  const setDayFocus = useCallback((next: DayFocus) => setDayFocusState(next), [])

  return { dayFocus, setDayFocus }
}
