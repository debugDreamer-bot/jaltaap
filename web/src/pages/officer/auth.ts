// Officer authentication. The real implementation uses aws-amplify (Auth only); this file
// is imported only by the lazily loaded officer page, so Amplify stays out of the main
// bundle. In mock mode a fake in-memory session is used instead.
import { Amplify } from 'aws-amplify'
import { confirmSignIn, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth'
import { config } from '../../config'

export interface OfficerSession {
  username: string
  agency: string | null
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
    mockSession = { username: username || 'mock-officer', agency: 'PWD' }
    return { kind: 'done', session: mockSession }
  },
  confirmNewPassword: async () => ({ kind: 'done', session: mockSession ?? { username: 'mock-officer', agency: 'PWD' } }),
  token: async () => 'mock-token',
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
  return { username, agency }
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

export const officerAuth: OfficerAuth = import.meta.env.VITE_USE_MOCK === 'true' ? mockAuth : cognitoAuth
