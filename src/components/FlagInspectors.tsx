import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { evalExpr, exprAppend, exprDepth, exprReplace, exprSize, flagNameTaken, flagUsage, initialFlagState } from '../lib/flags'
import { EXPR_MAX_DEPTH, EXPR_MAX_NODES, type Expr, type Flag } from '../lib/schema'
import { Field, TextArea, TextInput } from './fields'
import { useExprText } from './useExprText'

/** TRUE/FALSE radio pair (accessible as a radiogroup). */
function BoolChoice({ value, onChange, label, testId }: { value: boolean; onChange: (v: boolean) => void; label: string; testId: string }) {
  const { t } = useT()
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="seg">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={`btn small${value === v ? ' active' : ''}`}
            data-testid={`${testId}-${v ? 'true' : 'false'}`}
            onClick={() => onChange(v)}
          >
            {v ? t('bool.true') : t('bool.false')}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Rename input with a local draft: empty or duplicate names are explained and never stored. */
function FlagNameInput({ flag }: { flag: Flag }) {
  const { t } = useT()
  const update = useStore((s) => s.updateFlag)
  const project = useStore((s) => s.project)
  const [draft, setDraft] = useState(flag.name)
  useEffect(() => setDraft(flag.name), [flag.name])
  const problem = !draft.trim() ? t('flag.nameEmpty') : flagNameTaken(project, draft, flag.id) ? t('flag.nameTaken') : null
  return (
    <Field label={t('flag.name')} hint={problem ?? undefined}>
      <input
        className="input"
        data-testid="flag-name"
        aria-invalid={problem !== null}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          update(flag.id, { name: e.target.value })
        }}
        onBlur={() => setDraft(flag.name)}
      />
    </Field>
  )
}

export function FlagManager() {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const add = useStore((s) => s.addFlag)
  const update = useStore((s) => s.updateFlag)
  const del = useStore((s) => s.deleteFlag)
  const select = useStore((s) => s.select)
  const [confirm, setConfirm] = useState<string | null>(null)
  const nodeTitle = (id: string) => project.logicNodes.find((n) => n.id === id)?.title || id
  return (
    <>
      <div className="section-title">{t('flag.title')}</div>
      <p className="muted">{t('flag.intro')}</p>
      {project.flags.length === 0 && <p className="muted" data-testid="flags-empty">{t('flag.empty')}</p>}
      {project.flags.map((f) => {
        const usage = flagUsage(project, f.id)
        const used = usage.setNodes.length + usage.branches.length
        return (
          <div key={f.id} className="scene-type-card" data-testid="flag-card" data-flag-id={f.id}>
            <FlagNameInput flag={f} />
            <Field label={t('field.description')}>
              <TextArea value={f.description} rows={2} onChange={(description) => update(f.id, { description })} />
            </Field>
            <BoolChoice value={f.defaultValue} onChange={(defaultValue) => update(f.id, { defaultValue })} label={t('flag.default')} testId="flag-default" />
            <p className="muted">{t('flag.usedBy', { n: used })}</p>
            {confirm === f.id ? (
              <div className="issue warning" role="alert" data-testid="flag-confirm">
                <p>{t('flag.deleteConfirm', { name: f.name, n: used })}</p>
                <ul className="flag-affected" data-testid="flag-affected">
                  {usage.setNodes.map((id) => (
                    <li key={id}><button className="linklike" onClick={() => select({ type: 'node', id })}>{nodeTitle(id)}</button> — {t('flag.affectedSet')}</li>
                  ))}
                  {usage.branches.map((id) => (
                    <li key={id}><button className="linklike" onClick={() => select({ type: 'node', id })}>{nodeTitle(id)}</button> — {t('flag.affectedIf')}</li>
                  ))}
                </ul>
                <div className="modal-actions">
                  <button className="btn small" onClick={() => setConfirm(null)}>{t('btn.cancel')}</button>
                  <button className="btn small danger" data-testid="flag-detach" onClick={() => { del(f.id, { detach: true }); setConfirm(null) }}>{t('flag.deleteDetach')}</button>
                </div>
              </div>
            ) : (
              <button className="btn small danger" data-testid="flag-delete" onClick={() => (used > 0 ? setConfirm(f.id) : del(f.id))}>
                <Trash2 size={14} /> {t('flag.delete')}
              </button>
            )}
          </div>
        )
      })}
      <button className="btn" data-testid="flag-add" onClick={() => add()}>
        <Plus size={14} /> {t('flag.add')}
      </button>
    </>
  )
}

export function SetFlagInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const node = project.logicNodes.find((n) => n.id === id)
  const update = useStore((s) => s.updateLogicNode)
  const duplicate = useStore((s) => s.duplicateNode)
  const del = useStore((s) => s.deleteScenes)
  const addFlag = useStore((s) => s.addFlag)
  const focusReq = useStore((s) => s.inspectorFocus)
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (focusReq !== id) return
    ref.current?.focus()
    useStore.getState().requestInspectorFocus(null)
  }, [focusReq, id])
  if (!node) return null
  const missing = !!node.flagId && !project.flags.some((f) => f.id === node.flagId)
  return (
    <>
      <div className="insp-head">
        <h3>{t('insp.setFlag')}</h3>
        <span>
          <button className="btn small" data-testid="setflag-duplicate" onClick={() => duplicate(id)} title={t('ctx.duplicate')}>
            <Copy size={14} />
          </button>{' '}
          <button className="btn small danger" data-testid="setflag-delete" onClick={() => del([id])}>
            <Trash2 size={14} /> {t('btn.delete')}
          </button>
        </span>
      </div>
      <Field label={t('field.title')}>
        <TextInput value={node.title} onChange={(title) => update(id, { title })} />
      </Field>
      <Field label={t('setflag.flag')}>
        <select ref={ref} className="input" data-testid="setflag-flag" value={node.flagId ?? ''} onChange={(e) => update(id, { flagId: e.target.value || null })}>
          <option value="">{t('setflag.none')}</option>
          {missing && <option value={node.flagId!}>{node.flagId}</option>}
          {project.flags.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </Field>
      {project.flags.length === 0 && (
        <p className="muted">{t('setflag.noFlags')}</p>
      )}
      <button className="btn small" data-testid="setflag-create-flag" onClick={() => update(id, { flagId: addFlag() })}>
        <Plus size={14} /> {t('setflag.createFlag')}
      </button>
      <BoolChoice value={node.value ?? true} onChange={(value) => update(id, { value })} label={t('setflag.value')} testId="setflag-value" />
      <Field label={t('field.description')}>
        <TextArea value={node.description} rows={3} onChange={(description) => update(id, { description })} />
      </Field>
      <p className="muted">{t('setflag.note')}</p>
      <p className="muted">{t('branch.incoming', { n: project.transitions.filter((x) => x.target === id).length })}</p>
    </>
  )
}

/** Structured IF condition builder: a tree of flag checks combined with AND / OR / NOT (no raw JSON, no scripting). */
export function ConditionBuilder({ nodeId }: { nodeId: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const node = project.logicNodes.find((n) => n.id === nodeId)
  const update = useStore((s) => s.updateLogicNode)
  const exprText = useExprText()
  if (!node) return null
  const expr = node.expression
  const set = (next: Expr | null) => update(nodeId, { expression: next ?? undefined })
  const newCheck = (): Expr => ({ op: 'flag', flagId: project.flags[0]?.id ?? '', is: true })
  const roomFor = (extraNodes: number, extraDepth: number) => !expr || (exprSize(expr) + extraNodes <= EXPR_MAX_NODES && exprDepth(expr) + extraDepth <= EXPR_MAX_DEPTH)

  const replaceAt = (path: number[], next: Expr | null) => (expr ? set(exprReplace(expr, path, next)) : set(next))

  const renderNode = (e: Expr, path: number[]): ReactNode => {
    const key = path.join('.') || 'root'
    if (e.op === 'flag') {
      const missing = !project.flags.some((f) => f.id === e.flagId)
      return (
        <div className="expr-row" data-testid="expr-check">
          <select className="input" aria-label={t('expr.flag')} data-testid="expr-flag" value={e.flagId} onChange={(ev) => replaceAt(path, { ...e, flagId: ev.target.value })}>
            {missing && <option value={e.flagId}>{t('expr.unknownFlag')}</option>}
            {project.flags.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select className="input" aria-label={t('expr.is')} data-testid="expr-is" value={e.is ? 'true' : 'false'} onChange={(ev) => replaceAt(path, { ...e, is: ev.target.value === 'true' })}>
            <option value="true">{t('expr.isTrue')}</option>
            <option value="false">{t('expr.isFalse')}</option>
          </select>
          <button className="btn small" data-testid="expr-wrap-not" disabled={!roomFor(1, 1)} onClick={() => replaceAt(path, { op: 'not', arg: e })}>{t('expr.not')}</button>
          <button className="btn small" data-testid="expr-wrap-and" disabled={!roomFor(2, 1)} onClick={() => replaceAt(path, { op: 'and', args: [e, newCheck()] })}>{t('expr.and')}</button>
          <button className="btn small" data-testid="expr-wrap-or" disabled={!roomFor(2, 1)} onClick={() => replaceAt(path, { op: 'or', args: [e, newCheck()] })}>{t('expr.or')}</button>
          <button className="btn small danger" data-testid="expr-remove" aria-label={t('expr.remove')} title={t('expr.remove')} onClick={() => replaceAt(path, null)}><Trash2 size={13} /></button>
        </div>
      )
    }
    if (e.op === 'not') {
      return (
        <div className="expr-group" role="group" aria-label={t('expr.not')} data-testid="expr-not">
          <div className="expr-row">
            <strong>{t('expr.not')}</strong>
            <button className="btn small" data-testid="expr-unwrap" onClick={() => replaceAt(path, e.arg)}>{t('expr.unwrap')}</button>
          </div>
          <div className="expr-children">{renderNode(e.arg, [...path, 0])}</div>
        </div>
      )
    }
    return (
      <div className="expr-group" role="group" aria-label={e.op === 'and' ? t('expr.and') : t('expr.or')} data-testid={`expr-${e.op}`} data-path={key}>
        <div className="expr-row">
          <select className="input" aria-label={t('expr.operator')} data-testid="expr-op" value={e.op} onChange={(ev) => replaceAt(path, { op: ev.target.value as 'and' | 'or', args: e.args })}>
            <option value="and">{t('expr.andAll')}</option>
            <option value="or">{t('expr.orAny')}</option>
          </select>
          <button className="btn small" data-testid="expr-add-check" disabled={!roomFor(1, 0) || project.flags.length === 0} onClick={() => set(expr ? exprAppend(expr, path, newCheck()) : null)}>
            <Plus size={12} /> {t('expr.addCheck')}
          </button>
          <button className="btn small" data-testid="expr-add-not" disabled={!roomFor(2, 1) || project.flags.length === 0} onClick={() => set(expr ? exprAppend(expr, path, { op: 'not', arg: newCheck() }) : null)}>
            <Plus size={12} /> {t('expr.not')}
          </button>
          <button className="btn small danger" data-testid="expr-remove" aria-label={t('expr.removeGroup')} title={t('expr.removeGroup')} onClick={() => replaceAt(path, null)}><Trash2 size={13} /></button>
        </div>
        <div className="expr-children">
          {e.args.map((a, i) => (
            <Fragment key={i}>{renderNode(a, [...path, i])}</Fragment>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="expr-builder" data-testid="expr-builder">
      <div className="section-title">{t('expr.title')}</div>
      <p className="muted">{t('expr.intro')}</p>
      {!expr ? (
        <>
          <button className="btn small" data-testid="expr-add" disabled={project.flags.length === 0} onClick={() => set(newCheck())}>
            <Plus size={13} /> {t('expr.add')}
          </button>
          {project.flags.length === 0 && <p className="muted">{t('expr.needFlags')}</p>}
        </>
      ) : (
        <>
          {renderNode(expr, [])}
          <p className="expr-preview" data-testid="expr-preview">
            <strong>{t('expr.preview')}</strong> {exprText(expr)}
          </p>
          <p className="muted" data-testid="expr-default-result">
            {t('expr.atDefaults', { value: evalExpr(expr, initialFlagState(project)) ? t('bool.true') : t('bool.false') })}
          </p>
          <button className="btn small" data-testid="expr-clear" onClick={() => set(null)}>{t('expr.clear')}</button>
        </>
      )}
    </div>
  )
}
