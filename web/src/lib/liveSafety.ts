// Live safety state shared by the whole app; LiveSafetyProvider (components/) keeps it fresh.
import { createContext, useContext } from 'react'
import type { LiveWarning, NowResponse } from '../api/types'
import type { Coords } from './geo'

export type LiveStatus = 'off' | 'locating' | 'on' | 'denied' | 'unavailable' | 'unsupported' | 'outside' | 'error'

export interface LiveSafety {
  status: LiveStatus
  coords: Coords | null
  /** GPS accuracy of the last fix, in metres. */
  accuracy: number | null
  now: NowResponse | null
  warnings: LiveWarning[]
  checkedAt: number | null
  refresh: () => void
}

export const LiveSafetyContext = createContext<LiveSafety>({ status: 'off', coords: null, accuracy: null, now: null, warnings: [], checkedAt: null, refresh: () => {} })

export function useLiveSafety(): LiveSafety {
  return useContext(LiveSafetyContext)
}
