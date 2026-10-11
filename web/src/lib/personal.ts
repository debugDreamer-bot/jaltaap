// Personal views of a /now plan: the user's shift and the reasons their band is stricter.
type Window = { from: string; to: string }

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** The parts of each window that fall inside the shift. A shift past midnight is cut at 24:00. */
export function clipToShift(windows: Window[], shift: { start: string; end: string } | null): Window[] {
  if (!shift) return windows
  const s = minutes(shift.start)
  const e = minutes(shift.end) > s ? minutes(shift.end) : 24 * 60
  const out: Window[] = []
  for (const w of windows) {
    const a = Math.max(minutes(w.from), s)
    const b = Math.min(minutes(w.to === '00:00' ? '24:00' : w.to), e)
    if (b > a) out.push({ from: hhmm(a), to: hhmm(b) })
  }
  return out
}

/** i18n key for one escalation label ("hot_night", "profile:heavy_work"); ':' is i18next's separator. */
export const reasonKey = (label: string) => `me.why.${label.replace(':', '_')}`

export const formatWindows = (ws: Window[]) => ws.map((w) => `${w.from}–${w.to}`).join(', ')
