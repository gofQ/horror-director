import { useEffect, useRef } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import type { Project } from '../lib/schema'

export type ImportState =
  | { kind: 'rejected'; fileName: string; errors: string[] }
  | { kind: 'confirm'; fileName: string; project: Project; warnings: string[] }

interface Props {
  state: ImportState
  current: Project
  onCancel: () => void
  onConfirm: (p: Project) => void
  onBackupCurrent: () => void
}

const describe = (p: Project) =>
  `“${p.name}” — ${p.scenes.length} scenes, ${p.transitions.length} transitions, ${p.characters.length} characters`

export function ImportDialog({ state, current, onCancel, onConfirm, onBackupCurrent }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const rejected = state.kind === 'rejected'
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h3 id="import-title">{rejected ? 'Import blocked' : 'Replace current project?'}</h3>
        <p className="muted">File: {state.fileName}</p>
        {rejected ? (
          <>
            <p>
              <XCircle size={14} className="inline-icon err" /> This file was not imported and your current
              project is unchanged. Fix these problems and try again:
            </p>
            <ul className="issues" role="alert">
              {state.errors.map((e, i) => (
                <li key={i} className="issue error">
                  <span>{e}</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn primary" onClick={onCancel}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              <strong>Current:</strong> {describe(current)}
              <br />
              <strong>Import:</strong> {describe(state.project)}
            </p>
            <p className="muted">You can undo the replacement afterwards (Ctrl/Cmd+Z) during this session.</p>
            {state.warnings.length > 0 && (
              <>
                <div className="section-title">
                  <AlertTriangle size={12} className="inline-icon" /> Warnings (import is still allowed)
                </div>
                <ul className="issues">
                  {state.warnings.map((w, i) => (
                    <li key={i} className="issue warning">
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={onBackupCurrent}>
                Download current backup
              </button>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => onConfirm(state.project)}>
                Replace project
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
