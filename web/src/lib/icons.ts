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
  | 'tap'
  | 'crew'
  | 'print'
  | 'city'
  | 'mask'
  | 'sun'
  | 'glass'
  | 'umbrella'
  | 'hammer'
  | 'speaker'
  | 'phone'
  | 'share'
  | 'sparkle'
  | 'arrow-right'
  | 'check'
  | 'shield'
  | 'bolt'
  | 'chevron-down'
  | 'map'
  | 'air'
  | 'confused'
  | 'faint'
  | 'dizzy'
  | 'seizure'
  | 'vomit'
  | 'sweat'
  | 'shirt'
  | 'fan'
  | 'tree'
  | 'bell'

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
  // Water-access problem: a tap with a drop.
  tap: `<g ${S}><path d="M3 9h9a4 4 0 014 4v1"/><path d="M7 6v3M5 6h4"/><path d="M3 12h8"/></g><path d="M16 17.2c-.9 1.2-1.6 2-1.6 2.8a1.6 1.6 0 003.2 0c0-.8-.7-1.6-1.6-2.8z" fill="currentColor"/>`,
  crew: `<g ${S}><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0111 0"/><path d="M13.5 15.2a4.5 4.5 0 018 3.8"/></g>`,
  print: `<g ${S}><path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/></g>`,
  mask: `<g ${S}><path d="M4 9.5c2.5-1 5-1.5 8-1.5s5.5.5 8 1.5v3.5c0 3-3.6 5.5-8 5.5S4 16 4 13z"/><path d="M8 12h8M8.5 14.8h7M4 10.5L2 9M20 10.5l2-1.5"/></g>`,
  sun: `<g ${S}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>`,
  glass: `<g ${S}><path d="M6 3.5h12l-1.6 16.2a1.5 1.5 0 01-1.5 1.3H9.1a1.5 1.5 0 01-1.5-1.3z"/></g><path d="M7.2 10h9.6l-.9 9.3a1 1 0 01-1 .9H9.1a1 1 0 01-1-.9z" fill="currentColor" opacity=".35"/>`,
  umbrella: `<g ${S}><path d="M3 12a9 9 0 0118 0z"/><path d="M12 12v6.5a2 2 0 01-4 0"/><path d="M12 3v-1"/></g>`,
  hammer: `<g ${S}><path d="M13.5 6.5l4 4"/><path d="M11 9l-7.3 7.3a1.8 1.8 0 002.6 2.6L13.6 11.6"/><path d="M10.5 4.5l3-1 6 6-1 3-2.5-.5-5-5z"/></g>`,
  speaker: `<g ${S}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></g>`,
  phone: `<g ${S}><path d="M5 3.5h3.5l1.7 4.4-2.2 1.4a11 11 0 006.7 6.7l1.4-2.2 4.4 1.7V19a2 2 0 01-2 2A16.5 16.5 0 013 5.5a2 2 0 012-2z"/></g>`,
  share: `<g ${S}><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/></g>`,
  sparkle: `<path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z" fill="currentColor"/>`,
  'arrow-right': `<g ${S}><path d="M4.5 12h15M13.5 6l6 6-6 6"/></g>`,
  check: `<g ${S}><path d="M4.5 12.5l5 5 10-11"/></g>`,
  shield: `<g ${S}><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></g>`,
  bolt: `<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" fill="currentColor"/>`,
  'chevron-down': `<g ${S}><path d="M6 9l6 6 6-6"/></g>`,
  map: `<g ${S}><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></g>`,
  confused: `<g ${S}><circle cx="12" cy="13" r="8"/><path d="M10 11a2 2 0 113 1.8c-.7.4-1 .9-1 1.7"/></g><circle cx="12" cy="17.2" r="1.2" fill="currentColor"/><path d="M8 3.5l1 2M16 3.5l-1 2M12 2.5v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  faint: `<g ${S}><circle cx="5" cy="15" r="2.3"/><path d="M8 16h12.5M9 13.5l4-2 7.5 1"/><path d="M2.5 20h19"/></g>`,
  dizzy: `<g ${S}><path d="M12 12a1.5 1.5 0 101.5 1.5A3 3 0 1010.5 12a4.5 4.5 0 104.5 4.5A6 6 0 109 10.5"/></g>`,
  seizure: `<g ${S}><path d="M2.5 12h3l2-5 3 10 3-12 3 9 2-2h3"/></g>`,
  vomit: `<g ${S}><circle cx="12" cy="9" r="6.5"/><path d="M9.5 8h.01M14.5 8h.01M10 12.5h4"/></g><path d="M12 15.5c-1.4 2-2.2 3.2-2.2 4.2a2.2 2.2 0 004.4 0c0-1-.8-2.2-2.2-4.2z" fill="currentColor"/>`,
  sweat: `<g ${S}><circle cx="12" cy="9" r="6"/><path d="M9.5 8.5h.01M14.5 8.5h.01M10 12h4"/></g><path d="M19 13c-1 1.4-1.6 2.3-1.6 3a1.6 1.6 0 003.2 0c0-.7-.6-1.6-1.6-3zM5 13c-1 1.4-1.6 2.3-1.6 3a1.6 1.6 0 003.2 0c0-.7-.6-1.6-1.6-3z" fill="currentColor"/>`,
  shirt: `<g ${S}><path d="M8.5 3.5L3 6.5l2 4.5 2-1v10.5h10V10l2 1 2-4.5-5.5-3"/><path d="M8.5 3.5a3.5 2.5 0 007 0"/></g>`,
  fan: `<g ${S}><circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C11 6 13 3 15.5 4.5S14.5 9 12 10.2zM13.8 12.5c4.2-.6 6.8 1.8 5.1 4.1S13.6 15 13.8 12.5zM10.3 12.8C7.6 16 4 16 4.4 13.2s3.9-2.6 5.9-.4z"/><path d="M12 14v7.5"/></g>`,
  tree: `<g ${S}><path d="M12 21.5v-6"/><path d="M12 2.5c-4.5 0-7.5 3.5-7.5 7 0 3.5 3.3 6 7.5 6s7.5-2.5 7.5-6c0-3.5-3-7-7.5-7z"/><path d="M8 21.5h8"/></g>`,
  bell: `<g ${S}><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/></g>`,
  air: `<g ${S}><path d="M3 8.5h11a3 3 0 10-3-3"/><path d="M3 12.5h15a3 3 0 11-3 3"/><path d="M3 16.5h7"/></g>`,
  city: `<g ${S}><path d="M3 21h18"/><path d="M5 21V9l5-3v15"/><path d="M10 21V4l7 3v14"/><path d="M17 11h2.5v10"/></g>`,
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
