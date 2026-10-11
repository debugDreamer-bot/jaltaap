import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCities, getFlood, getHeat, getRelief, getReplay, getReports, getWaterIssues, listReplays } from '../api/endpoints'
import { isAbort } from '../api/client'
import type { City, FloodResponse, HeatResponse, PublicReport, ReliefPoint, ReplayScenario, ScenarioSummary, WaterIssue } from '../api/types'
import { Attribution } from '../components/Attribution'
import { PROVIDER_FALLBACK, type AttribItem } from '../lib/attribution'
import { Icon } from '../components/Icon'
import { LayerToggles } from '../components/LayerToggles'
import { Legend } from '../components/Legend'
import { USE_MOCK, config } from '../config'
import { currentLang } from '../i18n'
import { openChat } from '../lib/chat'
import { useLiveSafety } from '../lib/liveSafety'
import { navigate } from '../lib/nav'
import { updateSettings, useSettings } from '../lib/settings'
import { readStore, writeStore } from '../lib/storage'
import { formatHour, hoursBetween, istIsoHoursAgo } from '../lib/time'
import { describeWarning } from '../lib/warnings'
import { RiskMap, type LayerVisibility, type MapCell, type MapData, type MapFocus, type MapHotspot, type MapMe } from '../map/RiskMap'
import { isFloodLevel, isHeatBand } from '../theme'

const CityDashboard = lazy(() => import('../components/CityDashboard').then((m) => ({ default: m.CityDashboard })))

type Load<T> = { state: 'idle' | 'loading' } | { state: 'ok'; value: T } | { state: 'error' }

const REPORTS_WINDOW_H = 12
const REPLAY_STEP_MS = 1000
const PREFERRED_ORDER = ['heat-2026-05-22', 'flood-2026-07-09']

const apiReady = USE_MOCK || Boolean(config.apiUrl)
const INDIA_BOUNDS: [number, number, number, number] = [68.1, 6.5, 97.4, 37.1]
const CITY_KEY = 'jaltaap.city'

const savedCity = (): string => readStore(CITY_KEY) || 'delhi'

function sortScenarios(list: ScenarioSummary[]): ScenarioSummary[] {
  const rank = (s: ScenarioSummary) => {
    const i = PREFERRED_ORDER.indexOf(s.id)
    if (i >= 0) return i
    return s.id.startsWith('humid-heat-') ? 10 : 20
  }
  return [...list].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
}

/** Map API hotspots (live) to the map model. */
function liveHotspots(f: FloodResponse | null): MapHotspot[] {
  if (!f) return []
  return f.hotspots
    .filter((h) => isFloodLevel(h.level) && Number.isFinite(h.lat) && Number.isFinite(h.lon))
    .map((h) => ({
      id: h.id,
      name: h.name,
      type: h.type,
      agency: h.agency,
      lat: h.lat,
      lon: h.lon,
      level: h.level,
      risk: h.risk,
      rain_3h_mm: h.rain_next_3h_mm ?? null,
      confirmed_reports: h.confirmed_reports ?? null,
    }))
}

function liveCells(h: HeatResponse | null, cityName: (id?: string) => string | null): MapCell[] {
  if (!h) return []
  return h.cells
    .filter((c) => isHeatBand(c.band) && Array.isArray(c.bounds) && c.bounds.length === 4)
    .map((c) => ({
      id: c.id,
      bounds: c.bounds,
      band: c.band,
      temp_c: c.temp_c ?? null,
      rh: c.rh ?? null,
      wet_bulb_c: c.wet_bulb_c ?? null,
      city: cityName(c.city),
      rain_3h_mm: c.rain_next_3h_mm,
      area_level: isFloodLevel(c.area_flood_level) ? c.area_flood_level : null,
    }))
}

function replayFrame(r: ReplayScenario, idx: number): { cells: MapCell[]; hotspots: MapHotspot[]; hour: string | null } {
  const hour = r.hours[idx]
  if (!hour) return { cells: [], hotspots: [], hour: null }
  const cells: MapCell[] = []
  for (const c of r.cells) {
    const v = hour.heat?.[c.id]
    if (v && isHeatBand(v.band)) cells.push({ id: c.id, bounds: c.bounds, band: v.band, temp_c: v.temp_c ?? null, rh: v.rh ?? null, wet_bulb_c: v.wet_bulb_c ?? null })
  }
  const hotspots: MapHotspot[] = []
  for (const h of r.hotspots) {
    const v = hour.flood?.[h.id]
    if (v && isFloodLevel(v.level))
      hotspots.push({ ...h, level: v.level, risk: v.risk, rain_3h_mm: v.rain_3h_mm ?? null, confirmed_reports: undefined })
  }
  return { cells, hotspots, hour: hour.time }
}

export default function MapPage() {
  const { t } = useTranslation()
  const lang = currentLang()

  const [visible, setVisible] = useState<LayerVisibility>({ heat: true, flood: true, reports: true, relief: false, water: true })
  const [cities, setCities] = useState<City[]>([])
  const [cityId, setCityId] = useState<string>(savedCity)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [water, setWater] = useState<Load<WaterIssue[]>>({ state: 'idle' })
  const [panelOpen, setPanelOpen] = useState(false)
  const [provider, setProvider] = useState<{ name: 'amazon' | 'openfreemap'; items: AttribItem[] }>(() => {
    const p = config.mapKey ? 'amazon' : 'openfreemap'
    return { name: p, items: PROVIDER_FALLBACK[p] }
  })
  const [clock, setClock] = useState(() => Date.now())

  // ---- live data ----
  const [hours, setHours] = useState<string[]>([])
  const [hourIdx, setHourIdx] = useState(0)
  const [heat, setHeat] = useState<Load<HeatResponse>>({ state: 'idle' })
  const [flood, setFlood] = useState<Load<FloodResponse>>({ state: 'idle' })
  const [reports, setReports] = useState<Load<PublicReport[]>>({ state: 'idle' })
  const [relief, setRelief] = useState<Load<ReliefPoint[]>>({ state: 'idle' })
  const [reload, setReload] = useState(0)
  const heatCache = useRef(new Map<string, HeatResponse>())
  const floodCache = useRef(new Map<string, FloodResponse>())

  // ---- replay ----
  const [scenarios, setScenarios] = useState<Load<ScenarioSummary[]>>({ state: 'idle' })
  const [replayId, setReplayId] = useState<string>('')
  const [replay, setReplay] = useState<Load<ReplayScenario>>({ state: 'idle' })
  const [replayIdx, setReplayIdx] = useState(0)
  const [playing, setPlaying] = useState(false)

  // Pins fade with age, so re-evaluate every 5 minutes.
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  // Initial live load: the current hour, which also gives hours_available.
  useEffect(() => {
    if (!apiReady) return
    const ctrl = new AbortController()
    heatCache.current.clear()
    floodCache.current.clear()
    setHeat({ state: 'loading' })
    setFlood({ state: 'loading' })
    getHeat(undefined, ctrl.signal)
      .then((h) => {
        heatCache.current.set(h.time, h)
        const avail = Array.isArray(h.hours_available) && h.hours_available.length ? h.hours_available : [h.time]
        setHours(avail)
        setHourIdx(Math.max(0, avail.indexOf(h.time)))
        setHeat({ state: 'ok', value: h })
        // Flood for the same hour is fetched by the hour effect below.
      })
      .catch((e) => {
        if (isAbort(e)) return
        setHeat({ state: 'error' })
        // Flood can still load for the default hour even when heat fails.
        getFlood(undefined, ctrl.signal)
          .then((f) => setFlood({ state: 'ok', value: f }))
          .catch((e2) => !isAbort(e2) && setFlood({ state: 'error' }))
      })
    return () => ctrl.abort()
  }, [reload])

  // Changing the forecast hour (debounced for slider drags).
  const selectedHour = hours[hourIdx]
  useEffect(() => {
    if (!apiReady || !selectedHour) return
    const cachedH = heatCache.current.get(selectedHour)
    const cachedF = floodCache.current.get(selectedHour)
    if (cachedH) setHeat({ state: 'ok', value: cachedH })
    if (cachedF) setFlood({ state: 'ok', value: cachedF })
    if (cachedH && cachedF) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      if (!cachedH) {
        getHeat(selectedHour, ctrl.signal)
          .then((h) => {
            heatCache.current.set(selectedHour, h)
            setHeat({ state: 'ok', value: h })
          })
          .catch((e) => !isAbort(e) && setHeat({ state: 'error' }))
      }
      if (!cachedF) {
        getFlood(selectedHour, ctrl.signal)
          .then((f) => {
            floodCache.current.set(selectedHour, f)
            setFlood({ state: 'ok', value: f })
          })
          .catch((e) => !isAbort(e) && setFlood({ state: 'error' }))
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [selectedHour, reload])

  // Reports, relief and the replay list: once per load.
  useEffect(() => {
    if (!apiReady) return
    const ctrl = new AbortController()
    setReports({ state: 'loading' })
    const since = istIsoHoursAgo(REPORTS_WINDOW_H)
    // Public pins are verified reports; officer-confirmed ones stay bright, so ask for both.
    Promise.allSettled([getReports(since, 'verified', ctrl.signal), getReports(since, 'confirmed', ctrl.signal)]).then((res) => {
      if (ctrl.signal.aborted) return
      const ok = res.filter((r): r is PromiseFulfilledResult<{ reports: PublicReport[] }> => r.status === 'fulfilled')
      if (!ok.length) return setReports({ state: 'error' })
      const byId = new Map<string, PublicReport>()
      for (const r of ok) for (const rep of r.value.reports ?? []) if (Number.isFinite(rep.lat) && Number.isFinite(rep.lon)) byId.set(rep.id, rep)
      setReports({ state: 'ok', value: [...byId.values()] })
    })
    getCities(ctrl.signal)
      .then((r) => setCities(r.cities ?? []))
      .catch(() => setCities([]))
    setWater({ state: 'loading' })
    getWaterIssues(ctrl.signal)
      .then((r) => setWater({ state: 'ok', value: r.issues ?? [] }))
      .catch((e) => !isAbort(e) && setWater({ state: 'error' }))
    setRelief({ state: 'loading' })
    getRelief(ctrl.signal)
      .then((r) => setRelief({ state: 'ok', value: r.points ?? [] }))
      .catch((e) => !isAbort(e) && setRelief({ state: 'error' }))
    setScenarios({ state: 'loading' })
    listReplays(ctrl.signal)
      .then((r) => setScenarios({ state: 'ok', value: sortScenarios(r.scenarios ?? []) }))
      .catch((e) => !isAbort(e) && setScenarios({ state: 'error' }))
    return () => ctrl.abort()
  }, [reload])

  // Load the chosen replay.
  useEffect(() => {
    setPlaying(false)
    setReplayIdx(0)
    if (!replayId) {
      setReplay({ state: 'idle' })
      return
    }
    const ctrl = new AbortController()
    setReplay({ state: 'loading' })
    getReplay(replayId, ctrl.signal)
      .then((r) => {
        setReplay({ state: 'ok', value: r })
        setPlaying(r.hours.length > 1)
      })
      .catch((e) => !isAbort(e) && setReplay({ state: 'error' }))
    return () => ctrl.abort()
  }, [replayId])

  const replayLen = replay.state === 'ok' ? replay.value.hours.length : 0
  useEffect(() => {
    if (!playing || replayLen < 2) return
    const id = setInterval(() => {
      setReplayIdx((i) => {
        if (i + 1 >= replayLen) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, REPLAY_STEP_MS)
    return () => clearInterval(id)
  }, [playing, replayLen])

  const inReplay = Boolean(replayId)

  // ---- "you are here": the live safety location, with what it means for this user ----
  const settings = useSettings()
  const live = useLiveSafety()
  const [flyToMe, setFlyToMe] = useState(0)
  const [seeking, setSeeking] = useState(false)   // waiting for a first fix, then fly to it
  const me = useMemo<MapMe | null>(() => {
    if (!live.coords || inReplay) return null
    const hour = live.now?.now
    const band = hour && isHeatBand(hour.band) ? hour.band : null
    const top = live.warnings.find((w) => w.severity >= 2)
    const text = top ? describeWarning(top, t) : null
    return {
      lat: live.coords.lat,
      lon: live.coords.lon,
      band,
      temp_c: hour?.temp_c ?? null,
      warning: text ? `${text.title}: ${text.headline} ${text.action}` : null,
      accuracy: live.accuracy,
      checkedAt: live.checkedAt,
      personalised: settings.flags.length > 0,
      label: hour ? `${t('me.map.you')} · ${Math.round(hour.temp_c)}°C` : t('me.map.you'),
    }
  }, [live.coords, live.now, live.warnings, live.accuracy, live.checkedAt, settings.flags.length, inReplay, t])
  useEffect(() => {
    if (!seeking || !live.coords) return
    setSeeking(false)
    setFlyToMe((n) => n + 1)
  }, [seeking, live.coords])
  const locate = () => {
    if (live.coords) return setFlyToMe((n) => n + 1)
    setSeeking(true)
    if (!settings.live) updateSettings({ live: true })   // tapping "show my location" is the consent
  }
  const openSafety = useCallback(() => navigate('/me'), [])
  const locateProblem = ['denied', 'unavailable', 'unsupported', 'outside'].includes(live.status)

  // City picker: fly to the city (or all of India) and remember the choice on this device.
  const pickCity = useCallback(
    (id: string) => {
      setCityId(id)
      writeStore(CITY_KEY, id)
      const c = cities.find((x) => x.id === id)
      setFocus({ bounds: c ? c.bounds : INDIA_BOUNDS, key: `${id}:${Date.now()}` })
    },
    [cities],
  )
  // After "show my location", the side panel follows: it shows the city the user is standing in
  // (the camera already flew to them; the remembered city choice is left as it was).
  const myCity = live.now?.location.city_id ?? null
  useEffect(() => {
    if (flyToMe && myCity && cities.some((c) => c.id === myCity)) setCityId(myCity)
  }, [flyToMe, myCity, cities])
  // Once cities load, go to the remembered city (Delhi by default needs no move).
  const firstFocus = useRef(false)
  useEffect(() => {
    if (firstFocus.current || !cities.length) return
    firstFocus.current = true
    if (cityId !== 'delhi') {
      const c = cities.find((x) => x.id === cityId)
      setFocus({ bounds: c ? c.bounds : INDIA_BOUNDS, key: `init:${cityId}` })
    }
  }, [cities, cityId])
  // Replays are Delhi data: bring the camera back to Delhi when one starts.
  useEffect(() => {
    if (!replayId) return
    const d = cities.find((x) => x.id === 'delhi')
    if (d) setFocus({ bounds: d.bounds, key: `replay:${replayId}` })
  }, [replayId, cities])
  const cityName = useCallback(
    (id?: string) => {
      const c = id ? cities.find((x) => x.id === id) : undefined
      return c ? (lang === 'hi' ? c.name_hi : c.name) : null
    },
    [cities, lang],
  )

  const mapData: MapData = useMemo(() => {
    const reliefPts = relief.state === 'ok' ? relief.value : []
    if (inReplay) {
      if (replay.state !== 'ok') return { cells: [], hotspots: [], reports: [], relief: reliefPts, water: [], hour: null, heatUpdated: null, floodUpdated: null }
      const f = replayFrame(replay.value, replayIdx)
      return { ...f, reports: [], relief: reliefPts, water: [], heatUpdated: null, floodUpdated: null }
    }
    const h = heat.state === 'ok' ? heat.value : null
    const fl = flood.state === 'ok' ? flood.value : null
    return {
      cells: liveCells(h, cityName),
      hotspots: liveHotspots(fl),
      reports: reports.state === 'ok' ? reports.value : [],
      relief: reliefPts,
      water: water.state === 'ok' ? water.value : [],
      hour: h?.time ?? fl?.time ?? null,
      heatUpdated: h?.data_updated_at ?? null,
      floodUpdated: fl?.data_updated_at ?? null,
    }
  }, [inReplay, replay, replayIdx, heat, flood, reports, relief, water, cityName])

  const onProvider = useCallback((name: 'amazon' | 'openfreemap', items: AttribItem[]) => {
    setProvider({ name, items: items.length ? items : PROVIDER_FALLBACK[name] })
  }, [])

  const replayLabel = replay.state === 'ok' ? replay.value.label : (scenarios.state === 'ok' && scenarios.value.find((s) => s.id === replayId)?.label) || ''

  // ---------- panel pieces ----------
  const currentCity = cities.find((c) => c.id === cityId)
  const cityPicker = (
    <div>
      <label htmlFor="city-select" className="mb-1 flex items-center gap-2 text-lg font-bold">
        <Icon name="city" size={20} />
        {t('city.title')}
      </label>
      <select
        id="city-select"
        className="w-full rounded-lg border-2 border-line bg-white px-3 py-2"
        value={cities.some((c) => c.id === cityId) || cityId === 'india' ? cityId : 'delhi'}
        onChange={(e) => pickCity(e.target.value)}
        disabled={!cities.length || inReplay}
      >
        <option value="india">{t('city.allIndia')}</option>
        {(['full', 'heat_and_rain', 'city'] as const).map((tier) => {
          const group = cities.filter((c) => c.tier === tier).sort((a, b) => (tier === 'city' ? a.name.localeCompare(b.name) : 0))
          return group.length ? (
            <optgroup key={tier} label={t(`city.group.${tier}`)}>
              {group.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'hi' ? `${c.name_hi} (${c.name})` : c.name}
                </option>
              ))}
            </optgroup>
          ) : null
        })}
      </select>
      <p className="mt-1 text-muted">
        {cityId === 'india'
          ? t('city.noteIndia')
          : currentCity?.tier === 'full'
            ? t('city.noteFull')
            : currentCity
              ? currentCity.agencies.civic === currentCity.agencies.water
                ? t('city.notePartialOne', { body: currentCity.agency_names[currentCity.agencies.civic] ?? currentCity.agencies.civic })
                : t('city.notePartial', { civic: currentCity.agency_names[currentCity.agencies.civic] ?? currentCity.agencies.civic, water: currentCity.agency_names[currentCity.agencies.water] ?? currentCity.agencies.water })
              : null}
      </p>
    </div>
  )

  const replayPicker = (
    <div>
      <label htmlFor="replay-select" className="mb-1 block text-lg font-bold">
        {t('replay.title')}
      </label>
      <select
        id="replay-select"
        className="w-full rounded-lg border-2 border-line bg-white px-3 py-2"
        value={replayId}
        onChange={(e) => setReplayId(e.target.value)}
        disabled={!apiReady}
      >
        <option value="">{t('replay.live')}</option>
        {scenarios.state === 'ok' &&
          scenarios.value.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label || s.id}
            </option>
          ))}
      </select>
      {scenarios.state === 'error' && <p className="mt-1 text-muted">{t('replay.unavailable')}</p>}
    </div>
  )

  const liveTime = (
    <div>
      <h2 className="sr-only lg:not-sr-only lg:text-lg lg:font-bold">{t('time.title')}</h2>
      {hours.length > 0 ? (
        <>
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 font-semibold" aria-live="polite">
            <span>{formatHour(selectedHour, lang)}</span>
            <span className="text-muted">
              {hourIdx === 0 ? t('time.now') : t('time.offset', { h: hoursBetween(hours[0], selectedHour) ?? hourIdx })}
            </span>
          </p>
          <input
            type="range"
            className="slider"
            min={0}
            max={hours.length - 1}
            step={1}
            value={hourIdx}
            onChange={(e) => setHourIdx(Number(e.target.value))}
            aria-label={t('time.sliderLabel')}
            aria-valuetext={formatHour(selectedHour, lang)}
          />
        </>
      ) : heat.state === 'loading' ? (
        <p className="text-muted" role="status">{t('time.loading')}</p>
      ) : null}
    </div>
  )

  const replayTime =
    replay.state === 'ok' ? (
      <div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!playing && replayIdx >= replayLen - 1) setReplayIdx(0)
              setPlaying((p) => !p)
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
            aria-pressed={playing}
          >
            <Icon name={playing ? 'pause' : 'play'} size={20} />
            {playing ? t('replay.pause') : t('replay.play')}
          </button>
          <span className="min-w-0">
            <span className="block font-semibold">{formatHour(replay.value.hours[replayIdx]?.time, lang)}</span>
            <span className="block text-muted">{t('replay.hourOf', { n: replayIdx + 1, total: replayLen })}</span>
          </span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={Math.max(0, replayLen - 1)}
          step={1}
          value={replayIdx}
          onChange={(e) => setReplayIdx(Number(e.target.value))}
          aria-label={t('replay.sliderLabel')}
          aria-valuetext={formatHour(replay.value.hours[replayIdx]?.time, lang)}
        />
        {replay.value.source && <p className="text-muted">{t('replay.source', { source: replay.value.source })}</p>}
      </div>
    ) : replay.state === 'loading' ? (
      <p role="status" className="text-muted">{t('replay.loading')}</p>
    ) : replay.state === 'error' ? (
      <p role="alert" className="font-semibold">{t('replay.failed')}</p>
    ) : null

  const statusLines = !apiReady ? (
    <p role="alert" className="rounded-lg border-2 border-[#c92a2a] bg-white p-2 font-semibold">{t('data.notConfigured')}</p>
  ) : inReplay ? null : (
    <div className="space-y-0.5 text-muted">
      {heat.state === 'error' && <p className="font-semibold text-ink">{t('data.heatUnavailable')}</p>}
      {flood.state === 'error' && <p className="font-semibold text-ink">{t('data.floodUnavailable')}</p>}
      {reports.state === 'error' && visible.reports && <p className="font-semibold text-ink">{t('data.reportsUnavailable')}</p>}
      {relief.state === 'error' && visible.relief && <p className="font-semibold text-ink">{t('data.reliefUnavailable')}</p>}
      {water.state === 'error' && visible.water && <p className="font-semibold text-ink">{t('data.waterUnavailable')}</p>}
      {mapData.heatUpdated && mapData.heatUpdated === mapData.floodUpdated ? (
        <p>{t('data.updated', { time: formatHour(mapData.heatUpdated, lang) })}</p>
      ) : (
        <>
          {mapData.heatUpdated && <p>{t('data.heatUpdated', { time: formatHour(mapData.heatUpdated, lang) })}</p>}
          {mapData.floodUpdated && <p>{t('data.floodUpdated', { time: formatHour(mapData.floodUpdated, lang) })}</p>}
        </>
      )}
      {(heat.state === 'error' || flood.state === 'error' || reports.state === 'error' || relief.state === 'error') && (
        <button type="button" className="inline-flex min-h-11 items-center gap-2 font-semibold text-[#0b5394] underline" onClick={() => setReload((n) => n + 1)}>
          <Icon name="refresh" size={18} />
          {t('data.retry')}
        </button>
      )}
    </div>
  )

  const chatButton = (cls: string) => (
    <button
      type="button"
      onClick={() => openChat()}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#c2410c] px-4 py-2 font-bold text-white shadow hover:bg-[#9a3412] ${cls}`}
    >
      <Icon name="chat" size={20} />
      {t('chat.open')}
    </button>
  )

  const details = (
    <div className="space-y-5">
      <LayerToggles value={visible} onChange={setVisible} />
      <Legend />
    </div>
  )

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Map */}
      <div className="relative min-h-0 flex-1 lg:order-2">
        <RiskMap data={mapData} visible={visible} lang={lang} clock={clock} onProvider={onProvider} focus={focus} me={me} flyToMe={flyToMe} onOpenSafety={openSafety} />
        {!inReplay && (
          <div className="absolute top-[78px] right-[10px] z-10 flex items-center gap-2">
            {(locateProblem || (seeking && live.status === 'locating')) && (
              <p role="status" className="max-w-56 rounded-lg bg-white px-2.5 py-1.5 text-[14px] font-semibold shadow">
                {live.status === 'locating' ? t('me.live.locating') : live.status === 'outside' ? t('me.live.outside') : t(`chat.location${live.status === 'denied' ? 'Denied' : live.status === 'unsupported' ? 'Unsupported' : 'Unavailable'}`)}
              </p>
            )}
            <button
              type="button"
              onClick={locate}
              aria-label={t('me.map.locate')}
              title={t('me.map.locate')}
              aria-pressed={Boolean(me)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg shadow-[0_0_0_2px_rgb(0_0_0/0.1)] ${me ? 'bg-[#1c7ed6] text-white' : 'bg-white text-[#1c7ed6]'}`}
            >
              <Icon name="location" size={22} />
            </button>
          </div>
        )}
        {inReplay && (
          <div
            role="status"
            className="absolute top-2 right-14 left-2 z-10 flex flex-wrap items-center gap-x-3 rounded-lg bg-[#212529]/95 px-3 py-1.5 text-white shadow-lg lg:right-auto lg:max-w-xl"
          >
            <p className="flex min-w-0 items-center gap-2 font-bold">
              <Icon name="replay" size={22} className="shrink-0" />
              <span>{replayLabel || t('replay.loading')}</span>
            </p>
            <button type="button" onClick={() => setReplayId('')} className="min-h-11 font-semibold underline">
              {t('replay.exit')}
            </button>
          </div>
        )}
        <div className="absolute right-3 bottom-3 z-10 hidden lg:block">{chatButton('text-lg')}</div>
      </div>

      {/* Control panel: below the map on phones, sidebar on desktop */}
      <aside
        aria-label={t('layers.title')}
        className="z-20 flex max-h-[62%] shrink-0 flex-col border-t border-line bg-panel shadow-[0_-4px_12px_rgb(0_0_0/0.12)] lg:order-1 lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-e lg:shadow-none"
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-3 pb-2">
          {statusLines}
          {inReplay ? replayTime : liveTime}
          {cityPicker}
          {currentCity && !inReplay && (
            <details className="group rounded-2xl border border-line bg-canvas p-3" open>
              <summary className="flex cursor-pointer list-none items-center justify-between font-bold [&::-webkit-details-marker]:hidden">
                {t('dash.cityNow', { city: lang === 'hi' ? currentCity.name_hi : currentCity.name })}
                <Icon name="chevron-down" size={20} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3">
                <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-line/50" />}>
                  <CityDashboard key={currentCity.id} lat={currentCity.lat} lon={currentCity.lon} label={currentCity.name} compact />
                </Suspense>
              </div>
            </details>
          )}
          <div className="flex gap-2 lg:hidden">
            <button
              type="button"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-brand px-3 py-2 font-semibold text-brand"
              aria-expanded={panelOpen}
              aria-controls="panel-details"
              onClick={() => setPanelOpen((o) => !o)}
            >
              <Icon name={panelOpen ? 'close' : 'layers'} size={20} />
              {panelOpen ? t('legend.hide') : t('legend.show')}
            </button>
            {chatButton('flex-1')}
          </div>
          <div className={`${panelOpen ? 'block' : 'hidden'} space-y-5 pt-2 lg:block`} id="panel-details">
            {replayPicker}
            {details}
          </div>
        </div>
        <div className="shrink-0 border-t border-line px-4 py-2">
          <Attribution items={provider.items} />
        </div>
      </aside>

    </div>
  )
}
