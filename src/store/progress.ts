import { create } from 'zustand'
import { useStore } from './useStore'
import { getBackend } from './library'
import type { LibError } from '../lib/library'
import {
  applyRestore, discardOrphan, listOrphans, loadProgress, planRestore, preserveDamaged, progressKey, saveProgress, type OrphanProject, type ProgressRecord, type RestoreItem,
} from '../lib/progressStorage'
import { applyAction, entryKey, type Action, type ActionContext, type ActionError, type Entries } from '../lib/production/progress'
import type { Engine } from '../lib/production/plan'

/**
 * Runtime state of the production progress of the ACTIVE library project. Separate from the authored project: it never
 * enters undo history, autosave or exports. Nothing is written when merely viewing; only explicit actions save.
 */
export type ProgressLoadState = 'idle' | 'ok' | 'empty' | 'damaged' | 'unavailable'
export type ProgressFailure = LibError | { code: 'conflict' | 'damaged' } | { code: ActionError }
interface ProgressState {
  projectId: string | null
  load: ProgressLoadState
  /** Last record known to be in storage (the compare-and-set base). */
  base: ProgressRecord | null
  /** Working copy shown in the UI; differs from `base` only while a save has failed. */
  entries: Entries
  dirty: boolean
  conflict: boolean
  damagedRaw: string | null
  error: ProgressFailure | null
  orphans: OrphanProject[]
}
const initial: ProgressState = { projectId: null, load: 'idle', base: null, entries: {}, dirty: false, conflict: false, damagedRaw: null, error: null, orphans: [] }
export const useProgress = create<ProgressState>(() => initial)
const set = (p: Partial<ProgressState>) => useProgress.setState(p)

const knownIds = () => useStore.getState().library.projects.map((m) => m.id)
export const refreshOrphans = () => set({ orphans: listOrphans(getBackend(), knownIds()) })

/** (Re)loads progress for the active project from storage. Safe to call any time; it discards nothing that is stored. */
export function syncProgress(): void {
  const projectId = useStore.getState().library.activeId
  if (!projectId) return set({ ...initial, orphans: listOrphans(getBackend(), knownIds()) })
  const r = loadProgress(getBackend(), projectId)
  const orphans = listOrphans(getBackend(), knownIds())
  if (r.state === 'ok') return set({ projectId, load: 'ok', base: r.record, entries: r.record.entries, dirty: false, conflict: false, damagedRaw: null, error: null, orphans })
  if (r.state === 'empty') return set({ projectId, load: 'empty', base: null, entries: {}, dirty: false, conflict: false, damagedRaw: null, error: null, orphans })
  if (r.state === 'unavailable') return set({ projectId, load: 'unavailable', base: null, entries: {}, dirty: false, conflict: false, damagedRaw: null, error: { code: 'storageUnavailable' }, orphans })
  // damaged / unsupported: keep the raw text, track nothing for this project until the user decides
  const b = getBackend()
  if (b) preserveDamaged(r.raw, projectId, b, Date.now())
  set({ projectId, load: 'damaged', base: null, entries: {}, dirty: false, conflict: false, damagedRaw: r.raw, error: { code: 'damaged' }, orphans })
}

function persist(entries: Entries): boolean {
  const { projectId, base } = useProgress.getState()
  const b = getBackend()
  if (!projectId) return false
  if (!b) {
    set({ entries, dirty: true, error: { code: 'storageUnavailable' } })
    return false
  }
  const r = saveProgress(b, projectId, base, entries, Date.now())
  if (r.ok) {
    set({ base: r.record, entries: r.record.entries, load: 'ok', dirty: false, conflict: false, error: null })
    return true
  }
  set({ entries, dirty: true, conflict: r.error.code === 'conflict', error: r.error })
  return false
}

const blocked = (): boolean => {
  const s = useProgress.getState()
  return s.load === 'damaged' || s.conflict || s.load === 'idle'
}

/** Applies one user action to one task. The in-memory result is kept even if saving fails (quota etc.). */
export function dispatchProgress(engine: Engine, taskId: string, action: Action, ctx: ActionContext): { ok: boolean; error?: ProgressFailure } {
  if (blocked()) return { ok: false, error: useProgress.getState().error ?? { code: 'damaged' } }
  const key = entryKey(engine, taskId)
  const res = applyAction(useProgress.getState().entries[key], action, ctx)
  if (!res.ok) return { ok: false, error: { code: res.error } }
  const saved = persist({ ...useProgress.getState().entries, [key]: res.record })
  return saved ? { ok: true } : { ok: false, error: useProgress.getState().error ?? undefined }
}

/** Retries writing the unsaved working copy. */
export const retryProgressSave = (): boolean => (useProgress.getState().dirty ? persist(useProgress.getState().entries) : true)

/** Conflict resolution: take what the other tab stored (the unsaved local copy is exported by the caller beforehand). */
export const reloadProgress = (): void => syncProgress()

/** Removes one orphaned-task record after an explicit, confirmed decision. */
export function removeEntry(key: string): boolean {
  if (blocked()) return false
  const { [key]: _gone, ...rest } = useProgress.getState().entries
  void _gone
  return persist(rest)
}

/** Restore into any library project (the active one goes through the store, others directly). */
export function restoreInto(targetId: string, incoming: Entries, useImported: Set<string>): { ok: boolean; error?: ProgressFailure; applied: number } {
  const b = getBackend()
  if (!b) return { ok: false, error: { code: 'storageUnavailable' }, applied: 0 }
  if (targetId === useProgress.getState().projectId) {
    if (blocked()) return { ok: false, error: useProgress.getState().error ?? { code: 'damaged' }, applied: 0 }
    const items = planRestore(incoming, useProgress.getState().entries)
    const merged = applyRestore(useProgress.getState().entries, items, useImported)
    return { ok: persist(merged), error: useProgress.getState().error ?? undefined, applied: Object.keys(merged).length }
  }
  const cur = loadProgress(b, targetId)
  if (cur.state === 'damaged') return { ok: false, error: { code: 'damaged' }, applied: 0 }
  const base = cur.state === 'ok' ? cur.record : null
  const merged = applyRestore(base?.entries ?? {}, planRestore(incoming, base?.entries ?? {}), useImported)
  const r = saveProgress(b, targetId, base, merged, Date.now())
  return r.ok ? { ok: true, applied: Object.keys(merged).length } : { ok: false, error: r.error, applied: 0 }
}
export const previewRestore = (targetId: string, incoming: Entries): RestoreItem[] => {
  const b = getBackend()
  const cur = targetId === useProgress.getState().projectId ? useProgress.getState().entries : (() => { const l = loadProgress(b, targetId); return l.state === 'ok' ? l.record.entries : {} })()
  return planRestore(incoming, cur)
}

export function discardOrphanProgress(key: string): boolean {
  const b = getBackend()
  const ok = !!b && discardOrphan(b, key)
  refreshOrphans()
  return ok
}

if (typeof window !== 'undefined') {
  // Another tab changed this project's progress: reload when we have nothing unsaved, otherwise flag a conflict (never overwrite).
  window.addEventListener('storage', (e) => {
    const s = useProgress.getState()
    if (!s.projectId || e.key !== progressKey(s.projectId)) return
    if (s.dirty) set({ conflict: true, error: { code: 'conflict' } })
    else syncProgress()
  })
}
