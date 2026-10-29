import { useEffect, useState } from 'react'
import { api } from '../api'
import StatusChip from '../components/StatusChip'
import type { Area, JobListItem } from '../types'

function go(id: string) {
  window.location.hash = `#/jobs/${id}`
}

function jobLine(j: JobListItem): string {
  const s = j.summary ?? {}
  if (j.status !== 'completed') return ''
  return `${s.stretches} stretches · ${s.counts?.['sample first'] ?? 0} to sample first · weed ${s.hyacinth_pct ?? '–'}% (${s.latest_month})`
}

export default function Home() {
  const [areas, setAreas] = useState<Area[]>([])
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.areas().then(setAreas).catch((e) => setError(e.message))
    const load = () => api.jobs().then(setJobs).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const start = async (id: string) => {
    setBusy(id)
    setError('')
    try {
      go((await api.createWater(id)).id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the assessment')
    } finally {
      setBusy('')
    }
  }

  return (
    <main>
      <section className="hero">
        <h1>Every stretch of a city's rivers, every month</h1>
        <p className="lead">
          Floating weed, turbidity and algae on urban rivers and lakes from Sentinel-2, so pollution boards know
          where to sample next and whether a cleanup worked. Method after NASA ARSET.
        </p>
      </section>

      <section className="page">
        <div className="section-head"><h2>Choose a city</h2></div>
        <div className="area-grid">
          {areas.map((a) => (
            <div key={a.id} className="panel area-card">
              <h3>{a.name}</h3>
              <p className="muted small">{a.waters}</p>
              <button className="btn btn-primary btn-block" disabled={!!busy} onClick={() => start(a.id)}>
                {busy === a.id ? 'Starting…' : 'Assess the last 24 months'}
              </button>
            </div>
          ))}
        </div>
        {error && <div className="error-box">{error}</div>}
      </section>

      <section className="page" id="assessments">
        <div className="section-head"><h2>Assessments</h2></div>
        {jobs.length === 0 ? (
          <div className="empty muted">No assessments yet.</div>
        ) : (
          <div className="panel list-panel">
            <table className="job-list">
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="clickable" onClick={() => go(j.id)}>
                    <td className="job-name">{j.name}</td>
                    <td className="muted">{jobLine(j)}</td>
                    <td><StatusChip status={j.status} /></td>
                    <td className="muted">{new Date(j.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
