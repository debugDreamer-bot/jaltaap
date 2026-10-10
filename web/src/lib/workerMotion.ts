// Helpers for the worker screen's motion (components/WorkerVisuals.tsx and pages/CheckPage.tsx).
import { useEffect, useState, type PointerEvent } from 'react'
import type { HeatBand } from '../theme'

export const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Sky gradients per band. Text uses the band's ink colour, which keeps 4.5:1 on every stop. */
export const SKY: Record<HeatBand, [string, string, string]> = {
  GREEN: ['#0b4f2a', '#1f7a3a', '#2b8a3e'],
  YELLOW: ['#f59f00', '#fcc419', '#ffe066'],
  ORANGE: ['#e8590c', '#f76707', '#ff922b'],
  RED: ['#7a1010', '#b42323', '#e03131'],
}

/** Counts from 0 up to `to` once mounted (instant with reduced motion). */
export function useCountUp(to: number, ms = 1400): number {
  const [v, setV] = useState(() => (reduced() ? to : 0))
  useEffect(() => {
    if (reduced()) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(to * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return v
}

/** Sets --mx/--my for the .jt-spot cursor spotlight. */
export const spot = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}
