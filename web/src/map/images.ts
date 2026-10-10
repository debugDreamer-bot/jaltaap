// Map symbol images generated from the shared icon table, so the map, legend and popups
// all use the same icons. Rendered at 2x for sharp display.
import type { Map as MLMap } from 'maplibre-gl'
import { FLOOD_ICON, HEAT_ICON, ICONS, type IconName } from '../lib/icons'
import { FLOOD_COLORS, FLOOD_LEVELS, HEAT_BANDS, HEAT_COLORS, RELIEF_COLORS, REPORT_COLOR, WATER_ISSUE_COLOR } from '../theme'

const PR = 2

interface Spec {
  id: string
  w: number
  h: number
  svg: string
}

function glyph(name: IconName, color: string, x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" color="${color}" style="color:${color}">${ICONS[name]}</g>`
}

function wrap(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PR}" height="${h * PR}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}

function specs(): Spec[] {
  const out: Spec[] = []
  for (const band of HEAT_BANDS) {
    const c = HEAT_COLORS[band]
    out.push({
      id: `heat-${band}`,
      w: 24,
      h: 24,
      svg: wrap(24, 24, `<rect x="1" y="1" width="22" height="22" rx="5" fill="${c.fill}" stroke="#ffffff" stroke-width="1.5"/>${glyph(HEAT_ICON[band], c.ink, 4, 4, 16)}`),
    })
  }
  for (const level of FLOOD_LEVELS) {
    const c = FLOOD_COLORS[level]
    out.push({ id: `flood-${level}`, w: 24, h: 24, svg: wrap(24, 24, glyph(FLOOD_ICON[level], c.ink, 2, 2, 20)) })
  }
  out.push({
    id: 'underpass-badge',
    w: 22,
    h: 22,
    svg: wrap(22, 22, `<circle cx="11" cy="11" r="10" fill="#ffffff" stroke="#1a1a1a" stroke-width="1.5"/>${glyph('underpass', '#1a1a1a', 4, 4, 14)}`),
  })
  out.push({
    id: 'report-pin',
    w: 30,
    h: 38,
    svg: wrap(
      30,
      38,
      `<path d="M15 37C15 37 2 23.5 2 14.5a13 13 0 0126 0C28 23.5 15 37 15 37z" fill="${REPORT_COLOR.fill}" stroke="#ffffff" stroke-width="2"/>${glyph('camera', REPORT_COLOR.ink, 7, 6.5, 16)}`,
    ),
  })
  out.push({
    id: 'water-issue',
    w: 28,
    h: 28,
    svg: wrap(28, 28, `<rect x="1.5" y="1.5" width="25" height="25" rx="6" fill="${WATER_ISSUE_COLOR.fill}" stroke="#ffffff" stroke-width="2"/>${glyph('tap', WATER_ISSUE_COLOR.ink, 5, 5, 18)}`),
  })
  for (const kind of ['cooling', 'water', 'hospital'] as const) {
    const c = RELIEF_COLORS[kind]
    const stroke = kind === 'hospital' ? c.ink : '#ffffff'
    out.push({
      id: `relief-${kind}`,
      w: 24,
      h: 24,
      svg: wrap(24, 24, `<circle cx="12" cy="12" r="11" fill="${c.fill}" stroke="${stroke}" stroke-width="1.75"/>${glyph(kind, c.ink, 5, 5, 14)}`),
    })
  }
  return out
}

let cache: Promise<Array<{ id: string; img: HTMLImageElement }>> | null = null

function loadAll() {
  if (!cache) {
    cache = Promise.allSettled(
      specs().map(async (s) => {
        const img = new Image(s.w * PR, s.h * PR)
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`
        await img.decode()
        return { id: s.id, img }
      }),
    ).then((rs) => rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
  }
  return cache
}

export async function addMapImages(map: MLMap): Promise<void> {
  const imgs = await loadAll()
  for (const { id, img } of imgs) {
    if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: PR })
  }
}
