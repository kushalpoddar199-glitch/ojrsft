// All user-facing times are UK local; the API speaks UTC.
const TZ = 'Europe/London'

const dayTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
const shortDay = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })
const hourOnly = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export const fmtDateTime = (iso: string) => dayTime.format(new Date(iso))
export const fmtDay = (iso: string) => shortDay.format(new Date(iso))
export const fmtHour = (iso: string) => hourOnly.format(new Date(iso))

export function fmtMW(v: number | null | undefined, signed = false): string {
  if (v == null) return '—'
  const s = nf.format(Math.round(v))
  return signed && v > 0 ? `+${s}` : s
}

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(digits)}%`

/** A 'YYYY-MM-DD' calendar date rendered without a timezone shift. */
export function fmtCalendarDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  })
}
