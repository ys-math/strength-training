import { useMemo, useState } from 'react'
import type { LiftKey, SetRow } from '../lib/types'
import { nextSession, type Prescription } from '../lib/engine'
import { overallStats } from '../lib/metrics'
import { fmtLongDate } from '../lib/format'
import { fullRange, includesLatest, rowsInRange, trainingDays, type DateRange } from '../lib/dateRange'
import { useBandMetric } from '../hooks/useBandMetric'
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
  const { metric: bandMetric, setMetric: setBandMetric } = useBandMetric()
  const { grain: volumeGrain, setGrain: setVolumeGrain } = useVolumeGrain()

  const days = useMemo(() => trainingDays(rows), [rows])
  const [range, setRange] = useState<DateRange | null>(null)
  const active = range ?? fullRange(days)

  // The range filters CHARTS ONLY. The engine, the all-time records in the glance strip
  // and the heatmap's colour cut points all keep reading full history, so narrowing the
  // view can never change what you are told to lift.
  const visible = useMemo(() => rowsInRange(rows, active), [rows, active])

  const prescriptions = useMemo(() => {
    const list = nextSession(rows)
    return Object.fromEntries(list.map((p) => [p.lift, p])) as Record<LiftKey, Prescription>
  }, [rows])
  const prescriptionList = useMemo<Prescription[]>(
    () => Object.values(prescriptions),
    [prescriptions],
  )

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
          <NextSession rows={rows} prescriptions={prescriptionList} />
          <SessionLog rows={rows} />
        </div>

        {/* TREND */}
        {/* The span control lives inside this card, but drives all four charts. One control
            rather than one per card: the charts count different things (training days, ISO
            weeks, one lift's sessions), so per-card index sliders could never agree on a
            period. Dates are the one unit they share. */}
        <ProgressChart
          rows={visible}
          prescriptions={prescriptions}
          showProjection={includesLatest(active, days)}
          days={days}
          range={active}
          setRange={setRange}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <VolumeCard rows={visible} allRows={rows} grain={volumeGrain} setGrain={setVolumeGrain} />
          <FrequencyHeatmap rows={visible} allRows={rows} metric={bandMetric} setMetric={setBandMetric} />
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
