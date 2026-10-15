import { useEffect, useRef, useState } from 'react'
import { Check, Copy, FileUp, FolderPlus, Pencil, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { useStore, defaultNames } from '../store/useStore'
import { addAndOpen, deleteProject, duplicateProject, flushNow, openInconsistent, openProject, renameProject } from '../store/library'
import { useT } from '../i18n/store'
import { emptyProject } from '../lib/factory'
import { downloadText } from '../lib/download'
import { formatDiagnostic } from '../lib/diagnostics'
import { sampleProject } from '../lib/sample'
import type { LibError, LibResult } from '../lib/library'
import { libErrorText } from './ImportDialog'
import { ContextMenu, isEditableTarget, useContextMenu, type MenuItem } from './ContextMenu'

interface Props {
  onClose: () => void
  onPickImport: (mode: 'new' | 'replace') => void
  /** Downloads a JSON backup of the active project. */
  onBackup: () => void
}

export function LibraryDialog({ onClose, onPickImport, onBackup }: Props) {
  const { t, locale, lang } = useT()
  const library = useStore((s) => s.library)
  const damaged = useStore((s) => s.damaged)
  const externalChange = useStore((s) => s.externalChange)
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<LibError | null>(null)
  const [status, setStatus] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null)
  const { menu, open: openMenu, close: closeMenu } = useContextMenu()

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const nameOf = (id: string) => library.projects.find((m) => m.id === id)?.name ?? ''
  const finish = (r: LibResult, message: string, close = false) => {
    if (!r.ok) return setError(r.error)
    setError(null)
    setStatus(message)
    if (close) onClose()
  }
  const when = (ms: number) => new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })

  const doOpen = (m: { id: string; name: string }) => finish(openProject(m.id), t('lib.status.opened', { name: m.name }), true)
  const doDuplicate = (m: { id: string }) => {
    const copy = t('lib.copyName', { name: nameOf(m.id) })
    finish(duplicateProject(m.id, copy), t('lib.status.duplicated', { name: copy }))
  }
  /** Context menu for a project row: only the actions the row buttons already offer. */
  const rowMenu = (x: number, y: number, m: { id: string; name: string }, isActive: boolean, bad: boolean) => {
    const items: MenuItem[] = bad
      ? [{ id: 'delete', label: t('lib.removeDamaged'), icon: <Trash2 size={13} />, danger: true, onSelect: () => setConfirmDelete(m.id) }]
      : [
          { id: 'open', label: t('lib.openBtn'), disabled: isActive || externalChange, onSelect: () => doOpen(m) },
          { id: 'rename', label: t('lib.rename'), icon: <Pencil size={13} />, disabled: externalChange, onSelect: () => setRenaming({ id: m.id, value: m.name }) },
          { id: 'duplicate', label: t('lib.duplicate'), icon: <Copy size={13} />, disabled: externalChange, onSelect: () => doDuplicate(m) },
          { id: 'delete', label: t('lib.delete'), icon: <Trash2 size={13} />, danger: true, disabled: externalChange, separatorBefore: true, onSelect: () => setConfirmDelete(m.id) },
        ]
    openMenu({ x, y, items, ariaLabel: `${t('ctx.libraryMenu')}: ${m.name}` })
  }
  const create = (project = emptyProject(defaultNames())) => {
    const r = addAndOpen(project)
    finish(r, t('lib.status.created', { name: project.name }), true)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal library" data-testid="library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <h3 id="library-title">{t('lib.title')}</h3>
        <p className="muted">{t('lib.intro')}</p>

        <div className="library-actions">
          <button className="btn primary" data-testid="library-new" onClick={() => create()} disabled={externalChange}>
            <FolderPlus size={15} /> {t('lib.new')}
          </button>
          <button className="btn" onClick={() => create(sampleProject())} disabled={externalChange}>
            <Sparkles size={15} /> {t('lib.addSample')}
          </button>
          <button className="btn" onClick={() => onPickImport('new')} disabled={externalChange}>
            <FileUp size={15} /> {t('lib.importNew')}
          </button>
          <button className="btn" onClick={() => onPickImport('replace')}>
            {t('lib.replaceActive')}
          </button>
        </div>

        {error && (
          <div className="issue error library-error" role="alert">
            <TriangleAlert size={16} />
            <span>{libErrorText(t, error)}</span>
            {error.code === 'saveFailed' && (
              <span className="library-error-actions">
                <button className="btn small" onClick={onBackup}>
                  {t('lib.backupFirst')}
                </button>
                <button
                  className="btn small"
                  onClick={() => {
                    if (flushNow()) {
                      setError(null)
                      setStatus(t('lib.status.retried'))
                    }
                  }}
                >
                  {t('lib.retrySave')}
                </button>
              </span>
            )}
          </div>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {status}
        </div>

        <ul className="library-list" key={lang}>
          {library.projects.map((m) => {
            const isActive = m.id === library.activeId
            const bad = damaged[m.id]
            return (
              <li
                key={m.id}
                data-testid="library-row"
                data-active={isActive}
                className={`library-row${isActive ? ' active' : ''}`}
                onContextMenu={(e) => {
                  if (isEditableTarget(e.target)) return // keep the native menu in the rename field
                  e.preventDefault()
                  rowMenu(e.clientX, e.clientY, m, isActive, !!bad)
                }}
                onKeyDown={(e) => {
                  if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') || isEditableTarget(e.target)) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  rowMenu(r.left + 24, r.top + 24, m, isActive, !!bad)
                }}
              >
                <div className="library-main">
                  {renaming?.id === m.id ? (
                    <form
                      className="library-rename"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const r = renameProject(m.id, renaming.value)
                        if (r.ok) setRenaming(null)
                        finish(r, t('lib.status.renamed', { name: renaming.value.trim() }))
                      }}
                    >
                      <input
                        className="input"
                        aria-label={t('lib.nameLabel')}
                        value={renaming.value}
                        autoFocus
                        onChange={(e) => setRenaming({ id: m.id, value: e.target.value })}
                      />
                      <button className="btn small primary" type="submit">
                        <Check size={14} /> {t('lib.renameSave')}
                      </button>
                      <button className="btn small" type="button" onClick={() => setRenaming(null)}>
                        {t('btn.cancel')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="library-name">
                        <strong>{m.name}</strong>
                        {isActive && <span className="badge start">{t('lib.active')}</span>}
                      </div>
                      <div className="muted">{t('lib.updated', { date: when(m.updatedAt) })}</div>
                      {bad && !bad.problems && <div className="library-damaged">{t('lib.damaged')}</div>}
                      {bad?.problems && (
                        <div className="library-damaged" data-testid="library-inconsistent">
                          {t('lib.inconsistent', { n: bad.problems.length })}
                          <ul>
                            {bad.problems.slice(0, 3).map((p, i) => (
                              <li key={i}>{formatDiagnostic(t, p)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {confirmOpen === m.id ? (
                  <div className="library-confirm" role="alert" data-testid="library-open-anyway-confirm">
                    <span>{t('lib.openAnywayConfirm', { name: m.name })}</span>
                    <span className="library-row-actions">
                      <button className="btn small" onClick={() => setConfirmOpen(null)}>
                        {t('btn.cancel')}
                      </button>
                      <button
                        className="btn small danger"
                        data-testid="library-open-anyway-yes"
                        onClick={() => {
                          const r = openInconsistent(m.id)
                          if (r.ok) setConfirmOpen(null)
                          finish(r, t('lib.status.opened', { name: m.name }), true)
                        }}
                      >
                        {t('lib.openAnywayYes')}
                      </button>
                    </span>
                  </div>
                ) : confirmDelete === m.id ? (
                  <div className="library-confirm" role="alert">
                    <span>{bad ? t('lib.removeDamagedConfirm', { name: m.name }) : t('lib.deleteConfirm', { name: m.name })}</span>
                    <span className="library-row-actions">
                      {isActive && (
                        <button className="btn small" onClick={onBackup}>
                          {t('lib.backupFirst')}
                        </button>
                      )}
                      <button className="btn small" onClick={() => setConfirmDelete(null)}>
                        {t('btn.cancel')}
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => {
                          const name = m.name
                          const r = deleteProject(m.id, () => emptyProject(defaultNames()))
                          if (r.ok) setConfirmDelete(null)
                          finish(r, t('lib.status.deleted', { name }))
                        }}
                      >
                        {bad ? t('lib.removeDamaged') : t('lib.deleteYes')}
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="library-row-actions">
                    {bad ? (
                      <>
                        {bad.raw && (
                          <button className="btn small" data-testid="library-download-raw" onClick={() => downloadText(`${m.id}.raw.json`, bad.raw!)}>
                            {t('lib.downloadRaw')}
                          </button>
                        )}
                        {bad.problems && (
                          <button className="btn small" data-testid="library-open-anyway" disabled={externalChange} onClick={() => setConfirmOpen(m.id)}>
                            {t('lib.openAnyway')}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {!isActive && (
                          <button
                            className="btn small primary"
                            data-testid="library-open"
                            disabled={externalChange}
                            onClick={() => doOpen(m)}
                          >
                            {t('lib.openBtn')}
                          </button>
                        )}
                        <button
                          className="btn small"
                          disabled={externalChange}
                          onClick={() => setRenaming({ id: m.id, value: m.name })}
                          aria-label={`${t('lib.rename')}: ${m.name}`}
                        >
                          <Pencil size={14} /> {t('lib.rename')}
                        </button>
                        <button
                          className="btn small"
                          disabled={externalChange}
                          onClick={() => doDuplicate(m)}
                          aria-label={`${t('lib.duplicate')}: ${m.name}`}
                        >
                          <Copy size={14} /> {t('lib.duplicate')}
                        </button>
                      </>
                    )}
                    <button
                      className="btn small danger"
                      disabled={externalChange}
                      onClick={() => setConfirmDelete(m.id)}
                      aria-label={`${bad ? t('lib.removeDamaged') : t('lib.delete')}: ${m.name}`}
                    >
                      <Trash2 size={14} /> {bad ? t('lib.removeDamaged') : t('lib.delete')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {menu && <ContextMenu state={menu} onClose={closeMenu} />}
        <div className="modal-actions">
          <button className="btn" onClick={onBackup}>
            {t('btn.backup')}
          </button>
          <button className="btn primary" onClick={onClose}>
            {t('btn.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
