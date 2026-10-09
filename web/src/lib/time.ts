// All API times are ISO 8601 with +05:30. We display them in IST regardless of the
// viewer's device time zone.
const TZ = 'Asia/Kolkata'

function locale(lang: string) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN'
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Thu 9 Oct, 17:00" */
export function formatHour(iso: string | null | undefined, lang: string): string {
  const d = parse(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

/** "9 Oct 2026, 17:05" */
export function formatDateTime(iso: string | null | undefined, lang: string): string {
  const d = parse(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

/** Whole hours between two API timestamps (b - a), or null if either is invalid. */
export function hoursBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const da = parse(a)
  const db = parse(b)
  if (!da || !db) return null
  return Math.round((db.getTime() - da.getTime()) / 3_600_000)
}

export function ageHours(iso: string | null | undefined, now = Date.now()): number | null {
  const d = parse(iso)
  if (!d) return null
  return (now - d.getTime()) / 3_600_000
}

/** ISO string with +05:30 offset for "now minus h hours", used as a query parameter. */
export function istIsoHoursAgo(h: number, now = Date.now()): string {
  const t = new Date(now - h * 3_600_000 + 5.5 * 3_600_000)
  return t.toISOString().replace(/\.\d{3}Z$/, '+05:30')
}
