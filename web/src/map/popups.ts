// Popup content is built with DOM APIs and textContent only. API strings are never parsed
// as HTML.
import i18n from '../i18n'
import { FLOOD_ICON, HEAT_ICON, ICONS, type IconName } from '../lib/icons'
import { formatDateTime, formatHour } from '../lib/time'
import { FLOOD_COLORS, HEAT_COLORS, isFloodLevel, isHeatBand, type FloodLevel, type HeatBand } from '../theme'
import type { PublicReport, ReliefPoint } from '../api/types'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o)
const lang = () => (i18n.language === 'hi' ? 'hi' : 'en')

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function icon(name: IconName, size: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = ICONS[name] // static icon markup from lib/icons.ts, never API data
  return svg
}

function badge(fill: string, ink: string, iconName: IconName, word: string): HTMLElement {
  const wrap = el('div', 'popup-badge')
  const sw = el('span', 'popup-swatch')
  sw.style.background = fill
  sw.style.color = ink
  sw.appendChild(icon(iconName, 20))
  wrap.append(sw, el('span', '', word))
  return wrap
}

function rows(pairs: Array<[string, string | null | undefined]>): HTMLElement {
  const dl = el('dl')
  for (const [k, v] of pairs) {
    if (v === undefined) continue
    const row = el('div', 'popup-row')
    row.append(el('dt', '', k), el('dd', '', v === null || v === '' ? t('popup.noValue') : v))
    dl.appendChild(row)
  }
  return dl
}

const num = (v: number | null | undefined, unit: string, digits = 1): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)} ${unit}` : null

function meta(hour: string | null, updated: string | null): HTMLElement | null {
  const parts: string[] = []
  if (hour) parts.push(`${t('popup.hour')}: ${formatHour(hour, lang())}`)
  if (updated) parts.push(t('data.updated', { time: formatDateTime(updated, lang()) }))
  if (!parts.length) return null
  const m = el('div', 'popup-meta')
  parts.forEach((p) => m.appendChild(el('div', '', p)))
  return m
}

export interface HeatCellInfo {
  band: HeatBand
  temp_c: number | null
  rh: number | null
  wet_bulb_c: number | null
}

export function heatPopup(c: HeatCellInfo, hour: string | null, updated: string | null): HTMLElement {
  const root = el('div')
  root.appendChild(el('div', 'popup-title', t('popup.heatCell')))
  if (isHeatBand(c.band)) {
    const col = HEAT_COLORS[c.band]
    root.appendChild(badge(col.fill, col.ink, HEAT_ICON[c.band], t(`bands.${c.band}`)))
  }
  root.appendChild(
    rows([
      [t('popup.temp'), num(c.temp_c, '°C')],
      [t('popup.rh'), num(c.rh, '%', 0)],
      [t('popup.wetBulb'), num(c.wet_bulb_c, '°C')],
    ]),
  )
  const m = meta(hour, updated)
  if (m) root.appendChild(m)
  return root
}

export interface HotspotInfo {
  name: string
  type: string
  agency: string
  level: FloodLevel
  rain_3h_mm: number | null
  confirmed_reports: number | null | undefined
}

export function hotspotPopup(h: HotspotInfo, hour: string | null, updated: string | null): HTMLElement {
  const root = el('div')
  root.appendChild(el('div', 'popup-title', h.name))
  if (isFloodLevel(h.level)) {
    const col = FLOOD_COLORS[h.level]
    root.appendChild(badge(col.fill, col.ink, FLOOD_ICON[h.level], t(`levels.${h.level}`)))
  }
  if (h.type === 'underpass') {
    const u = el('div', 'popup-badge')
    u.append(icon('underpass', 22), el('span', '', t('popup.underpass')))
    root.appendChild(u)
  }
  const pairs: Array<[string, string | null | undefined]> = [
    [t('popup.agency'), h.agency || null],
    [t('popup.rain3h'), num(h.rain_3h_mm, 'mm')],
  ]
  // Report count is not part of replay data; leave the row out rather than show a guess.
  if (h.confirmed_reports !== undefined) pairs.push([t('popup.reportCount'), h.confirmed_reports === null ? null : String(h.confirmed_reports)])
  root.appendChild(rows(pairs))
  const m = meta(hour, updated)
  if (m) root.appendChild(m)
  return root
}

function depthWord(d: string | null | undefined): string | null {
  if (!d) return null
  const key = `depth.${d}`
  return i18n.exists(key) ? t(key) : d
}

function statusWord(s: string): string {
  const key = `status.${s}`
  return i18n.exists(key) ? t(key) : s
}

export function reportPopup(r: PublicReport): HTMLElement {
  const root = el('div')
  if (r.thumb_url && /^https?:\/\//i.test(r.thumb_url)) {
    const img = el('img', 'popup-thumb')
    img.src = r.thumb_url
    img.alt = t('popup.photoAlt')
    img.loading = 'lazy'
    img.referrerPolicy = 'no-referrer'
    img.onerror = () => img.remove()
    root.appendChild(img)
  }
  const summary = lang() === 'hi' ? r.summary_hi || r.summary_en : r.summary_en || r.summary_hi
  if (summary) root.appendChild(el('div', 'popup-title', summary))
  root.appendChild(
    rows([
      [t('popup.depth'), depthWord(r.water_depth)],
      [t('popup.reported'), formatDateTime(r.created_at, lang()) || null],
      [t('popup.status'), statusWord(String(r.status))],
      ...(r.agency ? ([[t('popup.agency'), r.agency]] as Array<[string, string]>) : []),
    ]),
  )
  return root
}

export function reliefPopup(p: ReliefPoint): HTMLElement {
  const root = el('div')
  root.appendChild(el('div', 'popup-title', p.name))
  const kindKey = `popup.kind.${p.kind}`
  const k = el('div', 'popup-badge')
  k.append(icon(p.kind === 'water' ? 'water' : p.kind === 'hospital' ? 'hospital' : 'cooling', 22), el('span', '', i18n.exists(kindKey) ? t(kindKey) : p.kind))
  root.appendChild(k)
  const pairs: Array<[string, string | null | undefined]> = []
  if (p.status) pairs.push([t('popup.status'), p.status])
  if (p.cool_room) pairs.push([t('popup.coolRoom'), p.cool_room])
  if (pairs.length) root.appendChild(rows(pairs))
  if (p.source && /^https?:\/\//i.test(p.source)) {
    const a = el('a', 'link', t('popup.moreInfo'))
    a.href = p.source
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    const wrap = el('div', 'popup-meta')
    wrap.appendChild(a)
    root.appendChild(wrap)
  }
  return root
}
