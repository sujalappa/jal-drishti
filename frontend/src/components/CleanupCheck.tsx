import { useMemo, useState } from 'react'
import type { Job } from '../types'
import { MonthBars, monthLabel } from './Charts'

/** Before/after floating-weed comparison for the whole area, from the monthly series. */
export default function CleanupCheck({ job }: { job: Job }) {
  const series = job.summary.city_series ?? []
  const valid = series.filter((s) => s.hyacinth_pct != null)
  const [before, setBefore] = useState(valid.length > 13 ? valid[valid.length - 13].month : valid[0]?.month ?? '')
  const [after, setAfter] = useState(valid[valid.length - 1]?.month ?? '')

  const change = useMemo(() => {
    if (!job.results || !before || !after) return null
    const bi = series.findIndex((s) => s.month === before)
    const ai = series.findIndex((s) => s.month === after)
    const rows = Object.values(job.results).map((r) => ({
      name: r.name, b: r.series[bi]?.hyacinth_pct, a: r.series[ai]?.hyacinth_pct, ha: r.channel_ha,
    })).filter((r) => r.b != null && r.a != null) as { name: string; b: number; a: number; ha: number }[]
    const cleared = rows.filter((r) => r.b - r.a >= 20).length
    const worse = rows.filter((r) => r.a - r.b >= 20).length
    return { cleared, worse, n: rows, b: series[bi]?.hyacinth_pct, a: series[ai]?.hyacinth_pct,
      bha: series[bi]?.hyacinth_ha, aha: series[ai]?.hyacinth_ha }
  }, [job.results, series, before, after])

  return (
    <div className="panel-body cleanup">
      <div className="cleanup-head">
        <div>
          <h3 className="sub">Did the cleanup work?</h3>
          <p className="muted small">Floating weed over all {job.summary.stretches} stretches, month by month. Pick a month before and after a removal drive or a new sewage plant.</p>
        </div>
        <div className="cleanup-pick">
          <label>Before<select value={before} onChange={(e) => setBefore(e.target.value)}>
            {valid.map((s) => <option key={s.month} value={s.month}>{monthLabel(s.month)}</option>)}</select></label>
          <label>After<select value={after} onChange={(e) => setAfter(e.target.value)}>
            {valid.map((s) => <option key={s.month} value={s.month}>{monthLabel(s.month)}</option>)}</select></label>
        </div>
      </div>
      <MonthBars color="#4caf50" max={50} highlight={[before, after]}
        points={series.map((s) => ({ month: s.month, value: s.hyacinth_pct }))} />
      <div className="chart-note">% of visible water covered by floating weed · scale 0-50% · gaps: monsoon cloud · Sentinel-2</div>
      {change && (
        <div className="kpis cleanup-kpis">
          <div className="kpi"><div className="value">{change.b?.toFixed(0)}% → {change.a?.toFixed(0)}%</div><div className="label">weed cover, whole area</div><div className="note">{change.bha} ha → {change.aha} ha</div></div>
          <div className="kpi"><div className="value">{change.cleared}</div><div className="label">stretches cleared</div><div className="note">cover down by 20+ points</div></div>
          <div className="kpi"><div className="value">{change.worse}</div><div className="label">stretches worse</div><div className="note">cover up by 20+ points</div></div>
          <div className="kpi"><div className="value">{change.n.length}</div><div className="label">stretches compared</div><div className="note">clear in both months</div></div>
        </div>
      )}
      <p className="muted small">Weed grows every dry season and the monsoon flushes it out, so compare the same season across years (for example May 2025 with May 2026).</p>
    </div>
  )
}
