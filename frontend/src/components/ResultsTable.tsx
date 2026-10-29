import { useMemo, useState } from 'react'
import type { Job, StretchResult } from '../types'
import { STATUS } from './colors'

type Col = { key: keyof StretchResult; label: string; source?: string; num?: boolean }

const COLS: Col[] = [
  { key: 'name', label: 'Stretch' },
  { key: 'status', label: 'Status', source: 'rules in Sources' },
  { key: 'reasons', label: 'Why' },
  { key: 'channel_ha', label: 'Water ha', source: 'Sentinel-2', num: true },
  { key: 'hyacinth_pct', label: 'Weed %', source: 'Sentinel-2 NDVI', num: true },
  { key: 'ndti_z', label: 'Turbidity σ', source: 'Sentinel-2 NDTI', num: true },
  { key: 'ndci_z', label: 'Chlorophyll σ', source: 'Sentinel-2 NDCI', num: true },
]
const ORDER = ['sample first', 'watch', 'normal', 'no data']

export default function ResultsTable({ job, selected, onSelect }: {
  job: Job
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [sort, setSort] = useState<{ key: keyof StretchResult; asc: boolean }>({ key: 'status', asc: true })
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const all = Object.entries(job.results ?? {}).map(([id, r]) => ({ id, r }))
    const filtered = q ? all.filter(({ r }) => r.name.toLowerCase().includes(q.toLowerCase())) : all
    const val = (r: StretchResult) => sort.key === 'status' ? ORDER.indexOf(r.status) : r[sort.key]
    return filtered.sort((a, b) => {
      const x = val(a.r), y = val(b.r)
      if (x == null) return 1
      if (y == null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return (sort.asc ? c : -c) || (b.r.hyacinth_pct ?? 0) - (a.r.hyacinth_pct ?? 0)
    })
  }, [job.results, sort, q])

  const cell = (c: Col, r: StretchResult) => {
    const v = r[c.key]
    if (c.key === 'status') {
      const s = STATUS[r.status]
      return <span className="cls" style={{ background: s.color, color: r.status === 'watch' || r.status === 'no data' ? '#2b261b' : '#fff' }}>{s.label}</span>
    }
    if (c.key === 'reasons') return r.reasons.join(', ')
    if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
    return v == null ? '–' : String(v)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{rows.length} stretches</h2>
        <input className="search-input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} title={c.source ? `Source: ${c.source}` : undefined}
                  onClick={() => setSort({ key: c.key, asc: sort.key === c.key ? !sort.asc : !c.num })}>
                  {c.label}{sort.key === c.key ? (sort.asc ? ' ↑' : ' ↓') : ''}
                  {c.source && <div className="th-source">{c.source}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, r }) => (
              <tr key={id} className={`clickable ${selected === id ? 'sel' : ''}`} onClick={() => onSelect(id)}>
                {COLS.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{cell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
