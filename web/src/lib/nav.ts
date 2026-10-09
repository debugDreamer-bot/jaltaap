// Minimal client-side router (three routes do not justify a router dependency).
import { useEffect, useState } from 'react'

const listeners = new Set<() => void>()

export function navigate(to: string) {
  if (to === window.location.pathname) return
  window.history.pushState(null, '', to)
  listeners.forEach((l) => l())
  window.scrollTo(0, 0)
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => {
      listeners.delete(update)
      window.removeEventListener('popstate', update)
    }
  }, [])
  return path.replace(/\/+$/, '') || '/'
}

