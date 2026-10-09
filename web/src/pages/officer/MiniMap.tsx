import { useEffect, useRef, useState } from 'react'
import '../../map/setup'
import { Map as MLMap, Marker } from 'maplibre-gl'
import { OPENFREEMAP_STYLE, mapStyleUrl } from '../../config'

/**
 * Small, non-interactive location map for a report card. The WebGL map is only created
 * while the card is on screen, so a long queue never holds many GL contexts at once.
 */
export function MiniMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(false)

  useEffect(() => {
    const el = boxRef.current
    if (!el || !('IntersectionObserver' in window)) {
      setOnScreen(true)
      return
    }
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!onScreen || !mapEl.current) return
    const style = mapStyleUrl()
    const map = new MLMap({
      container: mapEl.current,
      style: style.url,
      center: [lon, lat],
      zoom: 14,
      interactive: false,
      attributionControl: false,
    })
    let fellBack = false
    map.on('error', () => {
      if (style.provider === 'amazon' && !fellBack && !map.isStyleLoaded()) {
        fellBack = true
        map.setStyle(OPENFREEMAP_STYLE)
      }
    })
    new Marker({ color: '#0b3d5c' }).setLngLat([lon, lat]).addTo(map)
    return () => map.remove()
  }, [onScreen, lat, lon])

  return (
    <div ref={boxRef} className="relative h-40 w-full overflow-hidden rounded-md border border-line bg-canvas" role="img" aria-label={label}>
      <div className="absolute inset-0">
        <div ref={mapEl} className="h-full w-full" />
      </div>
    </div>
  )
}
