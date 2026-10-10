import { api } from './client'
import type {
  BriefResponse,
  ChatRequest,
  CitiesResponse,
  CrewSchedule,
  NowResponse,
  WaterIssuesResponse,
  ChatResponse,
  FloodResponse,
  HeatResponse,
  OfficerReport,
  ReliefResponse,
  ReplayScenario,
  ReportStatusResponse,
  ReportsResponse,
  ScenarioSummary,
  UploadUrlResponse,
} from './types'

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const out = s.toString()
  return out ? `?${out}` : ''
}

export const getHeat = (time?: string, signal?: AbortSignal) =>
  api<HeatResponse>(`/risk/heat${q({ time })}`, { signal })

export const getCities = (signal?: AbortSignal) => api<CitiesResponse>('/cities', { signal })

export const getNow = (lat: number, lon: number, label?: string, signal?: AbortSignal) =>
  api<NowResponse>(`/now${q({ lat: lat.toFixed(3), lon: lon.toFixed(3), label })}`, { signal, timeoutMs: 20_000 })

export const getWaterIssues = (signal?: AbortSignal) => api<WaterIssuesResponse>('/water-issues', { signal })

export interface CrewQuery {
  lat: number
  lon: number
  size: number
  from: string
  to: string
  date?: string
  heavy: boolean
  label?: string
}

export const getCrew = (c: CrewQuery, signal?: AbortSignal) =>
  api<CrewSchedule>(
    `/crew${q({ lat: c.lat.toFixed(4), lon: c.lon.toFixed(4), size: String(c.size), from: c.from, to: c.to, date: c.date, heavy: c.heavy ? '1' : '0', label: c.label })}`,
    { signal, timeoutMs: 20_000 },
  )

export const getFlood = (time?: string, signal?: AbortSignal) =>
  api<FloodResponse>(`/risk/flood${q({ time })}`, { signal })

export const getRelief = (signal?: AbortSignal) => api<ReliefResponse>('/relief', { signal })

export const getReports = (since: string, status: string, signal?: AbortSignal) =>
  api<ReportsResponse>(`/reports${q({ since, status })}`, { signal })

export const listReplays = (signal?: AbortSignal) =>
  api<{ scenarios: ScenarioSummary[] }>('/replay', { signal })

export const getReplay = (id: string, signal?: AbortSignal) =>
  api<ReplayScenario>(`/replay/${encodeURIComponent(id)}`, { signal })

export const postChat = (body: ChatRequest, signal?: AbortSignal) =>
  api<ChatResponse>('/chat', { method: 'POST', body, signal, timeoutMs: 28_000 })

export const postUploadUrl = (body: { session_id: string; lat: number; lon: number; note?: string }) =>
  api<UploadUrlResponse>('/reports/upload-url', { method: 'POST', body, timeoutMs: 20_000 })

export const getReportStatus = (id: string) =>
  api<ReportStatusResponse>(`/reports/${encodeURIComponent(id)}/status`, { timeoutMs: 10_000 })

export const getOfficerReports = (token: string, status?: string) =>
  api<{ reports: OfficerReport[]; agency?: string; city?: string }>(`/officer/reports${q({ status })}`, { token })

export const patchReport = (token: string, id: string, status: 'confirmed' | 'resolved' | 'false') =>
  api<{ report: OfficerReport }>(`/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status }, token })

/** Hand a report to another agency (Cedar: only the owning agency, only to a known agency). */
export const reassignReport = (token: string, id: string, agency: string, note?: string) =>
  api<{ report: OfficerReport }>(`/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: { agency, note }, token })

export const getAgencies = (token: string) => api<{ agencies: string[] }>('/officer/agencies', { token })

export const getBrief = (token: string, agency: string) =>
  api<BriefResponse>(`/briefs/${encodeURIComponent(agency)}`, { token })
