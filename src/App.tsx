import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Route, Eye, Workflow, Activity, Users, ShieldCheck, Factory, Undo2, Redo2, Save } from 'lucide-react'
import { useStore, type View } from './store/useStore'
import { addAndOpen, flushNow } from './store/library'
import { LibraryDialog } from './components/LibraryDialog'
import type { LoadNotice } from './lib/library'
import { useSaveStatus, type SaveStatus } from './lib/persist'
import { useLang, useT } from './i18n/store'
import { LANGS, type Lang } from './i18n'
import { downloadText } from './lib/download'
import { ImportDialog, type ImportState } from './components/ImportDialog'
import { GraphView } from './components/GraphView'
import { Inspector } from './components/Inspector'
import { TimelineView } from './components/TimelineView'
import { CharactersView } from './components/CharactersView'
import { AnalysisView } from './components/AnalysisView'
import { SimulatorView } from './components/SimulatorView'
import { ProductionView } from './components/ProductionView'
import { SampleGuide } from './components/SampleGuide'
import { GlobalContextMenu } from './components/GlobalContextMenu'
import './store/simulator'
import { exportFileName, parseProject, serializeProject } from './lib/io'
import type { Project } from './lib/schema'
import { validateProject } from './lib/validate'

const TABS = [
  { id: 'graph', Icon: Workflow },
  { id: 'timeline', Icon: Activity },
  { id: 'characters', Icon: Users },
  { id: 'analysis', Icon: ShieldCheck },
  { id: 'simulator', Icon: Route },
  { id: 'production', Icon: Factory },
] as const satisfies readonly { id: View; Icon: typeof Workflow }[]

const LANG_NAMES: Record<Lang, string> = { tr: 'Türkçe', en: 'English' }

function SaveBadge({ status }: { status: SaveStatus }) {
  const { t, formatTime } = useT()
  const text =
    status.state === 'pending'
      ? t('save.pending')
      : status.state === 'error'
        ? t('save.error')
        : status.at
          ? t('save.savedAt', { time: formatTime(status.at) })
          : t('save.saved')
  return (
    <span className={`save-badge ${status.state}`} data-testid="save-badge" role="status" aria-live="polite" title={t('save.tip')}>
      <Save size={13} /> {text}
    </span>
  )
}

function LanguageSwitch() {
  const { t, lang } = useT()
  const setLang = useLang((s) => s.setLang)
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.aria')}>
      {LANGS.map((l) => (
        <button
          key={l}
          lang={l}
          data-testid={`lang-${l}`}
          className={l === lang ? 'active' : ''}
          aria-pressed={l === lang}
          title={LANG_NAMES[l]}
          aria-label={LANG_NAMES[l]}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function App() {
  const { t } = useT()
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const loadProject = useStore((s) => s.loadProject)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const notices = useStore((s) => s.notices)
  const externalChange = useStore((s) => s.externalChange)
  const dismissNotice = useStore((s) => s.dismissNotice)
  const saveStatus = useSaveStatus((s) => s.status)
  const [importState, setImportState] = useState<ImportState | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const importMode = useRef<'new' | 'replace'>('new')
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  const flash = (text: string, error = false) => {
    setMsg({ text, error })
    setTimeout(() => setMsg(null), 5000)
  }

  const doExport = () => {
    flushNow()
    const check = validateProject(project)
    downloadText(exportFileName(project), serializeProject(project))
    if (check.errors.length)
      flash(t('toast.backupIssues', { n: check.errors.length }), true)
    else flash(t('toast.backupOk'))
  }

  const doImport = async (file: File) => {
    const res = parseProject(await file.text())
    setImportState(
      res.ok
        ? { kind: 'confirm', mode: importMode.current, fileName: file.name, project: res.project, warnings: res.warnings, error: null }
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

  const pickFile = (mode: 'new' | 'replace') => {
    importMode.current = mode
    setLibraryOpen(false)
    fileRef.current?.click()
  }

  const confirmImport = (p: Project) => {
    if (importState?.kind !== 'confirm') return
    if (importState.mode === 'replace') {
      loadProject(p) // explicit, confirmed, undoable replacement of the active project
      setImportState(null)
      flash(t('toast.imported', { name: p.name }))
      return
    }
    const r = addAndOpen(p)
    if (r.ok) {
      setImportState(null)
      flash(t('toast.imported', { name: p.name }))
    } else setImportState({ ...importState, error: r.error })
  }

  const noticeText = (n: LoadNotice): string => {
    switch (n.kind) {
      case 'unreadable':
        return n.backedUp ? t('banner.unreadableBackedUp') : t('banner.unreadableNotBackedUp')
      case 'migrated':
        return t('banner.migrated')
      case 'migrationFailed':
        return t('banner.migrationFailed', {
          reason: n.reason === 'verify' ? t('lib.err.verifyFailed') : t(`save.reason.${n.reason}`),
        })
      case 'indexRebuilt':
        return t('banner.indexRebuilt', { n: n.n })
      case 'activeDamaged':
        return t('banner.activeDamaged')
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Eye size={20} />
          <span className="brand-name" lang="en">Horror Director</span>
        </div>
        <nav className="tabs" aria-label={t('nav.aria')}>
          {TABS.map(({ id, Icon }) => (
            <button key={id} className={`tab${view === id ? ' active' : ''}`} onClick={() => setView(id)}>
              <Icon size={16} /> <span>{t(`tab.${id}`)}</span>
            </button>
          ))}
        </nav>
        <div className="actions">
          <span className="project-name" title={project.name}>
            {project.name}
          </span>
          <button className="btn icon" data-testid="undo-btn" onClick={undo} disabled={!canUndo} title={t('tip.undo')} aria-label={t('btn.undo')}>
            <Undo2 size={15} />
          </button>
          <button className="btn icon" data-testid="redo-btn" onClick={redo} disabled={!canRedo} title={t('tip.redo')} aria-label={t('btn.redo')}>
            <Redo2 size={15} />
          </button>
          <SaveBadge status={saveStatus} />
          <LanguageSwitch />
          <button className="btn" data-testid="projects-btn" onClick={() => setLibraryOpen(true)} title={t('lib.openTip')} aria-haspopup="dialog">
            <FolderOpen size={15} /> <span>{t('lib.open')}</span>
          </button>
          <button className="btn primary" onClick={doExport} title={t('tip.backup')} aria-label={t('aria.backup')}>
            <Download size={15} /> <span>{t('btn.backup')}</span>
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

      {notices.map((n, i) => (
        <div key={i} className={`banner ${n.kind === 'migrated' ? 'info' : 'error'}`} role={n.kind === 'migrated' ? 'status' : 'alert'}>
          <span>{noticeText(n)}</span>
          {n.kind === 'unreadable' && n.raw && (
            <button className="btn small" onClick={() => downloadText('horror-director-unreadable.json', n.raw!)}>
              {t('btn.downloadRaw')}
            </button>
          )}
          <button className="btn small" onClick={() => dismissNotice(i)}>
            {t('btn.dismiss')}
          </button>
        </div>
      ))}
      {externalChange && (
        <div className="banner error" role="alert">
          <span>{t('banner.externalChange')}</span>
          <button className="btn small" onClick={() => window.location.reload()}>
            {t('btn.reload')}
          </button>
        </div>
      )}
      {saveStatus.state === 'error' && (
        <div className="banner error" role="alert">
          <span>{t('banner.saveFailed', { reason: t(`save.reason.${saveStatus.reason}`) })}</span>
          <button className="btn small" onClick={doExport}>
            {t('btn.downloadBackup')}
          </button>
        </div>
      )}
      {libraryOpen && (
        <LibraryDialog onClose={() => setLibraryOpen(false)} onPickImport={pickFile} onBackup={doExport} />
      )}
      {importState && (
        <ImportDialog
          state={importState}
          current={project}
          onCancel={() => setImportState(null)}
          onBackupCurrent={doExport}
          onConfirm={confirmImport}
        />
      )}
      {msg && (
        <div className={`toast${msg.error ? ' error' : ''}`} role="status">
          {msg.text}
        </div>
      )}

      <GlobalContextMenu onBackup={doExport} onProjects={() => setLibraryOpen(true)} notify={flash} />

      <main className="main">
        {view === 'graph' && (
          <div className="graph-layout">
            <GraphView />
            <SampleGuide />
            <div className={`inspector-slot${selection ? ' has-selection' : ''}`}>
              <Inspector onClose={() => select(null)} />
            </div>
          </div>
        )}
        {view === 'timeline' && <TimelineView />}
        {view === 'characters' && <CharactersView />}
        {view === 'analysis' && <AnalysisView />}
        {view === 'simulator' && <SimulatorView />}
        {view === 'production' && <ProductionView />}
      </main>
    </div>
  )
}
