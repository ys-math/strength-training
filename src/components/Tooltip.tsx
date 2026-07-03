import type { TooltipProps } from 'recharts'

// Shared dark-surface tooltip. Values wear text ink; a color chip carries identity.
export default function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: TooltipProps<number, string> & {
  labelFormatter?: (label: string) => string
  valueFormatter?: (value: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: 'var(--page)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="mb-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
        {labelFormatter ? labelFormatter(String(label)) : String(label)}
      </div>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: p.color }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{p.name}</span>
            <span className="ml-auto tabular-nums font-medium">
              {valueFormatter ? valueFormatter(Number(p.value)) : p.value}
            </span>
          </div>
        ))}
    </div>
  )
}
