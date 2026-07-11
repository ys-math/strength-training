// The bucket the Volume card sums working tonnage into. Both grains use the *same*
// accumulation rule (big four, working sets, warmups excluded), so a week's bar equals
// the sum of its sessions' bars — the grains are two readings of one quantity, not two
// quantities. 'week' answers "am I doing enough"; 'session' answers "was that day
// unusually heavy" (the fatigue question), which is why only that grain carries the
// trailing baseline.
export type VolumeGrain = 'week' | 'session'

export const VOLUME_GRAIN_STORAGE_KEY = 'strength-training:volume-grain'

export const DEFAULT_VOLUME_GRAIN: VolumeGrain = 'week'

export const VOLUME_GRAINS: { id: VolumeGrain; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'session', label: 'Session' },
]

export function isVolumeGrain(value: string | null | undefined): value is VolumeGrain {
  return value === 'week' || value === 'session'
}
