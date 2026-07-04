import { useMemo } from 'react'
import { LIFTS, type LiftKey, type SetRow } from '../lib/types'
import { nextSessionSuggestion, overallStats, recommendedGoals, type GoalContext } from '../lib/metrics'
import { fmtLongDate } from '../lib/format'
import { quarterCheckpoints, weeksUntil } from '../lib/goals'
import { useMetricMode } from '../hooks/useMetricMode'
import StatCards from './StatCards'
import LatestWorkout from './LatestWorkout'
import NextSession from './NextSession'
import ProgressChart from './ProgressChart'
import VolumeChart from './VolumeChart'
import FrequencyHeatmap from './FrequencyHeatmap'
import LiftDetail from './LiftDetail'
import SessionLog from './SessionLog'
import ModeToggle from './ModeToggle'
import ThemeSwitcher from './ThemeSwitcher'

export default function Dashboard({ rows }: { rows: SetRow[] }) {
  const stats = useMemo(() => overallStats(rows), [rows])
  const { mode, setMode } = useMetricMode()

  // Make the next-session suggestion goal-aware against the recommended short-term
  // target (due at the next calendar quarter-end). Computed once here, then passed to
  // the chart and the card so their projection stays consistent.
  const suggestions = useMemo(() => {
    const target: Partial<Record<LiftKey, number>> = {}
    for (const lift of LIFTS) {
      target[lift.key] = recommendedGoals(rows, lift.key).short
    }
    const goalCtx: GoalContext = { target, weeksLeft: weeksUntil(quarterCheckpoints().horizonDate.short) }
    return nextSessionSuggestion(rows, goalCtx)
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
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Strength Training Progress
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Bench · Squat · Deadlift · Overhead Press &nbsp;·&nbsp; {fmtLongDate(stats.firstDate)} –{' '}
            {fmtLongDate(stats.lastDate)}
          </p>
        </div>
        <ModeToggle mode={mode} setMode={setMode} />
      </header>

      <div className="space-y-4">
        <StatCards rows={rows} mode={mode} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LatestWorkout rows={rows} />
          <NextSession rows={rows} suggestions={suggestions} />
        </div>
        <ProgressChart rows={rows} mode={mode} suggestions={suggestions} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VolumeChart rows={rows} />
          <FrequencyHeatmap rows={rows} />
        </div>
        <LiftDetail rows={rows} />
        <SessionLog rows={rows} />
      </div>

      <footer className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        <div className="mb-3 flex justify-center">
          <ThemeSwitcher />
        </div>
        <p style={{ color: 'var(--text-muted)' }}>
          Estimated 1RM uses the Epley formula (weight × (1 + reps/30)). Data exported from the Strong app.
        </p>
      </footer>
    </div>
  )
}
