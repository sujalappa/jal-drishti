import { useEffect, useState } from 'react'
import { api, fileUrl } from '../api'
import CleanupCheck from '../components/CleanupCheck'
import EventLog from '../components/EventLog'
import ResultsTable from '../components/ResultsTable'
import { DownloadsView, SourcesView } from '../components/SourcesView'
import StatusChip from '../components/StatusChip'
import Stepper from '../components/Stepper'
import StretchDetail from '../components/StretchDetail'
import UnitMap from '../components/UnitMap'
import type { Job, UnitCollection } from '../types'

type Tab = 'table' | 'cleanup' | 'sources' | 'downloads' | 'processing'
const TABS: Record<Tab, string> = {
  table: 'Stretches', cleanup: 'Cleanup check', sources: 'Sources and method', downloads: 'Downloads', processing: 'Processing',
}

function Kpis({ job }: { job: Job }) {
  const s = job.summary
  const items: [string, string, string][] = [
    [`${s.counts?.['sample first'] ?? 0}`, 'stretches to sample first', 'heavy weed, or unusual turbidity / algae'],
    [`${s.counts?.watch ?? 0}`, 'stretches to watch', `of ${s.stretches} stretches, ${s.water_ha?.toLocaleString()} ha of water`],
    [s.hyacinth_pct == null ? '–' : `${s.hyacinth_pct}%`, 'floating weed cover now', `${s.hyacinth_ha ?? '–'} ha in ${s.latest_month}`],
    [`${s.city_series?.length ?? 0}`, 'months analysed', `${s.city_series?.[0]?.month ?? ''} to ${s.latest_month ?? ''}`],
  ]
  return (
    <div className="kpis">
      {items.map(([v, l, n]) => (
        <div key={l} className="kpi"><div className="value">{v}</div><div className="label">{l}</div><div className="note">{n}</div></div>
      ))}
    </div>
  )
}

export default function JobPage({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null)
  const [units, setUnits] = useState<UnitCollection | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('table')
  const [stage, setStage] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let alive = true
    const load = async () => {
      try {
        const j = await api.job(jobId)
        if (!alive) return
        setJob(j)
        if (j.status === 'queued' || j.status === 'running') timer = setTimeout(load, 2500)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the assessment')
      }
    }
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [jobId])

  const done = job?.status === 'completed'
  useEffect(() => {
    if (done && job?.outputs.layers.units && !units) api.unitsOf(job.id, job.outputs.layers.units.file).then(setUnits).catch(() => {})
  }, [done, job, units])

  if (error) return <main className="page"><div className="error-box">{error}</div></main>
  if (!job) return <main className="page"><p className="muted">Loading…</p></main>

  const result = selected ? job.results?.[selected] : null
  return (
    <main className="page job-page">
      <div className="crumbs"><a href="#/">Assessments</a> / {job.name}</div>
      <div className="job-head">
        <div>
          <h1>{job.name}</h1>
          <div className="job-meta"><StatusChip status={job.status} />
            <span className="muted">{job.summary.waters ?? ''}{job.summary.latest_month ? ` · latest clear month ${job.summary.latest_month}` : ''}</span>
            {job.event_counts.warning > 0 && <span className="chip chip-warning">{job.event_counts.warning} warning{job.event_counts.warning > 1 ? 's' : ''}</span>}
          </div>
        </div>
        {done && job.outputs.exports.pdf && (
          <a className="btn btn-primary" href={fileUrl(job.id, job.outputs.exports.pdf.file, true)} download>Download report</a>
        )}
      </div>

      {!done && (
        <div className="run-grid">
          <div className="panel"><div className="panel-head"><h2>Steps</h2></div>
            <Stepper stages={job.stages} selected={stage} onSelect={setStage} />
          </div>
          <div>
            <div className="panel"><div className="panel-body">
              {job.stages.filter((x) => x.summary).map((x) => <p key={x.id}><strong>{x.name}:</strong> {x.summary}</p>)}
              {job.status !== 'failed' && <p className="muted">Reading 24 months of Sentinel-2 in Earth Engine; a city takes about a minute and a half.</p>}
            </div></div>
            <EventLog events={job.events} stages={job.stages} />
          </div>
        </div>
      )}

      {done && (
        <>
          <Kpis job={job} />
          <div className="result-grid">
            {units ? <UnitMap job={job} units={units} selected={selected} onSelect={setSelected} /> : <div className="map-wrap map-loading">Loading map…</div>}
            <aside className="panel detail">
              {result ? <StretchDetail r={result} /> : (
                <div className="detail-empty">
                  <h3>Click a stretch of river or lake</h3>
                  <p className="muted small">See its weed cover month by month and how its water colour compares with normal. Stretches outlined in dark red are where to take water samples first.</p>
                </div>
              )}
            </aside>
          </div>
          <div className="tabs">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{TABS[t]}</button>
            ))}
          </div>
          {tab === 'table' && <ResultsTable job={job} selected={selected} onSelect={(id) => { setSelected(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}
          {tab === 'cleanup' && <div className="panel"><CleanupCheck job={job} /></div>}
          {tab === 'sources' && <div className="panel"><SourcesView job={job} /></div>}
          {tab === 'downloads' && <div className="panel"><DownloadsView job={job} /></div>}
          {tab === 'processing' && (
            <div className="run-grid">
              <div className="panel"><div className="panel-head"><h2>Steps</h2></div>
                <Stepper stages={job.stages} selected={stage} onSelect={setStage} /></div>
              <div>
                <div className="panel"><div className="panel-body">
                  {job.stages.map((x) => <p key={x.id}><strong>{x.name}:</strong> {x.summary ?? '–'}</p>)}
                </div></div>
                <EventLog events={job.events} stages={job.stages} />
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
