import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_MODE, MODE_STORAGE_KEY, isMode, type MetricMode } from '../lib/mode'

function readInitialMode(): MetricMode {
  const stored = localStorage.getItem(MODE_STORAGE_KEY)
  return isMode(stored) ? stored : DEFAULT_MODE
}

export function useMetricMode() {
  const [mode, setModeState] = useState<MetricMode>(readInitialMode)

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
  }, [mode])

  const setMode = useCallback((next: MetricMode) => setModeState(next), [])

  return { mode, setMode }
}
