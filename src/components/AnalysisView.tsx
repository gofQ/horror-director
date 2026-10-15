import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { analyze } from '../lib/graph'
import { formatDiagnostic } from '../lib/diagnostics'

const ICON = { error: XCircle, warning: AlertTriangle, info: Info }

export function AnalysisView() {
  const { t, formatNumber } = useT()
  const project = useStore((s) => s.project)
  const focusScene = useStore((s) => s.focusScene)
  const a = useMemo(() => analyze(project), [project])
  const titleOf = (id: string) => project.scenes.find((s) => s.id === id)?.title ?? id

  const stats: [string, string | number][] = [
    [t('stat.scenes'), a.stats.scenes],
    [t('stat.transitions'), a.stats.transitions],
    [t('stat.reality'), a.stats.realityScenes],
    [t('stat.dream'), a.stats.dreamScenes],
    [t('stat.crossings'), a.stats.crossings],
    [t('stat.loops'), a.stats.loops],
    [t('stat.endings'), a.stats.endings],
    [t('stat.triggers'), a.stats.triggers],
    [t('stat.avgIntensity'), formatNumber(a.stats.avgIntensity)],
  ]

  return (
    <div className="view-pad analysis-view">
      <div className="stat-grid">
        {stats.map(([k, v]) => (
          <div className="card stat" key={k}>
            <div className="stat-value">{v}</div>
            <div className="stat-label">{k}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title">{t('section.checks', { n: a.issues.length })}</div>
        {a.issues.length === 0 && (
          <p className="ok">
            <CheckCircle2 size={16} /> {t('ok.noProblems')}
          </p>
        )}
        <ul className="issues">
          {a.issues.map((i) => {
            const Icon = ICON[i.severity]
            return (
              <li key={i.id} className={`issue ${i.severity}`}>
                <Icon size={16} />
                <span>{formatDiagnostic(t, i.diagnostic)}</span>
                {i.sceneId && (
                  <button className="link" onClick={() => focusScene(i.sceneId!)}>
                    {t('btn.show')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="card">
        <div className="section-title">{t('section.loops', { n: a.loops.length })}</div>
        {a.loops.length === 0 && <p className="muted">{t('empty.noCycles')}</p>}
        <ul className="issues">
          {a.loops.map((comp, i) => (
            <li key={i} className="issue info">
              <span>{comp.map(titleOf).join(' ⟲ ')}</span>
              <button className="link" onClick={() => focusScene(comp[0])}>
                {t('btn.show')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
