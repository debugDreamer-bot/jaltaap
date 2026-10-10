// "Check my area": the worker view. Built for people who read slowly or not at all:
// one giant colour + icon + few-word answer, picture cards instead of paragraphs, a button that
// reads everything aloud in Hindi, and a huge Call 112 button. The motion (animated sky, work
// clock, filling glasses) is CSS only, with no animation library and no map, so it stays fast on a budget phone.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCities, getHeat, getRelief } from '../api/endpoints'
import type { City, NowResponse, ReliefPoint } from '../api/types'
import { Icon } from '../components/Icon'
import { ShiftReminders } from '../components/ShiftReminders'
import { RouteSketch, Reveal, SkyScene, SkySkeleton, SoundBars, WaterGlass, WordReveal, WorkDial } from '../components/WorkerVisuals'
import { SKY, spot, useCountUp } from '../lib/workerMotion'
import { Link } from '../router'
import { useNow } from '../lib/useNow'
import { USE_MOCK, config } from '../config'
import { currentLang } from '../i18n'
import { HEAT_ICON, type IconName } from '../lib/icons'
import { geoErrorCode, getLocation } from '../lib/geo'
import { hasVoice, speak, stopSpeaking } from '../lib/speak'
import { readStore, writeStore } from '../lib/storage'
import { formatHour } from '../lib/time'
import { shareText, spokenLines, workerPlan } from '../lib/workerPlan'
import { AQI_COLORS, HEAT_COLORS, type HeatBand } from '../theme'

type Place = { lat: number; lon: number; label: string }
const PLACE_KEY = 'jaltaap.check.place'
const RANK: Record<HeatBand, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 }

function savedPlace(): Place | null {
  try {
    const p = JSON.parse(readStore(PLACE_KEY) ?? 'null')
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null
  } catch {
    return null
  }
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** India time now, refreshed every 30 seconds: hour as a fraction (14.5 = 2:30 pm) and "14:30". */
function useIstClock() {
  const read = () => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date()).map((x) => [x.type, x.value]),
    )
    return { hour: Number(p.hour) + Number(p.minute) / 60, label: `${p.hour}:${p.minute}` }
  }
  const [c, setC] = useState(read)
  useEffect(() => {
    const id = setInterval(() => setC(read()), 30_000)
    return () => clearInterval(id)
  }, [])
  return c
}

/** Live band and temperature per covered city, for the city buttons. Fail-soft: empty on error. */
function useCityHeat(): Record<string, { band: HeatBand; temp: number }> {
  const [m, setM] = useState<Record<string, { band: HeatBand; temp: number }>>({})
  useEffect(() => {
    const ctrl = new AbortController()
    getHeat(undefined, ctrl.signal)
      .then((h) => {
        const out: Record<string, { band: HeatBand; temp: number }> = {}
        for (const c of h.cells) {
          if (!c.city) continue
          const cur = out[c.city]
          const temp = c.temp_c ?? -99
          if (!cur) out[c.city] = { band: c.band, temp }
          else out[c.city] = { band: RANK[c.band] > RANK[cur.band] ? c.band : cur.band, temp: Math.max(cur.temp, temp) }
        }
        setM(out)
      })
      .catch(() => setM({}))
    return () => ctrl.abort()
  }, [])
  return m
}

// ---------------- choose a place ----------------
function PlacePicker({ onPick }: { onPick: (p: Place) => void }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const [cities, setCities] = useState<City[]>([])
  const heat = useCityHeat()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = (showAll ? cities : cities.filter((c) => c.tier !== 'city')).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.name_hi.includes(q.trim()),
  )

  useEffect(() => {
    getCities().then((r) => setCities(r.cities ?? [])).catch(() => setCities([]))
  }, [])

  const useGps = async () => {
    setBusy(true)
    setMsg('')
    try {
      const c = await getLocation()
      onPick({ lat: c.lat, lon: c.lon, label: t('check.myPlace') })
    } catch (e) {
      const code = geoErrorCode(e)
      setMsg(t(code === 'denied' ? 'chat.locationDenied' : code === 'unsupported' ? 'chat.locationUnsupported' : 'chat.locationUnavailable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-10">
      <section className="jt-grid-bg relative overflow-hidden bg-night text-white">
        <div className="jt-blob absolute -top-24 -left-20 h-72 w-72 rounded-full bg-heat/40 blur-3xl" aria-hidden="true" />
        <div className="jt-blob absolute -right-24 -bottom-28 h-80 w-80 rounded-full bg-water/40 blur-3xl" style={{ animationDelay: '-7s' }} aria-hidden="true" />
        <div className="relative mx-auto max-w-xl px-5 pt-10 pb-20">
          <p className="jt-glass jt-rise mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-semibold text-white/90">
            <span className="relative inline-flex h-2.5 w-2.5"><span className="jt-radar absolute inset-0 rounded-full bg-[#69db7c]" /><span className="relative h-2.5 w-2.5 rounded-full bg-[#69db7c]" /></span>
            {t('check.liveBadge')}
          </p>
          <h1 className="text-[2.4rem] leading-[1.1] font-extrabold tracking-tight">
            <WordReveal text={t('check.pickTitle')} className="jt-gradient-text" />
          </h1>
          <p className="jt-rise mt-3 text-lg text-white/75" style={{ animationDelay: '300ms' }}>{t('check.pickSub')}</p>
          <button type="button" onClick={useGps} disabled={busy}
            className="jt-shine jt-rise group mt-7 flex min-h-20 w-full items-center gap-4 rounded-3xl bg-white px-5 text-left text-2xl font-extrabold text-brand shadow-[0_20px_60px_-15px_rgb(28_126_214/0.7)] active:scale-[0.98] disabled:opacity-80"
            style={{ animationDelay: '450ms' }}>
            <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
              <span className="jt-radar absolute inset-0 rounded-2xl bg-water" aria-hidden="true" />
              <span className="jt-radar absolute inset-0 rounded-2xl bg-water" style={{ animationDelay: '1.2s' }} aria-hidden="true" />
              <Icon name="location" size={32} className="relative" />
            </span>
            <span className="flex-1">{busy ? t('chat.locating') : t('check.useGps')}</span>
            <Icon name="arrow-right" size={28} className="transition-transform group-hover:translate-x-1" />
          </button>
          {msg && <p role="alert" className="mt-3 rounded-2xl bg-white/10 p-3 text-lg font-semibold">{msg}</p>}
        </div>
        <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-px h-10 w-full text-canvas" aria-hidden="true">
          <path fill="currentColor" d="M0 40V22 Q 100 0 200 18 T 400 12 V40z" />
        </svg>
      </section>

      <div className="mx-auto -mt-6 max-w-xl space-y-5 px-4">
        <p className="relative text-xl font-bold">{t('check.orCity')}</p>
        {showAll && (
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('check.searchCity')} aria-label={t('check.searchCity')}
            className="jt-rise min-h-14 w-full rounded-2xl border-2 border-line bg-white px-4 text-xl" />
        )}
        <ul className="grid grid-cols-2 gap-3">
          {shown.map((c, i) => {
            const h = heat[c.id]
            const col = h ? HEAT_COLORS[h.band] : null
            return (
              <li key={c.id} className="jt-rise" style={{ animationDelay: `${Math.min(i, 14) * 45}ms` }}>
                <button type="button" onPointerMove={spot} onClick={() => onPick({ lat: c.lat, lon: c.lon, label: lang === 'hi' ? c.name_hi : c.name })}
                  className="jt-spot group flex min-h-20 w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border-2 border-line bg-white px-4 py-2 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg active:scale-[0.98]">
                  <span className="min-w-0">
                    <span className="block truncate text-xl font-bold" lang="hi">{c.name_hi}</span>
                    <span className="block truncate text-muted">{c.name}</span>
                  </span>
                  {h && col && (
                    <span className="flex shrink-0 flex-col items-center rounded-xl px-2 py-1 text-sm font-extrabold" style={{ background: col.fill, color: col.ink }}>
                      <Icon name={HEAT_ICON[h.band]} size={18} />
                      {h.temp > -99 ? `${Math.round(h.temp)}°` : ''}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {!showAll && cities.length > 11 && (
          <button type="button" onClick={() => setShowAll(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand bg-white text-xl font-bold text-brand transition hover:bg-brand hover:text-white">
            <Icon name="city" size={24} />{t('check.moreCities', { n: cities.length - 11 })}
          </button>
        )}
        <Link href="/unwell" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-[#c92a2a] bg-[#fff5f5] text-lg font-bold text-[#c92a2a]">
          <span className="jt-sway inline-flex"><Icon name="faint" size={26} /></span>{t('check.unwell')}
        </Link>
      </div>
    </div>
  )
}

/** Today, tomorrow and the day after as three cards that flip in: colour + icon + safe heavy-work hours. */
function Outlook({ n }: { n: NowResponse }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const days = n.days ?? []
  if (days.length < 2) return null
  const label = (date: string, i: number) =>
    i === 0 ? t('crew.day0') : i === 1 ? t('crew.day1') : new Date(`${date}T12:00:00+05:30`).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })
  return (
    <Reveal as="section">
      <SectionTitle icon="clock">{t('check.outlook')}</SectionTitle>
      <ul className="grid grid-cols-3 gap-2.5 [perspective:900px]">
        {days.map((d, i) => {
          const sky = SKY[d.day_band]
          const ink = HEAT_COLORS[d.day_band].ink
          return (
            <li key={d.date} className={`jt-flip overflow-hidden rounded-3xl bg-white shadow-md ${i === 0 ? 'ring-4 ring-brand/20' : 'ring-1 ring-line'}`} style={{ animationDelay: `${150 + i * 160}ms` }}>
              <div className="relative flex flex-col items-center gap-1 overflow-hidden px-2 pt-3 pb-4" style={{ backgroundImage: `linear-gradient(160deg, ${sky[0]}, ${sky[2]})`, color: ink }}>
                <span className="text-[15px] font-bold">{label(d.date, i)}</span>
                <span className="jt-bob inline-flex" style={{ animationDelay: `${i * 0.4}s` }}><Icon name={HEAT_ICON[d.day_band]} size={38} /></span>
                {d.max_temp_c !== null && <span className="text-2xl font-black tabular-nums">{Math.round(d.max_temp_c)}°</span>}
              </div>
              <div className="flex items-start gap-1 p-2.5 text-[15px] leading-tight">
                <Icon name="hammer" size={18} className="mt-0.5 shrink-0" />
                <span className="font-semibold">
                  {d.heavy_work_windows.length ? d.heavy_work_windows.map((w) => `${Number(w.from.slice(0, 2))}–${Number(w.to.slice(0, 2))}`).join(', ') : t('check.noHeavyShort')}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </Reveal>
  )
}

function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-xl font-extrabold tracking-tight">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><Icon name={icon} size={20} /></span>
      {children}
    </p>
  )
}

function Card({ icon, iconClass = '', title, children, tone = '#ffffff', ink = '#1a1a1a', delay = 0 }: {
  icon: IconName; iconClass?: string; title: string; children?: React.ReactNode; tone?: string; ink?: string; delay?: number
}) {
  return (
    <Reveal delay={delay}>
      <div onPointerMove={spot} className="jt-spot flex gap-4 overflow-hidden rounded-3xl p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg" style={{ background: tone, color: ink }}>
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb, currentColor 9%, transparent)' }}>
          <span className={`inline-flex ${iconClass}`}><Icon name={icon} size={40} /></span>
        </span>
        <div className="min-w-0 self-center">
          <p className="text-xl leading-tight font-bold">{title}</p>
          {children}
        </div>
      </div>
    </Reveal>
  )
}

// ---------------- the answer ----------------
function Answer({ place, onChange }: { place: Place; onChange: () => void }) {
  const { t } = useTranslation()
  const st = useNow(place.lat, place.lon, place.label)
  if (st.s === 'loading') return <SkySkeleton label={t('dash.loading')} />
  if (st.s === 'error')
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <p role="alert" className="text-xl font-bold">{t('check.failed')}</p>
        <button type="button" onClick={onChange} className="min-h-14 rounded-2xl border-2 border-brand px-5 text-lg font-bold text-brand">{t('check.change')}</button>
      </div>
    )
  return <AnswerView n={st.v} place={place} onChange={onChange} />
}

function AnswerView({ n, place, onChange }: { n: NowResponse; place: Place; onChange: () => void }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const clock = useIstClock()
  const [voiceOk, setVoiceOk] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [relief, setRelief] = useState<ReliefPoint[]>([])
  const [dock, setDock] = useState(false)
  const hero = useRef<HTMLElement>(null)

  useEffect(() => {
    void hasVoice(lang).then(setVoiceOk)
  }, [lang])
  useEffect(() => {
    getRelief().then((r) => setRelief(r.points ?? [])).catch(() => setRelief([]))
  }, [])
  useEffect(() => () => stopSpeaking(), [])
  // the floating Listen / 112 bar appears once the big answer has scrolled away
  useEffect(() => {
    const el = hero.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setDock(!e.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const nearest = useMemo(() => {
    const ranked = relief
      .filter((p) => (p.kind === 'cooling' || p.kind === 'water') && p.status !== 'planned') // only places that exist
      .map((p) => ({ p, km: distanceKm(place, p) }))
      .filter((x) => x.km <= 25)
      .sort((a, b) => a.km - b.km)
    return ranked[0] ?? null
  }, [relief, place])

  const p = workerPlan(n)
  const temp = useCountUp(n.now?.temp_c ?? 0)
  const sky = SKY[p.band]
  const ink = HEAT_COLORS[p.band].ink
  const urgent = p.band === 'ORANGE' || p.band === 'RED'
  const night = clock.hour < 6 || clock.hour >= 19
  const rain = p.rain || (n.now?.rain_next_3h_mm ?? 0) >= 2

  const bandAt = (h: number): HeatBand => {
    const b = n.today.blocks.find((x) => Number(x.from.slice(0, 2)) <= h && h < Number(x.to.slice(0, 2) === '24' ? 24 : x.to.slice(0, 2)))
    return b?.band ?? 'GREEN'
  }
  const heavy = (h: number) => n.today.heavy_work_windows.some((w) => Number(w.from.slice(0, 2)) <= h && h < Number(w.to.slice(0, 2)))
  const litres = p.glasses * 8 * 0.25 // 250 ml glasses over an 8-hour day

  const say = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    void speak(spokenLines(p, t), lang, place, () => setSpeaking(false))
  }

  return (
    <div className="pb-32">
      {/* the big answer, on an animated sky */}
      <section ref={hero} aria-live="polite" className="jt-sky relative overflow-hidden"
        style={{ backgroundImage: `linear-gradient(155deg, ${sky[0]}, ${sky[1]}, ${sky[2]}, ${sky[1]})`, color: ink }}>
        <SkyScene band={p.band} night={night} rain={rain} />
        <div className="relative mx-auto max-w-xl px-5 pt-5 pb-24">
          <div className="flex items-center justify-between gap-3">
            <p className="jt-chip flex min-w-0 items-center gap-2 rounded-full py-1.5 pr-4 pl-2 text-lg font-bold">
              <Icon name="location" size={22} /><span className="truncate">{place.label}</span>
            </p>
            <button type="button" onClick={onChange} className="min-h-11 shrink-0 rounded-full bg-white px-4 font-bold text-ink shadow-md transition hover:scale-105">{t('check.change')}</button>
          </div>

          <div className={`jt-pop mt-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white/25 shadow-lg ${urgent ? 'jt-ring' : ''}`} style={{ animationDelay: '100ms' }}>
            <Icon name={HEAT_ICON[p.band]} size={52} />
          </div>
          {n.now && (
            <p className={`mt-2 text-[6.5rem] leading-none font-black tracking-tighter tabular-nums ${p.band === 'RED' ? 'jt-throb' : ''}`} aria-label={t('check.tempNow', { temp: n.now.temp_c.toFixed(0) })}>
              {Math.round(temp)}<span className="align-top text-5xl">°C</span>
            </p>
          )}
          <h1 className="mt-2 text-[2.1rem] leading-[1.15] font-extrabold tracking-tight"><WordReveal text={t(`check.verdict.${p.band}`)} delay={250} /></h1>

          <div className="mt-5 flex flex-wrap gap-2 text-[15px] font-bold">
            {n.now && <span className="jt-chip jt-rise inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ animationDelay: '700ms' }}><Icon name="water" size={18} />{t('check.humidity', { rh: Math.round(n.now.rh) })}</span>}
            {n.today.peak_hour && (
              <span className="jt-chip jt-rise inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ animationDelay: '800ms' }}>
                <Icon name="thermometer" size={18} />{t('check.hottest', { time: n.today.peak_hour.time.slice(11, 16), temp: Math.round(n.today.peak_hour.temp_c) })}
              </span>
            )}
            {n.air && (
              <span className="jt-chip jt-rise inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ animationDelay: '900ms' }}>
                <span className="h-3 w-3 rounded-full ring-2 ring-white/70" style={{ background: AQI_COLORS[n.air.category].fill }} />AQI {n.air.aqi}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-10 max-w-xl space-y-5 px-4">
        {voiceOk && (
          <button type="button" onClick={say} aria-pressed={speaking}
            className={`jt-pop flex min-h-20 w-full items-center gap-4 rounded-full bg-white py-2 pr-6 pl-2 text-left text-2xl font-extrabold shadow-[0_18px_50px_-12px_rgb(6_18_28/0.45)] transition active:scale-[0.98] ${speaking ? 'ring-4 ring-brand/30' : ''}`}
            style={{ animationDelay: '600ms' }}>
            <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              {speaking && <span className="jt-radar absolute inset-0 rounded-full bg-brand" aria-hidden="true" />}
              <Icon name={speaking ? 'pause' : 'speaker'} size={32} className="relative" />
            </span>
            <span className="flex-1">{speaking ? t('check.stop') : t('check.listen')}</span>
            <SoundBars active={speaking} className="bg-brand" />
          </button>
        )}

        {/* the work clock */}
        <Reveal>
          <div onPointerMove={spot} className="jt-spot overflow-hidden rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
            <SectionTitle icon="hammer">{t('check.workClock')}</SectionTitle>
            <WorkDial bandAt={bandAt} heavy={heavy} nowHour={clock.hour} nowLabel={clock.label} ariaLabel={t('check.hourBarAria')} />
            <p className="mt-2 text-xl font-bold">{p.heavyWindows.length ? t('check.heavyOk') : t('check.heavyNo')}</p>
            {p.heavyWindows.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-2">
                {p.heavyWindows.map((w) => (
                  <span key={w.from} className="rounded-2xl bg-[#ebfbee] px-3 py-1 text-[1.6rem] leading-tight font-black tracking-tight whitespace-nowrap text-[#1b5e20] ring-1 ring-[#b2f2bb]">{w.from}–{w.to}</span>
                ))}
              </p>
            )}
            {p.noonPause && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-[#fff4e6] px-3 py-2 text-lg font-bold text-[#a63e00]">
                <Icon name="sun" size={22} />{t('check.noonPause', p.noonPause)}
              </p>
            )}
            <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-muted">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#237032] text-white"><Icon name="check" size={14} /></span>{t('check.tickLegend')}
            </p>
          </div>
        </Reveal>

        <Outlook n={n} />

        {/* water */}
        <Reveal>
          <div onPointerMove={spot} className="jt-spot overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#e7f5ff] to-white p-5 shadow-sm ring-1 ring-[#a5d8ff]">
            <SectionTitle icon="glass">{t('check.water', { count: p.glasses })}</SectionTitle>
            <div className="flex flex-wrap items-end gap-3">
              {Array.from({ length: p.glasses }, (_, i) => <WaterGlass key={i} delay={300 + i * 350} />)}
              <span className="ms-auto text-right">
                <span className="block text-4xl font-black text-water tabular-nums">×{p.glasses}</span>
                <span className="font-semibold text-muted">{t('check.perHour')}</span>
              </span>
            </div>
            <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-lg font-bold">{t('check.litres', { l: litres })}</p>
          </div>
        </Reveal>

        <Reveal><ShiftReminders n={n} /></Reveal>

        {p.mask && n.air && (
          <Card icon="mask" iconClass="jt-breathe" title={t('check.mask')} tone={AQI_COLORS[n.air.category].fill} ink={AQI_COLORS[n.air.category].ink}>
            <p className="mt-1 text-lg font-semibold">{t('check.aqi', { aqi: n.air.aqi, cat: t(`aqi.${n.air.category}`) })}</p>
          </Card>
        )}
        {p.strongSun && (
          <Card icon="sun" iconClass="jt-spin-slow" title={t('check.sun')} tone="#fff3bf" delay={80}>
            <p className="mt-1 text-lg font-semibold">UV {n.uv?.today_max}</p>
          </Card>
        )}
        {p.rain && (
          <Card icon="umbrella" iconClass="jt-sway" title={t('check.rain')} tone="#dbeefe" delay={160}>
            <p className="mt-1 text-lg font-semibold">{t('check.rainMm', { mm: n.now?.rain_next_3h_mm ?? 0 })}</p>
          </Card>
        )}

        {nearest && (
          <Reveal>
            <div onPointerMove={spot} className="jt-spot overflow-hidden rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
              <SectionTitle icon={nearest.p.kind === 'water' ? 'water' : 'cooling'}>{t('check.nearest')}</SectionTitle>
              <RouteSketch kind={nearest.p.kind === 'water' ? 'water' : 'cooling'} />
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg leading-snug font-bold">{lang === 'hi' && nearest.p.name_hi ? nearest.p.name_hi : nearest.p.name}</p>
                  <p className="text-3xl font-black text-brand tabular-nums">{t('check.km', { km: nearest.km.toFixed(1) })}</p>
                </div>
              </div>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${nearest.p.lat},${nearest.p.lon}`} target="_blank" rel="noopener noreferrer"
                className="jt-shine group mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-xl font-bold text-white">
                <Icon name="map" size={24} />{t('check.directions')}<Icon name="arrow-right" size={22} className="transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </Reveal>
        )}

        <Reveal>
          <Link href="/unwell" className="flex min-h-16 items-center justify-center gap-3 rounded-3xl border-2 border-[#c92a2a] bg-[#fff5f5] px-4 text-xl font-bold text-[#c92a2a] transition hover:bg-[#ffe3e3] active:scale-[0.98]">
            <span className="jt-sway inline-flex"><Icon name="faint" size={30} /></span>{t('check.unwell')}
          </Link>
        </Reveal>

        <Reveal className="space-y-2">
          <a href="tel:112" className="jt-beat jt-shine flex min-h-20 items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-[#a51d1d] to-[#e03131] px-4 text-2xl font-extrabold text-white shadow-lg active:scale-[0.98]">
            <span className="jt-shake inline-flex"><Icon name="phone" size={34} /></span>{t('check.call112')}
          </a>
          <p className="text-center text-lg text-muted">{t('check.call112Why')}</p>
        </Reveal>

        <Reveal>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText(n, p, t))}`} target="_blank" rel="noopener noreferrer"
            className="jt-shine flex min-h-16 items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-[#0b7a35] to-[#20a34e] px-4 text-xl font-bold text-white shadow-md">
            <Icon name="share" size={28} />{t('check.share')}
          </a>
        </Reveal>

        <p className="pt-2 text-center text-[15px] text-muted">
          {t('check.dataLine', { time: formatHour(n.data_updated_at, lang) })}
        </p>
      </div>

      {/* floating bar: band + temperature, Listen and Call 112 always within reach */}
      <div className={`jt-dock fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] ${dock ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[120%] opacity-0'}`} aria-hidden={!dock}>
        <div className="mx-auto flex max-w-xl items-center gap-2 rounded-full bg-night/90 p-2 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <span className="inline-flex h-14 items-center gap-2 rounded-full px-3 text-lg font-extrabold" style={{ background: HEAT_COLORS[p.band].fill, color: ink }}>
            <Icon name={HEAT_ICON[p.band]} size={26} />{n.now ? `${Math.round(n.now.temp_c)}°` : ''}
          </span>
          {voiceOk ? (
            <button type="button" onClick={say} tabIndex={dock ? 0 : -1} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-lg font-bold">
              <SoundBars active={speaking} className="bg-white" />{speaking ? t('check.stop') : t('check.listen')}
            </button>
          ) : <span className="flex-1" />}
          <a href="tel:112" tabIndex={dock ? 0 : -1} className="jt-beat flex h-14 items-center gap-2 rounded-full bg-[#c92a2a] px-5 text-lg font-extrabold">
            <Icon name="phone" size={24} />112
          </a>
        </div>
      </div>
    </div>
  )
}

export default function CheckPage() {
  const { t } = useTranslation()
  const [place, setPlace] = useState<Place | null>(savedPlace)
  const apiReady = USE_MOCK || Boolean(config.apiUrl)
  if (!apiReady) return <p role="alert" className="m-4 rounded-lg border-2 border-[#c92a2a] bg-white p-3 font-semibold">{t('data.notConfigured')}</p>
  if (!place)
    return (
      <PlacePicker
        onPick={(p) => {
          writeStore(PLACE_KEY, JSON.stringify(p))
          setPlace(p)
        }}
      />
    )
  return <Answer place={place} onChange={() => setPlace(null)} />
}
