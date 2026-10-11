import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatLauncher } from './components/ChatLauncher'
import { Header } from './components/Header'
import { LiveSafetyProvider } from './components/LiveSafetyProvider'
import { LiveWarningBanner } from './components/LiveWarningBanner'
import { MockBanner } from './components/MockBanner'
import { usePath } from './lib/nav'
import { Link } from './router'

// Each page is its own chunk: only /map downloads MapLibre, only / downloads the animation library,
// /check stays light for budget phones, and
// aws-amplify only ever loads with the officer page.
const LandingPage = lazy(() => import('./pages/LandingPage'))
const CheckPage = lazy(() => import('./pages/CheckPage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const OfficerPage = lazy(() => import('./pages/officer/OfficerPage'))
const CrewPage = lazy(() => import('./pages/CrewPage'))
const UnwellPage = lazy(() => import('./pages/UnwellPage'))
const SafetyPage = lazy(() => import('./pages/SafetyPage'))

function Loading() {
  const { t } = useTranslation()
  return (
    <p className="p-6 text-center text-muted" role="status">
      {t('common.loading')}
    </p>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-xl p-6">
      <p className="mb-4 text-lg">{t('common.notFound')}</p>
      <Link href="/" className="link">
        {t('common.goHome')}
      </Link>
    </div>
  )
}

export default function App() {
  const path = usePath()
  let page
  if (path === '/') page = <LandingPage />
  else if (path === '/check') page = <CheckPage />
  else if (path === '/map') page = <MapPage />
  else if (path === '/about') page = <AboutPage />
  else if (path === '/officer') page = <OfficerPage />
  else if (path === '/crew') page = <CrewPage />
  else if (path === '/unwell') page = <UnwellPage />
  else if (path === '/me') page = <SafetyPage />
  else page = <NotFound />

  return (
    <LiveSafetyProvider>
      <div className="flex h-full flex-col">
        <MockBanner />
        <Header path={path} />
        {path !== '/officer' && <LiveWarningBanner />}
        <main id="main" className={`relative min-h-0 flex-1 ${path === '/map' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <Suspense fallback={<Loading />}>{page}</Suspense>
        </main>
        <ChatLauncher path={path} />
      </div>
    </LiveSafetyProvider>
  )
}
