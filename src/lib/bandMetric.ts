/** What the frequency calendar colors its cells by. Sets and volume are ordinal and read
 *  off the sequential ramp; band is categorical and reads off its own three hues. */
export type BandMetric = 'sets' | 'volume' | 'band'

export const BAND_METRICS: { id: BandMetric; label: string }[] = [
  { id: 'sets', label: 'Sets' },
  { id: 'volume', label: 'Volume' },
  { id: 'band', label: 'Band' },
]

export const DEFAULT_BAND_METRIC: BandMetric = 'sets'

export const BAND_METRIC_STORAGE_KEY = 'strength-training:heatmap-metric'

export function isBandMetric(v: unknown): v is BandMetric {
  return typeof v === 'string' && BAND_METRICS.some((m) => m.id === v)
}
