import { useMemo } from 'react'
import { LIFTS, type LiftKey, type SetRow } from '../lib/types'
import { nextSessionSuggestion, overallStats, recommendedGoals, type GoalContext } from '../lib/metrics'
import { fmtLongDate } from '../lib/format'
import { quarterCheckpoints, weeksUntil } from '../lib/goals'
import { useHeatmapMetric } from '../hooks/useHeatmapMetric'
import { useVolumeGrain } from '../hooks/useVolumeGrain'
import StatCards from './StatCards'
import NextSession from './NextSession'
import SessionLog from './SessionLog'
import ProgressChart from './ProgressChart'
import VolumeCard from './VolumeCard'
import FrequencyHeatmap from './FrequencyHeatmap'
import ThemeSwitcher from './ThemeSwitcher'

export default function Dashboard({ rows }: { rows: SetRow[] }) {
  const stats = useMemo(() => overallStats(rows), [rows])
  const { metric: heatmapMetric, setMetric: setHeatmapMetric } = useHeatmapMetric()
  const { grain: volumeGrain, setGrain: setVolumeGrain } = useVolumeGrain()

  // Make the next-session suggestion goal-aware against the recommended short-term
  // target (due at the next calendar quarter-end). Computed once here, then passed to
  // the chart and the card so their projection stays consistent.
  const suggestions = useMemo(() => {
    const target: Partial<Record<LiftKey, number>> = {}
    for (const lift of LIFTS) {
      target[lift.key] = recommendedGoals(rows, lift.key).short
    }
    const goalCtx: GoalContext = { target, weeksLeft: weeksUntil(quarterCheckpoints().horizonDate.short) }
    // Real calendar "now" so the detraining back-off reflects an actual layoff.
    return nextSessionSuggestion(rows, goalCtx, undefined, Date.now())
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        No workout data found in strong_workouts.csv.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Strength Training Progress
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Bench · Squat · Deadlift · Overhead Press &nbsp;·&nbsp; {fmtLongDate(stats.firstDate)} –{' '}
          {fmtLongDate(stats.lastDate)}
        </p>
      </header>

      {/* Two zones, in reading order. The glance strip answers "am I progressing" in a
          second; TODAY answers "what do I lift"; TREND is the reference you drill into.
          Session log sits beside Next session — it opens on the latest session, so the
          pair reads "here's what I did / here's what to do" without a duplicate card. */}
      <div className="space-y-4">
        <StatCards rows={rows} />

        {/* TODAY */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <NextSession rows={rows} suggestions={suggestions} />
          <SessionLog rows={rows} />
        </div>

        {/* TREND */}
        <ProgressChart rows={rows} suggestions={suggestions} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VolumeCard rows={rows} grain={volumeGrain} setGrain={setVolumeGrain} />
          <FrequencyHeatmap rows={rows} metric={heatmapMetric} setMetric={setHeatmapMetric} />
        </div>
      </div>

      <footer className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        <div className="mb-3 flex justify-center">
          <ThemeSwitcher />
        </div>
        <p style={{ color: 'var(--text-muted)' }}>Data exported from the Strong app.</p>
      </footer>
    </div>
  )
}
