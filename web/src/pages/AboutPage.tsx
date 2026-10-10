import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Attribution } from '../components/Attribution'
import { Icon } from '../components/Icon'
import { Counter, MotionPage, Reveal } from '../components/motion'
import { FloodBadge } from '../components/RiskBadge'
import { config } from '../config'
import { PROVIDER_FALLBACK } from '../lib/attribution'
import { HEAT_ICON, type IconName } from '../lib/icons'
import { Link } from '../router'
import { FLOOD_LEVELS, HEAT_COLORS } from '../theme'

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
  cities_sentence?: string | null
  cities_chart?: string | null
  cities_qualifier?: string | null
  cities_humid_only_total?: number | null
  cities_top?: Array<{ name: string; humid_only_days: number; orange_plus_days: number }> | null
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

const safeImg = (src: string | null | undefined) => (src && /^\/[\w./-]+\.(png|jpe?g|svg|webp)$/i.test(src) ? src : null)

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link break-words">
      {children}
    </a>
  )
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <Reveal className="mb-8 max-w-2xl">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand/8 px-3 py-1 text-[15px] font-semibold text-brand ring-1 ring-brand/15">
        <Icon name="sparkle" size={14} />
        {eyebrow}
      </p>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-lg text-muted">{body}</p>}
    </Reveal>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`h-full rounded-3xl border border-line bg-white p-6 shadow-sm ${className}`}>{children}</div>
}

export default function AboutPage() {
  const { t } = useTranslation()
  const bt = useBacktests()
  const chart = safeImg(bt?.chart)
  const citiesChart = safeImg(bt?.cities_chart)
  const citiesTop = Array.isArray(bt?.cities_top) ? bt.cities_top.filter((c) => typeof c?.name === 'string' && typeof c?.humid_only_days === 'number') : []
  const mapProvider = config.mapKey ? 'amazon' : 'openfreemap'

  const stats = [
    { value: 46, suffix: ' °C', text: t('about.stat1'), src: SOURCES.uni },
    { value: 169, suffix: '', text: t('about.stat2'), src: SOURCES.pioneer },
    { value: 5.8, suffix: '%', text: t('about.stat3'), src: SOURCES.quint },
  ]
  const facts: Array<[IconName, string]> = [
    ['city', t('about.fact1')],
    ['chat', t('about.fact2')],
    ['speaker', t('about.fact3')],
    ['shield', t('about.fact4')],
  ]
  const bands = [
    ['RED', 'about.heatRed'],
    ['ORANGE', 'about.heatOrange'],
    ['YELLOW', 'about.heatYellow'],
    ['GREEN', 'about.heatGreen'],
  ] as const

  return (
    <MotionPage>
      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden bg-night text-white">
        <div className="jt-grid-bg absolute inset-0" aria-hidden="true" />
        <div className="jt-blob absolute -top-32 -left-24 h-96 w-96 rounded-full bg-heat/30 blur-[110px]" aria-hidden="true" />
        <div className="jt-blob absolute -right-32 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-water/30 blur-[120px]" style={{ animationDelay: '-8s' }} aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 pt-14 pb-12 sm:px-6 lg:pt-20">
          <Reveal>
            <p className="jt-glass mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-semibold"><Icon name="info" size={16} />{t('about.title')}</p>
            <h1 className="max-w-3xl text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl">
              {t('about.heroTitle1')} <span className="jt-gradient-text">{t('about.heroTitle2')}</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-white/80">{t('about.lead')}</p>
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {facts.map(([icon, text]) => (
                <li key={text} className="jt-glass flex items-center gap-3 rounded-2xl px-4 py-3">
                  <Icon name={icon} size={22} className="shrink-0 text-[#ffb470]" />
                  <span className="font-semibold">{text}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-20 px-4 py-16 sm:px-6">
        {/* ---------- the problem ---------- */}
        <section>
          <SectionHead eyebrow={t('about.problemEyebrow')} title={t('about.problemTitle')} />
          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((s, i) => (
              <Reveal key={s.text} delay={i * 0.08}>
                <Card>
                  <p className="text-5xl font-extrabold tracking-tight text-brand"><Counter to={s.value} suffix={s.suffix} /></p>
                  <p className="mt-3 text-lg">{s.text}</p>
                  <p className="mt-3"><Ext href={s.src.url}>{t('about.sourceLabel', { source: s.src.name })}</Ext></p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- coverage ---------- */}
        <section>
          <SectionHead eyebrow={t('about.coverageEyebrow')} title={t('about.coverageTitle')} />
          <div className="grid gap-4 md:grid-cols-3">
            {([['map', 'tierFull'], ['city', 'tierCities'], ['location', 'tierPoint']] as const).map(([icon, k], i) => (
              <Reveal key={k} delay={i * 0.08}>
                <Card>
                  <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white"><Icon name={icon} size={24} /></span>
                  <h3 className="text-xl font-bold tracking-tight">{t(`about.${k}Title`)}</h3>
                  <p className="mt-2 text-muted">{t(`about.${k}`)}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- features ---------- */}
        <section>
          <SectionHead eyebrow={t('about.featuresEyebrow')} title={t('about.featuresTitle')} />
          <div className="grid gap-4 sm:grid-cols-2">
            {([['crew', 'featureCrew'], ['tap', 'featureWater'], ['speaker', 'featureVoice'], ['shield', 'featureCedar']] as const).map(([icon, key], i) => (
              <Reveal key={key} delay={(i % 2) * 0.08}>
                <Card className="flex gap-4">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-heat-soft text-[#a33b00]"><Icon name={icon} size={26} /></span>
                  <span>
                    <span className="block text-lg font-bold">{t(`about.${key}Title`)}</span>
                    <span className="text-muted">{t(`about.${key}`)}</span>
                  </span>
                </Card>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-6 flex flex-wrap gap-3">
            <Link href="/check" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand px-5 font-bold text-white hover:bg-brand-dark"><Icon name="location" size={20} />{t('nav.check')}</Link>
            <Link href="/crew" className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-brand px-5 font-bold text-brand"><Icon name="crew" size={20} />{t('nav.crew')}</Link>
          </Reveal>
        </section>

        {/* ---------- how risk is computed ---------- */}
        <section>
          <SectionHead eyebrow={t('about.howEyebrow')} title={t('about.howTitle')} body={t('about.heatIntro')} />
          <Reveal>
            <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
              {bands.map(([band, key]) => (
                <div key={band} className="flex flex-col gap-2 border-b border-line p-4 last:border-0 sm:flex-row sm:items-center sm:gap-5">
                  <span className="inline-flex w-52 shrink-0 items-center gap-3 font-bold">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: HEAT_COLORS[band].fill, color: HEAT_COLORS[band].ink }}>
                      <Icon name={HEAT_ICON[band]} size={24} />
                    </span>
                    {t(`bands.${band}`)}
                  </span>
                  <span className="text-lg">{t(key)}</span>
                </div>
              ))}
            </div>
          </Reveal>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Reveal>
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="sun" size={22} />{t('about.escalationTitle')}</h3>
                <ul className="space-y-2">
                  {(['escalation1', 'escalation2', 'escalation3'] as const).map((k) => (
                    <li key={k} className="flex gap-2"><Icon name="check" size={20} className="mt-0.5 shrink-0 text-[#237032]" /><span>{t(`about.${k}`)}</span></li>
                  ))}
                </ul>
              </Card>
            </Reveal>
            <Reveal delay={0.08}>
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="waves" size={22} />{t('about.floodTitle')}</h3>
                <p className="mb-3 overflow-x-auto rounded-xl bg-night px-3 py-2 font-mono text-[15px] text-[#c5f6fa]">{t('about.floodFormula')}</p>
                <p className="mb-3 text-muted">{t('about.floodExplain')}</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {FLOOD_LEVELS.map((l) => <li key={l}><FloodBadge level={l} /></li>)}
                </ul>
              </Card>
            </Reveal>
          </div>
          <Reveal className="mt-4">
            <Card className="flex gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e7f1f8] text-brand"><Icon name="mask" size={26} /></span>
              <span><span className="block text-lg font-bold">{t('about.airTitle')}</span><span className="text-muted">{t('about.airBody')}</span></span>
            </Card>
          </Reveal>
        </section>

        {/* ---------- proof ---------- */}
        {bt && (citiesChart || chart) && (
          <section className="relative -mx-4 overflow-hidden rounded-none bg-night px-4 py-14 text-white sm:mx-0 sm:rounded-[2.5rem] sm:px-10">
            <div className="jt-grid-bg absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <Reveal className="max-w-3xl">
                <p className="jt-glass mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-semibold"><Icon name="sparkle" size={14} />{t('about.backtestTitle')}</p>
                {typeof bt.cities_humid_only_total === 'number' && (
                  <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                    <span className="jt-gradient-text"><Counter to={bt.cities_humid_only_total} /></span> {t('about.proofTitle')}
                  </h2>
                )}
                {bt.cities_sentence && <p className="mt-3 text-lg text-white/80">{bt.cities_sentence}</p>}
              </Reveal>
              {citiesTop.length > 0 && (
                <div className="mt-8 grid gap-3 sm:grid-cols-4">
                  {citiesTop.map((c, i) => (
                    <Reveal key={c.name} delay={i * 0.06}>
                      <div className="jt-glass h-full rounded-2xl p-4">
                        <p className="text-3xl font-extrabold">{c.humid_only_days}</p>
                        <p className="text-white/80">{t('about.citiesDays', { city: c.name, total: c.orange_plus_days })}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              )}
              {citiesChart && (
                <Reveal className="mt-8">
                  <img src={citiesChart} alt={t('about.citiesChartAlt')} className="w-full rounded-2xl border border-white/10" loading="lazy" />
                  {bt.cities_qualifier && <p className="mt-2 text-[15px] text-white/60">{bt.cities_qualifier}</p>}
                </Reveal>
              )}
              {chart && (
                <Reveal className="mt-10">
                  <h3 className="mb-2 text-xl font-bold">{t('about.delhiBacktest')}</h3>
                  {bt.heat_missed_sentence && <p className="mb-3 text-white/80">{bt.heat_missed_sentence}</p>}
                  <img src={chart} alt={t('about.backtestChartAlt')} className="w-full rounded-2xl border border-white/10" loading="lazy" />
                </Reveal>
              )}
            </div>
          </section>
        )}

        {/* ---------- sources ---------- */}
        <section>
          <SectionHead eyebrow={t('about.sourcesEyebrow')} title={t('about.sourcesTitle')} />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: 'sun' as const, text: t('about.srcOpenMeteo'), link: <><Ext href="https://open-meteo.com/">open-meteo.com</Ext> · <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext></> },
              { icon: 'map' as const, text: t('about.srcOsm'), link: <Ext href="https://www.openstreetmap.org/copyright">openstreetmap.org/copyright</Ext> },
              { icon: 'layers' as const, text: mapProvider === 'amazon' ? t('about.srcMapAmazon') : t('about.srcMapOfm'),
                link: mapProvider === 'amazon' ? <Ext href="https://aws.amazon.com/location/">aws.amazon.com/location</Ext> : <Ext href="https://openfreemap.org/">openfreemap.org</Ext> },
              { icon: 'waves' as const, text: t('about.srcHotspots'), link: null },
              { icon: 'city' as const, text: t('about.srcCities'), link: null },
            ].map((s, i) => (
              <Reveal key={s.text} delay={(i % 2) * 0.06}>
                <Card className="flex gap-3">
                  <Icon name={s.icon} size={24} className="mt-0.5 shrink-0 text-brand" />
                  <span><span className="block">{s.text}</span>{s.link && <span className="mt-1 block">{s.link}</span>}</span>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- limitations ---------- */}
        <section>
          <Reveal>
            <div className="rounded-3xl border-2 border-[#f59f00] bg-[#fff9db] p-6 sm:p-8">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-extrabold tracking-tight"><Icon name="band-yellow" size={28} />{t('about.limitsTitle')}</h2>
              <ul className="space-y-2.5">
                {(['limit1', 'limit2', 'limit3', 'limit5'] as const).map((k) => (
                  <li key={k} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" /><span>{t(`about.${k}`)}</span></li>
                ))}
              </ul>
              <a href="tel:112" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#c92a2a] px-5 text-lg font-extrabold text-white">
                <Icon name="phone" size={22} />{t('about.limit4')}
              </a>
            </div>
          </Reveal>
        </section>

        {/* ---------- team ---------- */}
        <section>
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0b3d5c] via-[#0b2a40] to-[#06121c] p-8 text-white sm:p-12">
              <div className="jt-blob absolute -top-20 right-10 h-64 w-64 rounded-full bg-heat/25 blur-[90px]" aria-hidden="true" />
              <h2 className="relative text-3xl font-extrabold tracking-tight">{t('about.teamTitle')}</h2>
              <p className="relative mt-2 text-lg text-white/80">{t('about.team')}</p>
              {(config.repoUrl || config.videoUrl) && (
                <ul className="relative mt-6 flex flex-wrap gap-3">
                  {config.repoUrl && <li><a href={config.repoUrl} target="_blank" rel="noopener noreferrer" className="jt-glass inline-flex min-h-12 items-center gap-2 rounded-2xl px-5 font-semibold">{t('about.repo')}<Icon name="arrow-right" size={18} /></a></li>}
                  {config.videoUrl && <li><a href={config.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 font-bold text-night">{t('about.video')}<Icon name="play" size={18} /></a></li>}
                </ul>
              )}
            </div>
          </Reveal>
        </section>

        <footer className="pb-2">
          <Attribution items={PROVIDER_FALLBACK[mapProvider]} />
        </footer>
      </div>
    </MotionPage>
  )
}
