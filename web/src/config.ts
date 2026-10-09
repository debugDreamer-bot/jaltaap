// All runtime configuration comes from Vite env vars, read once here.
const env = import.meta.env

function clean(v: string | undefined): string {
  return (v ?? '').trim()
}

function httpUrlOrEmpty(v: string | undefined): string {
  const s = clean(v)
  return /^https?:\/\//i.test(s) ? s : ''
}

/**
 * Mock mode needs the explicit string "true". Vite inlines this at build time, so a
 * production build without VITE_USE_MOCK=true drops the mock code entirely.
 */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === 'true'

export const config = {
  apiUrl: clean(env.VITE_API_URL).replace(/\/+$/, ''),
  mapKey: clean(env.VITE_MAP_KEY),
  region: clean(env.VITE_AWS_REGION) || 'ap-south-1',
  cognitoUserPoolId: clean(env.VITE_COGNITO_USER_POOL_ID),
  cognitoClientId: clean(env.VITE_COGNITO_CLIENT_ID),
  repoUrl: httpUrlOrEmpty(env.VITE_REPO_URL),
  videoUrl: httpUrlOrEmpty(env.VITE_VIDEO_URL),
}

export const DELHI_CENTER: [number, number] = [77.21, 28.61] // [lon, lat]
export const DELHI_ZOOM = 10

export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export function mapStyleUrl(): { url: string; provider: 'amazon' | 'openfreemap' } {
  if (config.mapKey) {
    return {
      url: `https://maps.geo.${config.region}.amazonaws.com/v2/styles/Standard/descriptor?key=${encodeURIComponent(config.mapKey)}&color-scheme=Light`,
      provider: 'amazon',
    }
  }
  return { url: OPENFREEMAP_STYLE, provider: 'openfreemap' }
}
