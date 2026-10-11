// Public landing page. Its own lazy chunk, so the worker view (/check) never downloads the
// animation library. All motion respects prefers-reduced-motion (MotionConfig reducedMotion="user"
// plus CSS guards in index.css). Live numbers come from the API; the phone conversation is an
// illustrated example and is labelled as one.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m, useScroll, useSpring } from 'motion/react'
import { Counter, MotionPage, Reveal } from '../components/motion'
import { openChat } from '../lib/chat'
import { ease } from '../lib/ease'
import { getCities, getHeat } from '../api/endpoints'
import type { City, HeatResponse } from '../api/types'
import { Attribution } from '../components/Attribution'
import { CityDashboard } from '../components/CityDashboard'
import { Icon } from '../components/Icon'
import { USE_MOCK, config } from '../config'
import { currentLang } from '../i18n'
import { PROVIDER_FALLBACK } from '../lib/attribution'
import { HEAT_ICON, type IconName } from '../lib/icons'
import { Link } from '../router'
import { HEAT_COLORS, type HeatBand } from '../theme'

const RANK: Record<HeatBand, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 }
function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-semibold ${dark ? 'jt-glass text-white/90' : 'bg-brand/8 text-brand ring-1 ring-brand/15'}`}>
      <Icon name="sparkle" size={14} />{children}
    </p>
  )
}

// ---------------- live city summary from /risk/heat ----------------
interface CityNow { id: string; name: string; band: HeatBand; temp: number }

function useCityNow(): CityNow[] {
  const [rows, setRows] = useState<CityNow[]>([])
  useEffect(() => {
    if (!USE_MOCK && !config.apiUrl) return
    const ctrl = new AbortController()
    Promise.all([getCities(ctrl.signal), getHeat(undefined, ctrl.signal)])
      .then(([c, h]: [{ cities: City[] }, HeatResponse]) => {
        const lang = currentLang()
        const out: CityNow[] = []
        for (const city of c.cities) {
          const cells = h.cells.filter((x) => x.city === city.id)
          if (!cells.length) continue
          const worst = cells.reduce((a, b) => (RANK[b.band] > RANK[a.band] ? b : a))
          const temp = Math.max(...cells.map((x) => x.temp_c ?? -99))
          out.push({ id: city.id, name: lang === 'hi' ? city.name_hi : city.name, band: worst.band, temp })
        }
        setRows(out)
      })
      .catch(() => setRows([]))
    return () => ctrl.abort()
  }, [])
  return rows
}

function CityChip({ c }: { c: CityNow }) {
  const { t } = useTranslation()
  const col = HEAT_COLORS[c.band]
  return (
    <span className="jt-glass inline-flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-white">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ background: col.fill, color: col.ink }}><Icon name={HEAT_ICON[c.band]} size={20} /></span>
      <span className="font-semibold">{c.name}</span>
      <span className="text-white/75">{t(`bands.${c.band}`).split(' · ')[0]} · {c.temp.toFixed(0)}°C</span>
    </span>
  )
}

// ---------------- animated example conversation ----------------
function PhoneChat() {
  const { t } = useTranslation()
  const script = useMemo(() => [
    { me: true, text: t('landing.chat.q1') },
    { me: false, text: t('landing.chat.a1') },
    { me: true, text: t('landing.chat.q2') },
    { me: false, text: t('landing.chat.a2') },
  ], [t])
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setShown((s) => (s >= script.length + 2 ? 0 : s + 1)), 1700)
    return () => clearInterval(id)
  }, [script.length])
  const visible = script.slice(0, Math.min(shown, script.length))
  const typing = shown < script.length && shown > 0 && !script[shown].me
  return (
    <div className="jt-float relative mx-auto w-[300px] max-w-full rounded-[2.6rem] border border-white/15 bg-[#0e1b25] p-3 shadow-[0_40px_120px_-20px_rgb(28_126_214/0.45)]">
      <div className="overflow-hidden rounded-[2.1rem] bg-[#ece5dd]">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
          <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-full bg-white p-0.5" />
          <div><p className="font-bold leading-tight">JalTaap</p><p className="text-[13px] text-white/80">{t('landing.chat.status')}</p></div>
        </div>
        <div className="flex h-[400px] flex-col justify-end gap-2 p-3" aria-live="off">
          <AnimatePresence initial={false}>
            {visible.map((b, i) => (
              <m.div key={`${i}-${b.text}`} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease }}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug whitespace-pre-line shadow-sm ${b.me ? 'self-end rounded-br-sm bg-[#dcf8c6] text-[#111]' : 'self-start rounded-bl-sm bg-white text-[#111]'}`}>
                {b.text}
              </m.div>
            ))}
            {typing && (
              <m.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1 self-start rounded-2xl bg-white px-3 py-3">
                <span className="jt-dot h-2 w-2 rounded-full bg-[#667]" /><span className="jt-dot h-2 w-2 rounded-full bg-[#667]" /><span className="jt-dot h-2 w-2 rounded-full bg-[#667]" />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="mt-2 text-center text-[13px] text-white/60">{t('landing.chat.example')}</p>
    </div>
  )
}

// ---------------- bento visuals ----------------
function MiniHourBar() {
  const bands: HeatBand[] = ['GREEN', 'GREEN', 'YELLOW', 'YELLOW', 'ORANGE', 'RED', 'RED', 'ORANGE', 'ORANGE', 'YELLOW', 'GREEN', 'GREEN']
  return (
    <div className="flex h-20 items-end gap-1.5">
      {bands.map((b, i) => (
        <m.span key={i} className="flex-1 rounded-t-md" style={{ background: HEAT_COLORS[b].fill }}
          initial={{ height: 6 }} whileInView={{ height: 18 + RANK[b] * 18 }} viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.5, ease }} />
      ))}
    </div>
  )
}

function Waveform() {
  return (
    <div className="flex h-16 items-center gap-1" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <m.span key={i} className="w-1.5 rounded-full bg-heat" animate={{ height: [8, 14 + ((i * 7) % 30), 8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.06, ease: 'easeInOut' }} />
      ))}
    </div>
  )
}

function Ripples() {
  return (
    <div className="relative h-20 w-20" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <m.span key={i} className="absolute inset-0 rounded-full border-2 border-water" initial={{ scale: 0.3, opacity: 0.8 }}
          animate={{ scale: 1.2, opacity: 0 }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }} />
      ))}
      <span className="absolute inset-6 rounded-full bg-water" />
    </div>
  )
}

function PhotoScan() {
  const { t } = useTranslation()
  return (
    <div className="relative h-24 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4dabf7] via-[#1c7ed6] to-[#0b3d5c]" aria-hidden="true">
      <span className="absolute inset-x-6 bottom-4 h-5 rounded-full bg-white/25" />
      <m.span className="absolute inset-x-0 h-0.5 bg-white shadow-[0_0_12px_#fff]" animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
      <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[13px] font-bold text-[#237032]"><Icon name="check" size={14} />{t('landing.features.verified')}</span>
    </div>
  )
}

function CrewRotation() {
  return (
    <div className="flex gap-3" aria-hidden="true">
      {[0, 1, 2, 3].map((g) => (
        <m.div key={g} className="flex flex-1 flex-wrap gap-1 rounded-xl bg-canvas p-2" animate={{ backgroundColor: ['#f1f3f5', '#dbeefe', '#f1f3f5'] }}
          transition={{ duration: 4, repeat: Infinity, delay: g, times: [0, 0.12, 0.25] }}>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-3 w-3 rounded-full bg-brand/70" />)}
        </m.div>
      ))}
    </div>
  )
}

function Converge() {
  const { t } = useTranslation()
  return (
    <div className="relative flex h-20 items-center" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <m.span key={i} className="absolute inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#8c5a2b] text-white"
          initial={{ x: i * 46, y: 0 }} whileInView={{ x: 70 + i * 6, y: (i - 1) * 4 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.15, duration: 0.8, ease }}>
          <Icon name="tap" size={20} />
        </m.span>
      ))}
      <m.span className="absolute left-[140px] inline-flex items-center gap-1 rounded-full bg-[#237032] px-3 py-1 font-bold text-white"
        initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.2, duration: 0.4 }}>
        <Icon name="check" size={16} />{t('landing.features.corroborated')}
      </m.span>
    </div>
  )
}

function AqiMeter() {
  const cols = ['#237032', '#94d82d', '#ffd43b', '#f76707', '#e03131', '#862e9c']
  return (
    <div aria-hidden="true">
      <div className="flex h-4 overflow-hidden rounded-full">{cols.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
      <m.span className="relative -mt-1 block h-0 w-0 border-x-[8px] border-t-[11px] border-x-transparent border-t-ink"
        initial={{ left: '4%' }} whileInView={{ left: '58%' }} viewport={{ once: true }} transition={{ duration: 1.4, ease }} />
      <div className="mt-2 flex items-center gap-3 text-muted"><Icon name="mask" size={22} /><Icon name="sun" size={22} /><span>AQI · UV</span></div>
    </div>
  )
}

function Bento({ icon, title, body, children, className = '' }: { icon: IconName; title: string; body: string; children?: ReactNode; className?: string }) {
  return (
    <m.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`group relative overflow-hidden rounded-3xl border border-line bg-white p-6 shadow-sm hover:shadow-xl ${className}`}>
      <span className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br from-heat/15 to-water/15 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white"><Icon name={icon} size={24} /></span>
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-muted">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </m.div>
  )
}

// ---------------- how it works, with a scroll-linked progress line ----------------
function Steps() {
  const { t } = useTranslation()
  const ref = useRef<HTMLOListElement>(null)
  const container = useRef<HTMLElement | null>(null)
  // The page scrolls inside <main id="main">, not the window. Declared before useScroll so its
  // layout effect reads the element.
  useLayoutEffect(() => {
    container.current = document.getElementById('main')
  }, [])
  const { scrollYProgress } = useScroll({ target: ref, container, offset: ['start 75%', 'end 55%'] })
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  const steps: Array<[IconName, string]> = [['chat', 'step1'], ['bolt', 'step2'], ['speaker', 'step3'], ['shield', 'step4']]
  return (
    <ol ref={ref} className="relative ms-5 space-y-10 border-s-2 border-line ps-10">
      <m.span aria-hidden="true" className="absolute top-0 -left-[2px] h-full w-[2px] origin-top bg-gradient-to-b from-heat to-water" style={{ scaleY }} />
      {steps.map(([icon, k], i) => (
        <li key={k} className="relative">
          <span className="absolute top-0 -left-[3.85rem] inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand shadow-md ring-1 ring-line"><Icon name={icon} size={24} /></span>
          <Reveal delay={i * 0.05}>
            <p className="text-[15px] font-bold tracking-wide text-heat uppercase">{t('landing.how.stepLabel', { n: i + 1 })}</p>
            <h3 className="text-2xl font-bold tracking-tight">{t(`landing.how.${k}Title`)}</h3>
            <p className="mt-1 max-w-xl text-lg text-muted">{t(`landing.how.${k}`)}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}

const DEMO_CITIES = ['delhi', 'mumbai', 'kolkata', 'chennai', 'bengaluru', 'hyderabad']

function LiveDashboard() {
  const { t } = useTranslation()
  const lang = currentLang()
  const [cities, setCities] = useState<City[]>([])
  const [pick, setPick] = useState('delhi')
  useEffect(() => {
    if (!USE_MOCK && !config.apiUrl) return
    getCities().then((r) => setCities((r.cities ?? []).filter((c) => DEMO_CITIES.includes(c.id)))).catch(() => setCities([]))
  }, [])
  const c = cities.find((x) => x.id === pick)
  return (
    <div>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('landing.live.tabs')}>
        {cities.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === pick} onClick={() => setPick(x.id)}
            className={`min-h-11 shrink-0 rounded-full px-4 font-semibold transition-colors ${x.id === pick ? 'bg-brand text-white shadow' : 'bg-white text-ink ring-1 ring-line hover:bg-canvas'}`}>
            {lang === 'hi' ? x.name_hi : x.name}
          </button>
        ))}
      </div>
      {c ? <CityDashboard key={c.id} lat={c.lat} lon={c.lon} label={c.name} /> : <div className="h-64 animate-pulse rounded-3xl bg-line/50" />}
    </div>
  )
}

function Faq() {
  const { t } = useTranslation()
  return (
    <div className="divide-y divide-line rounded-3xl border border-line bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
            {t(`landing.faq.q${i}`)}
            <Icon name="chevron-down" size={22} className="shrink-0 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-muted">{t(`landing.faq.a${i}`)}</p>
        </details>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const { t } = useTranslation()
  const live = useCityNow()
  const hot = [...live].sort((a, b) => RANK[b.band] - RANK[a.band] || b.temp - a.temp).slice(0, 3)
  const awsList = ['Amazon Bedrock', 'Strands Agents', 'AWS Lambda', 'Amazon API Gateway', 'Amazon SQS', 'EventBridge Scheduler', 'Amazon DynamoDB', 'Amazon S3', 'Amazon Cognito', 'Amazon Location Service', 'Amazon Transcribe', 'Amazon Polly', 'Cedar', 'AWS SAM', 'Powertools', 'Amazon CloudWatch', 'AWS Amplify']

  return (
    <MotionPage>
        {/* ---------- hero ---------- */}
        <section className="relative overflow-hidden bg-night text-white">
          <div className="jt-grid-bg absolute inset-0" aria-hidden="true" />
          <div className="jt-blob absolute -top-40 -left-32 h-[34rem] w-[34rem] rounded-full bg-heat/35 blur-[110px]" aria-hidden="true" />
          <div className="jt-blob absolute -right-40 -bottom-48 h-[36rem] w-[36rem] rounded-full bg-water/35 blur-[120px]" style={{ animationDelay: '-7s' }} aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20 lg:pb-24">
            <div>
              <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <Eyebrow dark>{t('landing.hero.eyebrow')}</Eyebrow>
              </m.div>
              <m.h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-tight sm:text-6xl"
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05, ease }}>
                {t('landing.hero.title1')} <span className="jt-gradient-text">{t('landing.hero.title2')}</span>
              </m.h1>
              <m.p className="mt-5 max-w-xl text-lg text-white/80 sm:text-xl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15, ease }}>
                {t('landing.hero.sub')}
              </m.p>
              <m.div className="mt-8 flex flex-wrap gap-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25, ease }}>
                <Link href="/check" className="group inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-lg font-bold text-night shadow-[0_10px_40px_-10px_rgb(255_255_255/0.6)] transition-transform hover:-translate-y-0.5">
                  <Icon name="location" size={22} />{t('landing.hero.ctaCheck')}
                  <Icon name="arrow-right" size={20} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <button type="button" onClick={() => openChat()} className="jt-glass inline-flex min-h-14 items-center gap-2 rounded-2xl px-6 text-lg font-semibold text-white transition-colors hover:bg-white/15">
                  <Icon name="chat" size={22} />{t('landing.hero.ctaChat')}
                </button>
                <Link href="/map" className="jt-glass inline-flex min-h-14 items-center gap-2 rounded-2xl px-6 text-lg font-semibold text-white transition-colors hover:bg-white/15">
                  <Icon name="map" size={22} />{t('landing.hero.ctaMap')}
                </Link>
              </m.div>
              <m.ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-white/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
                {['proof1', 'proof2', 'proof3'].map((k) => (
                  <li key={k} className="flex items-center gap-2"><Icon name="check" size={18} className="text-[#8ce99a]" />{t(`landing.hero.${k}`)}</li>
                ))}
              </m.ul>
            </div>
            <m.div className="relative" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2, ease }}>
              <PhoneChat />
              {hot.slice(0, 2).map((c, i) => (
                <m.div key={c.id} className={`absolute z-10 hidden sm:block ${['-left-2 -top-5', '-right-2 bottom-4'][i]}`}
                  initial={{ opacity: 0, x: i % 2 ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.15, duration: 0.6, ease }}>
                  <CityChip c={c} />
                </m.div>
              ))}
            </m.div>
          </div>
          {/* live city marquee */}
          {live.length > 0 && (
            <div className="relative border-t border-white/10 py-4">
              <p className="sr-only">{t('landing.liveNow')}</p>
              <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
                <div className="jt-marquee flex w-max gap-3">
                  {[...live, ...live].map((c, i) => <CityChip key={`${c.id}-${i}`} c={c} />)}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ---------- numbers ---------- */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="max-w-2xl">
            <Eyebrow>{t('landing.problem.eyebrow')}</Eyebrow>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.problem.title')}</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([['46', '°C', 'n1'], ['414', '', 'n2'], ['42', '', 'n3'], ['5.8', '%', 'n4']] as const).map(([v, s, k], i) => (
              <Reveal key={k} delay={i * 0.08}>
                <div className="h-full rounded-3xl border border-line bg-white p-6 shadow-sm">
                  <p className="text-5xl font-extrabold tracking-tight text-brand"><Counter to={Number(v)} suffix={s} /></p>
                  <p className="mt-3 text-lg">{t(`landing.problem.${k}`)}</p>
                  <p className="mt-2 text-[15px] text-muted">{t(`landing.problem.${k}Src`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- personal live safety ---------- */}
        <section className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <Eyebrow>{t('landing.personal.eyebrow')}</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.personal.title')}</h2>
              <p className="mt-4 text-lg text-muted">{t('landing.personal.body')}</p>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {([['shield', 'c1'], ['location', 'c2'], ['bell', 'c3']] as const).map(([icon, k], i) => (
                <Reveal key={k} delay={i * 0.08}>
                  <div className="h-full rounded-3xl border border-line bg-canvas p-6">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white"><Icon name={icon} size={26} /></span>
                    <h3 className="mt-4 text-xl font-extrabold">{t(`landing.personal.${k}Title`)}</h3>
                    <p className="mt-2 text-muted">{t(`landing.personal.${k}`)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 flex flex-wrap gap-3">
              <Link href="/me" className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand px-6 text-lg font-bold text-white hover:bg-brand-dark">
                <Icon name="shield" size={22} />{t('landing.personal.cta')}<Icon name="arrow-right" size={20} />
              </Link>
              <button type="button" onClick={() => openChat()} className="inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-brand px-6 text-lg font-bold text-brand">
                <Icon name="chat" size={22} />{t('landing.hero.ctaChat')}
              </button>
            </Reveal>
          </div>
        </section>

        {/* ---------- built for people who do not read much ---------- */}
        <section className="bg-white py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <Eyebrow>{t('landing.simple.eyebrow')}</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.simple.title')}</h2>
              <p className="mt-4 text-lg text-muted">{t('landing.simple.body')}</p>
              <ul className="mt-6 space-y-4">
                {([['speaker', 'p1'], ['band-orange', 'p2'], ['chat', 'p3'], ['phone', 'p4']] as const).map(([icon, k]) => (
                  <li key={k} className="flex gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-heat-soft text-[#a33b00]"><Icon name={icon} size={26} /></span>
                    <span><b className="block text-lg">{t(`landing.simple.${k}Title`)}</b><span className="text-muted">{t(`landing.simple.${k}`)}</span></span>
                  </li>
                ))}
              </ul>
              <Link href="/check" className="mt-8 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-brand px-6 text-lg font-bold text-white hover:bg-brand-dark">
                {t('landing.simple.cta')}<Icon name="arrow-right" size={20} />
              </Link>
            </Reveal>
            <Reveal delay={0.1}>
              {/* a picture of the worker screen, built from the same parts */}
              <div className="mx-auto max-w-sm space-y-3 rounded-[2.2rem] border border-line bg-canvas p-4 shadow-xl">
                <div className="rounded-[1.6rem] p-5 text-[#1a1a1a]" style={{ background: HEAT_COLORS.ORANGE.fill }}>
                  <span className="jt-ring relative mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/25"><Icon name="band-orange" size={42} /></span>
                  <p className="text-2xl leading-tight font-extrabold">{t('check.verdict.ORANGE')}</p>
                  <p className="mt-1 text-lg font-bold">{t('landing.simple.mockTemp')}</p>
                </div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-white py-3 text-lg font-bold"><Icon name="speaker" size={24} />{t('check.listen')}</div>
                <div className="flex items-center gap-3 rounded-2xl bg-white p-3"><Icon name="glass" size={34} className="text-water" /><b className="text-lg">{t('check.water', { count: 3 })}</b></div>
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#c92a2a] py-3 text-lg font-extrabold text-white"><Icon name="phone" size={24} />{t('check.call112')}</div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------- features bento ---------- */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="max-w-2xl">
            <Eyebrow>{t('landing.features.eyebrow')}</Eyebrow>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.features.title')}</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Reveal className="md:col-span-2"><Bento icon="clock" title={t('landing.features.f1Title')} body={t('landing.features.f1')}><MiniHourBar /></Bento></Reveal>
            <Reveal delay={0.05}><Bento icon="speaker" title={t('landing.features.f2Title')} body={t('landing.features.f2')}><Waveform /></Bento></Reveal>
            <Reveal><Bento icon="waves" title={t('landing.features.f3Title')} body={t('landing.features.f3')}><Ripples /></Bento></Reveal>
            <Reveal delay={0.05}><Bento icon="camera" title={t('landing.features.f4Title')} body={t('landing.features.f4')}><PhotoScan /></Bento></Reveal>
            <Reveal delay={0.1}><Bento icon="crew" title={t('landing.features.f5Title')} body={t('landing.features.f5')}><CrewRotation /></Bento></Reveal>
            <Reveal><Bento icon="tap" title={t('landing.features.f6Title')} body={t('landing.features.f6')}><Converge /></Bento></Reveal>
            <Reveal delay={0.05} className="md:col-span-2"><Bento icon="mask" title={t('landing.features.f7Title')} body={t('landing.features.f7')}><AqiMeter /></Bento></Reveal>
          </div>
        </section>

        {/* ---------- live dashboard ---------- */}
        <section className="bg-gradient-to-b from-white to-canvas py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="max-w-2xl">
              <Eyebrow>{t('landing.live.eyebrow')}</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.live.title')}</h2>
              <p className="mt-3 text-lg text-muted">{t('landing.live.body')}</p>
            </Reveal>
            <Reveal delay={0.1} className="mt-8"><LiveDashboard /></Reveal>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <div className="lg:sticky lg:top-8">
              <Eyebrow>{t('landing.how.eyebrow')}</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.how.title')}</h2>
              <p className="mt-4 text-lg text-muted">{t('landing.how.body')}</p>
            </div>
          </Reveal>
          <Steps />
        </section>

        {/* ---------- proof ---------- */}
        <section className="relative overflow-hidden bg-night py-20 text-white">
          <div className="jt-grid-bg absolute inset-0" aria-hidden="true" />
          <div className="jt-blob absolute top-10 -right-40 h-[28rem] w-[28rem] rounded-full bg-heat/25 blur-[110px]" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="max-w-3xl">
              <Eyebrow dark>{t('landing.proof.eyebrow')}</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl"><span className="jt-gradient-text"><Counter to={414} /></span> {t('landing.proof.title')}</h2>
              <p className="mt-4 text-lg text-white/75">{t('landing.proof.body')}</p>
            </Reveal>
            <Reveal delay={0.1} className="mt-10">
              <img src="/backtest_heat_cities_2026.png" alt={t('about.citiesChartAlt')} loading="lazy" className="w-full rounded-3xl border border-white/10 shadow-2xl" />
              <p className="mt-3 text-[15px] text-white/60">{t('landing.proof.caption')}</p>
            </Reveal>
          </div>
        </section>

        {/* ---------- agencies ---------- */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <Reveal>
            <Eyebrow>{t('landing.agency.eyebrow')}</Eyebrow>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.agency.title')}</h2>
            <p className="mt-4 text-lg text-muted">{t('landing.agency.body')}</p>
            <ul className="mt-6 space-y-3">
              {['a1', 'a2', 'a3'].map((k) => <li key={k} className="flex gap-3 text-lg"><Icon name="check" size={24} className="shrink-0 text-[#237032]" />{t(`landing.agency.${k}`)}</li>)}
            </ul>
            <Link href="/officer" className="mt-8 inline-flex min-h-14 items-center gap-2 rounded-2xl border-2 border-brand px-6 text-lg font-bold text-brand hover:bg-brand hover:text-white">{t('landing.agency.cta')}<Icon name="arrow-right" size={20} /></Link>
          </Reveal>
          <Reveal delay={0.1}>
            <pre className="overflow-x-auto rounded-3xl bg-night p-6 text-[14px] leading-relaxed text-[#c5f6fa] shadow-xl" lang="en"><code>{`// backend/policies/reports.cedar
permit (
  principal in JalTaap::Group::"officers",
  action == JalTaap::Action::"resolve",
  resource is JalTaap::Report
)
when {
  principal.agency == resource.agency &&
  ["verified", "confirmed", "corroborated"]
    .contains(resource.status)
};`}</code></pre>
          </Reveal>
        </section>

        {/* ---------- built on AWS ---------- */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center"><h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('landing.aws.title')}</h2><p className="mt-2 text-muted">{t('landing.aws.body')}</p></Reveal>
            <m.ul className="mt-8 flex flex-wrap justify-center gap-2.5" initial="hide" whileInView="show" viewport={{ once: true }}
              variants={{ show: { transition: { staggerChildren: 0.035 } } }}>
              {awsList.map((s) => (
                <m.li key={s} variants={{ hide: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} className="rounded-full border border-line bg-canvas px-4 py-2 font-semibold">{s}</m.li>
              ))}
            </m.ul>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <Reveal><h2 className="mb-8 text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.faq.title')}</h2></Reveal>
          <Reveal delay={0.05}><Faq /></Reveal>
        </section>

        {/* ---------- final CTA ---------- */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0b3d5c] via-[#0b2a40] to-[#06121c] px-6 py-14 text-center text-white sm:px-12">
            <div className="jt-blob absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-heat/30 blur-[90px]" aria-hidden="true" />
            <h2 className="relative text-3xl font-extrabold tracking-tight sm:text-5xl">{t('landing.final.title')}</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/80">{t('landing.final.body')}</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/check" className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-lg font-bold text-night"><Icon name="location" size={22} />{t('landing.hero.ctaCheck')}</Link>
              <Link href="/crew" className="jt-glass inline-flex min-h-14 items-center gap-2 rounded-2xl px-6 text-lg font-semibold"><Icon name="crew" size={22} />{t('nav.crew')}</Link>
            </div>
          </Reveal>
        </section>

        <footer className="border-t border-line bg-white px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 font-bold"><img src="/favicon.svg" alt="" width={26} height={26} />JalTaap · {t('about.team')}</p>
            <Attribution items={PROVIDER_FALLBACK[config.mapKey ? 'amazon' : 'openfreemap']} />
          </div>
          <p className="mx-auto mt-3 max-w-6xl text-[15px] text-muted">{t('landing.footerNote')}</p>
        </footer>
    </MotionPage>
  )
}
