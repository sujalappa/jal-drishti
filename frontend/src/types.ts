import type { Geometry } from 'geojson'

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'
export type EventLevel = 'info' | 'warning' | 'error'
export type Status = 'sample first' | 'watch' | 'normal' | 'no data'

export interface Stage {
  id: string
  name: string
  description: string
  status: StageStatus
  started_at: string | null
  finished_at: string | null
  summary: string | null
  metrics: Record<string, unknown>
  preview: string | null
}

export interface JobEvent {
  time: string
  level: EventLevel
  code: string
  stage: string | null
  message: string
  action: string | null
}

export interface Legend {
  type: 'continuous' | 'categorical'
  min?: number
  max?: number
  unit?: string
  palette?: string[]
  items?: { label: string; color: string }[]
}

export interface RasterOutput {
  file: string
  corners: [number, number][]
  label: string
  legend: Legend | null
}

export interface FileOutput {
  file: string
  label: string
}

export interface Source {
  key?: string
  dataset: string
  provider?: string
  source: string
  resolution_m?: number
  license: string
  used_for?: string
  citation?: string
}

export interface MonthPoint {
  month: string
  seen_ha: number
  hyacinth_pct: number | null
  open_pct: number | null
  ndti: number | null
  ndci: number | null
}

export interface StretchResult {
  code: string
  name: string
  lat: number
  lon: number
  channel_ha: number
  series: MonthPoint[]
  latest_month: string | null
  hyacinth_pct: number | null
  ndti: number | null
  ndci: number | null
  ndti_normal?: number
  ndci_normal?: number
  ndti_z: number | null
  ndci_z: number | null
  reasons: string[]
  status: Status
}

export interface Area {
  id: string
  name: string
  bbox: [number, number, number, number]
  waters: string
  district: string
}

export interface Summary {
  kind?: 'water'
  area?: string
  area_name?: string
  waters?: string
  stretches?: number
  water_ha?: number
  counts?: Record<Status, number>
  city_series?: { month: string; hyacinth_ha: number; hyacinth_pct: number | null }[]
  latest_month?: string | null
  hyacinth_pct?: number | null
  hyacinth_ha?: number | null
  method?: Record<string, string>
}

export interface Job {
  id: string
  name: string
  mode: 'water'
  status: JobStatus
  created_at: string
  finished_at: string | null
  options: Record<string, string | number>
  stages: Stage[]
  outputs: {
    layers: Record<string, FileOutput>
    rasters: Record<string, RasterOutput>
    exports: Record<string, FileOutput>
  }
  summary: Summary
  provenance: Source[]
  event_counts: Record<EventLevel, number>
  events: JobEvent[]
  results: Record<string, StretchResult> | null
}

export interface JobListItem {
  id: string
  name: string
  mode: 'water'
  status: JobStatus
  created_at: string
  finished_at: string | null
  summary: Summary
}

export interface UnitFeature {
  type: 'Feature'
  properties: { id: string; name: string }
  geometry: Geometry
}

export interface UnitCollection {
  type: 'FeatureCollection'
  features: UnitFeature[]
}
