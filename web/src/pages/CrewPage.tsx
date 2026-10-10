// Crew heat plan for site supervisors: pick a place, crew size, day, shift and work type, and get an
// hour-by-hour work/rest roster with staggered rest groups and the water to carry. Every number comes
// from GET /crew (the same tested engine as the WhatsApp reply); this page only presents it.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getCities, getCrew, type CrewQuery } from '../api/endpoints'
import { ApiError, isAbort } from '../api/client'
import type { City, CrewHour, CrewSchedule } from '../api/types'
import { Icon } from '../components/Icon'
import { MotionPage, Reveal } from '../components/motion'
import { HeatBadge } from '../components/RiskBadge'
import { USE_MOCK, config } from '../config'
import { currentLang } from '../i18n'
import { geoErrorCode, getLocation } from '../lib/geo'
import { HEAT_ICON, type IconName } from '../lib/icons'
import { formatDateTime } from '../lib/time'
import { HEAT_COLORS } from '../theme'

const HOURS = Array.from({ length: 18 }, (_, i) => `${String(i + 5).padStart(2, '0')}:00`) // 05:00 to 22:00
const SIZE_PRESETS = [5, 10, 20, 50, 100]
const SHIFT_PRESETS: Array<[string, string, string]> = [
  ['presetMorning', '06:00', '14:00'],
  ['presetDay', '08:00', '18:00'],
  ['presetLong', '07:00', '19:00'],
  ['presetEvening', '14:00', '22:00'],
]
const CAN_LITRES = 20
const ACTIVITY_ICON: Record<CrewHour['activity'], IconName> = { heavy: 'hammer', light: 'crew', rest: 'pause' }

/** YYYY-MM-DD in IST, `offset` days from today. */
function istDate(offset: number): string {
  const d = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function fromQuery(): Partial<CrewQuery> & { city?: string } {
  const p = new URLSearchParams(window.location.search)
  const num = (k: string) => (p.get(k) !== null && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined)
  const hhmm = (k: string) => (/^\d{2}:\d{2}$/.test(p.get(k) ?? '') ? (p.get(k) as string) : undefined)
  return {
    lat: num('lat'), lon: num('lon'), size: num('size'), from: hhmm('from'), to: hhmm('to'), date: p.get('date') ?? undefined,
    city: p.get('city') ?? undefined, heavy: p.get('heavy') === '0' ? false : undefined,
  }
}

type Place = { kind: 'city'; id: string } | { kind: 'point'; lat: number; lon: number }

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex items-center gap-2 font-bold">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[15px] text-white">{n}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`min-h-11 rounded-xl px-3.5 py-2 font-semibold transition-colors ${active ? 'bg-brand text-white shadow' : 'bg-white text-ink ring-1 ring-line hover:ring-brand'}`}>
      {children}
    </button>
  )
}

function Tile({ icon, label, children, accent }: { icon: ReactNode; label: string; children: ReactNode; accent?: string }) {
  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-line bg-white p-5 shadow-sm">
      {accent && <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} aria-hidden="true" />}
      <p className="flex items-center gap-2 text-muted">{icon}{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/** The shift as one strip: colour = heat band, icon = what the crew does that hour. */
function DayStrip({ hours }: { hours: CrewHour[] }) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="flex gap-1" role="list" aria-label={t('crew.timelineTitle')}>
        {hours.map((h) => (
          <div key={h.time} role="listitem" className="min-w-0 flex-1" title={`${h.time} · ${t(`bands.${h.band}`)} · ${t(`crew.activity.${h.activity}`)}`}>
            <div className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl" style={{ background: HEAT_COLORS[h.band].fill, color: HEAT_COLORS[h.band].ink }}>
              <Icon name={ACTIVITY_ICON[h.activity]} size={20} />
              <span className="hidden text-[13px] font-bold sm:block">{h.work_min}/{h.rest_min}</span>
            </div>
            <p className="mt-1 text-center text-[13px] text-muted">{h.time.slice(0, 2)}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-muted">
        {(['heavy', 'light', 'rest'] as const).map((a) => (
          <li key={a} className="flex items-center gap-1.5"><Icon name={ACTIVITY_ICON[a]} size={18} />{t(`crew.activity.${a}`)}</li>
        ))}
        <li className="hidden sm:inline">{t('crew.stripMinutes')}</li>
      </ul>
    </div>
  )
}

/** Who rests when inside one hour: a bar per group, the shaded part is that group's rest slot. */
function Rotation({ hours }: { hours: CrewHour[] }) {
  const { t } = useTranslation()
  const options = useMemo(() => {
    const seen = new Set<string>()
    return hours.filter((h) => {
      const k = `${h.activity}|${h.rest_min}|${h.rotation.length}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [hours])
  const [pick, setPick] = useState(0)
  const h = options[Math.min(pick, options.length - 1)]
  if (!h) return null
  const parse = (slot: string) => {
    const m = slot.match(/:(\d{2})-:(\d{2})/)
    return m ? [Number(m[1]), Number(m[2])] : null
  }
  return (
    <div>
      {options.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {options.map((o, i) => (
            <Chip key={o.time} active={i === pick} onClick={() => setPick(i)}>
              {t('crew.fromHour', { time: o.time })} · {o.work_min}/{o.rest_min}
            </Chip>
          ))}
        </div>
      )}
      {h.rotation.length === 1 ? (
        <p className="rounded-2xl bg-canvas p-4 text-lg font-semibold">
          {h.rotation[0].rest === 'all' ? t('crew.allRest') : t('crew.together', { min: h.rest_min })}
        </p>
      ) : (
        <div className="space-y-2">
          {h.rotation.map((g) => {
            const r = parse(g.rest)
            return (
              <div key={g.group} className="flex items-center gap-3">
                <span className="w-28 shrink-0 font-semibold">{t('crew.groupShort', { g: g.group, n: g.workers })}</span>
                <div className="relative h-9 flex-1 overflow-hidden rounded-lg" style={{ background: HEAT_COLORS[h.band].fill }}>
                  {r && (
                    <span className="absolute inset-y-0 flex items-center justify-center bg-[#dbeefe] text-[13px] font-bold text-[#0b3d5c] ring-2 ring-white"
                      style={{ left: `${(r[0] / 60) * 100}%`, width: `${((r[1] - r[0]) / 60) * 100}%` }}>
                      {t('crew.restShort')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex gap-3">
            <span className="w-28 shrink-0" />
            <div className="flex flex-1 justify-between text-[13px] text-muted"><span>:00</span><span>:15</span><span>:30</span><span>:45</span><span>:60</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CrewPage() {
  const { t } = useTranslation()
  const lang = currentLang()
  const [initial] = useState(fromQuery)
  const [cities, setCities] = useState<City[]>([])
  const [place, setPlace] = useState<Place>(() =>
    initial.lat !== undefined && initial.lon !== undefined ? { kind: 'point', lat: initial.lat, lon: initial.lon } : { kind: 'city', id: initial.city ?? 'delhi' },
  )
  const [size, setSize] = useState(initial.size ?? 20)
  const [from, setFrom] = useState(initial.from ?? '08:00')
  const [to, setTo] = useState(initial.to ?? '18:00')
  const dates = useMemo(() => [istDate(0), istDate(1), istDate(2)], [])
  const [date, setDate] = useState(initial.date && dates.includes(initial.date) ? initial.date : dates[0])
  const [heavy, setHeavy] = useState(initial.heavy ?? true)
  const [state, setState] = useState<{ s: 'idle' | 'loading' } | { s: 'ok'; v: CrewSchedule } | { s: 'error'; msg: string }>({ s: 'idle' })
  const [geoMsg, setGeoMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const apiReady = USE_MOCK || Boolean(config.apiUrl)

  useEffect(() => {
    if (!apiReady) return
    const ctrl = new AbortController()
    getCities(ctrl.signal)
      .then((r) => setCities(r.cities ?? []))
      .catch(() => setCities([]))
    return () => ctrl.abort()
  }, [apiReady])

  const coords = (): { lat: number; lon: number; label?: string } | null => {
    if (place.kind === 'point') return { lat: place.lat, lon: place.lon }
    const c = cities.find((x) => x.id === place.id)
    return c ? { lat: c.lat, lon: c.lon, label: c.name } : null
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const where = coords()
    const n = Math.round(size)
    if (!where) return setState({ s: 'error', msg: t('crew.pickPlace') })
    if (!Number.isFinite(n) || n < 1 || n > 500) return setState({ s: 'error', msg: t('crew.badSize') })
    if (to <= from) return setState({ s: 'error', msg: t('crew.badShift') })
    setState({ s: 'loading' })
    try {
      const v = await getCrew({ ...where, size: n, from, to, date, heavy })
      setState({ s: 'ok', v })
      setTimeout(() => document.getElementById('crew-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err) {
      if (isAbort(err)) return
      const msg = err instanceof ApiError && err.status === 400 ? err.message : t('crew.failed')
      setState({ s: 'error', msg })
    }
  }

  // A print link (from the WhatsApp reply) opens straight to the roster.
  useEffect(() => {
    if (initial.lat !== undefined && initial.lon !== undefined && apiReady) void submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const useMyLocation = async () => {
    setGeoMsg(t('chat.locating'))
    try {
      const c = await getLocation()
      setPlace({ kind: 'point', lat: c.lat, lon: c.lon })
      setGeoMsg(t('crew.locationSet', { lat: c.lat.toFixed(3), lon: c.lon.toFixed(3) }))
    } catch (err) {
      const code = geoErrorCode(err)
      setGeoMsg(t(code === 'denied' ? 'chat.locationDenied' : code === 'unsupported' ? 'chat.locationUnsupported' : 'chat.locationUnavailable'))
    }
  }

  const v = state.s === 'ok' ? state.v : null
  const shareUrl = v
    ? `${window.location.origin}/crew?lat=${v.location.lat.toFixed(3)}&lon=${v.location.lon.toFixed(3)}&size=${v.crew_size}&from=${v.shift.from}&to=${v.shift.to}&date=${v.date}${heavy ? '' : '&heavy=0'}`
    : ''
  const shareText = v
    ? [
        t('crew.shareTitle', { place: v.location.label, date: v.date }),
        t('crew.shareCrew', { n: v.crew_size, from: v.shift.from, to: v.shift.to }),
        t('crew.shareHeavy', { hours: !heavy ? t('crew.lightOnly') : v.no_heavy_work ? t('crew.noHeavy') : v.heavy_work_hours.join(', ') }),
        t('crew.shareWater', { litres: v.water.litres_total, cans: Math.ceil(v.water.litres_total / CAN_LITRES) }),
        v.ors_needed ? t('crew.shareOrs') : '',
        shareUrl,
      ].filter(Boolean).join('\n')
    : ''
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  const workMin = v?.work_minutes_per_worker ?? 0

  return (
    <MotionPage>
      {/* ---------- header ---------- */}
      <section className="relative overflow-hidden bg-night text-white print:hidden">
        <div className="jt-grid-bg absolute inset-0" aria-hidden="true" />
        <div className="jt-blob absolute -top-28 -left-20 h-80 w-80 rounded-full bg-heat/30 blur-[100px]" aria-hidden="true" />
        <div className="jt-blob absolute -right-24 -bottom-32 h-80 w-80 rounded-full bg-water/30 blur-[100px]" style={{ animationDelay: '-7s' }} aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 pt-12 pb-24 sm:px-6">
          <Reveal>
            <p className="jt-glass mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-semibold"><Icon name="crew" size={16} />{t('crew.heroEyebrow')}</p>
            <h1 className="max-w-3xl text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl">
              {t('crew.heroTitle1')} <span className="jt-gradient-text">{t('crew.heroTitle2')}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-white/80">{t('crew.intro')}</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {([['hammer', 'b1'], ['clock', 'b2'], ['glass', 'b3'], ['print', 'b4']] as const).map(([icon, k]) => (
                <li key={k} className="jt-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold"><Icon name={icon} size={18} className="text-[#ffb470]" />{t(`crew.${k}`)}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-6 px-4 pb-14 sm:px-6 print:max-w-none print:p-0">
        {/* ---------- form ---------- */}
        <Reveal className="relative z-10 -mt-16 print:hidden">
          <form onSubmit={submit} className="space-y-6 rounded-3xl bg-white p-5 shadow-xl ring-1 ring-line sm:p-8">
            {!apiReady && <p role="alert" className="rounded-xl border-2 border-[#c92a2a] p-3 font-semibold">{t('data.notConfigured')}</p>}
            <Step n={1} title={t('crew.place')}>
              <div className="flex flex-wrap gap-2">
                <select aria-label={t('crew.place')} className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-line bg-white px-3"
                  value={place.kind === 'city' ? place.id : 'point'}
                  onChange={(e) => e.target.value !== 'point' && setPlace({ kind: 'city', id: e.target.value })}>
                  {place.kind === 'point' && <option value="point">{t('crew.myPoint', { lat: place.lat.toFixed(3), lon: place.lon.toFixed(3) })}</option>}
                  {(['full', 'heat_and_rain', 'city'] as const).map((tier) => {
                    const group = cities.filter((c) => c.tier === tier).sort((a, b) => (tier === 'city' ? a.name.localeCompare(b.name) : 0))
                    return group.length ? (
                      <optgroup key={tier} label={t(`city.group.${tier}`)}>
                        {group.map((c) => <option key={c.id} value={c.id}>{lang === 'hi' ? `${c.name_hi} (${c.name})` : c.name}</option>)}
                      </optgroup>
                    ) : null
                  })}
                </select>
                <button type="button" onClick={useMyLocation} className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-brand px-4 font-semibold text-brand">
                  <Icon name="location" size={20} />{t('chat.useLocation')}
                </button>
              </div>
              {geoMsg && <p className="mt-1 text-muted" role="status">{geoMsg}</p>}
            </Step>

            <div className="grid gap-6 md:grid-cols-2">
              <Step n={2} title={t('crew.size')}>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={t('crew.fewer')} onClick={() => setSize((s) => Math.max(1, s - 1))} className="h-12 w-12 rounded-xl bg-canvas text-2xl font-bold ring-1 ring-line">−</button>
                  <input type="number" inputMode="numeric" min={1} max={500} value={size} aria-label={t('crew.size')}
                    onChange={(e) => setSize(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                    className="h-12 w-24 rounded-xl border-2 border-line text-center text-xl font-bold" />
                  <button type="button" aria-label={t('crew.more')} onClick={() => setSize((s) => Math.min(500, s + 1))} className="h-12 w-12 rounded-xl bg-canvas text-2xl font-bold ring-1 ring-line">+</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SIZE_PRESETS.map((n) => <Chip key={n} active={size === n} onClick={() => setSize(n)}>{n}</Chip>)}
                </div>
              </Step>
              <Step n={3} title={t('crew.date')}>
                <div className="flex flex-wrap gap-2">
                  {dates.map((d, i) => (
                    <Chip key={d} active={date === d} onClick={() => setDate(d)}>
                      {t(`crew.day${i}`)}<span className="ms-1 font-normal opacity-80">{d.slice(8)}/{d.slice(5, 7)}</span>
                    </Chip>
                  ))}
                </div>
              </Step>
            </div>

            <Step n={4} title={t('crew.shiftTitle')}>
              <div className="flex flex-wrap gap-2">
                {SHIFT_PRESETS.map(([k, f, tt]) => (
                  <Chip key={k} active={from === f && to === tt} onClick={() => { setFrom(f); setTo(tt) }}>{t(`crew.${k}`)} · {f.slice(0, 2)}–{tt.slice(0, 2)}</Chip>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2"><span className="text-muted">{t('crew.from')}</span>
                  <select className="min-h-11 rounded-xl border-2 border-line bg-white px-2" value={from} onChange={(e) => setFrom(e.target.value)}>{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                </label>
                <label className="flex items-center gap-2"><span className="text-muted">{t('crew.to')}</span>
                  <select className="min-h-11 rounded-xl border-2 border-line bg-white px-2" value={to} onChange={(e) => setTo(e.target.value)}>{HOURS.map((h) => <option key={h}>{h}</option>)}</select>
                </label>
              </div>
            </Step>

            <Step n={5} title={t('crew.workType')}>
              <div className="grid gap-2 sm:grid-cols-2">
                {([[true, 'hammer', 'workHeavy', 'workHeavyHint'], [false, 'crew', 'workLight', 'workLightHint']] as const).map(([val, icon, k, hint]) => (
                  <button key={k} type="button" onClick={() => setHeavy(val)} aria-pressed={heavy === val}
                    className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-colors ${heavy === val ? 'bg-brand text-white shadow' : 'bg-white ring-1 ring-line hover:ring-brand'}`}>
                    <Icon name={icon} size={28} className="shrink-0" />
                    <span><b className="block">{t(`crew.${k}`)}</b><span className={heavy === val ? 'text-white/80' : 'text-muted'}>{t(`crew.${hint}`)}</span></span>
                  </button>
                ))}
              </div>
            </Step>

            <button type="submit" disabled={!apiReady || state.s === 'loading'}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0b3d5c] to-[#0b2a40] px-6 text-lg font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60 sm:w-auto">
              <Icon name="clock" size={22} />
              {state.s === 'loading' ? t('crew.loading') : t('crew.make')}
              {state.s !== 'loading' && <Icon name="arrow-right" size={20} />}
            </button>
          </form>
        </Reveal>

        {state.s === 'error' && <p role="alert" className="rounded-2xl border-2 border-[#c92a2a] bg-white p-4 font-semibold">{state.msg}</p>}
        {state.s === 'loading' && (
          <div className="grid gap-4 sm:grid-cols-4" role="status" aria-label={t('crew.loading')}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-line/60" />)}
          </div>
        )}

        {/* ---------- result ---------- */}
        {v && (
          <section id="crew-result" aria-labelledby="crew-result-title" className="scroll-mt-4 space-y-5">
            <Reveal>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold tracking-wide text-heat uppercase">{t('crew.planFor')}</p>
                  <h2 id="crew-result-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {t('crew.resultTitle', { n: v.crew_size, place: v.location.label, date: v.date })}
                  </h2>
                  <p className="text-muted">{t('crew.shift', { from: v.shift.from, to: v.shift.to })} · {t('data.updated', { time: formatDateTime(v.data_updated_at, lang) })}</p>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#128c3e] px-4 font-semibold text-white"><Icon name="share" size={18} />{t('crew.share')}</a>
                  <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-line bg-white px-4 font-semibold">
                    <Icon name={copied ? 'check' : 'map'} size={18} />{copied ? t('crew.copied') : t('crew.copyLink')}
                  </button>
                  <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-brand px-4 font-semibold text-brand">
                    <Icon name="print" size={18} />{t('crew.print')}
                  </button>
                </div>
              </div>
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Reveal><Tile icon={<Icon name={HEAT_ICON[v.worst_band]} size={18} />} label={t('crew.worst')} accent={HEAT_COLORS[v.worst_band].fill}>
                <HeatBadge band={v.worst_band} className="text-lg" />
              </Tile></Reveal>
              <Reveal delay={0.05}><Tile icon={<Icon name="glass" size={18} />} label={t('crew.waterTotal')} accent="#1c7ed6">
                <p className="text-3xl font-extrabold tracking-tight">{t('crew.litres', { n: v.water.litres_total })}</p>
                <p className="text-muted">{t('crew.cans', { n: Math.ceil(v.water.litres_total / CAN_LITRES) })} · {t('crew.perWorkerShort', { l: v.water.litres_per_worker })}</p>
              </Tile></Reveal>
              <Reveal delay={0.1}><Tile icon={<Icon name="hammer" size={18} />} label={t('crew.heavyHours')} accent="#237032">
                <p className="text-lg font-bold">{!heavy ? t('crew.lightOnly') : v.no_heavy_work ? t('crew.noHeavy') : v.heavy_work_hours.map((h) => h.slice(0, 2)).join(', ')}</p>
                {v.noon_pause && <p className="text-muted">{t('crew.noonPause', v.noon_pause)}</p>}
              </Tile></Reveal>
              <Reveal delay={0.15}><Tile icon={<Icon name="clock" size={18} />} label={t('crew.workTime')} accent="#f59f00">
                <p className="text-3xl font-extrabold tracking-tight">{t('crew.hm', { h: Math.floor(workMin / 60), m: workMin % 60 })}</p>
                <p className="text-muted">{t('crew.workTimeHint')}</p>
              </Tile></Reveal>
            </div>

            {v.ors_needed && (
              <Reveal>
                <div role="note" className="flex gap-3 rounded-3xl border-2 border-[#c92a2a] bg-[#fff5f5] p-5">
                  <Icon name="band-red" size={28} className="shrink-0 text-[#c92a2a]" />
                  <p className="font-semibold">{t('crew.ors')}</p>
                </div>
              </Reveal>
            )}

            <Reveal>
              <div className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
                <h3 className="mb-1 text-xl font-bold">{t('crew.timelineTitle')}</h3>
                <p className="mb-4 text-muted">{t('crew.timelineHint')}</p>
                <DayStrip hours={v.hours} />
              </div>
            </Reveal>

            <Reveal>
              <div className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
                <h3 className="mb-1 text-xl font-bold">{t('crew.rotationTitle')}</h3>
                <p className="mb-4 text-muted">{t('crew.rotationHint')}</p>
                <Rotation hours={v.hours} />
              </div>
            </Reveal>

            <Reveal>
              <details className="group overflow-hidden rounded-3xl border border-line bg-white shadow-sm" open>
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-xl font-bold [&::-webkit-details-marker]:hidden">
                  {t('crew.detailsTitle')}
                  <Icon name="chevron-down" size={22} className="transition-transform group-open:rotate-180 print:hidden" />
                </summary>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[640px] text-left">
                    <caption className="sr-only">{t('crew.tableCaption')}</caption>
                    <thead className="bg-canvas">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">{t('crew.colTime')}</th>
                        <th scope="col" className="px-4 py-2.5">{t('crew.colBand')}</th>
                        <th scope="col" className="px-4 py-2.5">{t('crew.colWork')}</th>
                        <th scope="col" className="px-4 py-2.5">{t('crew.colRest')}</th>
                        <th scope="col" className="px-4 py-2.5">{t('crew.colWater')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.hours.map((h) => (
                        <tr key={h.time} className="border-t border-line">
                          <th scope="row" className="px-4 py-2.5 font-semibold whitespace-nowrap">{h.time}</th>
                          <td className="px-4 py-2.5"><HeatBadge band={h.band} /></td>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-1.5 font-semibold"><Icon name={ACTIVITY_ICON[h.activity]} size={18} />{t(`crew.activity.${h.activity}`)}</span>
                            {h.activity !== 'rest' && <span className="block text-muted">{t('crew.minutes', { work: h.work_min, rest: h.rest_min })}</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {h.rotation.length > 1
                              ? h.rotation.map((g) => <span key={g.group} className="me-3 inline-block whitespace-nowrap">{t('crew.group', { g: g.group, n: g.workers, slot: g.rest })}</span>)
                              : h.rotation[0]?.rest === 'all' ? t('crew.allRest') : t('crew.together', { min: h.rest_min })}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{t('crew.ml', { n: h.water_ml_per_worker })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Reveal>

            <p className="flex gap-2 text-muted"><Icon name="info" size={18} className="mt-0.5 shrink-0" />{t('crew.disclaimer')}</p>
            <p className="text-muted">{t('crew.source')}</p>
          </section>
        )}
      </div>
    </MotionPage>
  )
}
