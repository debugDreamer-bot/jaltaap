import { api } from './client'
import type {
  BriefResponse,
  ChatRequest,
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
  api<{ reports: OfficerReport[] }>(`/officer/reports${q({ status })}`, { token })

export const patchReport = (token: string, id: string, status: 'confirmed' | 'resolved' | 'false') =>
  api<OfficerReport>(`/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status }, token })

export const getBrief = (token: string, agency: string) =>
  api<BriefResponse>(`/briefs/${encodeURIComponent(agency)}`, { token })
