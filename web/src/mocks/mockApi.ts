// Development-only mock backend. Loaded through a dynamic import guarded by
// `import.meta.env.VITE_USE_MOCK === 'true'`, so it is not part of production builds.
import { ApiError } from '../api/client'
import type { OfficerReport } from '../api/types'
import * as fx from './fixtures'

// Served by the Vite dev server as a normal http URL (an ?url import would be inlined).
const photoUrl = () => new URL('./photo.svg', import.meta.url).href

let officer: OfficerReport[] | null = null
const uploads = new Map<string, number>()

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

export async function handle(method: string, fullPath: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(fullPath, 'http://mock.local')
  const path = url.pathname
  const qp = (k: string) => url.searchParams.get(k) ?? undefined
  await delay(250 + Math.random() * 300, signal)

  if (method === 'GET' && path === '/health') return { status: 'ok', version: 'mock', time: fx.istIso(new Date()) }
  if (method === 'GET' && path === '/risk/heat') return fx.heatFor(qp('time'))
  if (method === 'GET' && path === '/risk/flood') return fx.floodFor(qp('time'))
  if (method === 'GET' && path === '/relief') return { points: fx.RELIEF }
  if (method === 'GET' && path === '/reports') {
    const status = qp('status')
    return { reports: fx.publicReports(photoUrl()).filter((r) => !status || r.status === status) }
  }
  if (method === 'GET' && path === '/replay') return { scenarios: fx.SCENARIOS }
  let m = path.match(/^\/replay\/([^/]+)$/)
  if (method === 'GET' && m) {
    const r = fx.replay(decodeURIComponent(m[1]))
    if (!r) throw new ApiError('unknown scenario', 404)
    return r
  }
  if (method === 'POST' && path === '/chat') {
    const msg = String((body as { message?: string })?.message ?? '')
    await delay(1200, signal)
    if (/mock-error/i.test(msg)) throw new ApiError('mock failure', 500)
    if (/mock-429/i.test(msg)) throw new ApiError('rate limited', 429)
    const b = body as { lat?: number; lon?: number }
    const where = typeof b.lat === 'number' ? ` (location received: ${b.lat.toFixed(3)}, ${b.lon?.toFixed(3)})` : ''
    return {
      reply: `MOCK REPLY${where}. You asked: "${msg}". This is canned text from src/mocks, not advice. Docs: https://open-meteo.com/ <script>alert(1)</script> stays as text.`,
      data_updated_at: fx.heatFor(undefined).data_updated_at,
    }
  }
  if (method === 'POST' && path === '/reports/upload-url') {
    const id = `mock_up_${Date.now()}`
    uploads.set(id, 0)
    return { report_id: id, upload_url: `mock://upload/${id}`, content_type: 'image/jpeg', expires_in: 900 }
  }
  m = path.match(/^\/reports\/([^/]+)\/status$/)
  if (method === 'GET' && m) {
    const n = (uploads.get(m[1]) ?? 0) + 1
    uploads.set(m[1], n)
    if (n < 2) return { status: 'pending', verdict: null }
    return { status: 'verified', verdict: { summary_en: 'Mock verdict: water about knee deep.', summary_hi: 'मॉक नतीजा: लगभग घुटने तक पानी।' } }
  }
  if (method === 'GET' && path === '/officer/reports') {
    officer ??= fx.officerReports(photoUrl())
    const status = qp('status')
    return { reports: officer.filter((r) => !status || r.status === status) }
  }
  m = path.match(/^\/reports\/([^/]+)$/)
  if (method === 'PATCH' && m) {
    officer ??= fx.officerReports(photoUrl())
    const i = officer.findIndex((r) => r.id === m![1])
    if (i < 0) throw new ApiError('not found', 404)
    officer[i] = { ...officer[i], status: (body as { status: string }).status }
    return officer[i]
  }
  m = path.match(/^\/briefs\/([^/]+)$/)
  if (method === 'GET' && m) return fx.brief(decodeURIComponent(m[1]))

  throw new ApiError(`mock: no handler for ${method} ${path}`, 404)
}

export async function mockPut(url: string, body: Blob): Promise<void> {
  if (!url.startsWith('mock://upload/') || body.size === 0) throw new ApiError('mock upload failed', 400)
  await delay(600)
}
