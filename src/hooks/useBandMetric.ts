import { useCallback, useEffect, useState } from 'react'
import {
  BAND_METRIC_STORAGE_KEY,
  DEFAULT_BAND_METRIC,
  isBandMetric,
  type BandMetric,
} from '../lib/bandMetric'

function readInitialMetric(): BandMetric {
  const stored = localStorage.getItem(BAND_METRIC_STORAGE_KEY)
  return isBandMetric(stored) ? stored : DEFAULT_BAND_METRIC
}

export function useBandMetric() {
  const [metric, setMetricState] = useState<BandMetric>(readInitialMetric)

  useEffect(() => {
    localStorage.setItem(BAND_METRIC_STORAGE_KEY, metric)
  }, [metric])

  const setMetric = useCallback((next: BandMetric) => setMetricState(next), [])

  return { metric, setMetric }
}
