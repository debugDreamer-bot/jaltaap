// Shift reminders on the worker screen: while the page is open, the phone vibrates and says, in a
// female Hindi voice, when to drink water and when to rest, based on each hour's heat band (the same
// glasses-per-hour as the plan). The screen is kept awake (Screen Wake Lock) because browsers pause
// pages when the screen turns off; the card says so. State survives a reload (localStorage).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NowResponse } from '../api/types'
import { currentLang } from '../i18n'
import { speak } from '../lib/speak'
import { readStore, writeStore } from '../lib/storage'
import { GLASSES_PER_HOUR, HEAT_COLORS, type HeatBand } from '../theme'
import { Icon } from './Icon'

const KEY = 'jaltaap.shift'
const REST_MIN: Record<HeatBand, number> = { GREEN: 0, YELLOW: 10, ORANGE: 15, RED: 30 } // shade minutes each hour
const LENGTHS = [4, 6, 8, 10]

interface Shift {
  start: number
  end: number
  glasses: number
  lastWater: number
  restHours: string[] // hours (YYYY-MM-DDTHH) whose rest reminder was given
  noonDay: string | null
}

function load(): Shift | null {
  try {
    const s = JSON.parse(readStore(KEY) ?? 'null') as Shift | null
    return s && s.end > Date.now() ? s : null
  } catch {
    return null
  }
}

function istParts(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), key: `${p.year}-${p.month}-${p.day}T${p.hour}` }
}

const clock = (ms: number) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))

export function ShiftReminders({ n }: { n: NowResponse }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const [shift, setShift] = useState<Shift | null>(load)
  const [len, setLen] = useState(8)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const lock = useRef<{ release: () => Promise<void> } | null>(null)

  const bandAt = useCallback(
    (ms: number): HeatBand => {
      const key = istParts(ms).key
      return n.hours.find((h) => h.time.startsWith(key))?.band ?? n.now?.band ?? n.today.day_band
    },
    [n],
  )

  const save = (s: Shift | null) => {
    setShift(s)
    writeStore(KEY, s ? JSON.stringify(s) : '')
  }

  const remind = useCallback(
    (text: string) => {
      setNotice(text)
      if ('vibrate' in navigator) navigator.vibrate([300, 150, 300])
      void speak([text], lang, null)
    },
    [lang],
  )

  // keep the screen awake while a shift runs (re-acquired when the page becomes visible again)
  useEffect(() => {
    if (!shift) return
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    const acquire = () => wl?.request('screen').then((l) => (lock.current = l)).catch(() => {})
    void acquire()
    const onVis = () => document.visibilityState === 'visible' && void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void lock.current?.release().catch(() => {})
      lock.current = null
    }
  }, [shift])

  // the reminder clock
  useEffect(() => {
    if (!shift) return
    const tick = () => {
      const ms = Date.now()
      setNow(ms)
      const cur = load() ?? shift
      if (ms >= cur.end) {
        remind(t('shift.say.end'))
        save(null)
        return
      }
      const band = bandAt(ms)
      const p = istParts(ms)
      const next = { ...cur }
      let changed = false
      const every = 60 / GLASSES_PER_HOUR[band]
      if (ms - cur.lastWater >= every * 60_000) {
        remind(t('shift.say.water'))
        next.lastWater = ms
        changed = true
      }
      const rest = REST_MIN[band]
      if (rest && p.minute >= 60 - rest && !cur.restHours.includes(p.key)) {
        remind(band === 'RED' ? t('shift.say.restRed', { min: rest }) : t('shift.say.rest', { min: rest }))
        next.restHours = [...cur.restHours.slice(-24), p.key]
        changed = true
      }
      if (n.today.noon_pause && p.hour === 12 && cur.noonDay !== p.day) {
        remind(t('shift.say.noon'))
        next.noonDay = p.day
        changed = true
      }
      if (changed) save(next)
    }
    tick()
    const id = setInterval(tick, 20_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift?.start, bandAt, remind])

  const start = () => {
    const ms = Date.now()
    save({ start: ms, end: ms + len * 3_600_000, glasses: 0, lastWater: ms, restHours: [], noonDay: null })
    remind(t('shift.say.start', { hours: len }))
  }

  if (!shift)
    return (
      <div className="jt-border rounded-[2rem] p-5 shadow-sm">
        <div className="flex gap-4">
          <span className="jt-shake inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#e7f1f8] text-brand"><Icon name="bell" size={34} /></span>
          <div>
            <p className="text-xl leading-tight font-bold">{t('shift.title')}</p>
            <p className="mt-1 text-lg text-muted">{t('shift.intro')}</p>
          </div>
        </div>
        <p className="mt-3 font-semibold">{t('shift.howLong')}</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {LENGTHS.map((h) => (
            <button key={h} type="button" onClick={() => setLen(h)} aria-pressed={len === h}
              className={`min-h-14 rounded-2xl text-xl font-bold transition ${len === h ? 'scale-105 bg-brand text-white shadow-md' : 'bg-canvas ring-1 ring-line hover:ring-brand'}`}>
              {t('shift.hours', { h })}
            </button>
          ))}
        </div>
        <button type="button" onClick={start} className="jt-shine mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-brand to-[#1c7ed6] text-xl font-bold text-white shadow-lg active:scale-[0.98]">
          <Icon name="play" size={26} />{t('shift.start')}
        </button>
      </div>
    )

  const band = bandAt(now)
  const every = 60 / GLASSES_PER_HOUR[band]
  const nextWater = shift.lastWater + every * 60_000
  const mins = Math.min(every, Math.max(0, Math.ceil((nextWater - now) / 60_000))) // `now` can lag a tap by up to one tick
  const waterLeft = Math.min(1, Math.max(0, (nextWater - now) / (every * 60_000))) // 1 = just drank
  const done = Math.min(1, Math.max(0, (now - shift.start) / (shift.end - shift.start)))
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-2 ring-brand" aria-live="polite">
      <div className="jt-sky relative flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundImage: 'linear-gradient(120deg, #072a40, #0b3d5c, #1c7ed6, #0b3d5c)' }}>
        <p className="flex items-center gap-2 text-lg font-bold">
          <span className="jt-shake inline-flex"><Icon name="bell" size={24} /></span>{t('shift.running')}
        </p>
        <p className="font-semibold">{t('shift.until', { time: clock(shift.end) })}</p>
      </div>
      <div className="h-2 bg-[#e7f1f8]" role="progressbar" aria-valuenow={Math.round(done * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('shift.running')}>
        <div className="h-full rounded-r-full bg-gradient-to-r from-[#1c7ed6] to-[#69db7c] transition-[width] duration-1000" style={{ width: `${done * 100}%` }} />
      </div>
      <div className="space-y-3 p-4">
        {notice && <p key={notice} className="jt-pop rounded-2xl bg-[#fff3bf] p-3 text-lg font-bold">{notice}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center rounded-2xl bg-canvas p-3 text-center">
            <span className="relative inline-flex h-24 w-24 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(#1c7ed6 ${waterLeft * 360}deg, #dbeefe 0deg)` }}>
              <span className="absolute inset-[7px] rounded-full bg-canvas" />
              <span className="relative flex flex-col items-center leading-none">
                <Icon name="glass" size={24} className="text-water" />
                <span className="mt-1 text-3xl font-black tabular-nums">{mins}</span>
              </span>
            </span>
            <p className="mt-2 font-semibold text-muted">{t('shift.minToWater')}</p>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl p-3 text-center" style={{ background: HEAT_COLORS[band].fill, color: HEAT_COLORS[band].ink }}>
            <Icon name="clock" size={34} className="jt-bob mx-auto" />
            <p className="mt-1 text-4xl font-black">{REST_MIN[band] ? `${REST_MIN[band]}` : '–'}</p>
            <p className="font-semibold">{t('shift.restPerHour')}</p>
          </div>
        </div>
        <button type="button" onClick={() => save({ ...shift, glasses: shift.glasses + 1, lastWater: Date.now() })}
          className="jt-shine flex min-h-16 w-full items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-[#1864ab] to-[#339af0] text-xl font-bold text-white shadow-md active:scale-[0.96]">
          <Icon name="glass" size={28} />{t('shift.drank')}
          <span key={shift.glasses} className="jt-pop rounded-full bg-white/25 px-3 py-0.5 tabular-nums">{shift.glasses}</span>
        </button>
        <p className="text-[15px] text-muted">{t('shift.keepOpen')}</p>
        <button type="button" onClick={() => { save(null); setNotice(null) }} className="min-h-12 w-full rounded-2xl border-2 border-line font-semibold">
          {t('shift.stop')}
        </button>
      </div>
    </div>
  )
}
