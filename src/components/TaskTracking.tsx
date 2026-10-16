import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n/store'
import { asPT } from '../lib/production/render'
import type { Engine, PlanTask, SourceRef } from '../lib/production/plan'
import type { Brief } from '../lib/production/brief'
import type { Fingerprint } from '../lib/production/fingerprint'
import { dispatchProgress } from '../store/progress'
import { emptyProgress, staleness, TRANSITIONS, MAX_NOTES, type ProgressStatus, type TaskProgress } from '../lib/production/progress'
import { parseReport, reportTemplateText, MAX_REPORT_CHARS, type CompletionReport, type ReportError, type ReportWarning } from '../lib/production/report'
import { failureText, fmtTime, partToSource, ProgressBadge, StaleBadge } from './progressUi'

interface Props {
  engine: Engine
  projectId: string
  task: PlanTask
  rec: TaskProgress | undefined
  fp: Fingerprint
  brief: Brief
  depProgress: { done: number; total: number; pending: string[] }
  recheck: boolean
  onOpen: (s: SourceRef) => void
  onPick: (id: string) => void
  onStatus: (text: string) => void
}

const actionLabel = (from: ProgressStatus, to: ProgressStatus) =>
  from === 'verified' ? 'reopen' : from === 'submitted' && to === 'inProgress' ? 'return' : to

/** Implementation progress for one task: its own state, notes, history, freshness, report import and review. */
export function TaskTracking(p: Props) {
  const { t } = useT()
  const pt = useMemo(() => asPT(t), [t])
  const rec = p.rec ?? emptyProgress()
  const st = staleness(p.rec, p.fp)
  const stale = st.stale
  const ctx = () => ({ now: Date.now(), fingerprint: p.fp, stale })
  const [notes, setNotes] = useState(rec.notes)
  useEffect(() => setNotes(p.rec?.notes ?? ''), [p.task.id, p.engine, p.rec?.notes])
  const run = (action: Parameters<typeof dispatchProgress>[2], ok: string) => {
    const r = dispatchProgress(p.engine, p.task.id, action, ctx())
    p.onStatus(r.ok ? ok : failureText(pt, r.error))
    return r.ok
  }
  const moves = TRANSITIONS[rec.status]

  return (
    <section className="task-progress" data-testid="task-progress" aria-label={pt('progress.title')}>
      <h4>{pt('progress.title')}</h4>
      <p className="muted small">{pt('progress.concepts')}</p>
      <p>
        <ProgressBadge status={rec.status} t={pt} /> {stale && <StaleBadge t={pt} />} {p.recheck && <span className="recheck-badge" data-testid="recheck-badge">{pt('progress.recheck.badge')}</span>}
      </p>
      <p className="small" data-testid="dep-progress">
        {pt('progress.deps', { done: p.depProgress.done, total: p.depProgress.total })}
        {p.depProgress.pending.map((id) => (
          <button key={id} type="button" className="link" onClick={() => p.onPick(id)}>{id}</button>
        ))}
      </p>

      {stale && st.stale && (
        <div className="stale-box" role="alert" data-testid="stale-box">
          <strong>{pt('progress.stale.title')}</strong>
          <p className="small">{pt('progress.stale.explain', { status: pt(`progress.status.${rec.status}`) })}</p>
          {(['changed', 'added', 'removed'] as const).map((k) =>
            st.diff[k].length ? (
              <div key={k} className="small">
                {pt(`progress.stale.${k}`)}:{' '}
                {st.diff[k].map((key) => {
                  const src = partToSource(key)
                  return src && k !== 'removed' ? (
                    <button key={key} type="button" className="link" data-testid="stale-part" onClick={() => p.onOpen(src)}>{key}</button>
                  ) : (
                    <code key={key} data-testid="stale-part">{key}</code>
                  )
                })}
              </div>
            ) : null,
          )}
          {p.task.dependents.length > 0 && (
            <p className="small" data-testid="stale-downstream">
              {pt('progress.stale.downstream')}: {p.task.dependents.map((id) => <button key={id} type="button" className="link" onClick={() => p.onPick(id)}>{id}</button>)}
            </p>
          )}
        </div>
      )}

      <div className="task-actions" data-testid="progress-actions">
        {moves.map((to) => (
          <button key={to} className="btn" data-testid={`progress-move-${to}`} onClick={() => run({ type: 'move', to }, pt('progress.saved'))}>
            {pt(`progress.action.${actionLabel(rec.status, to)}`)}
          </button>
        ))}
      </div>

      <label className="task-field">
        <span>{pt('progress.notes')}</span>
        <textarea className="input" rows={3} maxLength={MAX_NOTES} data-testid="progress-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button className="btn" data-testid="progress-notes-save" disabled={notes === rec.notes} onClick={() => run({ type: 'setNotes', notes }, pt('progress.saved'))}>
        {pt('progress.notes.save')}
      </button>

      <h4>{pt('progress.history')}</h4>
      <ul className="task-links" data-testid="progress-history">
        {rec.history.length === 0 && <li className="muted">{pt('prod.task.noneItems')}</li>}
        {[...rec.history].reverse().slice(0, 8).map((h, i) => (
          <li key={`${h.at}-${i}`} className="small">
            {fmtTime(h.at)} · {pt(`progress.status.${h.from}`)} → {pt(`progress.status.${h.to}`)}
            {h.by === 'report' ? ` · ${pt('progress.history.report')}` : ''}
            {h.note ? ` · ${h.note}` : ''}
          </li>
        ))}
      </ul>

      <ReportImport {...p} rec={rec} stale={stale} run={run} pt={pt} />
      <ReviewPanel {...p} rec={rec} stale={stale} run={run} pt={pt} />
    </section>
  )
}

type Shared = Props & { rec: TaskProgress; stale: boolean; run: (a: Parameters<typeof dispatchProgress>[2], ok: string) => boolean; pt: ReturnType<typeof asPT> }

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

function ReportView({ report, pt, outdated }: { report: CompletionReport; pt: Shared['pt']; outdated: boolean }) {
  const c = report.agentClaim
  return (
    <div className="report-view" data-testid="report-view">
      <p className="chip-warn small">{pt('progress.report.claimNote')}</p>
      {outdated && <p className="stale-box small" role="alert" data-testid="report-outdated">{pt('progress.report.outdated')}</p>}
      <p className="small">{pt('progress.report.outcome')}: <strong>{pt(`progress.report.outcome.${c.outcome}`)}</strong></p>
      <h5>{pt('progress.report.files')} <span className="muted small">({pt('progress.report.pathNote')})</span></h5>
      <ul className="task-links">
        {c.changedFiles.length === 0 && <li className="muted">—</li>}
        {c.changedFiles.map((f, i) => (
          <li key={i} className="small"><code>{pt(`progress.report.change.${f.change}`)}</code> <code>{f.path}</code>{f.note ? ` — ${f.note}` : ''}</li>
        ))}
      </ul>
      <h5>{pt('progress.report.checks')} <span className="muted small">({pt('progress.report.checksNote')})</span></h5>
      <ul className="task-links" data-testid="report-checks">
        {c.checks.length === 0 && <li className="muted">—</li>}
        {c.checks.map((k, i) => (
          <li key={i} className="small">{pt(`progress.report.result.${k.result}`)} · {k.name}{k.command ? ` (${k.command})` : ''}{k.details ? ` — ${k.details}` : ''}</li>
        ))}
      </ul>
      {(['limitations', 'questions'] as const).map((k) => (
        <div key={k}>
          <h5>{pt(`progress.report.${k}`)}</h5>
          <ul className="task-links">{c[k].length ? c[k].map((x, i) => <li key={i} className="small">{x}</li>) : <li className="muted">—</li>}</ul>
        </div>
      ))}
      {c.notes && (<><h5>{pt('progress.report.notes')}</h5><pre className="task-prompt" tabIndex={0}>{c.notes}</pre></>)}
    </div>
  )
}

function ReportImport(p: Shared) {
  const { pt } = p
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<{ report: CompletionReport; warnings: ReportWarning[] } | null>(null)
  const [errors, setErrors] = useState<ReportError[]>([])
  const file = useRef<HTMLInputElement>(null)
  const [m, setM] = useState({ outcome: 'completed', files: '', checks: '', limitations: '', questions: '', notes: '' })
  const ctxId = { projectId: p.projectId, engine: p.engine, taskId: p.task.id, fingerprint: p.fp.fp }
  useEffect(() => { setParsed(null); setErrors([]); setText('') }, [p.task.id, p.engine])

  const check = (input: string | unknown) => {
    const r = parseReport(input, ctxId)
    if (r.ok) { setParsed({ report: r.report, warnings: r.warnings }); setErrors([]) } else { setParsed(null); setErrors(r.errors) }
  }
  const checkManual = () =>
    check({
      format: 'horror-director.completion-report', version: 1, ...{ projectId: ctxId.projectId, engine: ctxId.engine, taskId: ctxId.taskId, sourceFingerprint: ctxId.fingerprint },
      agentClaim: {
        outcome: m.outcome,
        changedFiles: lines(m.files).map((l) => { const [change, ...rest] = l.split(/\s+/); return ['added', 'modified', 'deleted'].includes(change) ? { path: rest.join(' '), change } : { path: l, change: 'modified' } }),
        checks: lines(m.checks).map((l) => { const [result, ...rest] = l.split(/\s+/); return ['passed', 'failed', 'notRun'].includes(result) ? { name: rest.join(' '), result } : { name: l, result: 'notRun' } }),
        limitations: lines(m.limitations), questions: lines(m.questions), notes: m.notes,
      },
    })
  const readFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_REPORT_CHARS) return setErrors([{ code: 'tooLarge' }])
    const s = await f.text()
    setText(s)
    check(s)
  }
  const save = (markSubmitted: boolean) => {
    if (!parsed) return
    const ok = p.run({ type: 'attachReport', report: parsed.report, outdated: parsed.warnings.includes('outdatedSource'), markSubmitted }, pt('progress.report.saved'))
    if (ok) { setParsed(null); setText(''); setOpen(false) }
  }
  const canSubmit = TRANSITIONS[p.rec.status].includes('submitted')

  return (
    <div className="report-import" data-testid="report-import">
      <h4>{pt('progress.report.title')}</h4>
      {p.rec.report && <ReportView report={p.rec.report.report} pt={pt} outdated={p.rec.report.outdated || p.stale} />}
      <button className="btn" data-testid="report-open" aria-expanded={open} onClick={() => setOpen(!open)}>{pt('progress.report.import')}</button>
      {open && (
        <div className="report-form">
          <div className="seg" role="group">
            <button type="button" className={`btn${!manual ? ' primary' : ''}`} aria-pressed={!manual} onClick={() => setManual(false)}>{pt('progress.report.modePaste')}</button>
            <button type="button" className={`btn${manual ? ' primary' : ''}`} aria-pressed={manual} data-testid="report-manual-toggle" onClick={() => setManual(true)}>{pt('progress.report.modeManual')}</button>
          </div>
          {!manual ? (
            <>
              <label className="task-field">
                <span>{pt('progress.report.paste')}</span>
                <textarea className="input mono" rows={6} data-testid="report-text" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
              </label>
              <div className="task-actions">
                <button className="btn primary" data-testid="report-check" disabled={!text.trim()} onClick={() => check(text)}>{pt('progress.report.check')}</button>
                <button className="btn" onClick={() => file.current?.click()}>{pt('progress.report.file')}</button>
                <input ref={file} type="file" accept=".json,application/json" hidden data-testid="report-file" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
                <button className="btn" data-testid="report-template" onClick={() => setText(reportTemplateText(ctxId))}>{pt('progress.report.template')}</button>
              </div>
            </>
          ) : (
            <div className="report-manual" data-testid="report-manual">
              <label className="task-field"><span>{pt('progress.report.outcome')}</span>
                <select className="input" data-testid="manual-outcome" value={m.outcome} onChange={(e) => setM({ ...m, outcome: e.target.value })}>
                  {['completed', 'partial', 'blocked', 'failed'].map((o) => <option key={o} value={o}>{pt(`progress.report.outcome.${o}`)}</option>)}
                </select></label>
              {(['files', 'checks', 'limitations', 'questions'] as const).map((k) => (
                <label key={k} className="task-field"><span>{pt(`progress.manual.${k}`)}</span>
                  <textarea className="input" rows={3} data-testid={`manual-${k}`} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></label>
              ))}
              <label className="task-field"><span>{pt('progress.report.notes')}</span>
                <textarea className="input" rows={3} data-testid="manual-notes" value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} /></label>
              <button className="btn primary" data-testid="manual-check" onClick={checkManual}>{pt('progress.report.check')}</button>
            </div>
          )}
          {errors.length > 0 && (
            <ul className="issues" role="alert" data-testid="report-errors">
              {errors.map((e, i) => <li key={i} className="issue error">{pt(`progress.report.err.${e.code}`)}{e.detail ? ` (${e.detail})` : ''}</li>)}
            </ul>
          )}
          {parsed && (
            <div className="report-preview" data-testid="report-preview">
              <strong>{pt('progress.report.preview')}</strong>
              {parsed.warnings.includes('verifiedIgnored') && <p className="chip-warn small">{pt('progress.report.verifiedIgnored')}</p>}
              <ReportView report={parsed.report} pt={pt} outdated={parsed.warnings.includes('outdatedSource')} />
              <div className="task-actions">
                <button className="btn primary" data-testid="report-save" onClick={() => save(false)}>{pt('progress.report.save')}</button>
                {canSubmit && <button className="btn" data-testid="report-save-submit" onClick={() => save(true)}>{pt('progress.report.saveSubmit')}</button>}
                <button className="btn" onClick={() => setParsed(null)}>{pt('btn.cancel')}</button>
              </div>
              <p className="muted small">{pt('progress.report.noAuto')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewPanel(p: Shared) {
  const { pt } = p
  const [note, setNote] = useState('')
  const [dialog, setDialog] = useState(false)
  const [sure, setSure] = useState(false)
  const [ack, setAck] = useState(false)
  useEffect(() => { setNote(''); setDialog(false); setSure(false); setAck(false) }, [p.task.id, p.engine, p.rec.status])
  const reviewable = p.rec.status === 'submitted' || p.rec.status === 'verified'
  if (!reviewable) return p.rec.review ? <p className="muted small" data-testid="review-last">{pt('progress.review.last')}: {pt(`progress.review.outcome.${p.rec.review.outcome}`)} · {p.rec.review.note}</p> : null
  const section = (id: string) => p.brief.sections.find((s) => s.id === id)
  const canApprove = p.rec.status === 'submitted' || p.stale
  const approve = () => {
    if (p.run({ type: 'approve', confirmed: true, note, acknowledgedChanges: ack }, pt('progress.review.approved'))) setDialog(false)
  }
  return (
    <div className="review-panel" data-testid="review-panel">
      <h4>{pt('progress.review.title')}</h4>
      <div className="small"><strong>{pt('progress.review.requirements')}</strong>
        <ul className="task-links">
          {[...(section('goal')?.lines ?? []), ...(section('acceptance')?.lines ?? [])].filter((l) => l.trim()).slice(0, 8).map((l, i) => <li key={i}>{l.replace(/^- /, '')}</li>)}
        </ul></div>
      <p className="small" data-testid="review-freshness">{pt('progress.review.freshness')}: {p.stale ? <StaleBadge t={pt} /> : <span className="fresh-badge">{pt('progress.fresh')}</span>}</p>
      {p.rec.report ? <p className="small">{pt('progress.review.hasReport', { outcome: pt(`progress.report.outcome.${p.rec.report.report.agentClaim.outcome}`) })}</p> : <p className="muted small">{pt('progress.review.noReport')}</p>}
      <p className="muted small">{pt('progress.review.evidenceNote')}</p>
      <label className="task-field"><span>{pt('progress.review.note')}</span>
        <textarea className="input" rows={2} maxLength={MAX_NOTES} data-testid="review-note" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="task-actions">
        {canApprove && <button className="btn primary" data-testid="review-approve" onClick={() => setDialog(true)}>{p.rec.status === 'verified' ? pt('progress.review.reapprove') : pt('progress.review.approve')}</button>}
        {p.rec.status === 'submitted' && <button className="btn" data-testid="review-request" onClick={() => p.run({ type: 'requestChanges', note }, pt('progress.review.requested'))}>{pt('progress.review.request')}</button>}
      </div>
      {dialog && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDialog(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="review-confirm-title" data-testid="review-confirm" onKeyDown={(e) => e.key === 'Escape' && setDialog(false)}>
            <h3 id="review-confirm-title">{pt('progress.review.confirmTitle')}</h3>
            <p>{pt('progress.review.confirmBody', { task: p.task.id })}</p>
            {p.stale && <label className="small"><input type="checkbox" data-testid="review-ack-stale" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {pt('progress.review.ackStale')}</label>}
            <label className="small"><input type="checkbox" data-testid="review-sure" checked={sure} onChange={(e) => setSure(e.target.checked)} /> {pt('progress.review.sure')}</label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDialog(false)}>{pt('btn.cancel')}</button>
              <button className="btn primary" data-testid="review-confirm-yes" disabled={!sure || (p.stale && !ack)} onClick={approve}>{pt('progress.review.confirmYes')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
