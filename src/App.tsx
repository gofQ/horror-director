import { useRef, useState } from 'react'
import { Download, FilePlus2, Sparkles, Upload, Eye, Workflow, Activity, Users, ShieldCheck } from 'lucide-react'
import { useStore, type View } from './store/useStore'
import { GraphView } from './components/GraphView'
import { Inspector } from './components/Inspector'
import { TimelineView } from './components/TimelineView'
import { CharactersView } from './components/CharactersView'
import { AnalysisView } from './components/AnalysisView'
import { parseProject, serializeProject } from './lib/io'

const TABS: { id: View; label: string; Icon: typeof Workflow }[] = [
  { id: 'graph', label: 'Scene Graph', Icon: Workflow },
  { id: 'timeline', label: 'Timeline', Icon: Activity },
  { id: 'characters', label: 'Characters', Icon: Users },
  { id: 'analysis', label: 'Analysis', Icon: ShieldCheck },
]

export function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const loadProject = useStore((s) => s.loadProject)
  const resetProject = useStore((s) => s.resetProject)
  const loadSample = useStore((s) => s.loadSample)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  const flash = (text: string, error = false) => {
    setMsg({ text, error })
    setTimeout(() => setMsg(null), 5000)
  }

  const doExport = () => {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/[^\w-]+/g, '_') || 'project'}.horror.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Exported project JSON.')
  }

  const doImport = async (file: File) => {
    const res = parseProject(await file.text())
    if (!res.ok) return flash(res.error, true)
    if (!window.confirm('Importing replaces the current project. Continue?')) return
    loadProject(res.project)
    flash(`Imported “${res.project.name}”.`)
  }

  const confirmThen = (fn: () => void, what: string) => {
    if (window.confirm(`${what} This replaces the current project (export first if you need a backup).`)) fn()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Eye size={20} />
          <span className="brand-name">Horror Director</span>
        </div>
        <nav className="tabs" aria-label="Views">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={`tab${view === id ? ' active' : ''}`} onClick={() => setView(id)}>
              <Icon size={16} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="actions">
          <span className="project-name" title={project.name}>
            {project.name}
          </span>
          <button className="btn" onClick={() => confirmThen(resetProject, 'Start a new empty project?')} title="New project">
            <FilePlus2 size={15} /> <span>New</span>
          </button>
          <button className="btn" onClick={() => confirmThen(loadSample, 'Load the sample project?')} title="Load sample">
            <Sparkles size={15} /> <span>Sample</span>
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Import JSON">
            <Upload size={15} /> <span>Import</span>
          </button>
          <button className="btn primary" onClick={doExport} title="Export JSON">
            <Download size={15} /> <span>Export</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {msg && (
        <div className={`toast${msg.error ? ' error' : ''}`} role="status">
          {msg.text}
        </div>
      )}

      <main className="main">
        {view === 'graph' && (
          <div className="graph-layout">
            <GraphView />
            <div className={`inspector-slot${selection ? ' has-selection' : ''}`}>
              <Inspector onClose={() => select(null)} />
            </div>
          </div>
        )}
        {view === 'timeline' && <TimelineView />}
        {view === 'characters' && <CharactersView />}
        {view === 'analysis' && <AnalysisView />}
      </main>
    </div>
  )
}
