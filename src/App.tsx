import { useEffect, useRef, useState } from 'react'
import { Download, FilePlus2, Sparkles, Upload, Eye, Workflow, Activity, Users, ShieldCheck, Undo2, Redo2, Save } from 'lucide-react'
import { flushSave, useStore, type View } from './store/useStore'
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
import { exportFileName, parseProject, serializeProject } from './lib/io'
import { validateProject } from './lib/validate'

const TABS = [
  { id: 'graph', Icon: Workflow },
  { id: 'timeline', Icon: Activity },
  { id: 'characters', Icon: Users },
  { id: 'analysis', Icon: ShieldCheck },
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
    <span className={`save-badge ${status.state}`} role="status" aria-live="polite" title={t('save.tip')}>
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
      flash(t('toast.backupIssues', { n: check.errors.length }), true)
    else flash(t('toast.backupOk'))
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

  const confirmThen = (fn: () => void, message: string) => {
    if (window.confirm(message)) fn()
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
          <button className="btn icon" onClick={undo} disabled={!canUndo} title={t('tip.undo')} aria-label={t('btn.undo')}>
            <Undo2 size={15} />
          </button>
          <button className="btn icon" onClick={redo} disabled={!canRedo} title={t('tip.redo')} aria-label={t('btn.redo')}>
            <Redo2 size={15} />
          </button>
          <SaveBadge status={saveStatus} />
          <LanguageSwitch />
          <button className="btn" onClick={() => confirmThen(resetProject, t('confirm.new'))} title={t('tip.new')}>
            <FilePlus2 size={15} /> <span>{t('btn.new')}</span>
          </button>
          <button className="btn" onClick={() => confirmThen(loadSample, t('confirm.sample'))} title={t('tip.sample')}>
            <Sparkles size={15} /> <span>{t('btn.sample')}</span>
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} title={t('tip.import')}>
            <Upload size={15} /> <span>{t('btn.import')}</span>
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

      {loadNotice && (
        <div className="banner error" role="alert">
          <span>{loadNotice.backedUp ? t('banner.unreadableBackedUp') : t('banner.unreadableNotBackedUp')}</span>
          {loadNotice.raw && (
            <button className="btn small" onClick={() => downloadText('horror-director-unreadable.json', loadNotice.raw!)}>
              {t('btn.downloadRaw')}
            </button>
          )}
          <button className="btn small" onClick={dismissNotice}>
            {t('btn.dismiss')}
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
      {importState && (
        <ImportDialog
          state={importState}
          current={project}
          onCancel={() => setImportState(null)}
          onBackupCurrent={doExport}
          onConfirm={(p) => {
            loadProject(p)
            setImportState(null)
            flash(t('toast.imported', { name: p.name }))
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
