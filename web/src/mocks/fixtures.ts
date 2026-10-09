// MOCK DATA for local development only (VITE_USE_MOCK=true). Values are made up so the UI
// can be exercised without the backend. They are shown under a "MOCK DATA" banner.
import type {
  BriefResponse,
  FloodResponse,
  HeatResponse,
  Hotspot,
  OfficerReport,
  ReliefPoint,
  ReplayScenario,
  ScenarioSummary,
} from '../api/types'
import type { FloodLevel, HeatBand } from '../theme'

const LATS = [28.4, 28.5, 28.6, 28.7, 28.8, 28.9]
const LONS = [76.8, 76.9, 77.0, 77.1, 77.2, 77.3]

export function istIso(d: Date): string {
  const t = new Date(d.getTime() + 5.5 * 3_600_000)
  return t.toISOString().replace(/\.\d{3}Z$/, '+05:30')
}

export function currentHourIst(): Date {
  const now = Date.now()
  const ist = now + 5.5 * 3_600_000
  const floored = ist - (ist % 3_600_000)
  return new Date(floored - 5.5 * 3_600_000)
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

function stull(t: number, rh: number): number {
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  )
}

function band(t: number, wb: number): HeatBand {
  if (wb >= 30 || t >= 44) return 'RED'
  if (wb >= 28 || t >= 40) return 'ORANGE'
  if (wb >= 25 || t >= 37) return 'YELLOW'
  return 'GREEN'
}

function cellBase(lat: number, lon: number) {
  const [w, s, e, n] = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05].map((v) => Math.round(v * 100) / 100)
  return { id: `g_${lat.toFixed(1)}_${lon.toFixed(1)}`, lat, lon, bounds: [w, s, e, n] as [number, number, number, number] }
}

function weather(id: string, hourOfDay: number, peak: number, humid: number) {
  const diurnal = Math.cos(((hourOfDay - 15) / 24) * 2 * Math.PI) // 1 at 15:00
  const t = Math.round((peak - 8 + 8 * diurnal + 3 * (hash(id) - 0.5)) * 10) / 10
  const rh = Math.round(Math.min(95, Math.max(12, humid - 18 * diurnal + 10 * (hash(id + 'h') - 0.5))))
  const wb = Math.round(stull(t, rh) * 10) / 10
  return { band: band(t, wb), temp_c: t, rh, wet_bulb_c: wb }
}

const hourOf = (iso: string) => Number(iso.slice(11, 13))

export function heatFor(timeIso: string | undefined): HeatResponse {
  const start = currentHourIst()
  const hours = Array.from({ length: 49 }, (_, i) => istIso(new Date(start.getTime() + i * 3_600_000)))
  const time = timeIso && hours.includes(timeIso) ? timeIso : hours[0]
  const cells = LATS.flatMap((lat) => LONS.map((lon) => cellBase(lat, lon))).map((c) => ({ ...c, ...weather(c.id, hourOf(time), 41, 45) }))
  return { time, source: 'open-meteo', data_updated_at: istIso(new Date(start.getTime() + 5 * 60_000)), hours_available: hours, cells }
}

export const HOTSPOTS: Array<Omit<Hotspot, 'level' | 'risk' | 'rain_next_1h_mm' | 'rain_next_3h_mm' | 'confirmed_reports'>> = [
  { id: 'hs_zakhira', name: 'Zakhira flyover and underpass', type: 'underpass', agency: 'PWD', lat: 28.6611, lon: 77.15 },
  { id: 'hs_minto', name: 'Minto Bridge underpass', type: 'underpass', agency: 'PWD', lat: 28.6335, lon: 77.2265 },
  { id: 'hs_pul_prahladpur', name: 'Pul Prahladpur underpass', type: 'underpass', agency: 'PWD', lat: 28.502, lon: 77.289 },
  { id: 'hs_ito', name: 'ITO crossing', type: 'road', agency: 'PWD', lat: 28.628, lon: 77.241 },
  { id: 'hs_azad_market', name: 'Azad Market', type: 'road', agency: 'MCD', lat: 28.6667, lon: 77.2042 },
  { id: 'hs_moolchand', name: 'Moolchand underpass', type: 'underpass', agency: 'PWD', lat: 28.5645, lon: 77.2345 },
  { id: 'hs_dhaula_kuan', name: 'Dhaula Kuan', type: 'road', agency: 'NHAI', lat: 28.5918, lon: 77.1617 },
  { id: 'hs_najafgarh', name: 'Najafgarh drain crossing', type: 'road', agency: 'I&FC', lat: 28.611, lon: 76.98 },
]

function levelFor(risk: number): FloodLevel {
  if (risk >= 0.8) return 'SEVERE'
  if (risk >= 0.55) return 'HIGH'
  if (risk >= 0.3) return 'MEDIUM'
  return 'LOW'
}

function floodState(id: string, hourOfDay: number, wetness: number) {
  const r1 = Math.round(Math.max(0, wetness * (10 + 25 * Math.sin((hourOfDay / 24) * Math.PI)) * hash(id + 'r')) * 10) / 10
  const r3 = Math.round(r1 * 2.1 * 10) / 10
  const risk = Math.round(Math.min(1, (0.3 + 0.5 * hash(id)) * Math.min(1, r3 / 40) + (wetness > 0.5 ? 0.15 : 0)) * 100) / 100
  return { r1, r3, risk }
}

export function floodFor(timeIso: string | undefined): FloodResponse {
  const time = timeIso ?? heatFor(undefined).time
  const hotspots: Hotspot[] = HOTSPOTS.map((h, i) => {
    const { r1, r3, risk } = floodState(h.id, hourOf(time), 0.8)
    const confirmed = i === 0 ? 2 : 0
    return { ...h, level: confirmed ? 'CONFIRMED' : levelFor(risk), risk: confirmed ? Math.max(risk, 0.7) : risk, rain_next_1h_mm: r1, rain_next_3h_mm: r3, confirmed_reports: confirmed }
  })
  return { time, horizon_h: 3, source: 'open-meteo', data_updated_at: heatFor(undefined).data_updated_at, hotspots }
}

export const RELIEF: ReliefPoint[] = [
  { id: 'rp_mock_cz_1', name: 'Cooling zone (mock) near Jama Masjid', kind: 'cooling', status: 'seasonal', lat: 28.6507, lon: 77.2334, cool_room: 'yes', source: 'https://example.org/mock-source' },
  { id: 'rp_mock_cz_2', name: 'Cooling zone (mock) at Kashmere Gate ISBT', kind: 'cooling', status: 'seasonal', lat: 28.6675, lon: 77.2282, cool_room: 'no', source: null },
  { id: 'rp_mock_w_1', name: 'Water point (mock) at Rajiv Chowk', kind: 'water', status: 'open', lat: 28.6328, lon: 77.2197 },
  { id: 'rp_mock_w_2', name: 'Water point (mock) at Lajpat Nagar', kind: 'water', status: 'open', lat: 28.5677, lon: 77.2433 },
  { id: 'rp_mock_h_1', name: 'Hospital (mock) near Ansari Nagar', kind: 'hospital', lat: 28.5672, lon: 77.21 },
  { id: 'rp_mock_h_2', name: 'Hospital (mock) near Rohini', kind: 'hospital', lat: 28.7158, lon: 77.1153 },
]

export function publicReports(photoUrl: string) {
  const now = Date.now()
  const ago = (h: number) => istIso(new Date(now - h * 3_600_000))
  return [
    { id: 'mock_r1', lat: 28.6615, lon: 77.1508, thumb_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'knee', severity: 3, summary_en: 'Mock: knee-deep water under the flyover.', summary_hi: 'मॉक: फ़्लाईओवर के नीचे घुटने तक पानी।', status: 'verified', agency: 'PWD', hotspot_id: 'hs_zakhira', created_at: ago(0.7) },
    { id: 'mock_r2', lat: 28.6338, lon: 77.2261, thumb_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'ankle', severity: 2, summary_en: 'Mock: ankle-deep water at the underpass mouth.', summary_hi: 'मॉक: अंडरपास के मुहाने पर टखने तक पानी।', status: 'verified', agency: 'PWD', hotspot_id: 'hs_minto', created_at: ago(5) },
    { id: 'mock_r3', lat: 28.5648, lon: 77.2349, thumb_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'waist', severity: 4, summary_en: 'Mock: waist-deep water, vehicles stalled.', summary_hi: 'मॉक: कमर तक पानी, गाड़ियाँ फँसी।', status: 'confirmed', agency: 'PWD', hotspot_id: 'hs_moolchand', created_at: ago(6) },
  ]
}

export function officerReports(photoUrl: string): OfficerReport[] {
  return [
    ...publicReports(photoUrl).map((r, i) => ({ ...r, photo_url: photoUrl, confidence: [0.91, 0.84, 0.96][i], note: i === 0 ? 'Mock note: bus stuck near the west lane' : null })),
    { id: 'mock_r4', lat: 28.5025, lon: 77.2885, thumb_url: photoUrl, photo_url: photoUrl, hazard_type: 'waterlogging', water_depth: 'unknown', severity: 2, summary_en: 'Mock: unclear photo, possible pooling.', summary_hi: 'मॉक: फ़ोटो साफ़ नहीं, शायद पानी जमा।', status: 'needs_review', agency: 'PWD', hotspot_id: 'hs_pul_prahladpur', created_at: istIso(new Date(Date.now() - 1.2 * 3_600_000)), confidence: 0.52, note: null },
  ]
}

export function brief(agency: string): BriefResponse {
  return {
    agency,
    generated_at: istIso(new Date(Date.now() - 10 * 60_000)),
    actions: [
      { n: 1, spot: 'Zakhira flyover and underpass (mock)', evidence: 'Mock: 2 verified reports in the last hour', ask: 'Mock: send a pump; clear the drain inlet on the west lane', report_ids: ['mock_r1'] },
      { n: 2, spot: 'Pul Prahladpur underpass (mock)', evidence: 'Mock: 1 report waiting for review', ask: 'Mock: check the photo and inspect the pump room', report_ids: ['mock_r4'] },
    ],
  }
}

export const SCENARIOS: ScenarioSummary[] = [
  { id: 'flood-2026-07-09', label: 'Replay: modelled data for 9 July 2026', kind: 'flood' },
  { id: 'heat-2026-05-22', label: 'Replay: modelled data for 22 May 2026', kind: 'heat' },
  { id: 'humid-heat-2026-06-18', label: 'Replay: modelled data for 18 June 2026', kind: 'humid-heat' },
]

export function replay(id: string): ReplayScenario | null {
  const sc = SCENARIOS.find((s) => s.id === id)
  if (!sc) return null
  const date = id.slice(-10)
  const base = new Date(`${date}T00:00:00+05:30`)
  const cells = LATS.flatMap((lat) => LONS.map((lon) => cellBase(lat, lon)))
  const peak = sc.kind === 'heat' ? 46 : sc.kind === 'humid-heat' ? 38 : 31
  const humid = sc.kind === 'heat' ? 25 : sc.kind === 'humid-heat' ? 70 : 85
  const hours = Array.from({ length: 24 }, (_, i) => {
    const time = istIso(new Date(base.getTime() + i * 3_600_000))
    const heat = Object.fromEntries(cells.map((c) => [c.id, weather(c.id, i, peak, humid)]))
    const flood =
      sc.kind === 'flood'
        ? Object.fromEntries(
            HOTSPOTS.map((h) => {
              const { r1, r3, risk } = floodState(h.id, i, i < 4 ? 0.2 : i < 12 ? 1.4 : 0.6)
              return [h.id, { level: levelFor(risk), risk, rain_1h_mm: r1, rain_3h_mm: r3 }]
            }),
          )
        : undefined
    return { time, heat, ...(flood ? { flood } : {}) }
  })
  return {
    scenario: id,
    label: sc.label,
    source: 'Open-Meteo Historical Weather API (modelled reanalysis, not station readings)',
    cells,
    hotspots: HOTSPOTS,
    hours,
  }
}
