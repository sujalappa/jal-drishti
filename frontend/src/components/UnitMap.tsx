import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { fileUrl } from '../api'
import type { FeatureCollection } from 'geojson'
import type { Job, UnitCollection } from '../types'
import { METRICS, STATUS, gradient, metricExpr, statusExpr, type Metric } from './colors'

const abs = (p: string) => new URL(p, window.location.href).href
maplibregl.setWorkerUrl(abs('/maplibre/maplibre-gl-worker.mjs'))

function boundsOf(fc: UnitCollection): [[number, number], [number, number]] {
  let w = 180, s = 90, e = -180, n = -90
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[]
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  fc.features.forEach((f) => walk((f.geometry as { coordinates: unknown }).coordinates))
  return [[w, s], [e, n]]
}

export default function UnitMap({ job, units, selected, onSelect }: {
  job: Job
  units: UnitCollection
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const metrics = METRICS
  const [colorBy, setColorBy] = useState<string>('status')
  const [basemap, setBasemap] = useState<'satellite' | 'streets'>('satellite')
  const rasters = Object.entries(job.outputs.rasters)
  const [raster, setRaster] = useState<string>('')
  const metric: Metric | undefined = metrics.find((m) => m.key === colorBy)

  useEffect(() => {
    if (!box.current) return
    const joined = {
      ...units,
      features: units.features.map((f) => {
        const r = job.results?.[f.properties.id]
        const { series: _series, reasons, ...rest } = r ?? ({} as Record<string, unknown>)
        void _series
        return { ...f, properties: { ...f.properties, ...rest, reasons: Array.isArray(reasons) ? reasons.join(', ') : '' } }
      }),
    }
    const m = new maplibregl.Map({
      container: box.current,
      style: {
        version: 8,
        sources: {
          satellite: { type: 'raster', tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
          streets: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'] },
        },
        layers: [
          { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-saturation': -0.35 } },
          { id: 'streets', type: 'raster', source: 'streets', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.75 } },
        ],
      },
      bounds: boundsOf(units),
      fitBoundsOptions: { padding: 24 },
      maxZoom: 17,
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      for (const [key, r] of rasters) {
        m.addSource(`r-${key}`, { type: 'image', url: abs(fileUrl(job.id, r.file)), coordinates: r.corners as [[number, number], [number, number], [number, number], [number, number]] })
        m.addLayer({ id: `r-${key}`, type: 'raster', source: `r-${key}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } })
      }
      m.addSource('units', { type: 'geojson', data: joined as unknown as FeatureCollection, promoteId: 'id' })
      m.addLayer({ id: 'units-fill', type: 'fill', source: 'units', paint: { 'fill-color': statusExpr(), 'fill-opacity': 0.9 } })
      m.addLayer({ id: 'units-line', type: 'line', source: 'units', paint: { 'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': 0.8 } })
      m.addLayer({ id: 'units-flag', type: 'line', source: 'units', filter: ['==', ['get', 'status'], 'sample first'], paint: { 'line-color': '#7a1f12', 'line-width': 2 } })
      m.addLayer({ id: 'units-selected', type: 'line', source: 'units', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#111', 'line-width': 2.8 } })
      m.on('click', 'units-fill', (e: MapLayerMouseEvent) => onSelect(String(e.features?.[0]?.properties?.id ?? '') || null))
      m.on('mouseenter', 'units-fill', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'units-fill', () => { m.getCanvas().style.cursor = '' })
      setReady(true)
    })
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, units])

  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    m.setPaintProperty('units-fill', 'fill-color', colorBy === 'status' ? statusExpr() : metricExpr(metric!))
    m.setPaintProperty('units-fill', 'fill-opacity', raster ? 0.15 : 0.9)
    m.setLayoutProperty('satellite', 'visibility', basemap === 'satellite' ? 'visible' : 'none')
    m.setLayoutProperty('streets', 'visibility', basemap === 'streets' ? 'visible' : 'none')
    for (const [key] of rasters) m.setLayoutProperty(`r-${key}`, 'visibility', raster === key ? 'visible' : 'none')
    m.setFilter('units-selected', ['==', ['get', 'id'], selected ?? ''])
  }, [ready, colorBy, metric, basemap, raster, selected, rasters])

  useEffect(() => {
    const m = map.current
    if (!ready || !m || !selected) return
    const f = units.features.find((x) => x.properties.id === selected)
    if (f) {
      const b = boundsOf({ type: 'FeatureCollection', features: [f] })
      if (!m.getBounds().contains([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2])) m.fitBounds(b, { padding: 80, maxZoom: 11 })
    }
    void (m.getSource('units') as GeoJSONSource | undefined)
  }, [ready, selected, units])

  const activeRaster = raster ? job.outputs.rasters[raster] : null
  return (
    <div className="map-wrap">
      <div ref={box} className="map" />
      <div className="map-controls">
        <h3>Colour by</h3>
        <select value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
          <option value="status">Status</option>
          {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        {rasters.length > 0 && <h3>Satellite layer</h3>}
        {rasters.length > 0 && (
          <select value={raster} onChange={(e) => setRaster(e.target.value)}>
            <option value="">None</option>
            {rasters.map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={basemap === 'satellite'}
          onChange={() => setBasemap(basemap === 'satellite' ? 'streets' : 'satellite')} /> Satellite basemap</label>
      </div>
      <div className="legend">
        {activeRaster?.legend ? (
          <>
            <strong>{activeRaster.label}</strong>
            {activeRaster.legend.type === 'continuous' ? (
              <>
                <div className="ramp" style={{ background: `linear-gradient(90deg,${(activeRaster.legend.palette ?? []).map((c) => `#${c}`).join(',')})` }} />
                <div className="ramp-labels"><span>{activeRaster.legend.min}{activeRaster.legend.unit}</span><span>0</span><span>+{activeRaster.legend.max}{activeRaster.legend.unit}</span></div>
              </>
            ) : activeRaster.legend.items?.map((it) => (
              <div key={it.label} className="legend-row"><span className="swatch" style={{ background: it.color }} />{it.label}</div>
            ))}
          </>
        ) : colorBy === 'status' ? (
          <>
            <strong>Stretch status, {job.summary.latest_month}</strong>
            {Object.values(STATUS).map((c) => (
              <div key={c.label} className="legend-row"><span className="swatch" style={{ background: c.color }} />{c.label}</div>
            ))}
            <div className="legend-source">Sentinel-2 · weed cover, turbidity, chlorophyll</div>
          </>
        ) : metric ? (
          <>
            <strong>{metric.label} ({metric.unit})</strong>
            <div className="ramp" style={{ background: gradient(metric.stops) }} />
            <div className="ramp-labels"><span>{metric.stops[0][0]}</span><span>{metric.stops[metric.stops.length - 1][0]}</span></div>
            <div className="legend-row"><span className="swatch outline" />Sample first</div>
            <div className="legend-source">Source: {metric.source}</div>
          </>
        ) : null}
      </div>
    </div>
  )
}
