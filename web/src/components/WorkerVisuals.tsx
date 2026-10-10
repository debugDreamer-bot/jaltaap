// Animated pieces of the worker screen (/check). Pure CSS keyframes (index.css, "Worker screen")
// plus one IntersectionObserver, so the page stays light on budget phones and needs no animation
// library. Every animation is decoration only and is switched off for prefers-reduced-motion.
import { useEffect, useId, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { HEAT_COLORS, type HeatBand } from '../theme'
import { Icon } from './Icon'

/** Fades and lifts its children in the first time they scroll into view; adds `is-in` for nested animations. */
export function Reveal({ children, className = '', delay = 0, as: Tag = 'div', style }: { children: ReactNode; className?: string; delay?: number; as?: ElementType; style?: CSSProperties }) {
  const ref = useRef<HTMLElement>(null)
  const [inView, setIn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return void setIn(true)
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setIn(true), io.disconnect()), { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} className={`jt-reveal ${inView ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </Tag>
  )
}

/** Splits a sentence into words that rise in one after another. */
export function WordReveal({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={`${w}-${i}`} className={`jt-word ${className}`} style={{ animationDelay: `${delay + i * 90}ms` }}>
          {w}{' '}
        </span>
      ))}
    </>
  )
}

// Fixed pseudo-random positions so renders are stable.
const EMBERS = [8, 17, 26, 34, 43, 52, 61, 70, 79, 88].map((x, i) => ({ x, d: (i * 0.53) % 5, dx: ((i % 3) - 1) * 30, s: 4 + (i % 3) * 2 }))
const DROPS = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37) % 100, d: ((i * 0.31) % 0.9).toFixed(2), h: 18 + (i % 4) * 6 }))
const STARS = Array.from({ length: 16 }, (_, i) => ({ x: (i * 53) % 95, y: (i * 29) % 55, d: (i * 0.4) % 3, s: 2 + (i % 3) }))

/** The animated sky behind the big answer: sun or moon, heat haze, embers, rain, and a city skyline. */
export function SkyScene({ band, night, rain }: { band: HeatBand; night: boolean; rain: boolean }) {
  const hot = band === 'ORANGE' || band === 'RED'
  const sunSize = { GREEN: 150, YELLOW: 180, ORANGE: 210, RED: 240 }[band]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {night ? (
        <>
          {STARS.map((s, i) => (
            <span key={i} className="jt-twinkle absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
          ))}
          <div className="jt-glow absolute top-20 right-6 h-20 w-20 rounded-full bg-[#fff9db] shadow-[0_0_60px_20px_rgb(255_249_219/0.35)]">
            <span className="absolute top-5 left-6 h-4 w-4 rounded-full bg-[#e9e3c3]" />
            <span className="absolute top-10 left-10 h-5 w-5 rounded-full bg-[#e9e3c3]" />
          </div>
        </>
      ) : (
        <div className="absolute" style={{ width: sunSize, height: sunSize, top: -sunSize * 0.32, right: -sunSize * 0.28 }}>
          <svg viewBox="0 0 200 200" className="jt-spin absolute inset-0 h-full w-full opacity-40">
            {Array.from({ length: 16 }, (_, i) => (
              <line key={i} x1="100" y1="6" x2="100" y2={i % 2 ? 30 : 22} stroke="#fff" strokeWidth="7" strokeLinecap="round" transform={`rotate(${i * 22.5} 100 100)`} />
            ))}
          </svg>
          <div className="jt-glow absolute inset-[22%] rounded-full" style={{ background: 'radial-gradient(circle at 40% 40%, #fffbe6, #ffe066 45%, rgba(255,224,102,0) 72%)' }} />
        </div>
      )}

      {/* heat haze: wavy lines rising off the ground */}
      {band !== 'GREEN' && !night &&
        [0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 400 20" className="jt-haze absolute left-0 w-[160%]" style={{ bottom: 40 + i * 26, animationDelay: `${i * 2}s` }}>
            <path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 T 250 10 T 300 10 T 350 10 T 400 10" fill="none" stroke="currentColor" strokeOpacity={hot ? 0.35 : 0.22} strokeWidth="2.5" />
          </svg>
        ))}

      {/* embers when it is dangerous */}
      {hot && !night &&
        EMBERS.map((e, i) => (
          <span key={i} className="jt-ember absolute bottom-6 rounded-full"
            style={{ left: `${e.x}%`, width: e.s, height: e.s, background: band === 'RED' ? '#ffd8a8' : '#fff3bf', animationDelay: `${e.d}s`, ['--dx' as string]: `${e.dx}px` }} />
        ))}

      {rain &&
        DROPS.map((d, i) => (
          <span key={i} className="jt-raindrop absolute top-0 w-[2px] rounded-full bg-white/60" style={{ left: `${d.x}%`, height: d.h, animationDelay: `${d.d}s` }} />
        ))}

      {/* skyline in the page colour, so the sky flows into the page */}
      <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-px h-14 w-full text-canvas">
        <path fill="currentColor" d="M0 60V38h18V24h14v14h10V30h20v8h8V16h6V8h4v8h6v22h14V28h22v10h10V20h16v18h8V34h18v4h10V22h12V12h10v10h8v16h14V30h20v8h10V18h18v20h12V26h16v12h8V32h20v6h14V24h12v14h14V30h14v8h10v22z" />
      </svg>
    </div>
  )
}

/** Sound bars: gentle when idle, dancing while the voice speaks. */
export function SoundBars({ active, className = 'bg-current' }: { active: boolean; className?: string }) {
  return (
    <span className="inline-flex h-7 items-end gap-[3px]" aria-hidden="true">
      {[0.5, 0.9, 0.65, 1, 0.55].map((h, i) => (
        <span key={i} className={`w-[4px] rounded-full ${className} ${active ? 'jt-eq' : 'jt-eq-idle'}`} style={{ height: `${h * 100}%`, animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  )
}

// ---------------- the work clock: a half dial from 6 am to 8 pm ----------------
const CX = 170
const CY = 178
const R_OUT = 150
const R_IN = 104
const pt = (r: number, deg: number) => [CX + r * Math.cos((deg * Math.PI) / 180), CY - r * Math.sin((deg * Math.PI) / 180)]
function sector(a0: number, a1: number) {
  const [x0, y0] = pt(R_OUT, a0)
  const [x1, y1] = pt(R_OUT, a1)
  const [x2, y2] = pt(R_IN, a1)
  const [x3, y3] = pt(R_IN, a0)
  return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R_IN} ${R_IN} 0 0 0 ${x3} ${y3}Z`
}

export function WorkDial({ bandAt, heavy, nowHour, nowLabel, ariaLabel }: {
  bandAt: (h: number) => HeatBand
  heavy: (h: number) => boolean
  nowHour: number | null
  nowLabel: string
  ariaLabel: string
}) {
  const step = 180 / 14
  const hours = Array.from({ length: 14 }, (_, i) => i + 6)
  const needle = nowHour !== null && nowHour >= 6 && nowHour <= 20 ? -90 + ((nowHour - 6) / 14) * 180 : null
  const band = needle !== null ? bandAt(Math.min(19, Math.floor(nowHour!))) : null
  return (
    <svg viewBox="-10 0 360 218" className="mx-auto w-full max-w-sm" role="img" aria-label={ariaLabel}>
      {hours.map((h, i) => {
        const a0 = 180 - i * step - 0.9
        const a1 = 180 - (i + 1) * step + 0.9
        const c = HEAT_COLORS[bandAt(h)]
        const [mx, my] = pt((R_OUT + R_IN) / 2, (a0 + a1) / 2)
        return (
          <g key={h} className="jt-seg" style={{ animationDelay: `${i * 55}ms` }}>
            <path d={sector(a0, a1)} fill={c.fill} />
            {heavy(h) && <path d={`M${mx - 7} ${my} l5 5 l9 -10`} fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        )
      })}
      {[6, 9, 12, 15, 18, 20].map((h) => {
        const [x, y] = pt(R_OUT + 14, 180 - (h - 6) * step)
        return <text key={h} x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#495057">{h}</text>
      })}
      {needle !== null && (
        <g className="jt-needle" style={{ transform: `rotate(${needle}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <path d={`M${CX - 5} ${CY} L${CX} ${CY - R_OUT - 4} L${CX + 5} ${CY}Z`} fill="#1a1a1a" />
        </g>
      )}
      <circle cx={CX} cy={CY} r="34" fill={band ? HEAT_COLORS[band].fill : '#1a1a1a'} stroke="#fff" strokeWidth="5" />
      <text x={CX} y={CY + 6} textAnchor="middle" fontSize="17" fontWeight="800" fill={band ? HEAT_COLORS[band].ink : '#fff'}>{nowLabel}</text>
    </svg>
  )
}

// ---------------- a glass that fills with moving water ----------------
export function WaterGlass({ delay = 0, size = 56 }: { delay?: number; size?: number }) {
  const id = `jt-glass-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 48 60" width={size} height={size * 1.25} aria-hidden="true">
      <defs>
        <clipPath id={id}><path d="M6 6h36l-4 48H10z" /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <g className="jt-fill" style={{ animationDelay: `${delay}ms` }}>
          <g className="jt-wave" style={{ animationDelay: `${delay % 900}ms` }}>
            <path d="M0 22 Q 12 16 24 22 T 48 22 T 72 22 T 96 22 V60 H0Z" fill="#1c7ed6" />
            <path d="M0 24 Q 12 30 24 24 T 48 24 T 72 24 T 96 24 V60 H0Z" fill="#4dabf7" opacity="0.6" />
          </g>
        </g>
      </g>
      <path d="M6 6h36l-4 48H10z" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" />
      <path d="M12 12l2 30" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A tiny animated map: you (pulsing) → dashed route drawing itself → the place pin (bobbing). */
export function RouteSketch({ kind }: { kind: 'water' | 'cooling' }) {
  return (
    <svg viewBox="0 0 300 96" className="h-24 w-full" aria-hidden="true">
      <defs>
        <pattern id="jt-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#ced4da" /></pattern>
      </defs>
      <rect width="300" height="96" rx="18" fill="url(#jt-dots)" />
      <path className="jt-draw" style={{ ['--len' as string]: 320 }} d="M40 70 C 100 10, 170 100, 252 34" fill="none" stroke="#0b3d5c" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 9" />
      <circle cx="40" cy="70" r="16" fill="#1c7ed6" opacity="0.25" className="jt-glow" style={{ transformOrigin: '40px 70px' }} />
      <circle cx="40" cy="70" r="8" fill="#1c7ed6" stroke="#fff" strokeWidth="3" />
      <g className="jt-bob">
        <path d="M252 46c-12-14-18-22-18-30a18 18 0 0 1 36 0c0 8-6 16-18 30z" fill={kind === 'water' ? '#1971c2' : '#0c8599'} />
        <circle cx="252" cy="16" r="7" fill="#fff" />
      </g>
    </svg>
  )
}

/** Loading state shaped like the answer, with a turning sun. */
export function SkySkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="relative h-[22rem] overflow-hidden bg-night">
        <div className="absolute top-10 right-10 text-[#ffe066]"><span className="jt-spin-slow inline-block"><Icon name="sun" size={72} /></span></div>
        <div className="mx-auto max-w-xl space-y-4 px-5 pt-24">
          <div className="h-24 w-44 rounded-3xl bg-white/10" />
          <div className="h-8 w-64 rounded-xl bg-white/10" />
        </div>
      </div>
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div className="jt-shimmer h-16 rounded-full" />
        <div className="jt-shimmer h-56 rounded-3xl" />
        <div className="jt-shimmer h-32 rounded-3xl" />
      </div>
    </div>
  )
}
