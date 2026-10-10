// Officer authentication. The real implementation uses aws-amplify (Auth only); this file
// is imported only by the lazily loaded officer page, so Amplify stays out of the main
// bundle. In mock mode a fake in-memory session is used instead.
import { Amplify } from 'aws-amplify'
import { confirmSignIn, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth'
import { config } from '../../config'

export interface OfficerSession {
  username: string
  agency: string | null
  /** City for control-room users (custom:city); officers default to Delhi. */
  city: string
  /** In the Cognito control_room group: reads every agency's queue in the city, changes nothing. */
  controlRoom: boolean
}

export type SignInResult = { kind: 'done'; session: OfficerSession } | { kind: 'new-password' } | { kind: 'unsupported'; step: string }

export interface OfficerAuth {
  configured: boolean
  current(): Promise<OfficerSession | null>
  signIn(username: string, password: string): Promise<SignInResult>
  confirmNewPassword(password: string): Promise<SignInResult>
  /** Fresh ID token for API calls (Amplify refreshes it when needed). */
  token(): Promise<string>
  signOut(): Promise<void>
}

// ---------- mock ----------
let mockSession: OfficerSession | null = null
const mockAuth: OfficerAuth = {
  configured: true,
  current: async () => mockSession,
  signIn: async (username) => {
    // Mock roles for demos: a username with "control" is a Delhi control room, "djb" is the Delhi Jal Board.
    const u = (username || 'mock-officer').toLowerCase()
    mockSession = u.includes('control')
      ? { username: u, agency: null, city: 'delhi', controlRoom: true }
      : { username: u, agency: u.includes('djb') ? 'DJB' : 'PWD', city: 'delhi', controlRoom: false }
    return { kind: 'done', session: mockSession }
  },
  confirmNewPassword: async () => ({ kind: 'done', session: mockSession ?? { username: 'mock-officer', agency: 'PWD', city: 'delhi', controlRoom: false } }),
  // The mock backend reads the role from the token, like the real API reads Cognito claims.
  token: async () => `mock-token:${mockSession?.controlRoom ? 'control_room' : (mockSession?.agency ?? '')}`,
  signOut: async () => {
    mockSession = null
  },
}

// ---------- Amplify / Cognito ----------
let configured = false
function ensureConfigured(): boolean {
  if (!config.cognitoUserPoolId || !config.cognitoClientId) return false
  if (!configured) {
    Amplify.configure({ Auth: { Cognito: { userPoolId: config.cognitoUserPoolId, userPoolClientId: config.cognitoClientId } } })
    configured = true
  }
  return true
}

async function sessionFromTokens(): Promise<OfficerSession | null> {
  const s = await fetchAuthSession()
  const id = s.tokens?.idToken
  if (!id) return null
  const p = id.payload
  const agency = typeof p['custom:agency'] === 'string' && p['custom:agency'] ? (p['custom:agency'] as string) : null
  const username =
    (typeof p.email === 'string' && p.email) || (typeof p['cognito:username'] === 'string' && (p['cognito:username'] as string)) || ''
  const groups = Array.isArray(p['cognito:groups']) ? (p['cognito:groups'] as unknown[]).map(String) : []
  const city = typeof p['custom:city'] === 'string' && p['custom:city'] ? (p['custom:city'] as string) : 'delhi'
  return { username, agency, city, controlRoom: groups.includes('control_room') && !groups.includes('officers') }
}

async function afterStep(step: string): Promise<SignInResult> {
  if (step === 'DONE') {
    const session = await sessionFromTokens()
    if (!session) throw new Error('no session')
    return { kind: 'done', session }
  }
  if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return { kind: 'new-password' }
  return { kind: 'unsupported', step }
}

const cognitoAuth: OfficerAuth = {
  get configured() {
    return ensureConfigured()
  },
  async current() {
    if (!ensureConfigured()) return null
    try {
      return await sessionFromTokens()
    } catch {
      return null
    }
  },
  async signIn(username, password) {
    ensureConfigured()
    try {
      const r = await signIn({ username, password })
      return afterStep(r.nextStep.signInStep)
    } catch (e) {
      // A stale session blocks a new sign-in: clear it and try once more.
      if (e instanceof Error && e.name === 'UserAlreadyAuthenticatedException') {
        await signOut()
        const r = await signIn({ username, password })
        return afterStep(r.nextStep.signInStep)
      }
      throw e
    }
  },
  async confirmNewPassword(password) {
    const r = await confirmSignIn({ challengeResponse: password })
    return afterStep(r.nextStep.signInStep)
  },
  async token() {
    const s = await fetchAuthSession()
    const tok = s.tokens?.idToken?.toString()
    if (!tok) throw new Error('signed out')
    return tok
  },
  async signOut() {
    await signOut()
  },
}

// ---------- local development (scripts/dev_api.py) ----------
// Only in `vite dev` with no Cognito settings: signs in against the dev API's demo accounts, whose
// tokens the dev API checks the way API Gateway's Cognito authorizer would. A production build
// without Cognito never reaches this (import.meta.env.DEV is false there), so it is not a back door.
const DEV_KEY = 'jaltaap.dev.officer'
interface DevStore {
  token: string
  claims: Record<string, unknown>
}

function devSession(st: DevStore): OfficerSession {
  const c = st.claims
  const groups = Array.isArray(c['cognito:groups']) ? (c['cognito:groups'] as unknown[]).map(String) : []
  return {
    username: String(c.email ?? ''),
    agency: typeof c['custom:agency'] === 'string' ? (c['custom:agency'] as string) : null,
    city: typeof c['custom:city'] === 'string' ? (c['custom:city'] as string) : 'delhi',
    controlRoom: groups.includes('control_room') && !groups.includes('officers'),
  }
}

function readDev(): DevStore | null {
  try {
    return JSON.parse(sessionStorage.getItem(DEV_KEY) ?? 'null')
  } catch {
    return null
  }
}

export const DEV_SIGN_IN = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK !== 'true' && !config.cognitoUserPoolId && Boolean(config.apiUrl)

const devAuth: OfficerAuth = {
  configured: true,
  current: async () => {
    const st = readDev()
    return st ? devSession(st) : null
  },
  signIn: async (username, password) => {
    const r = await fetch(`${config.apiUrl}/dev/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!r.ok) throw new Error('sign-in failed')
    const st = (await r.json()) as DevStore
    try {
      sessionStorage.setItem(DEV_KEY, JSON.stringify(st))
    } catch {
      /* private mode: session lasts until reload */
    }
    return { kind: 'done', session: devSession(st) }
  },
  confirmNewPassword: async () => ({ kind: 'unsupported', step: 'dev' }),
  token: async () => {
    const st = readDev()
    if (!st) throw new Error('signed out')
    return st.token
  },
  signOut: async () => {
    try {
      sessionStorage.removeItem(DEV_KEY)
    } catch {
      /* nothing stored */
    }
  },
}

export const officerAuth: OfficerAuth = import.meta.env.VITE_USE_MOCK === 'true' ? mockAuth : DEV_SIGN_IN ? devAuth : cognitoAuth
