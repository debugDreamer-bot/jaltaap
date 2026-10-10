import { useEffect, useState } from 'react'
import { getNow } from '../api/endpoints'
import { isAbort } from '../api/client'
import type { NowResponse } from '../api/types'

export type NowLoad = { s: 'loading' } | { s: 'ok'; v: NowResponse } | { s: 'error' }

/** GET /now for a place; refetches when the place changes. */
export function useNow(lat: number | null, lon: number | null, label?: string): NowLoad {
  const [state, setState] = useState<NowLoad>({ s: 'loading' })
  useEffect(() => {
    if (lat === null || lon === null) return
    const ctrl = new AbortController()
    setState({ s: 'loading' })
    getNow(lat, lon, label, ctrl.signal)
      .then((v) => setState({ s: 'ok', v }))
      .catch((e) => !isAbort(e) && setState({ s: 'error' }))
    return () => ctrl.abort()
  }, [lat, lon, label])
  return state
}
