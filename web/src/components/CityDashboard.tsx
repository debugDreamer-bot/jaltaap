// Live dashboard for one place: heat now, today's safe hours, air (AQI estimate), sun (UV), rain,
// and the next 48 hours. Data from GET /now; every tile pairs colour with an icon and a word.
import { useTranslation } from 'react-i18next'
import { useNow } from '../lib/useNow'
import { currentLang } from '../i18n'
import { HEAT_ICON, FLOOD_ICON } from '../lib/icons'
import { formatDateTime } from '../lib/time'
import { AQI_COLORS, FLOOD_COLORS, HEAT_COLORS } from '../theme'
import { Icon } from './Icon'
import { Timeline48 } from './Timeline48'

function Tile({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-3.5">
      {accent && <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden="true" />}
      <p className="text-[15px] text-muted">{label}</p>
      {children}
    </div>
  )
}

export function CityDashboard({ lat, lon, label, compact = false }: { lat: number; lon: number; label?: string; compact?: boolean }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const st = useNow(lat, lon, label)

  if (st.s === 'loading')
    return (
      <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label={t('dash.loading')}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-line/50" />)}
      </div>
    )
  if (st.s === 'error') return <p role="alert" className="font-semibold">{t('dash.unavailable')}</p>
  const n = st.v
  const now = n.now
  const windows = n.today.heavy_work_windows
  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-5'}`}>
        {now && (
          <Tile label={t('dash.now')} accent={HEAT_COLORS[now.band].fill}>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ background: HEAT_COLORS[now.band].fill, color: HEAT_COLORS[now.band].ink }}>
                <Icon name={HEAT_ICON[now.band]} size={20} />
              </span>
              {t(`bands.${now.band}`)}
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">{now.temp_c.toFixed(0)}°C</p>
            <p className="text-[15px] text-muted">{t('dash.wetBulb', { wb: now.wet_bulb_c.toFixed(1), rh: now.rh })}</p>
          </Tile>
        )}
        <Tile label={t('dash.safeHours')} accent={HEAT_COLORS[n.today.day_band].fill}>
          <p className="mt-1 flex items-center gap-2 font-bold"><Icon name="hammer" size={20} />{t('dash.heavyWork')}</p>
          <p className="text-lg font-extrabold">{windows.length ? windows.map((w) => `${w.from}–${w.to}`).join(', ') : t('dash.noHeavy')}</p>
          {n.today.noon_pause && <p className="text-[15px] text-muted">{t('dash.noonPause', n.today.noon_pause)}</p>}
        </Tile>
        {n.air && (
          <Tile label={t('dash.air')} accent={AQI_COLORS[n.air.category].fill}>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ background: AQI_COLORS[n.air.category].fill, color: AQI_COLORS[n.air.category].ink }}>
                <Icon name={['POOR', 'VERY_POOR', 'SEVERE'].includes(n.air.category) ? 'mask' : 'air'} size={20} />
              </span>
              {t(`aqi.${n.air.category}`)}
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">{n.air.aqi} <span className="text-[15px] font-semibold text-muted">AQI*</span></p>
            <p className="text-[15px] text-muted">{t('dash.aqiEstimate')}</p>
          </Tile>
        )}
        {n.uv && n.uv.today_max !== null && (
          <Tile label={t('dash.sun')} accent="#fab005">
            <p className="mt-1 flex items-center gap-2 text-lg font-bold"><Icon name="sun" size={22} />{t(`uv.${n.uv.today_category}`)}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">UV {n.uv.today_max}</p>
            <p className="text-[15px] text-muted">{t('dash.uvPeak')}</p>
          </Tile>
        )}
        {now && now.area_flood_level && (
          <Tile label={t('dash.rain')} accent={FLOOD_COLORS[now.area_flood_level].fill}>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ background: FLOOD_COLORS[now.area_flood_level].fill, color: FLOOD_COLORS[now.area_flood_level].ink }}>
                <Icon name={FLOOD_ICON[now.area_flood_level]} size={20} />
              </span>
              {t(`levels.${now.area_flood_level}`)}
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight">{now.rain_next_3h_mm ?? 0} mm</p>
            <p className="text-[15px] text-muted">{t('dash.rainNext')}</p>
          </Tile>
        )}
      </div>
      <div className="rounded-2xl border border-line bg-white p-3.5">
        <p className="mb-1 font-bold">{t('dash.next48')}</p>
        <Timeline48 hours={n.hours} />
      </div>
      <p className="text-[15px] text-muted">
        {t('data.updated', { time: formatDateTime(n.data_updated_at, lang) })} · {t('dash.sources')}
      </p>
    </div>
  )
}
