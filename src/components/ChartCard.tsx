import type { ReactNode } from 'react'

// A titled surface that wraps a chart. Keeps chrome consistent across the board.
export default function ChartCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section
      className="flex h-full flex-col rounded-2xl p-3 sm:p-4"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
      {/* min-h-0 so a scrolling child (SessionLog) can shrink below its content height
          and stretch to the row instead of blowing the card out. */}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
