import type { MonthPoint } from '../types'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

/** Monthly bars of a 0-100% value; empty slots where no clear image. */
export function MonthBars({ points, color, max = 100, highlight }: {
  points: { month: string; value: number | null }[]
  color: string
  max?: number
  highlight?: string[]
}) {
  return (
    <div className="mbars">
      <div className="mbars-plot">
        {points.map((p) => (
          <div key={p.month} className={`mbar ${highlight?.includes(p.month) ? 'hl' : ''}`}
            title={`${monthLabel(p.month)}: ${p.value == null ? 'no clear image' : `${p.value.toFixed(0)}%`}`}>
            {p.value == null ? <div className="mbar-gap" /> : (
              <div className="mbar-fill" style={{ height: `${Math.min(100, (p.value / max) * 100)}%`, background: color }} />
            )}
          </div>
        ))}
      </div>
      <div className="mbars-axis">
        <span>{monthLabel(points[0].month)}</span>
        <span>{monthLabel(points[Math.floor(points.length / 2)].month)}</span>
        <span>{monthLabel(points[points.length - 1].month)}</span>
      </div>
    </div>
  )
}

/** Small line chart for an index series (NDTI or NDCI), with the normal value as a dashed line. */
export function IndexLine({ series, keyName, normal, color }: {
  series: MonthPoint[]
  keyName: 'ndti' | 'ndci'
  normal?: number
  color: string
}) {
  const vals = series.map((p) => p[keyName])
  const known = vals.filter((v): v is number => v != null)
  if (known.length < 2) return <div className="muted small">Not enough clear open water.</div>
  const lo = Math.min(...known, normal ?? Infinity) - 0.02
  const hi = Math.max(...known, normal ?? -Infinity) + 0.02
  const W = 300, H = 70
  const x = (i: number) => (i / (vals.length - 1)) * W
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  let d = ''
  vals.forEach((v, i) => {
    if (v == null) return
    d += `${d && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
  })
  return (
    <svg className="iline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {normal != null && <line x1={0} x2={W} y1={y(normal)} y2={y(normal)} className="iline-normal" />}
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {vals.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={color} />)}
    </svg>
  )
}
