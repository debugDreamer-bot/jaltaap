// Thin fetch wrapper for the JalTaap API. In mock mode (VITE_USE_MOCK=true, dev only) the
// same calls are answered by src/mocks. The mock import sits behind a build-time constant,
// so production bundles contain no fixture data.
import { config } from '../config'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT'
  body?: unknown
  token?: string
  signal?: AbortSignal
  timeoutMs?: number
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  // Inline env check (not the USE_MOCK constant) so the bundler can drop the mock chunk.
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const mock = await import('../mocks/mockApi')
    return mock.handle(method, path, opts.body, opts.signal, opts.token) as Promise<T>
  }
  if (!config.apiUrl) throw new ApiError('API URL is not configured', 0)

  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  opts.signal?.addEventListener('abort', onAbort)
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : undefined
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    const res = await fetch(config.apiUrl + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    })
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
          ? (data as { error: string }).error
          : res.statusText
      throw new ApiError(msg || 'Request failed', res.status)
    }
    if (data === null) throw new ApiError('Empty or invalid response', res.status)
    return data as T
  } finally {
    if (timer) clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** PUT a photo to the presigned S3 URL returned by POST /reports/upload-url. */
export async function putUpload(url: string, body: Blob, contentType: string): Promise<void> {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const mock = await import('../mocks/mockApi')
    return mock.mockPut(url, body)
  }
  const res = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } })
  if (!res.ok) throw new ApiError('Upload failed', res.status)
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
