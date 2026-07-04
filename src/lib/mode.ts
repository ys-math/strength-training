// The dashboard's primary metric can be viewed two ways, switched via a global
// toggle: estimated 1RM (Epley) or the actual max weight lifted. This drives the
// StatCards and the main ProgressChart.
export type MetricMode = 'e1rm' | 'maxWeight'

export const MODE_STORAGE_KEY = 'strength-training:metric-mode'

export const DEFAULT_MODE: MetricMode = 'maxWeight'

export const MODES: { id: MetricMode; label: string }[] = [
  { id: 'e1rm', label: 'Est. 1RM' },
  { id: 'maxWeight', label: 'Max weight' },
]

export function isMode(value: string | null | undefined): value is MetricMode {
  return value === 'e1rm' || value === 'maxWeight'
}
