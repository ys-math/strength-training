import { useMemo } from 'react'
import csv from '../strong_workouts.csv?raw'
import { parseWorkouts } from './lib/parse'
import Dashboard from './components/Dashboard'

export default function App() {
  // The CSV is bundled at build time; replacing the root file + pushing is the
  // whole data-update workflow.
  const rows = useMemo(() => parseWorkouts(csv), [])
  return <Dashboard rows={rows} />
}
