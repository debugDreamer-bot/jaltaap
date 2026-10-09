// Types mirror docs/api-contract.md. Fields the contract marks optional or that can be
// missing in practice are typed as optional/nullable so the UI never invents values.
import type { FloodLevel, HeatBand } from '../theme'

export type Bounds = [number, number, number, number] // [west, south, east, north]

export interface HeatCell {
  id: string
  lat: number
  lon: number
  bounds: Bounds
  band: HeatBand
  temp_c: number | null
  rh: number | null
  wet_bulb_c: number | null
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

export interface ChatRequest {
  session_id: string
  message: string
  lat?: number
  lon?: number
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
  actions: BriefAction[]
}
