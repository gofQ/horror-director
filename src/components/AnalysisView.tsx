import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { analyze } from '../lib/graph'

const ICON = { error: XCircle, warning: AlertTriangle, info: Info }

export function AnalysisView() {
  const project = useStore((s) => s.project)
  const focusScene = useStore((s) => s.focusScene)
  const a = useMemo(() => analyze(project), [project])
  const titleOf = (id: string) => project.scenes.find((s) => s.id === id)?.title ?? id

  const stats: [string, string | number][] = [
    ['Scenes', a.stats.scenes],
    ['Transitions', a.stats.transitions],
    ['Reality scenes', a.stats.realityScenes],
    ['Dream-layer scenes', a.stats.dreamScenes],
    ['Reality ⇄ Dream crossings', a.stats.crossings],
    ['Loops', a.stats.loops],
    ['Endings', a.stats.endings],
    ['Triggers', a.stats.triggers],
    ['Avg. intensity', a.stats.avgIntensity],
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
        <div className="section-title">Narrative checks ({a.issues.length})</div>
        {a.issues.length === 0 && (
          <p className="ok">
            <CheckCircle2 size={16} /> No structural problems found.
          </p>
        )}
        <ul className="issues">
          {a.issues.map((i) => {
            const Icon = ICON[i.severity]
            return (
              <li key={i.id} className={`issue ${i.severity}`}>
                <Icon size={16} />
                <span>{i.message}</span>
                {i.sceneId && (
                  <button className="link" onClick={() => focusScene(i.sceneId!)}>
                    Show
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="card">
        <div className="section-title">Detected loops ({a.loops.length})</div>
        {a.loops.length === 0 && <p className="muted">No cycles in the scene graph.</p>}
        <ul className="issues">
          {a.loops.map((comp, i) => (
            <li key={i} className="issue info">
              <span>{comp.map(titleOf).join(' ⟲ ')}</span>
              <button className="link" onClick={() => focusScene(comp[0])}>
                Show
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
