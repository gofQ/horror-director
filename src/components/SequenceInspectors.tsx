import { useEffect, useRef } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { formatDiagnostic } from '../lib/diagnostics'
import { sequenceIssues } from '../lib/seqflow'
import { SEQUENCE_PORTS, SEQUENCE_STAGES } from '../lib/schema'
import { Field, TextArea, TextInput } from './fields'
import { SEQUENCE_PORT_COLOR } from './SequenceNodes'

function Head({ id, prefix, title }: { id: string; prefix: string; title: string }) {
  const { t } = useT()
  const duplicate = useStore((s) => s.duplicateNode)
  const del = useStore((s) => s.deleteScenes)
  return (
    <div className="insp-head">
      <h3>{title}</h3>
      <span>
        <button className="btn small" data-testid={`${prefix}-duplicate`} onClick={() => duplicate(id)} title={t('ctx.duplicate')}>
          <Copy size={14} />
        </button>{' '}
        <button className="btn small danger" data-testid={`${prefix}-delete`} onClick={() => del([id])}>
          <Trash2 size={14} /> {t('btn.delete')}
        </button>
      </span>
    </div>
  )
}

function useFocusOnRequest(id: string) {
  const focusReq = useStore((s) => s.inspectorFocus)
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focusReq !== id) return
    ref.current?.focus()
    useStore.getState().requestInspectorFocus(null)
  }, [focusReq, id])
  return ref
}

export function SequenceInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const node = project.logicNodes.find((n) => n.id === id)
  const update = useStore((s) => s.updateLogicNode)
  const ref = useFocusOnRequest(id)
  if (!node) return null
  const titleOf = (tid: string) => project.scenes.find((s) => s.id === tid)?.title ?? project.logicNodes.find((n) => n.id === tid)?.title ?? tid
  const issues = sequenceIssues(project).filter((i) => i.nodeId === id)
  return (
    <>
      <Head id={id} prefix="sequence" title={t('insp.sequence')} />
      <Field label={t('field.title')}>
        <input ref={ref as React.RefObject<HTMLInputElement>} className="input" data-testid="sequence-title" value={node.title} onChange={(e) => update(id, { title: e.target.value })} />
      </Field>
      <Field label={t('field.description')}>
        <TextArea value={node.description} rows={3} onChange={(description) => update(id, { description })} />
      </Field>
      <div className="section-title">{t('sequence.outputs')}</div>
      <ul className="branch-outs" data-testid="sequence-outs">
        {SEQUENCE_PORTS.map((port) => {
          const link = project.transitions.find((x) => x.source === id && x.sourcePort === port)
          return (
            <li key={port} data-port={port}>
              <strong style={{ color: SEQUENCE_PORT_COLOR[port] }}>{t(`pin.${port}`)}</strong> →{' '}
              {link ? titleOf(link.target) : <span className="muted">{t(port === 'completed' ? 'sequence.completedStatus.empty' : 'sequence.stageStatus.empty')}</span>}
            </li>
          )
        })}
      </ul>
      <p className="muted">{t('sequence.order')}</p>
      <p className="muted">{t('sequence.rules')}</p>
      {issues.length > 0 && (
        <ul className="issue-list" data-testid="sequence-issues">
          {issues.map((i, k) => (
            <li key={k} className={`issue ${i.severity === 'error' ? 'error' : 'warning'}`}>
              {formatDiagnostic(t, i.diagnostic)}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">{t('branch.incoming', { n: project.transitions.filter((x) => x.target === id).length })}</p>
    </>
  )
}

export function SeqReturnInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const node = project.logicNodes.find((n) => n.id === id)
  const update = useStore((s) => s.updateLogicNode)
  const wrap = useFocusOnRequest(id)
  if (!node) return null
  const sequences = project.logicNodes.filter((n) => n.type === 'sequence')
  const issues = sequenceIssues(project).filter((i) => i.nodeId === id)
  const connected = project.transitions.some((x) => x.target === id)
  return (
    <>
      <Head id={id} prefix="seqreturn" title={t('insp.seqReturn')} />
      <Field label={t('field.title')}>
        <TextInput value={node.title} onChange={(title) => update(id, { title })} />
      </Field>
      <Field label={t('seqReturn.owner')}>
        <select
          ref={wrap as React.RefObject<HTMLSelectElement>}
          className="input"
          data-testid="seqreturn-owner-select"
          value={node.sequenceId ?? ''}
          disabled={connected}
          onChange={(e) => update(id, { sequenceId: e.target.value || null })}
        >
          <option value="">{t('seqReturn.none')}</option>
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>{s.title || s.id}</option>
          ))}
        </select>
      </Field>
      <Field label={t('seqReturn.stage')}>
        <select className="input" data-testid="seqreturn-stage-select" value={node.stage ?? 0} disabled={connected} onChange={(e) => update(id, { stage: Number(e.target.value) })}>
          {Array.from({ length: SEQUENCE_STAGES }, (_, k) => (
            <option key={k} value={k}>{t(`pin.then${k as 0 | 1}`)}</option>
          ))}
        </select>
      </Field>
      {issues.length > 0 && (
        <ul className="issue-list" data-testid="seqreturn-issues">
          {issues.map((i, k) => (
            <li key={k} className={`issue ${i.severity === 'error' ? 'error' : 'warning'}`}>
              {formatDiagnostic(t, i.diagnostic)}
            </li>
          ))}
        </ul>
      )}
      <p className="muted">{t('seqReturn.note')}</p>
    </>
  )
}
