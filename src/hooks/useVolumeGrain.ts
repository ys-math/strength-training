import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_VOLUME_GRAIN,
  isVolumeGrain,
  VOLUME_GRAIN_STORAGE_KEY,
  type VolumeGrain,
} from '../lib/volumeGrain'

function readInitialGrain(): VolumeGrain {
  const stored = localStorage.getItem(VOLUME_GRAIN_STORAGE_KEY)
  return isVolumeGrain(stored) ? stored : DEFAULT_VOLUME_GRAIN
}

export function useVolumeGrain() {
  const [grain, setGrainState] = useState<VolumeGrain>(readInitialGrain)

  useEffect(() => {
    localStorage.setItem(VOLUME_GRAIN_STORAGE_KEY, grain)
  }, [grain])

  const setGrain = useCallback((next: VolumeGrain) => setGrainState(next), [])

  return { grain, setGrain }
}
