import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_HEATMAP_METRIC,
  HEATMAP_METRIC_STORAGE_KEY,
  isHeatmapMetric,
  type HeatmapMetric,
} from '../lib/heatmapMetric'

function readInitialMetric(): HeatmapMetric {
  const stored = localStorage.getItem(HEATMAP_METRIC_STORAGE_KEY)
  return isHeatmapMetric(stored) ? stored : DEFAULT_HEATMAP_METRIC
}

export function useHeatmapMetric() {
  const [metric, setMetricState] = useState<HeatmapMetric>(readInitialMetric)

  useEffect(() => {
    localStorage.setItem(HEATMAP_METRIC_STORAGE_KEY, metric)
  }, [metric])

  const setMetric = useCallback((next: HeatmapMetric) => setMetricState(next), [])

  return { metric, setMetric }
}
