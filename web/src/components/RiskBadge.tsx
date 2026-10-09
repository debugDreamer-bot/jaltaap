import { useTranslation } from 'react-i18next'
import { FLOOD_ICON, HEAT_ICON } from '../lib/icons'
import { FLOOD_COLORS, HEAT_COLORS, type FloodLevel, type HeatBand } from '../theme'
import { Icon } from './Icon'

/** Colour swatch + icon. Always rendered next to a word. */
export function Swatch({ fill, ink, icon, size = 28 }: { fill: string; ink: string; icon: Parameters<typeof Icon>[0]['name']; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md ring-1 ring-black/25"
      style={{ background: fill, color: ink, width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name={icon} size={Math.round(size * 0.72)} />
    </span>
  )
}

export function HeatBadge({ band, className = '' }: { band: HeatBand; className?: string }) {
  const { t } = useTranslation()
  const c = HEAT_COLORS[band]
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Swatch fill={c.fill} ink={c.ink} icon={HEAT_ICON[band]} />
      <span className="font-semibold">{t(`bands.${band}`)}</span>
    </span>
  )
}

export function FloodBadge({ level, className = '' }: { level: FloodLevel; className?: string }) {
  const { t } = useTranslation()
  const c = FLOOD_COLORS[level]
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Swatch fill={c.fill} ink={c.ink} icon={FLOOD_ICON[level]} />
      <span className="font-semibold">{t(`levels.${level}`)}</span>
    </span>
  )
}
