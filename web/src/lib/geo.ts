export interface Coords {
  lat: number
  lon: number
}

export type GeoErrorCode = 'unsupported' | 'denied' | 'unavailable'

export function getLocation(timeoutMs = 15_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)) }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

/** Great-circle distance in metres. */
export function distanceM(a: Coords, b: Coords): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export function geoErrorCode(e: unknown): GeoErrorCode {
  const m = e instanceof Error ? e.message : ''
  return m === 'unsupported' || m === 'denied' ? m : 'unavailable'
}
