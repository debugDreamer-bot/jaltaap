// localStorage can throw (private mode, blocked storage). Every access goes through here.
export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStore(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: keep working without persistence */
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

let memorySession: string | null = null

/** Random chat session id, kept in localStorage when possible. */
export function getSessionId(): string {
  const stored = readStore('jaltaap.session_id')
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored
  if (!memorySession) memorySession = randomId()
  writeStore('jaltaap.session_id', memorySession)
  return memorySession
}
