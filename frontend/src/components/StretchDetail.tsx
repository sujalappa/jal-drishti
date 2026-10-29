import type { StretchResult } from '../types'
import { IndexLine, MonthBars } from './Charts'
import { STATUS } from './colors'

const z = (v: number | null) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)} σ`)

export default function StretchDetail({ r }: { r: StretchResult }) {
  const st = STATUS[r.status]
  const maps = `https://www.google.com/maps?q=${r.lat},${r.lon}`
  return (
    <>
      <div className="detail-head">
        <h3>{r.name}</h3>
        <div className="muted small">{r.channel_ha} ha of water · <a href={maps} target="_blank" rel="noreferrer">{r.lat}, {r.lon}</a></div>
        <div className="cat-badge" style={{ background: st.color, color: r.status === 'normal' || r.status === 'sample first' ? '#fff' : '#2b261b' }}>{st.label}</div>
        {r.reasons.length > 0 && <div className="reasons">{r.reasons.join(' · ')}</div>}
      </div>

      <h4>Floating weed (hyacinth) · {r.latest_month}</h4>
      <div className="ind-row">
        <div><div className="ind-label">Cover now</div><div className="ind-source">Sentinel-2 NDVI &gt; 0.3 on the water channel</div></div>
        <div className="ind-value">{r.hyacinth_pct == null ? '–' : `${r.hyacinth_pct.toFixed(0)}%`}</div>
      </div>
      <MonthBars color="#4caf50" points={r.series.map((p) => ({ month: p.month, value: p.hyacinth_pct }))} />
      <div className="chart-note">monthly cover, % of visible water · gaps: monsoon cloud</div>

      <h4>Water colour vs the same month in 2019-2023</h4>
      <div className="ind-row">
        <div><div className="ind-label">Turbidity (NDTI)</div><div className="ind-source">suspended sediment, sewage solids · Lacaux et al. 2007</div></div>
        <div className="ind-value">{r.ndti ?? '–'}<span className="zval">{z(r.ndti_z)}</span></div>
      </div>
      <IndexLine series={r.series} keyName="ndti" normal={r.ndti_normal} color="#b2182b" />
      <div className="ind-row">
        <div><div className="ind-label">Chlorophyll (NDCI)</div><div className="ind-source">algae from nutrient-rich sewage · Mishra &amp; Mishra 2012</div></div>
        <div className="ind-value">{r.ndci ?? '–'}<span className="zval">{z(r.ndci_z)}</span></div>
      </div>
      <IndexLine series={r.series} keyName="ndci" normal={r.ndci_normal} color="#1b7837" />
      <div className="chart-note">dashed line: normal for {r.latest_month?.slice(5)} · σ = standard deviations from normal</div>
      <p className="muted small detail-note">Satellite colour indices are proxies. Confirm with a water sample (BOD, DO, coliforms).</p>
    </>
  )
}
