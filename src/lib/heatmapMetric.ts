// What the Training-frequency heatmap colors its cells by. This is an *encoding*
// switch, not a filter: every training day stays on the grid in every mode, only the
// meaning of the shade changes. (An earlier heavy/light *filter* on this card was
// removed in 33fa31b precisely because hiding days to see a subset was the wrong shape.)
export type HeatmapMetric = 'sets' | 'volume' | 'intensity'

export const HEATMAP_METRIC_STORAGE_KEY = 'strength-training:heatmap-metric'

export const DEFAULT_HEATMAP_METRIC: HeatmapMetric = 'sets'

export const HEATMAP_METRICS: { id: HeatmapMetric; label: string }[] = [
  { id: 'sets', label: 'Sets' },
  { id: 'volume', label: 'Volume' },
  { id: 'intensity', label: 'Intensity' },
]

export function isHeatmapMetric(value: string | null | undefined): value is HeatmapMetric {
  return value === 'sets' || value === 'volume' || value === 'intensity'
}
