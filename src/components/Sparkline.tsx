// A tiny inline progress line for a stat card. Hand-rolled SVG (rather than a
// Recharts instance per card) keeps it light. The viewBox is a fixed 100×30 grid
// stretched to the card width via preserveAspectRatio="none"; `vector-effect:
// non-scaling-stroke` keeps the line an even weight despite that horizontal
// stretch.
export default function Sparkline({
  values,
  color,
  height = 30,
}: {
  values: number[]
  color: string
  height?: number
}) {
  if (values.length === 0) return null

  const n = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const y = (v: number) => 29 - ((v - min) / span) * 28 // pad within 1..29
  const x = (i: number) => (n === 1 ? 100 : (i / (n - 1)) * 100)

  // A single data point can't form a line — draw it flat across the full width.
  const line =
    n === 1 ? `0,${y(values[0])} 100,${y(values[0])}` : values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `0,30 ${line} 100,30`

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <polygon points={area} fill={color} fillOpacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
