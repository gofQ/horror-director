import { useEffect, useRef, useState } from 'react'
import { Download, FilePlus2, Sparkles, Upload, Eye, Workflow, Activity, Users, ShieldCheck, Undo2, Redo2, Save } from 'lucide-react'
import { flushSave, useStore, type View } from './store/useStore'
import { useSaveStatus } from './lib/persist'
import { downloadText } from './lib/download'
import { ImportDialog, type ImportState } from './components/ImportDialog'
import { GraphView } from './components/GraphView'
import { Inspector } from './components/Inspector'
import { TimelineView } from './components/TimelineView'
import { CharactersView } from './components/CharactersView'
import { AnalysisView } from './components/AnalysisView'
import { exportFileName, parseProject, serializeProject } from './lib/io'
import { validateProject } from './lib/validate'

const TABS: { id: View; label: string; Icon: typeof Workflow }[] = [
  { id: 'graph', label: 'Scene Graph', Icon: Workflow },
  { id: 'timeline', label: 'Timeline', Icon: Activity },
  { id: 'characters', label: 'Characters', Icon: Users },
  { id: 'analysis', label: 'Analysis', Icon: ShieldCheck },
]

function SaveBadge({ status }: { status: ReturnType<typeof useSaveStatus.getState>['status'] }) {
  const text =
    status.state === 'pending'
      ? 'Saving…'
      : status.state === 'error'
        ? 'Not saved'
        : status.at
          ? `Saved ${new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Saved'
  return (
    <span className={`save-badge ${status.state}`} role="status" aria-live="polite" title="Projects are saved in this browser only">
      <Save size={13} /> {text}
    </span>
  )
}

export function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const loadProject = useStore((s) => s.loadProject)
  const resetProject = useStore((s) => s.resetProject)
  const loadSample = useStore((s) => s.loadSample)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const loadNotice = useStore((s) => s.loadNotice)
  const dismissNotice = useStore((s) => s.dismissNotice)
  const saveStatus = useSaveStatus((s) => s.status)
  const [importState, setImportState] = useState<ImportState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  const flash = (text: string, error = false) => {
    setMsg({ text, error })
    setTimeout(() => setMsg(null), 5000)
  }

  const doExport = () => {
    flushSave()
    const check = validateProject(project)
    downloadText(exportFileName(project), serializeProject(project))
    if (check.errors.length)
      flash(`Backup downloaded, but the project has ${check.errors.length} integrity problem(s).`, true)
    else flash('JSON backup downloaded.')
  }

  const doImport = async (file: File) => {
    const res = parseProject(await file.text())
    setImportState(
      res.ok
        ? { kind: 'confirm', fileName: file.name, project: res.project, warnings: res.warnings }
        : { kind: 'rejected', fileName: file.name, errors: res.errors },
    )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        doExport()
        return
      }
      if (k !== 'z' && k !== 'y') return
      // Leave native undo/redo alone inside text fields.
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      if (k === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
          <button className="btn icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
            <Undo2 size={15} />
          </button>
          <button className="btn icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
            <Redo2 size={15} />
          </button>
          <SaveBadge status={saveStatus} />
          <button className="btn" onClick={() => confirmThen(resetProject, 'Start a new empty project?')} title="New project">
            <FilePlus2 size={15} /> <span>New</span>
          </button>
          <button className="btn" onClick={() => confirmThen(loadSample, 'Load the sample project?')} title="Load sample">
            <Sparkles size={15} /> <span>Sample</span>
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Import JSON">
            <Upload size={15} /> <span>Import</span>
          </button>
          <button className="btn primary" onClick={doExport} title="Download JSON backup (Ctrl/Cmd+S)" aria-label="Download JSON backup">
            <Download size={15} /> <span>Backup</span>
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

      {loadNotice && (
        <div className="banner error" role="alert">
          <span>{loadNotice.message}</span>
          {loadNotice.raw && (
            <button className="btn small" onClick={() => downloadText('horror-director-unreadable.json', loadNotice.raw!)}>
              Download raw data
            </button>
          )}
          <button className="btn small" onClick={dismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      {saveStatus.state === 'error' && (
        <div className="banner error" role="alert">
          <span>Changes are not being saved: {saveStatus.message} Download a backup so work is not lost.</span>
          <button className="btn small" onClick={doExport}>
            Download backup
          </button>
        </div>
      )}
      {importState && (
        <ImportDialog
          state={importState}
          current={project}
          onCancel={() => setImportState(null)}
          onBackupCurrent={doExport}
          onConfirm={(p) => {
            loadProject(p)
            setImportState(null)
            flash(`Imported “${p.name}”. Undo is available.`)
          }}
        />
      )}
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
