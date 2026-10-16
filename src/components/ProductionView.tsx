import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download, FileSpreadsheet, Info } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { formatDiagnostic } from '../lib/diagnostics'
import { downloadText } from '../lib/download'
import { writeClipboard } from '../lib/clipboardActions'
import { buildPlan, ENGINES, type Engine } from '../lib/production/plan'
import { asPT, csvFileName, planFileName, renderMarkdown, renderTaskCsv } from '../lib/production/render'
import { MarkdownPreview } from './MarkdownPreview'

/** Engine chosen in this browser session (not project data, never persisted). */
let lastEngine: Engine = 'unreal'

/**
 * Production workspace: derives an Unreal / Unity production plan from the active project. Strictly read-only: it
 * never calls a store setter, so the project, autosave, library and undo history are untouched.
 */
export function ProductionView() {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const focusScene = useStore((s) => s.focusScene)
  const [engine, setEngine] = useState<Engine>(lastEngine)
  const [status, setStatus] = useState('')
  const plan = useMemo(() => buildPlan(project), [project])
  const pt = useMemo(() => asPT(t), [t])
  const markdown = useMemo(() => renderMarkdown(plan, engine, pt), [plan, engine, pt])
  const tbd = useMemo(() => (markdown.match(/TBD/g) ?? []).length, [markdown])

  const pick = (e: Engine) => {
    lastEngine = e
    setEngine(e)
    setStatus('')
  }
  const dlMd = () => {
    downloadText(planFileName(engine), markdown, 'text/markdown')
    setStatus(t('prod.status.downloaded', { name: planFileName(engine) }))
  }
  const dlCsv = () => {
    downloadText(csvFileName(engine), renderTaskCsv(plan, engine, pt), 'text/csv')
    setStatus(t('prod.status.downloaded', { name: csvFileName(engine) }))
  }
  const copy = async () => {
    const r = await writeClipboard(markdown)
    setStatus(r === 'ok' ? t('prod.status.copied') : r === 'denied' ? t('clip.denied') : t('clip.unsupported'))
  }

  const gaps = [
    ...plan.gaps.filter((g) => g.severity === 'warning').map((g, i) => ({ key: `g${i}`, severity: 'warning', text: asPT(t)(`plan.gap.${g.code}`, g.params), sceneId: g.ids[0] })),
    ...plan.issues.filter((i) => i.severity !== 'info').map((i) => ({ key: `i${i.id}`, severity: i.severity, text: formatDiagnostic(t, i.diagnostic), sceneId: i.sceneId })),
  ]

  return (
    <div className="view-pad production-view" data-testid="production-view">
      <div className="card production-head">
        <div className="section-title">{t('prod.title')}</div>
        <p className="muted">{t('prod.intro')}</p>
        <div className="seg" role="group" aria-label={t('prod.engine.aria')}>
          {ENGINES.map((e) => (
            <button key={e} type="button" className={`btn${engine === e ? ' primary' : ''}`} aria-pressed={engine === e} data-testid={`engine-${e}`} onClick={() => pick(e)}>
              {t(`plan.engine.${e}`)}
            </button>
          ))}
        </div>
        <div className="production-actions">
          <button className="btn" data-testid="plan-download-md" onClick={dlMd}>
            <Download size={14} /> {planFileName(engine)}
          </button>
          <button className="btn" data-testid="plan-download-csv" onClick={dlCsv}>
            <FileSpreadsheet size={14} /> {csvFileName(engine)}
          </button>
          <button className="btn" data-testid="plan-copy" onClick={copy}>
            <ClipboardCopy size={14} /> {t('prod.copy')}
          </button>
        </div>
        <p className="muted small" role="status" aria-live="polite" data-testid="plan-status">
          {status}
        </p>
        <p className="muted small">
          <Info size={12} /> {t('prod.readOnly')}
        </p>
      </div>

      <div className="stat-grid">
        {([
          [t('prod.stat.scenes'), plan.scenes.length],
          [t('prod.stat.tasks'), plan.tasks.length],
          [t('prod.stat.gaps'), gaps.length],
          [t('prod.stat.tbd'), tbd],
        ] as const).map(([k, v]) => (
          <div className="card stat" key={k}>
            <div className="stat-value">{v}</div>
            <div className="stat-label">{k}</div>
          </div>
        ))}
      </div>

      {gaps.length > 0 && (
        <div className="card" data-testid="plan-gaps">
          <div className="section-title">{t('prod.gaps', { n: gaps.length })}</div>
          <ul className="issues">
            {gaps.map((g) => (
              <li key={g.key} className={`issue ${g.severity}`}>
                <AlertTriangle size={16} />
                <span>{g.text}</span>
                {g.sceneId && project.scenes.some((s) => s.id === g.sceneId) && (
                  <button className="link" onClick={() => focusScene(g.sceneId!)}>
                    {t('btn.show')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="section-title">{t('prod.preview')}</div>
        <MarkdownPreview source={markdown} testId="plan-preview" />
      </div>
    </div>
  )
}
