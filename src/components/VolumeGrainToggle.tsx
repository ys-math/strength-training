import { VOLUME_GRAINS, type VolumeGrain } from '../lib/volumeGrain'

// Segmented control choosing the bucket the Volume card sums tonnage into. Sits in the
// card header; re-buckets the same quantity rather than switching to a different one.
export default function VolumeGrainToggle({
  grain,
  setGrain,
}: {
  grain: VolumeGrain
  setGrain: (g: VolumeGrain) => void
}) {
  return (
    <div
      className="inline-flex rounded-full p-0.5"
      role="group"
      aria-label="Volume grain"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-1)' }}
    >
      {VOLUME_GRAINS.map((g) => {
        const on = g.id === grain
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => setGrain(g.id)}
            aria-pressed={on}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{
              background: on ? 'var(--lift-bp)' : 'transparent',
              color: on ? '#fff' : 'var(--text-muted)',
            }}
          >
            {g.label}
          </button>
        )
      })}
    </div>
  )
}
