import type { ExpressionSpecification } from 'maplibre-gl'
import type { Status } from '../types'

export const STATUS: Record<Status, { label: string; color: string }> = {
  'sample first': { label: 'Sample first', color: '#c0392b' },
  watch: { label: 'Watch', color: '#f2a531' },
  normal: { label: 'Normal for the season', color: '#2a9d8f' },
  'no data': { label: 'No clear image', color: '#b8b5ab' },
}

export interface Metric {
  key: string
  label: string
  unit: string
  stops: [number, string][]
  source: string
}

export const METRICS: Metric[] = [
  { key: 'hyacinth_pct', label: 'Floating weed (hyacinth) cover', unit: '% of water', source: 'Sentinel-2 NDVI',
    stops: [[0, '#2a9d8f'], [10, '#9fd8b0'], [25, '#f2d16b'], [50, '#e07b1a'], [80, '#7a2e12']] },
  { key: 'ndti_z', label: 'Turbidity vs normal', unit: 'z-score', source: 'Sentinel-2 NDTI, 2019-2023 baseline',
    stops: [[-2, '#2166ac'], [0, '#f2f2ee'], [1.5, '#f4a582'], [2.5, '#b2182b'], [4, '#67001f']] },
  { key: 'ndci_z', label: 'Chlorophyll vs normal', unit: 'z-score', source: 'Sentinel-2 NDCI, 2019-2023 baseline',
    stops: [[-2, '#2166ac'], [0, '#f2f2ee'], [1.5, '#a6dba0'], [2.5, '#1b7837'], [4, '#00441b']] },
]

export function statusExpr(): ExpressionSpecification {
  const pairs = Object.entries(STATUS).flatMap(([k, v]) => [k, v.color])
  return ['match', ['coalesce', ['get', 'status'], 'no data'], ...pairs, '#b8b5ab'] as unknown as ExpressionSpecification
}

export function metricExpr(m: Metric): ExpressionSpecification {
  return ['case', ['==', ['get', m.key], null], '#d9d6cc',
    ['interpolate', ['linear'], ['get', m.key], ...m.stops.flat()]] as ExpressionSpecification
}

export function gradient(stops: [number, string][]): string {
  return `linear-gradient(90deg,${stops.map(([, c]) => c).join(',')})`
}
