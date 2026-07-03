import { useMemo } from 'react'
import { dailyActivity, frequencyStats, overallStats, sessionDetails } from '../lib/metrics'
import { fmtLongDate, shortExerciseName } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'

const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)']

// Working-set count → sequential bucket (single blue hue, light→dark).
function bucket(count: number): number {
  if (count <= 0) return 0
  if (count <= 4) return 1
  if (count <= 9) return 2
  if (count <= 14) return 3
  return 4
}

function keyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FrequencyHeatmap({ rows }: { rows: SetRow[] }) {
  const { weeks, stats } = useMemo(() => {
    const activity = dailyActivity(rows)
    const stats = overallStats(rows)
    if (!stats.firstDate) return { weeks: [] as { key: string; count: number; inRange: boolean }[][], stats }

    const first = new Date(stats.firstDate)
    const last = new Date(stats.lastDate)
    // Back up to Monday of the first week.
    const start = new Date(first)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    // Advance to Sunday of the last week.
    const end = new Date(last)
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7))

    const weeks: { key: string; count: number; inRange: boolean }[][] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const col: { key: string; count: number; inRange: boolean }[] = []
      for (let i = 0; i < 7; i++) {
        const k = keyOf(cursor)
        col.push({ key: k, count: activity.get(k) ?? 0, inRange: cursor >= first && cursor <= last })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(col)
    }
    return { weeks, stats }
  }, [rows])

  const freq = useMemo(() => frequencyStats(rows), [rows])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof sessionDetails>[number]>()
    for (const s of sessionDetails(rows)) map.set(s.dateKey, s)
    return map
  }, [rows])

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', '']
  const chips: { label: string; value: string }[] = [
    { label: 'Avg / week', value: `${freq.avgSessionsPerWeek}` },
    { label: 'Most active', value: freq.mostActiveWeekday },
    { label: 'This week', value: `${freq.sessionsThisWeek}` },
  ]

  return (
    <ChartCard
      title="Training frequency"
      subtitle={`${stats.totalSessions} sessions · ${stats.totalWorkingSets} working sets`}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="grid grid-cols-3 gap-2">
          {chips.map((c) => (
            <div key={c.label} className="rounded-lg px-2 py-1.5" style={{ border: '1px solid var(--border)' }}>
              <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {c.value}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {c.label}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto py-1">
          <div className="flex gap-2">
            <div className="flex flex-col gap-[3px] pr-1 pt-[2px]">
              {dayLabels.map((d, i) => (
                <div key={i} className="h-[13px] text-[10px] leading-[13px]" style={{ color: 'var(--text-muted)' }}>
                  {d}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {weeks.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-[3px]">
                  {col.map((cell) => {
                    const session = cell.inRange ? sessionsByDate.get(cell.key) : undefined
                    return (
                      <div key={cell.key} className="group relative">
                        <div
                          className="h-[13px] w-[13px] rounded-sm"
                          style={{
                            background: cell.inRange ? SEQ[bucket(cell.count)] : 'transparent',
                            outline: cell.count > 0 ? '1px solid var(--border)' : 'none',
                          }}
                        />
                        {cell.inRange && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 group-hover:block">
                            <div
                              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg"
                              style={{ background: 'var(--page)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                            >
                              <div className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {fmtLongDate(cell.key)}
                              </div>
                              <div>
                                {cell.count} working set{cell.count === 1 ? '' : 's'}
                              </div>
                              {session && session.exercises.some((e) => e.workingSets > 0) && (
                                <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                  {session.exercises
                                    .filter((e) => e.workingSets > 0)
                                    .map((e) => `${shortExerciseName(e.exercise)}×${e.workingSets}`)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>Less</span>
          {SEQ.map((c, i) => (
            <span key={i} className="h-[11px] w-[11px] rounded-sm" style={{ background: c, outline: '1px solid var(--border)' }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </ChartCard>
  )
}
