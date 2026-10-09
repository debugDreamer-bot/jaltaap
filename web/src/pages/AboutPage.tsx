import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Attribution } from '../components/Attribution'
import { PROVIDER_FALLBACK } from '../lib/attribution'
import { HeatBadge, FloodBadge } from '../components/RiskBadge'
import { config } from '../config'
import { FLOOD_LEVELS } from '../theme'

// Citations for the three headline numbers. Publisher pages, not our own data.
// UNI: no stable article URL was found when this page was written, so the link goes to the
// publisher; replace with the exact article URL when available.
const SOURCES = {
  uni: { name: 'UNI', url: 'https://www.uniindia.com/' },
  pioneer: {
    name: 'The Daily Pioneer',
    url: 'https://dailypioneer.com/news/heavy-rain-floods-roads-triggers-massive-traffic-jams-across-capital',
  },
  quint: {
    name: 'The Quint',
    url: 'https://www.thequint.com/news/environment/india-may-lose-34-million-jobs-due-to-global-warming-2030-un',
  },
}

interface Backtests {
  heat_missed_days: number | null
  heat_missed_sentence: string | null
  chart: string | null
}

function isBacktests(v: unknown): v is Backtests {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const okNum = o.heat_missed_days === null || o.heat_missed_days === undefined || typeof o.heat_missed_days === 'number'
  const okStr = o.heat_missed_sentence === null || o.heat_missed_sentence === undefined || typeof o.heat_missed_sentence === 'string'
  const okChart = o.chart === null || o.chart === undefined || typeof o.chart === 'string'
  return okNum && okStr && okChart
}

/** Reads /backtests.json if it exists. Missing, invalid or all-null means nothing is shown. */
function useBacktests(): Backtests | null {
  const [data, setData] = useState<Backtests | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/backtests.json', { signal: ctrl.signal, cache: 'no-cache' })
      .then(async (r) => {
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return
        const j: unknown = await r.json()
        if (isBacktests(j)) setData(j)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])
  return data
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 sm:p-6">
      <h2 className="mb-3 text-xl font-bold sm:text-2xl">{title}</h2>
      {children}
    </section>
  )
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link break-words">
      {children}
    </a>
  )
}

export default function AboutPage() {
  const { t } = useTranslation()
  const bt = useBacktests()
  const chart = bt?.chart && /^\/[\w./-]+\.(png|jpe?g|svg|webp)$/i.test(bt.chart) ? bt.chart : null
  const showBacktest = bt && (typeof bt.heat_missed_days === 'number' || bt.heat_missed_sentence || chart)
  const mapProvider = config.mapKey ? 'amazon' : 'openfreemap'

  const stats = [
    { value: t('about.stat1Value'), text: t('about.stat1'), src: SOURCES.uni },
    { value: t('about.stat2Value'), text: t('about.stat2'), src: SOURCES.pioneer },
    { value: t('about.stat3Value'), text: t('about.stat3'), src: SOURCES.quint },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">{t('about.title')}</h1>
        <p className="text-lg">{t('about.lead')}</p>
      </header>

      <Section title={t('about.problemTitle')}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <li key={s.value} className="rounded-lg bg-canvas p-4">
              <p className="text-3xl font-bold text-brand">{s.value}</p>
              <p className="my-2">{s.text}</p>
              <Ext href={s.src.url}>{t('about.sourceLabel', { source: s.src.name })}</Ext>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('about.howTitle')}>
        <h3 className="mb-2 text-lg font-bold">{t('about.heatTitle')}</h3>
        <p className="mb-3">{t('about.heatIntro')}</p>
        <ul className="mb-4">
          {(
            [
              ['RED', 'about.heatRed'],
              ['ORANGE', 'about.heatOrange'],
              ['YELLOW', 'about.heatYellow'],
              ['GREEN', 'about.heatGreen'],
            ] as const
          ).map(([band, key]) => (
            <li key={band} className="flex flex-col gap-1 border-t border-line py-2 sm:flex-row sm:items-center sm:gap-4">
              <HeatBadge band={band} className="sm:w-52 sm:shrink-0" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 text-lg font-bold">{t('about.escalationTitle')}</h3>
        <ul className="mb-4 list-disc space-y-1 ps-6">
          <li>{t('about.escalation1')}</li>
          <li>{t('about.escalation2')}</li>
          <li>{t('about.escalation3')}</li>
        </ul>
        <h3 className="mb-2 text-lg font-bold">{t('about.floodTitle')}</h3>
        <p className="mb-2 overflow-x-auto rounded-md bg-canvas px-3 py-2 font-mono">{t('about.floodFormula')}</p>
        <p className="mb-2">{t('about.floodExplain')}</p>
        <p className="mb-3">{t('about.floodLevels')}</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {FLOOD_LEVELS.map((l) => (
            <li key={l}>
              <FloodBadge level={l} />
            </li>
          ))}
        </ul>
      </Section>

      {showBacktest && (
        <Section title={t('about.backtestTitle')}>
          {bt.heat_missed_sentence && <p className="mb-2">{bt.heat_missed_sentence}</p>}
          {typeof bt.heat_missed_days === 'number' && <p className="mb-2 font-semibold">{t('about.backtestMissedDays', { n: bt.heat_missed_days })}</p>}
          {chart && <img src={chart} alt={t('about.backtestChartAlt')} className="h-auto max-w-full rounded-md border border-line" loading="lazy" />}
        </Section>
      )}

      <Section title={t('about.sourcesTitle')}>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            {t('about.srcOpenMeteo')} <Ext href="https://open-meteo.com/">open-meteo.com</Ext> ·{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>
          </li>
          <li>
            {t('about.srcOsm')} <Ext href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</Ext>
          </li>
          <li>
            {mapProvider === 'amazon' ? t('about.srcMapAmazon') : t('about.srcMapOfm')}{' '}
            {mapProvider === 'amazon' ? <Ext href="https://aws.amazon.com/location/">aws.amazon.com/location</Ext> : <Ext href="https://openfreemap.org/">openfreemap.org</Ext>}
          </li>
          <li>{t('about.srcHotspots')}</li>
        </ul>
      </Section>

      <Section title={t('about.limitsTitle')}>
        <ul className="list-disc space-y-1 ps-6">
          <li>{t('about.limit1')}</li>
          <li>{t('about.limit2')}</li>
          <li>{t('about.limit3')}</li>
          <li className="font-bold">{t('about.limit4')}</li>
        </ul>
      </Section>

      <Section title={t('about.teamTitle')}>
        <p>{t('about.team')}</p>
        {(config.repoUrl || config.videoUrl) && (
          <ul className="mt-2 flex flex-wrap gap-4">
            {config.repoUrl && (
              <li>
                <Ext href={config.repoUrl}>{t('about.repo')}</Ext>
              </li>
            )}
            {config.videoUrl && (
              <li>
                <Ext href={config.videoUrl}>{t('about.video')}</Ext>
              </li>
            )}
          </ul>
        )}
      </Section>

      <footer className="pb-4">
        <Attribution items={PROVIDER_FALLBACK[mapProvider]} />
      </footer>
    </div>
  )
}
