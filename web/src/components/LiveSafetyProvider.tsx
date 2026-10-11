// Live safety: while the app is open and the user has turned it on, watch the device location and
// keep the next-3-hour warnings for that spot fresh. The location never leaves the device except,
// rounded to about 100 m, in the /now request; nothing is stored on the server.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client'
import { getNow } from '../api/endpoints'
import type { NowResponse } from '../api/types'
import { distanceM, type Coords } from '../lib/geo'
import { LiveSafetyContext, type LiveStatus } from '../lib/liveSafety'
import { showNotice } from '../lib/notify'
import { useSettings } from '../lib/settings'
import { describeWarning, topKey } from '../lib/warnings'

const MOVE_M = 500                 // re-check after moving this far
const REFRESH_MS = 10 * 60_000     // and at least this often while standing still

export function LiveSafetyProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { flags, live, notify } = useSettings()
  const [status, setStatus] = useState<LiveStatus>('off')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [now, setNow] = useState<NowResponse | null>(null)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const fetched = useRef<{ at: Coords; time: number; flags: string } | null>(null)
  const seq = useRef(0)
  const notified = useRef('')
  const hasFix = useRef(false)

  // 1. watch the device location
  useEffect(() => {
    fetched.current = null
    hasFix.current = false
    if (!live) {
      setStatus('off')
      setCoords(null)
      setAccuracy(null)
      setNow(null)
      setCheckedAt(null)
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus('locating')
    const id = navigator.geolocation.watchPosition(
      (p) => {
        hasFix.current = true
        setAccuracy(Math.round(p.coords.accuracy))
        setCoords({ lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)) })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied')
        else if (!hasFix.current) setStatus('unavailable')   // a later timeout keeps the last good fix
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
    )
    const timer = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => {
      navigator.geolocation.clearWatch(id)
      window.clearInterval(timer)
    }
  }, [live])

  // 2. fetch personalised conditions after a real move, when stale, or when the profile changes
  const flagKey = flags.join(',')
  useEffect(() => {
    if (!live) seq.current++   // turned off: drop any reply still in flight
    if (!live || !coords) return
    const last = fetched.current
    if (last && last.flags === flagKey && Date.now() - last.time < REFRESH_MS - 5_000 && distanceM(last.at, coords) < MOVE_M) return
    fetched.current = { at: coords, time: Date.now(), flags: flagKey }
    const mine = ++seq.current
    getNow(coords.lat, coords.lon, undefined, undefined, flagKey ? flagKey.split(',') : undefined)
      .then((res) => {
        if (mine !== seq.current) return
        setNow(res)
        setCheckedAt(Date.now())
        setStatus('on')
      })
      .catch((e) => {
        if (mine !== seq.current) return
        setStatus(e instanceof ApiError && e.status === 400 ? 'outside' : 'error')
      })
  }, [live, coords, flagKey, tick])

  // 3. one system notification each time a new warning (severity 2+) starts
  const warnings = useMemo(() => now?.warnings ?? [], [now])
  const key = topKey(warnings)
  useEffect(() => {
    if (!key) {
      notified.current = ''
      return
    }
    if (key === notified.current) return
    notified.current = key
    if (!notify) return
    const top = warnings.find((w) => w.severity >= 2)
    if (!top) return
    const text = describeWarning(top, t)
    void showNotice(`JalTaap · ${text.title}`, `${text.headline} ${text.action}`)
  }, [key, notify, warnings, t])

  const refresh = () => {
    fetched.current = null
    setTick((n) => n + 1)
  }

  return <LiveSafetyContext.Provider value={{ status, coords, accuracy, now, warnings, checkedAt, refresh }}>{children}</LiveSafetyContext.Provider>
}
