// Single source of truth for risk colours. Every colour is always shown with an icon and a
// word (see components/RiskBadge.tsx), never on its own.
//
// `fill` is the swatch / map colour. `ink` is the icon colour drawn on top of the fill and
// meets 4.5:1 contrast against it. Map heat squares use `fill` at 0.45 opacity.

export type HeatBand = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED'
export type FloodLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE' | 'CONFIRMED'

export interface Swatch {
  fill: string
  ink: string
}

export const HEAT_BANDS: HeatBand[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED']
export const FLOOD_LEVELS: FloodLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'SEVERE', 'CONFIRMED']

export const HEAT_COLORS: Record<HeatBand, Swatch> = {
  GREEN: { fill: '#237032', ink: '#ffffff' },
  YELLOW: { fill: '#fcc419', ink: '#1a1a1a' },
  ORANGE: { fill: '#f76707', ink: '#1a1a1a' },
  RED: { fill: '#c92a2a', ink: '#ffffff' },
}

export const FLOOD_COLORS: Record<FloodLevel, Swatch> = {
  LOW: { fill: '#a5d8ff', ink: '#1a1a1a' },
  MEDIUM: { fill: '#4dabf7', ink: '#1a1a1a' },
  HIGH: { fill: '#1864ab', ink: '#ffffff' },
  SEVERE: { fill: '#5f3dc4', ink: '#ffffff' },
  CONFIRMED: { fill: '#a61e4d', ink: '#ffffff' },
}

export const HEAT_FILL_OPACITY = 0.45

export const REPORT_COLOR: Swatch = { fill: '#212529', ink: '#ffffff' }
export const RELIEF_COLORS: Record<'cooling' | 'water' | 'hospital', Swatch> = {
  cooling: { fill: '#0c8599', ink: '#ffffff' },
  water: { fill: '#1971c2', ink: '#ffffff' },
  hospital: { fill: '#ffffff', ink: '#c92a2a' },
}

export function isHeatBand(v: unknown): v is HeatBand {
  return typeof v === 'string' && (HEAT_BANDS as string[]).includes(v)
}

export function isFloodLevel(v: unknown): v is FloodLevel {
  return typeof v === 'string' && (FLOOD_LEVELS as string[]).includes(v)
}
