// Personal safety settings: kept only on this device (localStorage), never sent to a user account.
// The profile flags go with /now and /chat requests so advice is personalised; nothing else leaves.
import { useSyncExternalStore } from 'react'
import type { ProfileFlag } from '../api/types'
import { readStore, writeStore } from './storage'

export const PROFILE_FLAGS: ProfileFlag[] = ['heavy_work', 'age_60_plus', 'pregnant', 'chronic_illness', 'not_acclimatised']

export interface SafetySettings {
  flags: ProfileFlag[]
  /** Watch the device location while the app is open and warn about the next 3 hours. */
  live: boolean
  /** Also show a system notification when a new warning starts (needs browser permission). */
  notify: boolean
  /** Usual outdoor working hours (IST, HH:MM); the day plan and the chat focus on them. */
  shift: { start: string; end: string } | null
}

const KEY = 'jaltaap.settings'
const DEFAULTS: SafetySettings = { flags: [], live: false, notify: false, shift: null }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function load(): SafetySettings {
  try {
    const raw = JSON.parse(readStore(KEY) ?? 'null') as Partial<SafetySettings> | null
    if (!raw || typeof raw !== 'object') return DEFAULTS
    const flags = Array.isArray(raw.flags) ? PROFILE_FLAGS.filter((f) => raw.flags!.includes(f)) : []
    const s = raw.shift
    const shift = s && HHMM.test(String(s.start)) && HHMM.test(String(s.end)) ? { start: s.start, end: s.end } : null
    return { flags, live: raw.live === true, notify: raw.notify === true, shift }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function getSettings(): SafetySettings {
  return current
}

export function updateSettings(patch: Partial<SafetySettings>): void {
  current = { ...current, ...patch }
  writeStore(KEY, JSON.stringify(current))
  emit()
}

export function resetSettings(): void {
  updateSettings(DEFAULTS)
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = load()
      emit()
    }
  }
  window.addEventListener('storage', onStorage)   // keep other tabs in step
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSettings(): SafetySettings {
  return useSyncExternalStore(subscribe, getSettings)
}
