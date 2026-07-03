// Display helpers shared across charts and cards.

export function fmtDate(dateKey: string): string {
  const d = new Date(dateKey)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function fmtLongDate(dateKey: string): string {
  const d = new Date(dateKey)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtKg(n: number): string {
  return `${Math.round(n * 10) / 10} kg`
}

export function fmtTonnage(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)} t`
  return `${Math.round(n)} kg`
}
