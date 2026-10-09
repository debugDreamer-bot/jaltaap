// Icon geometry shared by React components (components/Icon.tsx) and map images
// (map/images.ts). Each icon is SVG markup for a 24x24 viewBox using `currentColor`
// strokes, so the caller decides the colour. Static strings only; no user data.
import type { FloodLevel, HeatBand } from '../theme'

export type IconName =
  | 'band-green'
  | 'band-yellow'
  | 'band-orange'
  | 'band-red'
  | 'flood-low'
  | 'flood-medium'
  | 'flood-high'
  | 'flood-severe'
  | 'flood-confirmed'
  | 'underpass'
  | 'camera'
  | 'cooling'
  | 'water'
  | 'hospital'
  | 'thermometer'
  | 'waves'
  | 'location'
  | 'send'
  | 'play'
  | 'pause'
  | 'close'
  | 'menu'
  | 'chat'
  | 'layers'
  | 'refresh'
  | 'info'
  | 'replay'
  | 'clock'

const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
const DOT = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="1.4" fill="currentColor" stroke="none"/>`

export const ICONS: Record<IconName, string> = {
  // Heat bands: shape grows more alarming with severity (circle, circle, triangle, octagon).
  'band-green': `<g ${S}><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/></g>`,
  'band-yellow': `<g ${S}><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/></g>${DOT(12, 16.6)}`,
  'band-orange': `<g ${S}><path d="M12 3L22 20H2Z"/><path d="M12 9.5v5"/></g>${DOT(12, 17.2)}`,
  'band-red': `<g ${S}><path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8Z"/><path d="M12 7v6.5"/></g>${DOT(12, 16.8)}`,
  // Flood levels: number of waves, then danger octagon, then camera (verified photo).
  'flood-low': `<g ${S}><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></g>`,
  'flood-medium': `<g ${S}><path d="M3 11c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></g>`,
  'flood-high': `<g ${S}><path d="M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 12.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></g>`,
  'flood-severe': `<g ${S}><path d="M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8Z"/><path d="M6.5 13c1.2-1.2 2.4-1.2 3.6 0s2.4 1.2 3.6 0 2.4-1.2 3.6 0"/><path d="M12 6.5v3.5"/></g>`,
  'flood-confirmed': `<g ${S}><path d="M3 8h3.5L8.5 5h7l2 3H21v12H3Z"/><path d="M8.5 13.5l2.5 2.5 4.5-5"/></g>`,
  underpass: `<g ${S}><path d="M2.5 20V11a9.5 9.5 0 0119 0v9"/><path d="M7 20v-8a5 5 0 0110 0v8"/></g>`,
  camera: `<g ${S}><path d="M3 8h3.5L8.5 5h7l2 3H21v12H3Z"/><circle cx="12" cy="13.5" r="3.5"/></g>`,
  cooling: `<g ${S}><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5"/></g>`,
  water: `<g ${S}><path d="M12 3c-3.5 5-6.5 8.5-6.5 12a6.5 6.5 0 0013 0c0-3.5-3-7-6.5-12z"/></g>`,
  hospital: `<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`,
  thermometer: `<g ${S}><path d="M10 14.5V5a2 2 0 014 0v9.5a4 4 0 11-4 0z"/><path d="M12 9v7"/></g>`,
  waves: `<g ${S}><path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></g>`,
  location: `<g ${S}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></g>`,
  send: `<g ${S}><path d="M4 12l16-8-6 16-2.5-6.5z"/></g>`,
  play: `<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>`,
  pause: `<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/>`,
  close: `<g ${S}><path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/></g>`,
  menu: `<g ${S}><path d="M4 7h16M4 12h16M4 17h16"/></g>`,
  chat: `<g ${S}><path d="M4 5h16v11H9l-5 4z"/></g>`,
  layers: `<g ${S}><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></g>`,
  refresh: `<g ${S}><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/></g>`,
  info: `<g ${S}><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/></g>${DOT(12, 7.6)}`,
  replay: `<g ${S}><path d="M4 12a8 8 0 108-8H8"/><path d="M10 1.5L7.5 4 10 6.5"/></g><path d="M10.5 9v6l4.5-3z" fill="currentColor"/>`,
  clock: `<g ${S}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></g>`,
}

export const HEAT_ICON: Record<HeatBand, IconName> = {
  GREEN: 'band-green',
  YELLOW: 'band-yellow',
  ORANGE: 'band-orange',
  RED: 'band-red',
}

export const FLOOD_ICON: Record<FloodLevel, IconName> = {
  LOW: 'flood-low',
  MEDIUM: 'flood-medium',
  HIGH: 'flood-high',
  SEVERE: 'flood-severe',
  CONFIRMED: 'flood-confirmed',
}
