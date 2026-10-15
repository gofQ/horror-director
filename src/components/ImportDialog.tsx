import { useEffect, useRef } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import { useT } from '../i18n/store'
import type { TFunction } from '../i18n'
import { formatDiagnostic, type Diagnostic } from '../lib/diagnostics'
import type { LibError } from '../lib/library'
import type { Project } from '../lib/schema'

export type ImportState =
  | { kind: 'rejected'; fileName: string; errors: Diagnostic[] }
  | {
      kind: 'confirm'
      /** `replace`: confirmed replacement of the active project; `new`: add to the library as a new project. */
      mode: 'replace' | 'new'
      fileName: string
      project: Project
      warnings: Diagnostic[]
      error: LibError | null
    }

interface Props {
  state: ImportState
  current: Project
  onCancel: () => void
  onConfirm: (p: Project) => void
  onBackupCurrent: () => void
}

export function libErrorText(t: TFunction, e: LibError): string {
  if (e.code === 'saveFailed') return t('lib.err.saveFailed', { reason: t(`save.reason.${e.reason ?? 'unavailable'}`) })
  return t(`lib.err.${e.code}`)
}

export function ImportDialog({ state, current, onCancel, onConfirm, onBackupCurrent }: Props) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const describe = (p: Project) =>
    t('dlg.describe', {
      name: p.name,
      scenes: p.scenes.length,
      transitions: p.transitions.length,
      characters: p.characters.length,
    })

  const rejected = state.kind === 'rejected'
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h3 id="import-title">
          {rejected ? t('dlg.blocked') : state.mode === 'new' ? t('dlg.addTitle') : t('dlg.replaceTitle')}
        </h3>
        <p className="muted">{t('dlg.file', { name: state.fileName })}</p>
        {rejected ? (
          <>
            <p>
              <XCircle size={14} className="inline-icon err" /> {t('dlg.rejectedLead')}
            </p>
            <ul className="issues" role="alert">
              {state.errors.map((e, i) => (
                <li key={i} className="issue error">
                  <span>{formatDiagnostic(t, e)}</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn primary" onClick={onCancel}>
                {t('btn.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {state.mode === 'replace' && (
                <>
                  <strong>{t('dlg.current')}</strong> {describe(current)}
                  <br />
                </>
              )}
              <strong>{t('dlg.import')}</strong> {describe(state.project)}
            </p>
            <p className="muted">{state.mode === 'new' ? t('dlg.addNote') : t('dlg.undoNote')}</p>
            {state.error && (
              <p className="issue error" role="alert">
                {libErrorText(t, state.error)}
              </p>
            )}
            {state.warnings.length > 0 && (
              <>
                <div className="section-title">
                  <AlertTriangle size={12} className="inline-icon" /> {t('dlg.warnings')}
                </div>
                <ul className="issues">
                  {state.warnings.map((w, i) => (
                    <li key={i} className="issue warning">
                      <span>{formatDiagnostic(t, w)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={onBackupCurrent}>
                {t('dlg.backupCurrent')}
              </button>
              <button className="btn" onClick={onCancel}>
                {t('btn.cancel')}
              </button>
              <button className="btn primary" onClick={() => onConfirm(state.project)}>
                {state.mode === 'new' ? t('dlg.add') : t('dlg.replace')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
