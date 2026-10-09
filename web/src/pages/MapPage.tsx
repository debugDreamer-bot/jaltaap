import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFlood, getHeat, getRelief, getReplay, getReports, listReplays } from '../api/endpoints'
import { isAbort } from '../api/client'
import type { FloodResponse, HeatResponse, PublicReport, ReliefPoint, ReplayScenario, ScenarioSummary } from '../api/types'
import { Attribution } from '../components/Attribution'
import { PROVIDER_FALLBACK, type AttribItem } from '../lib/attribution'
import { Icon } from '../components/Icon'
import { LayerToggles } from '../components/LayerToggles'
import { Legend } from '../components/Legend'
import { USE_MOCK, config } from '../config'
import { currentLang } from '../i18n'
import { formatHour, hoursBetween, istIsoHoursAgo } from '../lib/time'
import { RiskMap, type LayerVisibility, type MapCell, type MapData, type MapHotspot } from '../map/RiskMap'
import { isFloodLevel, isHeatBand } from '../theme'

const ChatDrawer = lazy(() => import('../components/ChatDrawer'))

type Load<T> = { state: 'idle' | 'loading' } | { state: 'ok'; value: T } | { state: 'error' }

const REPORTS_WINDOW_H = 12
const REPLAY_STEP_MS = 1000
const PREFERRED_ORDER = ['heat-2026-05-22', 'flood-2026-07-09']

const apiReady = USE_MOCK || Boolean(config.apiUrl)

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

function liveCells(h: HeatResponse | null): MapCell[] {
  if (!h) return []
  return h.cells
    .filter((c) => isHeatBand(c.band) && Array.isArray(c.bounds) && c.bounds.length === 4)
    .map((c) => ({ id: c.id, bounds: c.bounds, band: c.band, temp_c: c.temp_c ?? null, rh: c.rh ?? null, wet_bulb_c: c.wet_bulb_c ?? null }))
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

  const [visible, setVisible] = useState<LayerVisibility>({ heat: true, flood: true, reports: true, relief: false })
  const [panelOpen, setPanelOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
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

  const mapData: MapData = useMemo(() => {
    const reliefPts = relief.state === 'ok' ? relief.value : []
    if (inReplay) {
      if (replay.state !== 'ok') return { cells: [], hotspots: [], reports: [], relief: reliefPts, hour: null, heatUpdated: null, floodUpdated: null }
      const f = replayFrame(replay.value, replayIdx)
      return { ...f, reports: [], relief: reliefPts, heatUpdated: null, floodUpdated: null }
    }
    const h = heat.state === 'ok' ? heat.value : null
    const fl = flood.state === 'ok' ? flood.value : null
    return {
      cells: liveCells(h),
      hotspots: liveHotspots(fl),
      reports: reports.state === 'ok' ? reports.value : [],
      relief: reliefPts,
      hour: h?.time ?? fl?.time ?? null,
      heatUpdated: h?.data_updated_at ?? null,
      floodUpdated: fl?.data_updated_at ?? null,
    }
  }, [inReplay, replay, replayIdx, heat, flood, reports, relief])

  const onProvider = useCallback((name: 'amazon' | 'openfreemap', items: AttribItem[]) => {
    setProvider({ name, items: items.length ? items : PROVIDER_FALLBACK[name] })
  }, [])

  const replayLabel = replay.state === 'ok' ? replay.value.label : (scenarios.state === 'ok' && scenarios.value.find((s) => s.id === replayId)?.label) || ''

  // ---------- panel pieces ----------
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
      onClick={() => setChatOpen(true)}
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
        <RiskMap data={mapData} visible={visible} lang={lang} clock={clock} onProvider={onProvider} />
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

      {chatOpen && (
        <Suspense fallback={null}>
          <ChatDrawer onClose={() => setChatOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
