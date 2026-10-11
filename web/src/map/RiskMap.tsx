import { useEffect, useRef } from 'react'
import './setup'
import { Map as MLMap, Marker, NavigationControl, Popup, type MapGeoJSONFeature, type GeoJSONSource } from 'maplibre-gl'
import { DELHI_CENTER, DELHI_ZOOM, OPENFREEMAP_STYLE, mapStyleUrl } from '../config'
import { parseAttribution, type AttribItem } from '../lib/attribution'
import { ageHours } from '../lib/time'
import { HEAT_COLORS, FLOOD_COLORS, HEAT_FILL_OPACITY } from '../theme'
import type { FeatureCollection } from 'geojson'
import type { PublicReport, ReliefPoint, WaterIssue } from '../api/types'
import { addMapImages } from './images'
import { heatPopup, hotspotPopup, mePopup, reliefPopup, reportPopup, waterIssuePopup, type HeatCellInfo, type HotspotInfo, type MeInfo } from './popups'


export interface MapCell extends HeatCellInfo {
  id: string
  bounds: [number, number, number, number]
}

export interface MapHotspot extends HotspotInfo {
  id: string
  lat: number
  lon: number
  risk: number
}

export interface MapData {
  cells: MapCell[]
  hotspots: MapHotspot[]
  reports: PublicReport[]
  relief: ReliefPoint[]
  water: WaterIssue[]
  hour: string | null
  heatUpdated: string | null
  floodUpdated: string | null
}

export interface LayerVisibility {
  heat: boolean
  flood: boolean
  reports: boolean
  relief: boolean
  water: boolean
}

/** Where the camera should go; `key` changes whenever the user picks a place again. */
export interface MapFocus {
  bounds: [number, number, number, number]
  key: string
}

/** The user's live position and what it means for them (from live safety). */
export interface MapMe extends Omit<MeInfo, 'onOpenSafety'> {
  lat: number
  lon: number
  label: string
}

interface Props {
  data: MapData
  visible: LayerVisibility
  lang: string
  /** Bumped periodically so report pins re-fade without new data. */
  clock: number
  onProvider: (p: 'amazon' | 'openfreemap', attribution: AttribItem[]) => void
  focus?: MapFocus | null
  me?: MapMe | null
  /** Increase to fly to `me`. */
  flyToMe?: number
  onOpenSafety?: () => void
}

const LAYERS = {
  heat: ['heat-fill', 'heat-line', 'heat-icon', 'city-heat'],
  flood: ['flood-circle', 'flood-icon', 'flood-underpass'],
  reports: ['reports-pin'],
  relief: ['relief-icon'],
  water: ['water-issue'],
} as const

// Click priority, top-most first.
const CLICKABLE = ['city-heat', 'water-issue', 'relief-icon', 'reports-pin', 'flood-circle', 'flood-icon', 'heat-fill']
const BAND_RANK = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 } as const

/** One marker per city (its worst cell's band) so the heat layer reads at all-India zoom. */
function citySummary(cells: MapCell[]): Array<{ key: string; city: string; band: MapCell['band']; lon: number; lat: number; worst: MapCell }> {
  const by = new Map<string, MapCell[]>()
  for (const c of cells) if (c.city) by.set(c.city, [...(by.get(c.city) ?? []), c])
  return [...by.entries()].map(([city, cs]) => {
    const worst = cs.reduce((a, b) => (BAND_RANK[b.band] > BAND_RANK[a.band] ? b : a))
    const lon = cs.reduce((n, c) => n + (c.bounds[0] + c.bounds[2]) / 2, 0) / cs.length
    const lat = cs.reduce((n, c) => n + (c.bounds[1] + c.bounds[3]) / 2, 0) / cs.length
    return { key: `city:${city}`, city, band: worst.band, lon, lat, worst }
  })
}

type FC = FeatureCollection

const empty = (): FC => ({ type: 'FeatureCollection', features: [] })

function cellsFC(cells: MapCell[]): { fill: FC; centers: FC } {
  const fill: FC = empty()
  const centers: FC = empty()
  for (const c of cells) {
    const [w, s, e, n] = c.bounds
    fill.features.push({
      type: 'Feature',
      properties: { key: c.id, band: c.band },
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    })
    centers.features.push({
      type: 'Feature',
      properties: { key: c.id, band: c.band },
      geometry: { type: 'Point', coordinates: [(w + e) / 2, (s + n) / 2] },
    })
  }
  return { fill, centers }
}

function hotspotsFC(hs: MapHotspot[]): FC {
  return {
    type: 'FeatureCollection',
    features: hs.map((h) => ({
      type: 'Feature',
      properties: { key: h.id, level: h.level, risk: Math.max(0, Math.min(1, h.risk ?? 0)), underpass: h.type === 'underpass' },
      geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
    })),
  }
}

function reportsFC(rs: PublicReport[], now: number): FC {
  return {
    type: 'FeatureCollection',
    features: rs.map((r) => {
      const age = ageHours(r.created_at, now)
      const fade = r.status !== 'confirmed' && (age === null || age > 3)
      return {
        type: 'Feature',
        properties: { key: r.id, opacity: fade ? 0.35 : 1 },
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      }
    }),
  }
}

function reliefFC(ps: ReliefPoint[]): FC {
  return {
    type: 'FeatureCollection',
    features: ps
      .filter((p) => ['cooling', 'water', 'hospital'].includes(p.kind))
      .map((p) => ({
        type: 'Feature',
        properties: { key: p.id, kind: p.kind },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
  }
}

function cityFC(cells: MapCell[]): FC {
  return {
    type: 'FeatureCollection',
    features: citySummary(cells).map((c) => ({
      type: 'Feature',
      properties: { key: c.key, band: c.band },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  }
}

function waterFC(ws: WaterIssue[]): FC {
  return {
    type: 'FeatureCollection',
    features: ws
      .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon))
      .map((w, i) => ({
        type: 'Feature',
        properties: { key: `${w.issue}:${w.lat}:${w.lon}:${i}` },
        geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
      })),
  }
}

function addLayers(map: MLMap) {
  const src = (id: string) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() })
  }
  ;['heat', 'heat-centers', 'city-heat', 'flood', 'reports', 'relief', 'water'].forEach(src)

  const bandColor = ['match', ['get', 'band'], 'GREEN', HEAT_COLORS.GREEN.fill, 'YELLOW', HEAT_COLORS.YELLOW.fill, 'ORANGE', HEAT_COLORS.ORANGE.fill, 'RED', HEAT_COLORS.RED.fill, '#adb5bd'] as unknown as string
  const levelColor = ['match', ['get', 'level'], 'LOW', FLOOD_COLORS.LOW.fill, 'MEDIUM', FLOOD_COLORS.MEDIUM.fill, 'HIGH', FLOOD_COLORS.HIGH.fill, 'SEVERE', FLOOD_COLORS.SEVERE.fill, 'CONFIRMED', FLOOD_COLORS.CONFIRMED.fill, '#adb5bd'] as unknown as string

  const add = (layer: Parameters<MLMap['addLayer']>[0]) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer)
  }
  add({ id: 'heat-fill', type: 'fill', source: 'heat', paint: { 'fill-color': bandColor, 'fill-opacity': HEAT_FILL_OPACITY } })
  add({ id: 'heat-line', type: 'line', source: 'heat', paint: { 'line-color': '#ffffff', 'line-opacity': 0.7, 'line-width': 1 } })
  add({
    id: 'heat-icon',
    type: 'symbol',
    source: 'heat-centers',
    minzoom: 9,
    layout: {
      'icon-image': ['concat', 'heat-', ['get', 'band']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.75, 12, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.9 },
  })
  add({
    id: 'city-heat',
    type: 'symbol',
    source: 'city-heat',
    maxzoom: 8,
    layout: {
      'icon-image': ['concat', 'heat-', ['get', 'band']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3.5, 1.1, 8, 1.4],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  add({
    id: 'flood-circle',
    type: 'circle',
    source: 'flood',
    paint: {
      'circle-color': levelColor,
      'circle-radius': ['interpolate', ['linear'], ['get', 'risk'], 0, 10, 1, 22],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.95,
    },
  })
  add({
    id: 'flood-icon',
    type: 'symbol',
    source: 'flood',
    layout: {
      'icon-image': ['concat', 'flood-', ['get', 'level']],
      'icon-size': ['interpolate', ['linear'], ['get', 'risk'], 0, 0.6, 1, 1.15],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  add({
    id: 'flood-underpass',
    type: 'symbol',
    source: 'flood',
    filter: ['==', ['get', 'underpass'], true],
    layout: {
      'icon-image': 'underpass-badge',
      'icon-offset': [15, -15],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  add({
    id: 'reports-pin',
    type: 'symbol',
    source: 'reports',
    layout: { 'icon-image': 'report-pin', 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    paint: { 'icon-opacity': ['get', 'opacity'] },
  })
  add({
    id: 'water-issue',
    type: 'symbol',
    source: 'water',
    layout: {
      'icon-image': 'water-issue',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  add({
    id: 'relief-icon',
    type: 'symbol',
    source: 'relief',
    layout: {
      'icon-image': ['concat', 'relief-', ['get', 'kind']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 13, 1.1],
      'icon-allow-overlap': true,
    },
  })
}

interface Snapshot {
  data: MapData
  visible: LayerVisibility
  clock: number
}

/** Push data and layer visibility into the map. */
function apply(map: MLMap, snap: Snapshot) {
  const { data: d, visible: v, clock: now } = snap
  const { fill, centers } = cellsFC(d.cells)
  ;(map.getSource('heat') as GeoJSONSource | undefined)?.setData(fill)
  ;(map.getSource('heat-centers') as GeoJSONSource | undefined)?.setData(centers)
  ;(map.getSource('city-heat') as GeoJSONSource | undefined)?.setData(cityFC(d.cells))
  ;(map.getSource('flood') as GeoJSONSource | undefined)?.setData(hotspotsFC(d.hotspots))
  ;(map.getSource('reports') as GeoJSONSource | undefined)?.setData(reportsFC(d.reports, now))
  ;(map.getSource('relief') as GeoJSONSource | undefined)?.setData(reliefFC(d.relief))
  ;(map.getSource('water') as GeoJSONSource | undefined)?.setData(waterFC(d.water))
  for (const [group, ids] of Object.entries(LAYERS) as Array<[keyof LayerVisibility, readonly string[]]>) {
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v[group] ? 'visible' : 'none')
  }
}

export function RiskMap({ data, visible, lang, clock, onProvider, focus, me, flyToMe = 0, onOpenSafety }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const readyRef = useRef(false)
  const popupRef = useRef<Popup | null>(null)
  const hoverRef = useRef<Popup | null>(null)
  const latest = useRef<Snapshot>({ data, visible, clock })
  const onProviderRef = useRef(onProvider)

  useEffect(() => {
    onProviderRef.current = onProvider
  }, [onProvider])

  useEffect(() => {
    if (!containerRef.current) return
    const style = mapStyleUrl()
    let provider = style.provider
    let fellBack = false
    const map = new MLMap({
      container: containerRef.current,
      style: style.url,
      center: DELHI_CENTER,
      zoom: DELHI_ZOOM,
      minZoom: 3.5, // all of India: the city picker flies between covered cities
      maxZoom: 17,
      attributionControl: false, // attribution is rendered, always visible, below the map
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    const onError = (e: { error?: { message?: string } }) => {
      // Amazon style failed (bad or missing key, network): fall back to OpenFreeMap once.
      if (!readyRef.current && provider === 'amazon' && !fellBack) {
        fellBack = true
        provider = 'openfreemap'
        map.setStyle(OPENFREEMAP_STYLE)
        return
      }
      if (import.meta.env.DEV) console.warn('map:', e.error?.message)
    }
    map.on('error', onError)

    map.on('style.load', async () => {
      readyRef.current = false
      await addMapImages(map)
      addLayers(map)
      readyRef.current = true
      apply(map, latest.current)
      const sources = map.getStyle().sources ?? {}
      const items: AttribItem[] = []
      for (const s of Object.values(sources)) {
        const a = (s as { attribution?: string }).attribution
        if (a) items.push(...parseAttribution(a))
      }
      onProviderRef.current(provider, items)
    })

    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const show = (f: MapGeoJSONFeature): HTMLElement | null => {
      const { data: d } = latest.current
      const key = f.properties?.key
      switch (f.layer.id) {
        case 'city-heat': {
          const c = citySummary(d.cells).find((x) => x.key === key)
          return c ? heatPopup({ ...c.worst, city: c.city }, d.hour, d.heatUpdated, true) : null
        }
        case 'heat-fill': {
          const c = d.cells.find((x) => x.id === key)
          return c ? heatPopup(c, d.hour, d.heatUpdated) : null
        }
        case 'flood-circle':
        case 'flood-icon': {
          const h = d.hotspots.find((x) => x.id === key)
          return h ? hotspotPopup(h, d.hour, d.floodUpdated) : null
        }
        case 'reports-pin': {
          const r = d.reports.find((x) => x.id === key)
          return r ? reportPopup(r) : null
        }
        case 'relief-icon': {
          const p = d.relief.find((x) => x.id === key)
          return p ? reliefPopup(p) : null
        }
        case 'water-issue': {
          const w = d.water.find((x, i) => `${x.issue}:${x.lat}:${x.lon}:${i}` === key)
          return w ? waterIssuePopup(w) : null
        }
      }
      return null
    }

    map.on('click', (e) => {
      const layers = CLICKABLE.filter((id) => map.getLayer(id))
      const feats = map.queryRenderedFeatures(e.point, { layers })
      feats.sort((a, b) => CLICKABLE.indexOf(a.layer.id) - CLICKABLE.indexOf(b.layer.id))
      hoverRef.current?.remove()
      popupRef.current?.remove()
      const node = feats.length ? show(feats[0]) : null
      if (!node) return
      popupRef.current = new Popup({ maxWidth: '320px', focusAfterOpen: false }).setLngLat(e.lngLat).setDOMContent(node).addTo(map)
    })

    map.on('mousemove', (e) => {
      const layers = CLICKABLE.filter((id) => map.getLayer(id))
      const feats = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : []
      map.getCanvas().style.cursor = feats.length ? 'pointer' : ''
      if (!canHover) return
      const heat = feats.length === 1 && feats[0].layer.id === 'heat-fill' ? feats[0] : null
      if (!heat || popupRef.current?.isOpen()) {
        hoverRef.current?.remove()
        return
      }
      const node = show(heat)
      if (!node) return
      if (!hoverRef.current) hoverRef.current = new Popup({ closeButton: false, closeOnClick: false, maxWidth: '320px', offset: 12 })
      hoverRef.current.setLngLat(e.lngLat).setDOMContent(node)
      if (!hoverRef.current.isOpen()) hoverRef.current.addTo(map)
    })
    map.on('mouseout', () => hoverRef.current?.remove())

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    latest.current = { data, visible, clock }
    if (mapRef.current && readyRef.current) apply(mapRef.current, latest.current)
  }, [data, visible, clock])

  // Fly to a chosen city (or all of India). Reduced motion: jump instead of animating.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const [w, s, e, n] = focus.bounds
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 11, duration: still ? 0 : 1200 })
  }, [focus])

  // "You are here": one marker that follows the live location; its popup is rebuilt as data changes.
  const meMarker = useRef<{ marker: Marker; el: HTMLElement; label: HTMLElement; popup: Popup } | null>(null)
  const meLatest = useRef(me)
  const openSafety = useRef(onOpenSafety)
  useEffect(() => {
    meLatest.current = me
    openSafety.current = onOpenSafety
    const map = mapRef.current
    if (!map) return
    if (!me) {
      meMarker.current?.marker.remove()
      meMarker.current = null
      return
    }
    if (!meMarker.current) {
      const el = document.createElement('div')
      el.className = 'jt-me'
      el.setAttribute('role', 'button')
      el.setAttribute('tabindex', '0')
      const dot = document.createElement('span')
      dot.className = 'jt-me-dot'
      const label = document.createElement('span')
      label.className = 'jt-me-label'
      el.append(dot, label)
      const popup = new Popup({ maxWidth: '300px', offset: 18, focusAfterOpen: false })
      const marker = new Marker({ element: el, anchor: 'top', offset: [0, -11] }).setLngLat([me.lon, me.lat]).setPopup(popup).addTo(map)
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') marker.togglePopup()
      })
      meMarker.current = { marker, el, label, popup }
    }
    const m = meMarker.current
    m.marker.setLngLat([me.lon, me.lat])
    m.label.textContent = me.label
    m.el.setAttribute('aria-label', me.label)
    m.el.style.setProperty('--jt-me-halo', me.band && (me.band === 'ORANGE' || me.band === 'RED') ? HEAT_COLORS[me.band].fill : '#1c7ed6')
    m.popup.setDOMContent(mePopup({ ...me, onOpenSafety: () => openSafety.current?.() }))
  }, [me, onOpenSafety, lang])

  useEffect(() => () => {
    meMarker.current?.marker.remove()
    meMarker.current = null
  }, [])

  // Fly to the user when asked (the locate button). Reduced motion: jump.
  useEffect(() => {
    const map = mapRef.current
    const at = meLatest.current
    if (!map || !flyToMe || !at) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.flyTo({ center: [at.lon, at.lat], zoom: Math.max(map.getZoom(), 13.5), duration: still ? 0 : 1200 })
  }, [flyToMe])

  // Popups hold translated text: close them when the language changes.
  useEffect(() => {
    popupRef.current?.remove()
    hoverRef.current?.remove()
  }, [lang])

  // MapLibre's CSS sets position: relative on the container, so size it from a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="Map" />
    </div>
  )
}
