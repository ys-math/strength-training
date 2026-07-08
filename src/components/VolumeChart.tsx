import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LIFTS } from '../lib/types'
import { weeklyVolume } from '../lib/metrics'
import { fmtTonnage } from '../lib/format'
import type { SetRow } from '../lib/types'
import ChartCard from './ChartCard'
import ChartTooltip from './Tooltip'

export default function VolumeChart({ rows }: { rows: SetRow[] }) {
  const data = useMemo(() => weeklyVolume(rows), [rows])
  const lastKey = LIFTS[LIFTS.length - 1].key

  return (
    <ChartCard title="Weekly volume" subtitle="Working tonnage (weight × reps), warmups excluded">
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="20%">
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--baseline)"
            />
            <YAxis
              width={44}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--baseline)"
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}t` : `${v}`)}
            />
            <Tooltip
              cursor={{ fill: 'var(--hover-tint)' }}
              content={<ChartTooltip valueFormatter={fmtTonnage} />}
            />
            {LIFTS.map((lift) => (
              <Bar
                key={lift.key}
                dataKey={lift.key}
                name={lift.label}
                stackId="vol"
                fill={lift.color}
                stroke="var(--surface-1)"
                strokeWidth={1}
                radius={lift.key === lastKey ? [4, 4, 0, 0] : undefined}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
