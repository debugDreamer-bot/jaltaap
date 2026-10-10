// Next-48-hours chart: a heat-band strip (colour + icon + word in the tooltip) above temperature
// and wet-bulb lines on one °C axis. Hover or tap shows a crosshair with every value for that hour;
// a visually hidden table carries the same numbers for screen readers.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { NowHour } from '../api/types'
import { currentLang } from '../i18n'
import { HEAT_COLORS } from '../theme'

const C_TEMP = '#e8590c'
const C_WB = '#1c7ed6'
const H = 210
const PAD = { l: 34, r: 14, t: 34, b: 26 }
const STRIP = 14

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const hourLabel = (iso: string) => iso.slice(11, 13)

export function Timeline48({ hours }: { hours: NowHour[] }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const data = hours.slice(0, 48)

  const g = useMemo(() => {
    const vals = data.flatMap((h) => [h.temp_c, h.wet_bulb_c])
    const lo = Math.floor((Math.min(...vals) - 2) / 5) * 5
    const hi = Math.ceil((Math.max(...vals) + 2) / 5) * 5
    const iw = width - PAD.l - PAD.r
    const ih = H - PAD.t - PAD.b
    const x = (i: number) => PAD.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * iw)
    const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih
    const path = (k: 'temp_c' | 'wet_bulb_c') => data.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h[k]).toFixed(1)}`).join('')
    const ticks: number[] = []
    for (let v = lo; v <= hi; v += 5) ticks.push(v)
    const step = iw / Math.max(1, data.length - 1)
    return { lo, hi, x, y, tempPath: path('temp_c'), wbPath: path('wet_bulb_c'), ticks, step, iw }
  }, [data, width])

  if (data.length < 2) return null

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const i = Math.round((e.clientX - box.left) / g.step)
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const hh = hover !== null ? data[hover] : null
  const last = data.length - 1
  const tipLeft = hover !== null ? Math.min(Math.max(g.x(hover) - 80, 0), width - 170) : 0

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted">
        <span className="inline-flex items-center gap-2"><span className="inline-block h-[3px] w-5 rounded" style={{ background: C_TEMP }} />{t('timeline.temp')}</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block h-[3px] w-5 rounded" style={{ background: C_WB }} />{t('timeline.wetBulb')}</span>
      </div>
      <div ref={ref} className="relative w-full select-none" style={{ touchAction: 'pan-y' }}>
        <svg width={width} height={H} role="img" aria-label={t('timeline.aria')}>
          {/* band strip */}
          {data.map((h, i) => (
            <rect key={h.time} x={g.x(i) - g.step / 2 + 0.5} y={6} width={Math.max(1, g.step - 1)} height={STRIP} rx={2}
              fill={HEAT_COLORS[h.band].fill} opacity={hover === null || hover === i ? 1 : 0.55} />
          ))}
          {/* day separators */}
          {data.map((h, i) => (hourLabel(h.time) === '00' && i > 0 ? (
            <g key={`d${h.time}`}>
              <line x1={g.x(i)} x2={g.x(i)} y1={PAD.t - 6} y2={H - PAD.b} stroke="#ced4da" strokeDasharray="3 4" />
              <text x={g.x(i) + 4} y={PAD.t + 6} fontSize={12} fill="#495057">{new Date(h.time).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}</text>
            </g>
          ) : null))}
          {/* grid + axis */}
          {g.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={g.y(v)} y2={g.y(v)} stroke="#e9ecef" />
              <text x={PAD.l - 6} y={g.y(v) + 4} textAnchor="end" fontSize={12} fill="#495057">{v}°</text>
            </g>
          ))}
          {data.map((h, i) => (i % 6 === 0 ? <text key={`x${h.time}`} x={g.x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="#495057">{hourLabel(h.time)}:00</text> : null))}
          {/* lines */}
          <path d={g.tempPath} fill="none" stroke={C_TEMP} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={g.wbPath} fill="none" stroke={C_WB} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* now marker */}
          <circle cx={g.x(0)} cy={g.y(data[0].temp_c)} r={4} fill={C_TEMP} stroke="#fff" strokeWidth={2} />
          <circle cx={g.x(0)} cy={g.y(data[0].wet_bulb_c)} r={4} fill={C_WB} stroke="#fff" strokeWidth={2} />
          <text x={g.x(0) + 2} y={PAD.t - 8} fontSize={12} fontWeight={700} fill="#1a1a1a">{t('timeline.now')}</text>
          {/* direct labels at the line ends */}
          <text x={g.x(last) - 2} y={g.y(data[last].temp_c) - 7} textAnchor="end" fontSize={12} fill="#1a1a1a">{data[last].temp_c.toFixed(0)}°</text>
          <text x={g.x(last) - 2} y={g.y(data[last].wet_bulb_c) + 15} textAnchor="end" fontSize={12} fill="#1a1a1a">{data[last].wet_bulb_c.toFixed(0)}°</text>
          {/* crosshair */}
          {hh && hover !== null && (
            <g pointerEvents="none">
              <line x1={g.x(hover)} x2={g.x(hover)} y1={4} y2={H - PAD.b} stroke="#1a1a1a" strokeOpacity={0.35} />
              <circle cx={g.x(hover)} cy={g.y(hh.temp_c)} r={5} fill={C_TEMP} stroke="#fff" strokeWidth={2} />
              <circle cx={g.x(hover)} cy={g.y(hh.wet_bulb_c)} r={5} fill={C_WB} stroke="#fff" strokeWidth={2} />
            </g>
          )}
          {/* hit target bigger than the marks */}
          <rect x={PAD.l - g.step / 2} y={0} width={g.iw + g.step} height={H} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hh && (
          <div className="pointer-events-none absolute top-6 z-10 w-[170px] rounded-xl border border-line bg-white/95 p-2.5 text-[15px] shadow-lg backdrop-blur" style={{ left: tipLeft }}>
            <p className="font-bold">{new Date(hh.time).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', hour: 'numeric', timeZone: 'Asia/Kolkata' })}</p>
            <p className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: HEAT_COLORS[hh.band].fill }} />{t(`bands.${hh.band}`)}</p>
            <p>{t('timeline.temp')}: <b>{hh.temp_c.toFixed(1)}°C</b></p>
            <p>{t('timeline.wetBulb')}: <b>{hh.wet_bulb_c.toFixed(1)}°C</b></p>
            {typeof hh.rain_next_3h_mm === 'number' && <p>{t('timeline.rain')}: <b>{hh.rain_next_3h_mm} mm</b></p>}
            {typeof hh.uv_index === 'number' && <p>UV: <b>{hh.uv_index}</b></p>}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{t('timeline.aria')}</caption>
        <thead><tr><th>{t('timeline.hour')}</th><th>{t('timeline.band')}</th><th>{t('timeline.temp')}</th><th>{t('timeline.wetBulb')}</th></tr></thead>
        <tbody>
          {data.map((h) => (
            <tr key={h.time}><td>{h.time.slice(0, 16).replace('T', ' ')}</td><td>{t(`bands.${h.band}`)}</td><td>{h.temp_c}</td><td>{h.wet_bulb_c}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
