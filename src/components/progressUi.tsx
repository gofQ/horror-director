import { create } from 'zustand'
import type { PT } from '../lib/production/render'
import type { ProgressFailure } from '../store/progress'
import type { ProgressStatus } from '../lib/production/progress'
import type { SourceRef } from '../lib/production/plan'

/** Status filter + selected task shared by the dashboard and the explorer (session-only, never persisted). */
export type StatusFilter = 'all' | ProgressStatus | 'stale' | 'recheck' | 'ready'
export const useExplorer = create<{ status: StatusFilter; selected: string | null }>(() => ({ status: 'all', selected: null }))
export const selectTask = (id: string | null) => useExplorer.setState({ selected: id })

export const failureText = (t: PT, e: ProgressFailure | null | undefined): string => {
  if (!e) return ''
  if (e.code === 'saveFailed') return t('lib.err.saveFailed', { reason: t('save.reason.unavailable') })
  if (e.code === 'conflict' || e.code === 'damaged') return t(`progress.err.${e.code}`)
  if (['transition', 'notConfirmed', 'staleNotAcknowledged', 'notSubmitted', 'noNotes', 'tooLong'].includes(e.code)) return t(`progress.err.${e.code}`)
  return t(`lib.err.${e.code}`)
}

export function ProgressBadge({ status, t }: { status: ProgressStatus; t: PT }) {
  return (
    <span className={`progress-badge ${status}`} data-testid="progress-badge" data-status={status}>
      {t(`progress.status.${status}`)}
    </span>
  )
}
export function StaleBadge({ t }: { t: PT }) {
  return (
    <span className="stale-badge" data-testid="stale-badge" title={t('progress.stale.hint')}>
      {t('progress.stale.badge')}
    </span>
  )
}

/** A fingerprint part key (`kind:id`) as a navigable source reference. */
export function partToSource(key: string): SourceRef | null {
  const i = key.indexOf(':')
  const kind = key.slice(0, i)
  const id = key.slice(i + 1)
  switch (kind) {
    case 'scene': case 'links': case 'shots': case 'cues': return { kind: 'scene', id }
    case 'node': case 'sequence': return { kind: 'node', id }
    case 'transition': case 'trigger': case 'character': case 'flag': case 'project': return { kind, id } as SourceRef
    default: return null
  }
}
export const fmtTime = (at: number) => new Date(at).toLocaleString()
