import { useMemo } from 'react'
import type { SetRow } from '../lib/types'
import { overallStats } from '../lib/metrics'
import { fmtLongDate } from '../lib/format'
import StatCards from './StatCards'
import E1RMChart from './E1RMChart'
import VolumeChart from './VolumeChart'
import FrequencyHeatmap from './FrequencyHeatmap'
import LiftDetail from './LiftDetail'
import ThemeSwitcher from './ThemeSwitcher'

export default function Dashboard({ rows }: { rows: SetRow[] }) {
  const stats = useMemo(() => overallStats(rows), [rows])

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
        <ThemeSwitcher />
      </header>

      <div className="space-y-4">
        <StatCards rows={rows} />
        <E1RMChart rows={rows} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VolumeChart rows={rows} />
          <FrequencyHeatmap rows={rows} />
        </div>
        <LiftDetail rows={rows} />
      </div>

      <footer className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Estimated 1RM uses the Epley formula (weight × (1 + reps/30)). Data exported from the Strong app.
      </footer>
    </div>
  )
}
