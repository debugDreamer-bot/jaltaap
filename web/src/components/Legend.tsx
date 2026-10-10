import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FLOOD_ICON, HEAT_ICON } from '../lib/icons'
import { FLOOD_COLORS, FLOOD_LEVELS, HEAT_BANDS, HEAT_COLORS, RELIEF_COLORS, REPORT_COLOR, WATER_ISSUE_COLOR } from '../theme'
import { Icon } from './Icon'
import { Swatch } from './RiskBadge'

function Row({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-2 py-0.5">{children}</li>
}

export function Legend() {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="legend-title">
      <h2 id="legend-title" className="mb-1 text-lg font-bold">
        {t('legend.title')}
      </h2>
      <h3 className="mt-2 font-semibold text-muted">{t('legend.heatTitle')}</h3>
      <ul>
        {HEAT_BANDS.map((b) => (
          <Row key={b}>
            <Swatch fill={HEAT_COLORS[b].fill} ink={HEAT_COLORS[b].ink} icon={HEAT_ICON[b]} />
            <span>{t(`bands.${b}`)}</span>
          </Row>
        ))}
      </ul>
      <p className="text-muted">{t('legend.cellRain')}</p>
      <h3 className="mt-3 font-semibold text-muted">{t('legend.floodTitle')}</h3>
      <ul>
        {FLOOD_LEVELS.map((l) => (
          <Row key={l}>
            <Swatch fill={FLOOD_COLORS[l].fill} ink={FLOOD_COLORS[l].ink} icon={FLOOD_ICON[l]} />
            <span>{t(`levels.${l}`)}</span>
          </Row>
        ))}
        <Row>
          <span className="inline-flex w-7 shrink-0 items-end justify-center gap-0.5" aria-hidden="true">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#4dabf7] ring-1 ring-black/30" />
            <span className="inline-block h-5 w-5 rounded-full bg-[#4dabf7] ring-1 ring-black/30" />
          </span>
          <span>{t('legend.circleSize')}</span>
        </Row>
      </ul>
      <h3 className="mt-3 font-semibold text-muted">{t('legend.otherTitle')}</h3>
      <ul>
        <Row>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-ink" aria-hidden="true">
            <Icon name="underpass" size={18} />
          </span>
          <span>{t('legend.underpass')}</span>
        </Row>
        <Row>
          <Swatch fill={REPORT_COLOR.fill} ink={REPORT_COLOR.ink} icon="camera" />
          <span>{t('legend.report')}</span>
        </Row>
        <Row>
          <Swatch fill={WATER_ISSUE_COLOR.fill} ink={WATER_ISSUE_COLOR.ink} icon="tap" />
          <span>{t('legend.waterIssue')}</span>
        </Row>
        {(['cooling', 'water', 'hospital'] as const).map((k) => (
          <Row key={k}>
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                background: RELIEF_COLORS[k].fill,
                color: RELIEF_COLORS[k].ink,
                boxShadow: `0 0 0 2px ${k === 'hospital' ? RELIEF_COLORS[k].ink : '#ffffff'}, 0 0 0 3px rgb(0 0 0 / 0.3)`,
              }}
              aria-hidden="true"
            >
              <Icon name={k} size={18} />
            </span>
            <span>{t(`legend.${k}`)}</span>
          </Row>
        ))}
      </ul>
    </section>
  )
}
