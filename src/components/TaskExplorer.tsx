import { useMemo, useState } from 'react'
import { ClipboardCopy, Download } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { downloadText } from '../lib/download'
import { writeClipboard } from '../lib/clipboardActions'
import { PHASES, type Engine, type Plan, type PlanTask, type SourceKind, type SourceRef } from '../lib/production/plan'
import { assessPlan, READINESS, type Readiness } from '../lib/production/readiness'
import { buildBrief } from '../lib/production/brief'
import { buildAgentPrompt } from '../lib/production/prompt'
import { asPT } from '../lib/production/render'
import { MarkdownPreview } from './MarkdownPreview'

const SOURCE_KINDS: readonly SourceKind[] = ['project', 'scene', 'node', 'transition', 'trigger', 'character', 'flag']

/** Explorer filters and selection live only for this browser session (module state): never project data, never persisted. */
const session = { query: '', phase: 'all', source: 'all', readiness: 'all', selected: null as string | null }

/**
 * Searchable, filterable task list with a details panel and the hand-off actions. Strictly read-only: the only store calls
 * are navigation (view + selection), never edits.
 */
export function TaskExplorer({ plan, engine, onStatus }: { plan: Plan; engine: Engine; onStatus: (text: string) => void }) {
  const { t } = useT()
  const pt = useMemo(() => asPT(t), [t])
  const setView = useStore((s) => s.setView)
  const select = useStore((s) => s.select)
  const focusScene = useStore((s) => s.focusScene)
  const [query, setQuery] = useState(session.query)
  const [phase, setPhase] = useState(session.phase)
  const [source, setSource] = useState(session.source)
  const [readiness, setReadiness] = useState(session.readiness)
  const [selected, setSelected] = useState<string | null>(session.selected)
  const assess = useMemo(() => assessPlan(plan, engine), [plan, engine])

  const remember = <K extends keyof typeof session>(k: K, v: (typeof session)[K]) => {
    session[k] = v
  }
  const subjectOf = (task: PlanTask) => (['foundation', 'state', 'verify'].includes(task.kind) ? t(`plan.kind.${task.kind}`) : `${t(`plan.kind.${task.kind}`)}: ${task.subject}`)
  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      plan.tasks.filter((task) => {
        if (phase !== 'all' && String(task.phase) !== phase) return false
        if (source !== 'all' && !task.sources.some((s) => s.kind === source)) return false
        if (readiness !== 'all' && assess.get(task.id)?.readiness !== readiness) return false
        if (!q) return true
        const hay = `${task.id} ${task.subject} ${task.kind} ${t(`plan.kind.${task.kind}`)} ${task.sources.map((s) => s.id).join(' ')}`.toLowerCase()
        return hay.includes(q)
      }),
    [plan.tasks, phase, source, readiness, q, assess, t],
  )
  const current = selected ? plan.tasks.find((x) => x.id === selected) : undefined
  const brief = useMemo(() => (current ? buildBrief(plan, current.id, engine, pt) : null), [plan, current, engine, pt])
  const prompt = useMemo(() => (brief ? buildAgentPrompt(brief, pt) : ''), [brief, pt])

  const pick = (id: string) => {
    setSelected(id)
    remember('selected', id)
  }
  const title = (id: string) => {
    const x = plan.tasks.find((y) => y.id === id)
    return x ? subjectOf(x) : id
  }

  const open = (s: SourceRef) => {
    switch (s.kind) {
      case 'scene':
        return focusScene(s.id)
      case 'trigger': {
        const sceneId = plan.triggers.find((x) => x.id === s.id)?.sceneId
        return sceneId ? focusScene(sceneId) : undefined
      }
      case 'node':
        setView('graph')
        return select({ type: 'node', id: s.id })
      case 'transition':
        setView('graph')
        return select({ type: 'edge', id: s.id })
      case 'character':
        return setView('characters')
      default:
        setView('graph')
        return select(null)
    }
  }

  const download = () => {
    if (!brief) return
    downloadText(brief.filename, brief.markdown, 'text/markdown')
    onStatus(t('prod.status.downloaded', { name: brief.filename }))
  }
  const copyPrompt = async () => {
    const r = await writeClipboard(prompt)
    onStatus(r === 'ok' ? t('prod.task.copied') : r === 'denied' ? t('clip.denied') : t('clip.unsupported'))
  }
  const badge = (r: Readiness) => <span className={`ready-badge ${r}`} data-readiness={r}>{t(`plan.ready.${r}`)}</span>
  const a = current ? assess.get(current.id) : undefined

  return (
    <div className="card task-explorer" data-testid="task-explorer">
      <div className="section-title">{t('prod.task.title')}</div>
      <p className="muted small">{t('prod.task.intro')}</p>
      <div className="task-toolbar">
        <label className="task-field grow">
          <span>{t('prod.task.search')}</span>
          <input className="input" type="search" data-testid="task-search" value={query} placeholder={t('prod.task.searchPh')} onChange={(e) => { setQuery(e.target.value); remember('query', e.target.value) }} />
        </label>
        <label className="task-field">
          <span>{t('prod.task.phase')}</span>
          <select className="input" data-testid="task-filter-phase" value={phase} onChange={(e) => { setPhase(e.target.value); remember('phase', e.target.value) }}>
            <option value="all">{t('prod.task.all')}</option>
            {PHASES.map((p) => (
              <option key={p.n} value={String(p.n)}>{`${p.n} — ${t(`plan.phase.${p.n}` as 'plan.phase.0')}`}</option>
            ))}
          </select>
        </label>
        <label className="task-field">
          <span>{t('prod.task.source')}</span>
          <select className="input" data-testid="task-filter-source" value={source} onChange={(e) => { setSource(e.target.value); remember('source', e.target.value) }}>
            <option value="all">{t('prod.task.all')}</option>
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>{t(`prod.src.${k}`)}</option>
            ))}
          </select>
        </label>
        <label className="task-field">
          <span>{t('prod.task.readiness')}</span>
          <select className="input" data-testid="task-filter-readiness" value={readiness} onChange={(e) => { setReadiness(e.target.value); remember('readiness', e.target.value) }}>
            <option value="all">{t('prod.task.all')}</option>
            {READINESS.map((r) => (
              <option key={r} value={r}>{t(`plan.ready.${r}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small" role="status" data-testid="task-count">{t('prod.task.count', { shown: shown.length, total: plan.tasks.length })}</p>

      <div className="task-grid">
        <ul className="task-list" aria-label={t('prod.task.list')} data-testid="task-list">
          {shown.length === 0 && <li className="muted" data-testid="task-empty">{t('prod.task.empty')}</li>}
          {shown.map((task) => {
            const r = assess.get(task.id)!.readiness
            return (
              <li key={task.id}>
                <button type="button" className={`task-row${selected === task.id ? ' active' : ''}`} data-testid="task-row" data-task-id={task.id} data-readiness={r} aria-pressed={selected === task.id} onClick={() => pick(task.id)}>
                  <span className="task-order">{task.order + 1}</span>
                  <span className="task-main">
                    <strong>{subjectOf(task)}</strong>
                    <code>{task.id}</code>
                  </span>
                  {badge(r)}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="task-details" data-testid="task-details" aria-label={t('prod.task.details')}>
          {!current || !a || !brief ? (
            <p className="muted">{t('prod.task.none')}</p>
          ) : (
            <>
              <h3 className="task-title">{subjectOf(current)}</h3>
              <p className="muted small">
                <code data-testid="task-id">{current.id}</code> · {t('prod.task.step', { n: current.order + 1 })} · {t('plan.col.phase')} {current.phase}: {t(`plan.phase.${current.phase}` as 'plan.phase.0')} · {t(`plan.engine.${engine}`)}
              </p>
              <p>
                {badge(a.readiness)} <span className="muted small" data-testid="task-impl">{t('plan.impl.unknown')}</span>
              </p>
              {a.blockedBy.length > 0 && (
                <p className="small" data-testid="task-blockedby">
                  {t('prod.task.blockedBy')}: {a.blockedBy.map((id) => (
                    <button key={id} type="button" className="link" onClick={() => pick(id)}>{id}</button>
                  ))}
                </p>
              )}

              <div className="task-actions">
                <button className="btn primary" data-testid="task-brief-download" onClick={download}>
                  <Download size={14} /> {t('prod.task.download')}
                </button>
                <button className="btn" data-testid="task-prompt-copy" onClick={copyPrompt}>
                  <ClipboardCopy size={14} /> {t('prod.task.copyPrompt')}
                </button>
              </div>

              <h4>{t('prod.task.missing')}</h4>
              <ul className="task-chips" data-testid="task-missing">
                {a.missing.length ? a.missing.map((c) => <li key={c} className="chip-warn">TBD — {t(`plan.tbd.${c}` as 'plan.tbd.audioAsset')}</li>) : <li className="muted">{t('prod.task.noneItems')}</li>}
              </ul>
              <h4>{t('prod.task.confirm')}</h4>
              <ul className="task-chips" data-testid="task-confirm">
                {a.confirm.length ? a.confirm.map((c) => <li key={c} className="chip-info">TBD — {t(`plan.tbd.${c}` as 'plan.tbd.audioAsset')}</li>) : <li className="muted">{t('prod.task.noneItems')}</li>}
              </ul>

              <h4>{t('prod.task.sources')}</h4>
              <ul className="task-links" data-testid="task-sources">
                {current.sources.map((s) => (
                  <li key={`${s.kind}:${s.id}`}>
                    <button type="button" className="link" data-testid="task-source" data-source-kind={s.kind} data-source-id={s.id} onClick={() => open(s)}>
                      {t(`prod.src.${s.kind}`)}: {s.id}
                    </button>
                  </li>
                ))}
              </ul>

              <h4>{t('prod.task.dependsOn')}</h4>
              <ul className="task-links" data-testid="task-deps">
                {current.dependsOn.length ? current.dependsOn.map((id) => (
                  <li key={id}>
                    <button type="button" className="link" data-testid="task-dep" onClick={() => pick(id)}>{id}</button> <span className="muted small">{title(id)} · {t(`plan.ready.${assess.get(id)!.readiness}`)}</span>
                  </li>
                )) : <li className="muted">{t('prod.task.noneItems')}</li>}
              </ul>
              <h4>{t('prod.task.dependents')}</h4>
              <ul className="task-links" data-testid="task-dependents">
                {current.dependents.length ? current.dependents.map((id) => (
                  <li key={id}>
                    <button type="button" className="link" data-testid="task-dependent" onClick={() => pick(id)}>{id}</button> <span className="muted small">{title(id)}</span>
                  </li>
                )) : <li className="muted">{t('prod.task.noneItems')}</li>}
              </ul>

              <details className="task-preview">
                <summary>{t('prod.task.showBrief')}</summary>
                <MarkdownPreview source={brief.markdown} testId="task-brief-preview" />
              </details>
              <details className="task-preview">
                <summary>{t('prod.task.showPrompt')}</summary>
                <pre className="task-prompt" data-testid="task-prompt-preview" tabIndex={0}>{prompt}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
