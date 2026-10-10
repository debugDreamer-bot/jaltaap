// Turns a /now response into the few facts a worker needs, and the sentences read aloud.
// Every number comes from the API; the wording is fixed copy from i18n.
import type { TFunction } from 'i18next'
import type { NowResponse } from '../api/types'
import { GLASSES_PER_HOUR, type HeatBand } from '../theme'

const RANK: Record<HeatBand, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 }

export interface WorkerPlan {
  band: HeatBand
  glasses: number
  heavyWindows: Array<{ from: string; to: string }>
  noonPause: { from: string; to: string } | null
  mask: boolean
  strongSun: boolean
  rain: boolean
  dayBand: HeatBand
}

export function workerPlan(n: NowResponse): WorkerPlan {
  const band = n.now?.band ?? n.today.day_band
  return {
    band,
    glasses: GLASSES_PER_HOUR[band],
    heavyWindows: n.today.heavy_work_windows,
    noonPause: n.today.noon_pause,
    mask: Boolean(n.air && ['POOR', 'VERY_POOR', 'SEVERE'].includes(n.air.category)),
    strongSun: Boolean(n.uv?.today_category && ['HIGH', 'VERY_HIGH', 'EXTREME'].includes(n.uv.today_category)),
    rain: Boolean(n.now?.area_flood_level && ['MEDIUM', 'HIGH', 'SEVERE', 'CONFIRMED'].includes(n.now.area_flood_level)),
    dayBand: n.today.day_band,
  }
}

export const worse = (a: HeatBand, b: HeatBand) => (RANK[a] >= RANK[b] ? a : b)

/** "8 to 11 and 4 to 7" style hour ranges, spoken naturally. */
function hourRange(w: { from: string; to: string }, t: TFunction): string {
  const h = (x: string) => String(Number(x.slice(0, 2)) % 24)
  return t('check.speak.range', { from: h(w.from), to: h(w.to) })
}

export function spokenLines(p: WorkerPlan, t: TFunction): string[] {
  const lines = [t(`check.verdict.${p.band}`)]
  if (p.heavyWindows.length) lines.push(t('check.speak.heavy', { ranges: p.heavyWindows.map((w) => hourRange(w, t)).join(t('check.speak.and')) }))
  else if (RANK[p.dayBand] >= 2) lines.push(t('check.speak.noHeavy'))
  if (p.noonPause) lines.push(t('check.speak.noon'))
  lines.push(t('check.speak.water', { count: p.glasses }))
  if (p.mask) lines.push(t('check.speak.mask'))
  if (p.strongSun) lines.push(t('check.speak.sun'))
  if (p.rain) lines.push(t('check.speak.rain'))
  if (p.band === 'RED' || p.band === 'ORANGE') lines.push(t('check.speak.emergency'))
  return lines
}

export function shareText(n: NowResponse, p: WorkerPlan, t: TFunction): string {
  const lines = spokenLines(p, t)
  const where = n.location.label || n.location.city || ''
  return `${t('check.shareTitle', { place: where })}\n${lines.join('\n')}\n${t('check.shareFooter')}`
}
