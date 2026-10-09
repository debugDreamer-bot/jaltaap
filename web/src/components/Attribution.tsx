import { useTranslation } from 'react-i18next'
import type { AttribItem } from '../lib/attribution'

const OSM: AttribItem = { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' }


export function Attribution({ items, className = '' }: { items: AttribItem[]; className?: string }) {
  const { t } = useTranslation()
  const all: AttribItem[] = [{ text: t('attribution.weather'), href: 'https://open-meteo.com/' }, ...items]
  if (!all.some((i) => /openstreetmap/i.test(i.text))) all.push(OSM)
  const seen = new Set<string>()
  const unique = all.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)))
  return (
    <p className={`attribution leading-snug ${className}`} lang="en">
      {unique.map((i, n) => (
        <span key={i.text}>
          {n > 0 && <span aria-hidden="true"> · </span>}
          {i.href ? (
            <a href={i.href} target="_blank" rel="noopener noreferrer" className="underline">
              {i.text}
            </a>
          ) : (
            i.text
          )}
        </span>
      ))}
    </p>
  )
}
