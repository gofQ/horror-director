import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Upload } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { downloadText } from '../lib/download'
import { asPT } from '../lib/production/render'
import type { Engine, Plan } from '../lib/production/plan'
import type { TaskAssessment } from '../lib/production/readiness'
import { splitKey, STATUSES, summarize, type Entries } from '../lib/production/progress'
import { progressReportFileName, renderProgressReport } from '../lib/production/progressReport'
import { buildBackup, loadProgress, parseBackup, readOrphanRaw, serializeBackup, type ProgressBackup } from '../lib/progressStorage'
import { discardOrphanProgress, previewRestore, refreshOrphans, reloadProgress, removeEntry, restoreInto, retryProgressSave, syncProgress, useProgress } from '../store/progress'
import { getBackend } from '../store/library'
import { failureText, selectTask, useExplorer, type StatusFilter } from './progressUi'

interface Props {
  plan: Plan
  engine: Engine
  assess: Map<string, TaskAssessment>
  onStatus: (text: string) => void
}

const stamp = (n: number) => new Date(n).toISOString().replace(/[:.]/g, '-')

/** Progress overview, storage health banner, backup / restore and preserved orphan records. */
export function ProgressDashboard({ plan, engine, assess, onStatus }: Props) {
  const { t } = useT()
  const pt = useMemo(() => asPT(t), [t])
  const activeId = useStore((s) => s.library.activeId)
  const projects = useStore((s) => s.library.projects)
  const prog = useProgress()
  const filter = useExplorer((s) => s.status)
  useEffect(() => syncProgress(), [activeId])
  const sum = useMemo(() => summarize(plan, engine, prog.entries, assess), [plan, engine, prog.entries, assess])
  const name = projects.find((m) => m.id === activeId)?.name ?? plan.overview.name

  const setFilter = (f: StatusFilter) => useExplorer.setState({ status: filter === f ? 'all' : f })
  const counts: [StatusFilter, string, number][] = [
    ['all', pt('progress.dash.total'), sum.total],
    ...STATUSES.map((s) => [s, pt(`progress.status.${s}`), sum.counts[s]] as [StatusFilter, string, number]),
    ['stale', pt('progress.stale.badge'), sum.stale.length],
    ['ready', pt('progress.dash.ready'), sum.ready.length],
  ]

  const exportActive = () => {
    if (!activeId) return
    const text = serializeBackup(buildBackup([{ projectId: activeId, projectName: name, entries: prog.entries }], Date.now()))
    const f = `progress-backup-${activeId}-${stamp(Date.now())}.json`
    downloadText(f, text)
    onStatus(pt('prod.status.downloaded', { name: f }))
  }
  const exportAll = () => {
    const b = getBackend()
    const list = projects.map((m) => {
      const l = loadProgress(b, m.id)
      return { projectId: m.id, projectName: m.name, entries: m.id === activeId ? prog.entries : l.state === 'ok' ? l.record.entries : {} }
    })
    const f = `progress-backup-all-${stamp(Date.now())}.json`
    downloadText(f, serializeBackup(buildBackup(list.filter((x) => Object.keys(x.entries).length), Date.now())))
    onStatus(pt('prod.status.downloaded', { name: f }))
  }
  const report = () => {
    downloadText(progressReportFileName(engine), renderProgressReport(plan, engine, prog.entries, pt, name), 'text/markdown')
    onStatus(pt('prod.status.downloaded', { name: progressReportFileName(engine) }))
  }

  const bannerText = prog.conflict ? pt('progress.err.conflict') : prog.load === 'damaged' ? pt('progress.err.damaged') : prog.error ? failureText(pt, prog.error) : ''
  const orphanEntries = useMemo(() => Object.keys(prog.entries).filter((k) => sum.orphans.includes(splitKey(k)?.taskId ?? '') && splitKey(k)?.engine === engine), [prog.entries, sum.orphans, engine])

  return (
    <div className="card progress-dashboard" data-testid="progress-dashboard">
      <div className="section-title">{pt('progress.dash.title')}</div>
      <p className="muted small">{pt('progress.concepts')}</p>
      {bannerText && (
        <div className="stale-box" role="alert" data-testid="progress-banner">
          <AlertTriangle size={14} /> {bannerText}
          <div className="task-actions">
            {prog.dirty && !prog.conflict && <button className="btn" data-testid="progress-retry" onClick={() => onStatus(retryProgressSave() ? pt('progress.saved') : pt('progress.err.stillFailing'))}>{pt('progress.retry')}</button>}
            {(prog.dirty || prog.conflict) && <button className="btn" data-testid="progress-backup-now" onClick={exportActive}>{pt('progress.backup.now')}</button>}
            {prog.conflict && <button className="btn" data-testid="progress-reload" onClick={() => reloadProgress()}>{pt('progress.reload')}</button>}
            {prog.load === 'damaged' && prog.damagedRaw && <button className="btn" data-testid="progress-raw" onClick={() => downloadText('progress-damaged-raw.txt', prog.damagedRaw!, 'text/plain')}>{pt('progress.raw')}</button>}
          </div>
        </div>
      )}
      <div className="progress-counts" data-testid="progress-counts">
        {counts.map(([k, label, n]) => (
          <button key={k} type="button" className={`progress-count${filter === k ? ' active' : ''}`} data-testid={`pg-count-${k}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            <span className="stat-value">{n}</span>
            <span className="stat-label">{label}</span>
          </button>
        ))}
      </div>
      {([['stale', sum.stale], ['recheck', sum.recheck], ['ready', sum.ready.slice(0, 6)]] as const).map(([k, ids]) =>
        ids.length ? (
          <p key={k} className="small" data-testid={`pg-list-${k}`}>
            <strong>{pt(`progress.dash.list.${k}`)}:</strong>{' '}
            {ids.map((id) => <button key={id} type="button" className="link" onClick={() => selectTask(id)}>{id}</button>)}
          </p>
        ) : null,
      )}

      <div className="task-actions">
        <button className="btn" data-testid="progress-report-download" onClick={report}><Download size={14} /> {pt('progress.rep.download')}</button>
        <button className="btn" data-testid="progress-export" onClick={exportActive}><Download size={14} /> {pt('progress.backup.export')}</button>
        <button className="btn" data-testid="progress-export-all" onClick={exportAll}><Download size={14} /> {pt('progress.backup.exportAll')}</button>
      </div>
      <Restore onStatus={onStatus} />

      {orphanEntries.length > 0 && (
        <div data-testid="orphan-tasks">
          <h4>{pt('progress.dash.orphans')}</h4>
          <p className="muted small">{pt('progress.orphan.note')}</p>
          <ul className="task-links">
            {orphanEntries.map((k) => (
              <li key={k} className="small" data-testid="orphan-task">
                <code>{k}</code> · {pt(`progress.status.${prog.entries[k].status}`)}{' '}
                <button className="link" onClick={() => { downloadText(`orphan-${k.replace(/[^A-Za-z0-9._-]/g, '_')}.json`, JSON.stringify({ [k]: prog.entries[k] }, null, 2)); onStatus(pt('progress.orphan.exported')) }}>{pt('progress.orphan.export')}</button>{' '}
                <button className="link" data-testid="orphan-remove" onClick={() => { if (window.confirm(pt('progress.orphan.confirm'))) onStatus(removeEntry(k) ? pt('progress.orphan.removed') : failureText(pt, useProgress.getState().error)) }}>{pt('progress.orphan.remove')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {prog.orphans.length > 0 && (
        <div data-testid="orphan-projects">
          <h4>{pt('progress.orphan.projects')}</h4>
          <p className="muted small">{pt('progress.orphan.projectsNote')}</p>
          <ul className="task-links">
            {prog.orphans.map((o) => (
              <li key={o.key} className="small" data-testid="orphan-project">
                {o.projectName} · {pt('progress.orphan.entries', { n: o.entries })}{' '}
                <button className="link" onClick={() => { const raw = readOrphanRaw(getBackend()!, o.key); if (raw) downloadText(`progress-orphan-${o.projectId}.json`, raw) }}>{pt('progress.orphan.export')}</button>{' '}
                <button className="link" data-testid="orphan-project-remove" onClick={() => { if (window.confirm(pt('progress.orphan.confirm'))) { discardOrphanProgress(o.key); onStatus(pt('progress.orphan.removed')) } }}>{pt('progress.orphan.remove')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface RestoreState {
  fileName: string
  backup: ProgressBackup
  /** backup project id → library project id ('' = skip) */
  target: Record<string, string>
  useImported: Set<string>
  confirm: boolean
}

function Restore({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useT()
  const pt = useMemo(() => asPT(t), [t])
  const projects = useStore((s) => s.library.projects)
  const [st, setSt] = useState<RestoreState | null>(null)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    const r = parseBackup(await f.text())
    if (!r.ok) return setErr(pt(`progress.restore.err.${r.code}`))
    setSt({ fileName: f.name, backup: r.backup, target: Object.fromEntries(r.backup.projects.map((p) => [p.projectId, projects.some((m) => m.id === p.projectId) ? p.projectId : ''])), useImported: new Set(), confirm: false })
  }
  const rows = st?.backup.projects.map((p) => ({ p, items: st.target[p.projectId] ? previewRestore(st.target[p.projectId], p.entries) : [] })) ?? []
  const apply = () => {
    if (!st) return
    let failed = ''
    for (const { p } of rows) {
      const tgt = st.target[p.projectId]
      if (!tgt) continue
      const r = restoreInto(tgt, p.entries, new Set([...st.useImported].filter((k) => k.startsWith(`${p.projectId}|`)).map((k) => k.slice(p.projectId.length + 1))))
      if (!r.ok) failed = failureText(pt, r.error)
    }
    refreshOrphans()
    setSt(null)
    onStatus(failed || pt('progress.restore.done'))
  }

  return (
    <div className="progress-restore" data-testid="progress-restore">
      <button className="btn" data-testid="restore-open" onClick={() => file.current?.click()}><Upload size={14} /> {pt('progress.restore.open')}</button>
      <input ref={file} type="file" accept=".json,application/json" hidden data-testid="restore-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      {err && <p className="issue error" role="alert" data-testid="restore-error">{err}</p>}
      {st && (
        <div className="report-preview" data-testid="restore-preview">
          <strong>{pt('progress.restore.preview', { name: st.fileName })}</strong>
          <p className="muted small">{pt('progress.restore.note')}</p>
          {rows.map(({ p, items }) => (
            <div key={p.projectId} className="restore-project" data-testid="restore-project">
              <p className="small"><strong>{p.projectName}</strong> <code>{p.projectId}</code></p>
              <label className="task-field"><span>{pt('progress.restore.target')}</span>
                <select className="input" data-testid="restore-target" value={st.target[p.projectId]} onChange={(e) => setSt({ ...st, target: { ...st.target, [p.projectId]: e.target.value } })}>
                  <option value="">{pt('progress.restore.skip')}</option>
                  {projects.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></label>
              <p className="small" data-testid="restore-counts">
                {pt('progress.restore.counts', { fresh: items.filter((i) => i.kind === 'new').length, same: items.filter((i) => i.kind === 'identical').length, clash: items.filter((i) => i.kind === 'collision').length })}
              </p>
              {items.filter((i) => i.kind === 'collision').map((i) => {
                const key = `${st.target[p.projectId]}|${i.key}`
                return (
                  <label key={key} className="small restore-collision" data-testid="restore-collision">
                    <input type="checkbox" checked={st.useImported.has(`${p.projectId}|${i.key}`)} onChange={(e) => { const s = new Set(st.useImported); const id = `${p.projectId}|${i.key}`; if (e.target.checked) s.add(id); else s.delete(id); setSt({ ...st, useImported: s }) }} />{' '}
                    <code>{i.key}</code>: {pt(`progress.status.${i.existing!.status}`)} → {pt(`progress.status.${i.incoming.status}`)} ({pt('progress.restore.useImported')})
                  </label>
                )
              })}
            </div>
          ))}
          <div className="task-actions">
            <button className="btn" data-testid="restore-backup-first" onClick={() => { const id = useProgress.getState().projectId; if (id) downloadText(`progress-backup-before-restore-${stamp(Date.now())}.json`, serializeBackup(buildBackup([{ projectId: id, projectName: id, entries: useProgress.getState().entries as Entries }], Date.now()))) }}>{pt('progress.restore.backupFirst')}</button>
            <button className="btn primary" data-testid="restore-apply" disabled={!rows.some((r) => st.target[r.p.projectId])} onClick={() => setSt({ ...st, confirm: true })}>{pt('progress.restore.apply')}</button>
            <button className="btn" onClick={() => setSt(null)}>{pt('btn.cancel')}</button>
          </div>
          {st.confirm && (
            <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSt({ ...st, confirm: false })}>
              <div className="modal" role="dialog" aria-modal="true" aria-labelledby="restore-title" data-testid="restore-confirm" onKeyDown={(e) => e.key === 'Escape' && setSt({ ...st, confirm: false })}>
                <h3 id="restore-title">{pt('progress.restore.confirmTitle')}</h3>
                <p>{pt('progress.restore.confirmBody', { n: st.useImported.size })}</p>
                <div className="modal-actions">
                  <button className="btn" onClick={() => setSt({ ...st, confirm: false })}>{pt('btn.cancel')}</button>
                  <button className="btn primary" data-testid="restore-confirm-yes" onClick={apply}>{pt('progress.restore.confirmYes')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
