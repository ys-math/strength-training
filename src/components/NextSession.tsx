import {
  BANDS,
  BAND_COLOR,
  BAND_META,
  daysBetween,
  latestDateKey,
  type PlanSet,
  type Prescription,
  type ProgressRule,
} from '../lib/engine'
import { LIFT_BY_KEY, type SetRow } from '../lib/types'
import { fmtLongDate } from '../lib/format'
import ChartCard from './ChartCard'
import SetChip, { groupSets } from './SetChip'

// Which arm of the one progression rule fired, in three words.
const RULE_LABEL: Record<ProgressRule, string> = {
  'load-up': 'add load',
  'rep-up': 'add rep',
  repeat: 'repeat',
  'no-history': 'no data',
}

// A band chip wearing the same hue the heatmap paints that band with, so the calendar and
// this card can never disagree about what heavy looks like.
function BandChip({ band }: { band: Prescription['band'] }) {
  const [lo, hi] = BANDS[band]
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[9px] w-[9px] shrink-0 rounded-sm" style={{ background: BAND_COLOR[band] }} />
      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        {BAND_META[band].label}
      </span>
      <span className="text-[11px] font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {lo}–{hi}
      </span>
    </span>
  )
}

// The set pills for one lift: three straight sets at one load. No warmup ramp — warmups
// are yours to judge and never enter the engine.
function PlanChips({ plan }: { plan: PlanSet }) {
  // groupSets speaks {weight, reps}; the engine speaks {load, reps}. The one plan entry
  // stands for all three sets, so it is repeated before grouping collapses it to "×3".
  const chips = groupSets(
    Array.from({ length: 3 }, () => ({ weight: plan.load, reps: plan.reps })),
  )
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {chips.map((g, i) => (
        <SetChip key={`s${i}`} g={g} />
      ))}
    </div>
  )
}

// Where the prescription came from. A track you haven't trained in weeks still gets
// progressed — the engine never quietly backs off — so its age has to be on screen.
function Reference({ p, today }: { p: Prescription; today: string }) {
  if (!p.reference) return null
  const age = today ? daysBetween(p.reference.dateKey, today) : 0
  return (
    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
      from {fmtLongDate(p.reference.dateKey)}
      {age > 0 && ` · ${age}d ago`} · {p.reference.load} kg × {p.reference.achieved}
      {p.reference.sets < 3 && `, only ${p.reference.sets} sets`}
    </span>
  )
}

export default function NextSession({
  rows,
  prescriptions,
}: {
  rows: SetRow[]
  prescriptions: Prescription[]
}) {
  const today = latestDateKey(rows)

  return (
    <ChartCard title="Next session" subtitle="3 straight sets in a rep band, per lift">
      <div className="space-y-2">
        {prescriptions.map((p) => {
          const lift = LIFT_BY_KEY.get(p.lift)
          const stale = p.reference && today ? daysBetween(p.reference.dateKey, today) >= 28 : false
          return (
            <div
              key={p.lift}
              className="border-t pt-2.5 first:border-t-0 first:pt-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: lift?.color }}
                  />
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {lift?.label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <BandChip band={p.band} />
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      border: '1px solid var(--border)',
                      color: p.rule === 'load-up' ? 'var(--delta-good)' : 'var(--text-muted)',
                    }}
                  >
                    {RULE_LABEL[p.rule]}
                  </span>
                </div>
              </div>

              {!p.plan ? (
                <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  No {BAND_META[p.band].label.toLowerCase()} history yet. Log one session and it starts
                  tracking.
                </div>
              ) : (
                <>
                  <PlanChips plan={p.plan} />
                  <div className="mt-1 flex items-center gap-1.5">
                    <Reference p={p} today={today} />
                    {stale && (
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--lift-dl)' }}>
                        stale
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Each lift rotates heavy → volume → moderate and progresses off its own last session in that
        band: complete three sets at the top of the band to earn 2.5 kg, otherwise add a rep. Full
        rules in docs/METHOD.md.
      </p>
    </ChartCard>
  )
}
