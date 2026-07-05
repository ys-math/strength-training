export interface SetGroup {
  weight: number
  reps: number
  count: number
}

// Collapse consecutive identical sets into one "weight × reps ×count" group, so a
// run of three matching working sets reads as one chip instead of three. Typed to
// the minimum it reads, so both logged sets (SetDetail) and planned sets (PlanSet)
// can be grouped.
export function groupSets(sets: Array<{ weight: number; reps: number }>): SetGroup[] {
  const groups: SetGroup[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.weight === s.weight && last.reps === s.reps) last.count += 1
    else groups.push({ weight: s.weight, reps: s.reps, count: 1 })
  }
  return groups
}

// A single "weight kg × reps ×count" pill. `warmup` dims it and prefixes a W;
// `dim` renders the muted "previous session" variant used by the Next-session card.
export default function SetChip({ g, warmup, dim }: { g: SetGroup; warmup?: boolean; dim?: boolean }) {
  const muted = warmup || dim
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums"
      style={{
        border: '1px solid var(--border)',
        background: muted ? 'transparent' : 'var(--page)',
        color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
      }}
    >
      {warmup && <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>W</span>}
      <span>
        {g.weight}
        <span style={{ color: 'var(--text-muted)' }}> kg × </span>
        {g.reps}
      </span>
      {g.count > 1 && <span style={{ color: 'var(--text-muted)' }}>×{g.count}</span>}
    </span>
  )
}
