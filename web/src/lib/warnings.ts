// Words for a live warning. The rules live in the backend (risk/warnings.py); this only renders them.
import type { TFunction } from 'i18next'
import type { LiveWarning } from '../api/types'
import type { IconName } from './icons'

export interface WarningText {
  title: string
  headline: string
  action: string
  icon: IconName
}

/** "Orange · High" → "Orange": the colour word is enough inside a sentence. */
const short = (label: string) => label.split(' · ')[0]
const num = (v: number | null | undefined, digits = 0) => (typeof v === 'number' ? v.toFixed(digits) : '?')

export function describeWarning(w: LiveWarning, t: TFunction): WarningText {
  const title = t(`live.severity.${w.severity}`)
  switch (w.hazard) {
    case 'heat':
      return { title, icon: 'thermometer', headline: t('live.heat', { band: short(t(`bands.${w.level}`)), temp: num(w.temp_c) }), action: t('live.heatDo') }
    case 'rain':
      return { title, icon: 'waves', headline: t('live.rain', { level: t(`levels.${w.level}`), rain: num(w.rain_mm, 1) }), action: t('live.rainDo') }
    case 'air':
      return {
        title,
        icon: 'mask',
        headline: t('live.air', { cat: t(`aqi.${w.level}`), aqi: num(w.aqi) }),
        action: w.severity === 1 ? t('live.airSensitiveDo') : t('live.airDo'),
      }
    default:
      return { title, icon: 'sun', headline: t('live.uv', { uv: num(w.uv_index, 1) }), action: t('live.uvDo') }
  }
}

/** Same key as the backend's top_key: the worst warning at severity 2+, or '' when all clear. */
export function topKey(warnings: LiveWarning[]): string {
  const top = warnings.find((w) => w.severity >= 2)
  return top ? `${top.hazard}:${top.level}` : ''
}

export const SEVERITY_STYLE: Record<1 | 2 | 3, { bg: string; ink: string; ring: string }> = {
  1: { bg: '#fff9db', ink: '#5c3c00', ring: '#fcc419' },
  2: { bg: '#fff4e6', ink: '#7a2e00', ring: '#f76707' },
  3: { bg: '#c92a2a', ink: '#ffffff', ring: '#a61e1e' },
}
