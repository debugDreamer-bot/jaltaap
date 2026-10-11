// Types mirror docs/api-contract.md. Fields the contract marks optional or that can be
// missing in practice are typed as optional/nullable so the UI never invents values.
import type { FloodLevel, HeatBand } from '../theme'

export type Bounds = [number, number, number, number] // [west, south, east, north]

export interface HeatCell {
  id: string
  /** City id from /cities (pan-India grid). Older API versions omit it. */
  city?: string
  lat: number
  lon: number
  bounds: Bounds
  band: HeatBand
  temp_c: number | null
  rh: number | null
  wet_bulb_c: number | null
  /** Rain expected in the next 3 hours and the general (no listed hotspot) waterlogging level. */
  rain_next_3h_mm?: number | null
  area_flood_level?: FloodLevel | null
}

export type CoverageTier = 'full' | 'heat_and_rain' | 'city'

export interface City {
  id: string
  name: string
  name_hi: string
  state: string
  lat: number
  lon: number
  tier: CoverageTier
  agencies: { civic: string; water: string }
  agency_names: Record<string, string>
  bounds: Bounds
}

export interface CitiesResponse {
  cities: City[]
  india_bbox: { min_lat: number; max_lat: number; min_lon: number; max_lon: number }
}

export type WaterIssueKind = 'leak' | 'tanker_no_show' | 'no_supply' | 'dirty_water'

export interface WaterIssue {
  issue: WaterIssueKind | string
  lat: number
  lon: number
  reports: number
  photo_verified: number
  agency: string | null
  latest: string
  status: string
}

export interface WaterIssuesResponse {
  issues: WaterIssue[]
  window_h: number
  min_reporters: number
}

export type CrewActivity = 'heavy' | 'light' | 'rest'

export interface CrewHour {
  time: string
  band: HeatBand
  temp_c: number
  wet_bulb_c: number
  activity: CrewActivity
  work_min: number
  rest_min: number
  water_ml_per_worker: number
  rotation: Array<{ group: string; workers: number; rest: string }>
}

export interface CrewSchedule {
  kind: 'crew_schedule'
  location: { lat: number; lon: number; label: string }
  city: string | null
  coverage: string
  date: string
  data_updated_at: string
  crew_size: number
  shift: { from: string; to: string }
  worst_band: HeatBand
  noon_pause: { from: string; to: string } | null
  heavy_work_hours: string[]
  no_heavy_work: boolean
  hours: CrewHour[]
  work_minutes_per_worker: number
  water: { litres_per_worker: number; litres_total: number; glasses_per_worker: number }
  ors_needed: boolean
}

export interface HeatResponse {
  time: string
  source: string
  data_updated_at: string | null
  hours_available: string[]
  cells: HeatCell[]
}

export interface Hotspot {
  id: string
  name: string
  type: string
  agency: string
  lat: number
  lon: number
  level: FloodLevel
  risk: number
  rain_next_1h_mm: number | null
  rain_next_3h_mm: number | null
  confirmed_reports: number | null
}

export interface FloodResponse {
  time: string
  horizon_h: number
  source: string
  data_updated_at: string | null
  hotspots: Hotspot[]
}

export type ReliefKind = 'cooling' | 'water' | 'hospital'

export interface ReliefPoint {
  id: string
  name: string
  kind: ReliefKind
  status?: string | null
  lat: number
  lon: number
  cool_room?: string | null
  source?: string | null
  /** Hindi name when known (OpenStreetMap name:hi), and the city for pan-India points. */
  name_hi?: string | null
  city?: string | null
}

export interface ReliefResponse {
  points: ReliefPoint[]
}

export type ReportStatus =
  | 'pending'
  | 'verified'
  | 'needs_review'
  | 'rejected'
  | 'confirmed'
  | 'resolved'
  | 'false'
  | 'unverified'
  | 'corroborated'

export interface PublicReport {
  id: string
  lat: number
  lon: number
  thumb_url?: string | null
  hazard_type?: string | null
  water_depth?: string | null
  severity?: number | null
  summary_en?: string | null
  summary_hi?: string | null
  status: ReportStatus | string
  agency?: string | null
  hotspot_id?: string | null
  created_at: string
}

export interface ReportsResponse {
  reports: PublicReport[]
}

export interface OfficerReport extends PublicReport {
  confidence?: number | null
  note?: string | null
  photo_url?: string | null
  /** flood (waterlogging) or water (water access: leaks, tankers, supply). */
  category?: 'flood' | 'water' | string
  issue?: WaterIssueKind | string | null
  source?: 'photo' | 'text' | string
  corroborations?: number | null
  reassigned_from?: string | null
}

export interface ScenarioSummary {
  id: string
  label: string
  kind: string
}

export interface ReplayCell {
  id: string
  lat: number
  lon: number
  bounds: Bounds
}

export interface ReplayHotspot {
  id: string
  name: string
  type: string
  agency: string
  lat: number
  lon: number
}

export interface ReplayHour {
  time: string
  heat?: Record<string, { band: HeatBand; temp_c: number | null; rh: number | null; wet_bulb_c: number | null }>
  flood?: Record<string, { level: FloodLevel; risk: number; rain_1h_mm: number | null; rain_3h_mm: number | null }>
}

export interface ReplayScenario {
  scenario: string
  label: string
  source: string
  cells: ReplayCell[]
  hotspots: ReplayHotspot[]
  hours: ReplayHour[]
}

/** Personal heat-risk factors the risk engine knows; each makes the advice at most one band stricter. */
export type ProfileFlag = 'heavy_work' | 'age_60_plus' | 'pregnant' | 'chronic_illness' | 'not_acclimatised'

export interface ChatRequest {
  session_id: string
  message: string
  lat?: number
  lon?: number
  profile?: ProfileFlag[]
  /** Usual outdoor working hours, IST 24-hour HH:MM. */
  shift?: { start: string; end: string }
}

export interface ChatResponse {
  reply: string
  data_updated_at: string | null
}

export interface UploadUrlResponse {
  report_id: string
  upload_url: string
  content_type: string
  expires_in: number
}

export interface ReportStatusResponse {
  status: 'pending' | 'verified' | 'needs_review' | 'rejected' | string
  verdict: Record<string, unknown> | null
}

export interface BriefAction {
  n: number
  spot: string
  evidence: string
  ask: string
  report_ids: string[]
}

export interface BriefResponse {
  agency: string
  generated_at: string | null
  /** "rules" when the AI was unavailable and the rule-based brief was used. */
  generated_by?: 'rules' | string
  actions: BriefAction[]
}

export type AqiCategory = 'GOOD' | 'SATISFACTORY' | 'MODERATE' | 'POOR' | 'VERY_POOR' | 'SEVERE'
export type UvCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME'

export interface NowHour {
  time: string
  band: HeatBand
  temp_c: number
  rh: number
  wet_bulb_c: number
  rain_next_3h_mm?: number | null
  area_flood_level?: FloodLevel | null
  uv_index?: number | null
}

/** GET /now: one screen of answers for a worker (heat, safe hours, rain, air, sun). */
export interface NowResponse {
  location: { lat: number; lon: number; label: string; city: string | null; city_id: string | null; coverage: string }
  now: NowHour | null
  today: {
    date: string
    day_band: HeatBand
    /** The band for most people, before personal and environmental escalation. */
    base_day_band?: HeatBand
    /** Why the band went up: "hot_night", "duration", "profile:<flag>". */
    escalations?: string[]
    blocks: Array<{ from: string; to: string; band: HeatBand }>
    heavy_work_windows: Array<{ from: string; to: string }>
    avoid_windows: Array<{ from: string; to: string }>
    noon_pause: { from: string; to: string } | null
    peak_hour: { time: string; temp_c: number; rh: number; wet_bulb_c: number; band: HeatBand } | null
    advice_keys: string[]
  }
  air: { aqi: number; category: AqiCategory; dominant: string; estimate: boolean; pm2_5: number | null; pm10: number | null; advice_keys: string[] } | null
  uv: { now: number | null; now_category: UvCategory | null; today_max: number | null; today_category: UvCategory | null; advice_keys: string[] } | null
  hours: NowHour[]
  /** Today and the next two days (the 3-day outlook). */
  days?: Array<{
    date: string
    day_band: HeatBand
    heavy_work_windows: Array<{ from: string; to: string }>
    noon_pause: { from: string; to: string } | null
    max_temp_c: number | null
    max_wet_bulb_c: number | null
  }>
  /** Next-3-hour warnings at this point (backend risk/warnings.py), most severe first. */
  warnings?: LiveWarning[]
  source: string
  data_updated_at: string
}

export type LiveHazard = 'heat' | 'rain' | 'air' | 'uv'

/** Severity 1 advisory, 2 warning, 3 danger. `level` is a HeatBand, FloodLevel, AqiCategory or UvCategory. */
export interface LiveWarning {
  hazard: LiveHazard
  severity: 1 | 2 | 3
  level: string
  at?: string
  temp_c?: number | null
  wet_bulb_c?: number | null
  rain_mm?: number | null
  aqi?: number | null
  uv_index?: number | null
}
