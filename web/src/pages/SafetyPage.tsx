// "My safety": the personal profile, live location warnings and notifications. Everything here is
// saved only on this device (lib/settings.ts); the profile flags go with /now and /chat requests.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProfileFlag } from '../api/types'
import { Icon } from '../components/Icon'
import { currentLang } from '../i18n'
import { openChat } from '../lib/chat'
import type { IconName } from '../lib/icons'
import { useLiveSafety, type LiveStatus } from '../lib/liveSafety'
import { notifyState, requestNotify, type NotifyState } from '../lib/notify'
import { clipToShift, formatWindows, reasonKey } from '../lib/personal'
import { PROFILE_FLAGS, resetSettings, updateSettings, useSettings } from '../lib/settings'
import { SEVERITY_STYLE, describeWarning } from '../lib/warnings'
import { AQI_COLORS, GLASSES_PER_HOUR, HEAT_COLORS, isHeatBand, type HeatBand } from '../theme'

const FLAG_ICON: Record<ProfileFlag, IconName> = {
  heavy_work: 'hammer',
  age_60_plus: 'crew',
  pregnant: 'shield',
  chronic_illness: 'info',
  not_acclimatised: 'sun',
}

function Card({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-xl font-extrabold">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon name={icon} size={22} /></span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Switch({ on, label, onChange, disabled = false }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand' : 'bg-line'}`}
    >
      <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  )
}

const STATUS_KEY: Record<LiveStatus, string> = {
  off: 'me.live.off',
  locating: 'me.live.locating',
  on: 'me.live.on',
  denied: 'chat.locationDenied',
  unavailable: 'chat.locationUnavailable',
  unsupported: 'chat.locationUnsupported',
  outside: 'me.live.outside',
  error: 'me.live.error',
}

function LiveCard() {
  const { t } = useTranslation()
  const lang = currentLang()
  const { live } = useSettings()
  const { status, now, warnings, checkedAt, refresh } = useLiveSafety()
  const time = checkedAt ? new Date(checkedAt).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' }) : ''
  const hour = now?.now
  const band = hour && isHeatBand(hour.band) ? hour.band : null

  return (
    <Card icon="location" title={t('me.live.title')}>
      <div className="flex items-start gap-4">
        <p className="flex-1 text-muted">{t('me.live.body')}</p>
        <Switch on={live} label={t('me.live.title')} onChange={(v) => updateSettings({ live: v })} />
      </div>
      {live && (
        <div className="mt-4 space-y-4">
          <p role="status" className={`flex items-center gap-2 font-semibold ${status === 'on' ? 'text-[#237032]' : ''}`}>
            {status === 'on' && <span className="inline-block motion-safe:animate-pulse h-2.5 w-2.5 rounded-full bg-[#2f9e44]" aria-hidden="true" />}
            {t(STATUS_KEY[status], { time })}
          </p>
          {hour && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {band && (
                <div className="rounded-2xl p-3" style={{ background: HEAT_COLORS[band].fill, color: HEAT_COLORS[band].ink }}>
                  <p className="text-[13px] font-semibold opacity-90">{t('me.live.heatNow')}</p>
                  <p className="text-lg font-extrabold">{t(`bands.${band}`).split(' · ')[0]} · {Math.round(hour.temp_c)}°C</p>
                </div>
              )}
              {now?.air && (
                <div className="rounded-2xl p-3" style={{ background: AQI_COLORS[now.air.category].fill, color: AQI_COLORS[now.air.category].ink }}>
                  <p className="text-[13px] font-semibold opacity-90">{t('me.live.airNow')}</p>
                  <p className="text-lg font-extrabold">{t(`aqi.${now.air.category}`)} · {now.air.aqi}</p>
                </div>
              )}
              <div className="rounded-2xl bg-canvas p-3">
                <p className="text-[13px] font-semibold text-muted">{t('me.live.rainNext')}</p>
                <p className="text-lg font-extrabold">{(hour.rain_next_3h_mm ?? 0).toFixed(1)} mm</p>
              </div>
              {now?.uv?.now != null && (
                <div className="rounded-2xl bg-canvas p-3">
                  <p className="text-[13px] font-semibold text-muted">{t('me.live.uvNow')}</p>
                  <p className="text-lg font-extrabold">{now.uv.now.toFixed(1)}</p>
                </div>
              )}
            </div>
          )}
          {status === 'on' && (
            warnings.length ? (
              <ul className="space-y-2">
                {warnings.map((w) => {
                  const text = describeWarning(w, t)
                  const s = SEVERITY_STYLE[w.severity]
                  return (
                    <li key={`${w.hazard}:${w.level}`} className="flex gap-3 rounded-2xl border-2 p-3" style={{ background: s.bg, color: s.ink, borderColor: s.ring }}>
                      <Icon name={text.icon} size={24} className="mt-0.5 shrink-0" />
                      <p><b>{text.title}: </b>{text.headline} <span className="font-semibold">{text.action}</span></p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="flex items-center gap-2 rounded-2xl bg-[#ebfbee] p-3 font-semibold text-[#1b5e20]">
                <Icon name="check" size={22} />{t('me.live.clear')}
              </p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={refresh} className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line px-4 font-semibold">
              <Icon name="refresh" size={18} />{t('me.live.checkNow')}
            </button>
            <button type="button" onClick={() => openChat(t('me.askPrompt'))} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 font-bold text-white">
              <Icon name="chat" size={18} />{t('me.ask')}
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

const RANK: Record<HeatBand, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 }

/** Today's plan for this person at this place: their band against most people's, why, and their shift. */
function DayCard() {
  const { t } = useTranslation()
  const { flags, shift } = useSettings()
  const { now } = useLiveSafety()
  if (!now) return null
  const today = now.today
  const band = today.day_band
  const base = today.base_day_band && isHeatBand(today.base_day_band) ? today.base_day_band : band
  const reasons = today.escalations ?? []
  const heavy = clipToShift(today.heavy_work_windows, shift)
  const avoid = clipToShift(today.avoid_windows, shift)
  const noon = today.noon_pause && clipToShift([today.noon_pause], shift).length ? today.noon_pause : null
  const hourBand = now.now && isHeatBand(now.now.band) ? now.now.band : band
  const word = (b: HeatBand) => t(`bands.${b}`)
  const lines: Array<[string, string]> = []
  lines.push(['clock', shift ? t('me.day.shift', { from: shift.start, to: shift.end }) : t('me.day.noShift')])
  if (heavy.length) lines.push(['hammer', t('me.day.heavy', { w: formatWindows(heavy) })])
  else if (avoid.length) lines.push(['hammer', t('me.day.noHeavy')])
  if (avoid.length) lines.push(['band-orange', t('me.day.avoid', { w: formatWindows(avoid) })])
  if (noon) lines.push(['sun', t('me.day.noon', { from: noon.from, to: noon.to })])
  lines.push(['glass', t('me.day.water', { count: GLASSES_PER_HOUR[hourBand] })])
  if (today.peak_hour) lines.push(['thermometer', t('me.day.peak', { time: today.peak_hour.time.slice(11, 16), temp: Math.round(today.peak_hour.temp_c) })])

  return (
    <Card icon="clock" title={t('me.day.title')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl p-4" style={{ background: HEAT_COLORS[band].fill, color: HEAT_COLORS[band].ink }}>
          <p className="text-[13px] font-semibold opacity-90">{t('me.day.forYou')}</p>
          <p className="text-2xl font-extrabold">{word(band)}</p>
        </div>
        {base !== band && (
          <div className="rounded-2xl border-2 border-dashed border-line p-4">
            <p className="text-[13px] font-semibold text-muted">{t('me.day.forMost')}</p>
            <p className="text-2xl font-extrabold text-muted">{word(base)}</p>
          </div>
        )}
      </div>
      {reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t('me.day.because')}</span>
          {reasons.map((r) => (
            <span key={r} className="rounded-full bg-brand/10 px-3 py-1 text-[14px] font-semibold text-brand">{t(reasonKey(r))}</span>
          ))}
        </div>
      )}
      {flags.length > 0 && base === band && RANK[base] === 0 && <p className="mt-3 text-muted">{t('me.day.onlyWarm')}</p>}
      {flags.length === 0 && <p className="mt-3 text-muted">{t('me.day.noProfile')}</p>}
      <ul className="mt-4 space-y-2">
        {lines.map(([icon, text]) => (
          <li key={text} className="flex items-start gap-3">
            <Icon name={icon as IconName} size={22} className="mt-0.5 shrink-0 text-brand" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ShiftSetting() {
  const { t } = useTranslation()
  const { shift } = useSettings()
  const set = (patch: Partial<{ start: string; end: string }>) => shift && updateSettings({ shift: { ...shift, ...patch } })
  return (
    <div className={`mt-3 rounded-2xl border-2 p-3 ${shift ? 'border-brand bg-brand/5' : 'border-line'}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={Boolean(shift)} onChange={(e) => updateSettings({ shift: e.target.checked ? { start: '08:00', end: '18:00' } : null })} className="mt-1 h-5 w-5 shrink-0 accent-[#0b3d5c]" />
        <Icon name="clock" size={22} className="mt-0.5 shrink-0 text-brand" />
        <span>
          <b className="block">{t('me.shift.title')}</b>
          <span className="text-muted">{t('me.shift.body')}</span>
        </span>
      </label>
      {shift && (
        <div className="mt-3 flex flex-wrap gap-3 ps-8">
          <label className="flex items-center gap-2 font-semibold">
            {t('me.shift.start')}
            <input type="time" value={shift.start} onChange={(e) => e.target.value && set({ start: e.target.value })} className="min-h-11 rounded-lg border-2 border-line px-2" />
          </label>
          <label className="flex items-center gap-2 font-semibold">
            {t('me.shift.end')}
            <input type="time" value={shift.end} onChange={(e) => e.target.value && set({ end: e.target.value })} className="min-h-11 rounded-lg border-2 border-line px-2" />
          </label>
        </div>
      )}
    </div>
  )
}

function ProfileCard() {
  const { t } = useTranslation()
  const { flags } = useSettings()
  const toggle = (f: ProfileFlag) =>
    updateSettings({ flags: flags.includes(f) ? flags.filter((x) => x !== f) : PROFILE_FLAGS.filter((x) => x === f || flags.includes(x)) })
  return (
    <Card icon="shield" title={t('me.profile.title')}>
      <p className="mb-4 text-muted">{t('me.profile.body')}</p>
      <ul className="space-y-2">
        {PROFILE_FLAGS.map((f) => {
          const on = flags.includes(f)
          return (
            <li key={f}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition-colors ${on ? 'border-brand bg-brand/5' : 'border-line'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(f)} className="mt-1 h-5 w-5 shrink-0 accent-[#0b3d5c]" />
                <Icon name={FLAG_ICON[f]} size={22} className="mt-0.5 shrink-0 text-brand" />
                <span>
                  <b className="block">{t(`me.flags.${f}.title`)}</b>
                  <span className="text-muted">{t(`me.flags.${f}.body`)}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <ShiftSetting />
    </Card>
  )
}

function NotifyCard() {
  const { t } = useTranslation()
  const { notify, live } = useSettings()
  const [perm, setPerm] = useState<NotifyState>(notifyState())
  const onChange = async (v: boolean) => {
    if (!v) return updateSettings({ notify: false })
    const p = await requestNotify()
    setPerm(p)
    updateSettings({ notify: p === 'granted' })
  }
  return (
    <Card icon="bell" title={t('me.notify.title')}>
      <div className="flex items-start gap-4">
        <p className="flex-1 text-muted">{t('me.notify.body')}</p>
        <Switch on={notify && perm === 'granted'} label={t('me.notify.title')} onChange={(v) => void onChange(v)} disabled={perm === 'unsupported' || perm === 'denied'} />
      </div>
      {perm === 'denied' && <p className="mt-3 font-semibold">{t('me.notify.denied')}</p>}
      {perm === 'unsupported' && <p className="mt-3 font-semibold">{t('me.notify.unsupported')}</p>}
      {notify && perm === 'granted' && !live && <p className="mt-3 font-semibold">{t('me.notify.needLive')}</p>}
    </Card>
  )
}

export default function SafetyPage() {
  const { t } = useTranslation()
  return (
    <div className="bg-canvas">
      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-8 pb-28 sm:px-6">
        <header>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/8 px-3 py-1 text-[15px] font-semibold text-brand ring-1 ring-brand/15">
            <Icon name="shield" size={14} />{t('me.eyebrow')}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('me.title')}</h1>
          <p className="mt-2 text-lg text-muted">{t('me.sub')}</p>
        </header>
        <LiveCard />
        <DayCard />
        <ProfileCard />
        <NotifyCard />
        <Card icon="phone" title={t('me.telegram.title')}>
          <ol className="list-decimal space-y-1 ps-5 text-muted">
            <li>{t('me.telegram.s1')}</li>
            <li>{t('me.telegram.s2')}</li>
            <li>{t('me.telegram.s3')}</li>
          </ol>
        </Card>
        <Card icon="info" title={t('me.privacy.title')}>
          <ul className="list-disc space-y-1 ps-5 text-muted">
            <li>{t('me.privacy.p1')}</li>
            <li>{t('me.privacy.p2')}</li>
            <li>{t('me.privacy.p3')}</li>
          </ul>
          <button type="button" onClick={resetSettings} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-[#c92a2a] px-4 font-semibold text-[#c92a2a]">
            <Icon name="close" size={18} />{t('me.privacy.reset')}
          </button>
        </Card>
      </div>
    </div>
  )
}
