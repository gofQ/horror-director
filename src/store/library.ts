import { useStore, bootDeps, bootResult } from './useStore'
import {
  LIBRARY_KEY,
  loadLibrary,
  makeMeta,
  readRecord,
  recordKey,
  serializeIndex,
  serializeRecord,
  validateName,
  writeVerified,
  type DamagedEntry,
  type LibError,
  type LibraryIndex,
  type LibResult,
} from '../lib/library'
import { browserBackend, createSafeStorage, preserveUnreadable, useSaveStatus, type Backend } from '../lib/persist'
import type { Project } from '../lib/schema'
import { uid } from '../lib/id'
import { copyProgress, orphanProgress } from '../lib/progressStorage'

/**
 * Runtime side of the project library: autosave of the active project, and the operations that
 * create / open / rename / duplicate / delete projects. Rules that keep data safe:
 *  - pending edits are flushed before the active project is replaced; if that fails, nothing changes;
 *  - every new record is written and read back before the index (the commit point) references it;
 *  - the in-memory state is only swapped after storage succeeded;
 *  - a project switch clears undo history (see `swapActive`).
 */
let backend: Backend | null = browserBackend()
const safe = createSafeStorage(
  () => {
    if (!backend) throw Object.assign(new Error('storage unavailable'), { name: 'StorageUnavailable' })
    return backend
  },
  { lastKey: LIBRARY_KEY },
)

let suppress = false

/** The active storage backend (null when storage is blocked). Used by the separate production-progress store. */
export const getBackend = (): Backend | null => backend

/** Re-initializes the library from a backend (used at startup by tests and for reload-like flows). */
export function bootLibrary(b: Backend | null): void {
  safe.flush()
  backend = b
  const loaded = loadLibrary(b, bootDeps())
  useSaveStatus.setState({ status: loaded.bootError ? { state: 'error', reason: loaded.bootError } : { state: 'saved', at: null } })
  suppress = true
  useStore.getState().swapActive({ project: loaded.project, library: loaded.index, damaged: loaded.damaged })
  useStore.setState({ notices: loaded.notices, externalChange: false })
  suppress = false
  if (loaded.indexDirty) safe.setItem(LIBRARY_KEY, serializeIndex(loaded.index))
}

/* ---------- autosave of the active project ---------- */

function scheduleSave(project: Project, library: LibraryIndex) {
  const id = library.activeId
  if (!id) return
  const next: LibraryIndex = {
    ...library,
    projects: library.projects.map((m) => (m.id === id ? { ...m, name: project.name, updatedAt: Date.now() } : m)),
  }
  suppress = true
  useStore.setState({ library: next })
  suppress = false
  safe.setItem(recordKey(id), serializeRecord(project))
  safe.setItem(LIBRARY_KEY, serializeIndex(next))
}

useStore.subscribe((s, prev) => {
  if (suppress || s.project === prev.project || s.library.activeId !== prev.library.activeId) return
  scheduleSave(s.project, s.library)
})
if (bootResult.indexDirty) safe.setItem(LIBRARY_KEY, serializeIndex(bootResult.index))

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void safe.flush())
  window.addEventListener('beforeunload', () => void safe.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') safe.flush()
  })
  // Detection only: concurrent tabs are NOT merged (last write wins), we just stop library operations.
  window.addEventListener('storage', (e) => {
    const id = useStore.getState().library.activeId
    if (e.key === LIBRARY_KEY || (id && e.key === recordKey(id))) useStore.setState({ externalChange: true })
  })
}

/** Writes everything pending now. Used by "Retry save" and before the page is left. */
export const flushNow = (): boolean => safe.flush()

/* ---------- helpers ---------- */

const fail = (error: LibError): LibResult<never> => ({ ok: false, error })

function saveFailure(): LibError {
  const st = useSaveStatus.getState().status
  return { code: 'saveFailed', reason: st.state === 'error' ? st.reason : 'unavailable' }
}

/** Common precondition: storage present and no other tab has changed the library. */
function precheck(): LibError | null {
  if (!backend) return { code: 'storageUnavailable' }
  if (useStore.getState().externalChange) return { code: 'externalChange' }
  return null
}

/** Direct (verified) index write. Supersedes any queued index write, which was derived from older state. */
function writeIndex(index: LibraryIndex): LibError | null {
  const err = writeVerified(backend!, LIBRARY_KEY, serializeIndex(index))
  if (!err) safe.discard(LIBRARY_KEY)
  return err
}

function setLibrary(library: LibraryIndex, damaged?: Record<string, DamagedEntry>) {
  suppress = true
  useStore.setState({ library, ...(damaged ? { damaged } : {}) })
  suppress = false
}

/* ---------- operations ---------- */

/** Adds `project` as a new library entry and opens it. */
export function addAndOpen(project: Project): LibResult<{ id: string }> {
  const pre = precheck()
  if (pre) return fail(pre)
  // 1. never leave the current project with unsaved edits
  if (!safe.flush()) return fail(saveFailure())
  const s = useStore.getState()
  const id = uid('p')
  const now = Date.now()
  // 2. record first (verified), then the index as the commit point
  const werr = writeVerified(backend!, recordKey(id), serializeRecord(project))
  if (werr) return fail(werr)
  const index: LibraryIndex = {
    ...s.library,
    activeId: id,
    projects: [...s.library.projects, makeMeta(id, project.name, now)],
  }
  const ierr = writeIndex(index)
  if (ierr) {
    try {
      backend!.removeItem(recordKey(id))
    } catch {
      /* best effort: an unlisted record is harmless */
    }
    return fail(ierr)
  }
  // 3. only now swap the in-memory state
  suppress = true
  s.swapActive({ project, library: index })
  suppress = false
  return { ok: true, id }
}

export function openProject(id: string): LibResult {
  const pre = precheck()
  if (pre) return fail(pre)
  const s = useStore.getState()
  if (s.library.activeId === id) return { ok: true }
  if (!s.library.projects.some((m) => m.id === id)) return fail({ code: 'notFound' })
  if (!safe.flush()) return fail(saveFailure())
  const rec = readRecord(backend!, id)
  if (!rec.ok) return fail({ code: 'damaged' })
  const index: LibraryIndex = {
    ...s.library,
    activeId: id,
    projects: s.library.projects.map((m) => (m.id === id ? { ...m, name: rec.project.name } : m)),
  }
  const err = writeIndex(index)
  if (err) return fail(err)
  suppress = true
  s.swapActive({ project: rec.project, library: index })
  suppress = false
  return { ok: true }
}

/**
 * Explicit, user-confirmed recovery for a record that parses but is internally inconsistent: its raw text is first
 * preserved under the `unreadable` prefix, then the project is opened in memory. Nothing is repaired or rewritten
 * until the user edits (autosave then writes the edited project; the raw copy stays).
 */
export function openInconsistent(id: string): LibResult {
  const pre = precheck()
  if (pre) return fail(pre)
  const s = useStore.getState()
  const entry = s.damaged[id]
  if (!entry?.problems || !entry.raw) return fail({ code: 'damaged' })
  if (!safe.flush()) return fail(saveFailure())
  const rec = readRecord(backend!, id, false)
  if (!rec.ok) return fail({ code: 'damaged' })
  if (preserveUnreadable(entry.raw, backend!, Date.now()) === null) return fail({ code: 'storageFull' })
  const damaged = { ...s.damaged }
  delete damaged[id]
  const index: LibraryIndex = {
    ...s.library,
    activeId: id,
    projects: s.library.projects.map((m) => (m.id === id ? { ...m, name: rec.project.name } : m)),
  }
  const err = writeIndex(index)
  if (err) return fail(err)
  suppress = true
  s.swapActive({ project: rec.project, library: index, damaged })
  suppress = false
  return { ok: true }
}

export function renameProject(id: string, input: string): LibResult {
  const pre = precheck()
  if (pre) return fail(pre)
  const v = validateName(input)
  if (!v.ok) return fail(v.error)
  const s = useStore.getState()
  if (!s.library.projects.some((m) => m.id === id)) return fail({ code: 'notFound' })
  if (id === s.library.activeId) {
    // a normal undoable edit; autosave persists the record and the index name
    s.updateProject({ name: v.name })
    return { ok: true }
  }
  const rec = readRecord(backend!, id)
  if (!rec.ok) return fail({ code: 'damaged' })
  const werr = writeVerified(backend!, recordKey(id), serializeRecord({ ...rec.project, name: v.name }))
  if (werr) return fail(werr)
  const index: LibraryIndex = {
    ...s.library,
    projects: s.library.projects.map((m) => (m.id === id ? { ...m, name: v.name, updatedAt: Date.now() } : m)),
  }
  const ierr = writeIndex(index)
  if (ierr) return fail(ierr) // record already has the new name; load self-heals the cached index name
  setLibrary(index)
  return { ok: true }
}

/** Copies a project under `copyName`; the current project stays open. */
export function duplicateProject(id: string, copyName: string): LibResult<{ id: string }> {
  const pre = precheck()
  if (pre) return fail(pre)
  const s = useStore.getState()
  if (!s.library.projects.some((m) => m.id === id)) return fail({ code: 'notFound' })
  let source: Project
  if (id === s.library.activeId) source = s.project
  else {
    const rec = readRecord(backend!, id)
    if (!rec.ok) return fail({ code: 'damaged' })
    source = rec.project
  }
  const v = validateName(copyName)
  const name = v.ok ? v.name : source.name
  const copy: Project = { ...structuredClone(source), name }
  const nid = uid('p')
  const werr = writeVerified(backend!, recordKey(nid), serializeRecord(copy))
  if (werr) return fail(werr)
  const index: LibraryIndex = { ...s.library, projects: [...s.library.projects, makeMeta(nid, name, Date.now())] }
  const ierr = writeIndex(index)
  if (ierr) {
    try {
      backend!.removeItem(recordKey(nid))
    } catch {
      /* best effort */
    }
    return fail(ierr)
  }
  // production progress follows the duplicate (best effort: the copy exists either way)
  copyProgress(backend!, id, nid, source.name, Date.now())
  setLibrary(index)
  return { ok: true, id: nid }
}

/**
 * Deletes a project. The index is updated first (commit point), then the record is removed.
 * A damaged record's raw text is preserved under the `unreadable` prefix before removal.
 * Deleting the active project opens another one (or `fresh` when it was the last).
 */
export function deleteProject(id: string, fresh: () => Project): LibResult {
  const pre = precheck()
  if (pre) return fail(pre)
  const s = useStore.getState()
  if (!s.library.projects.some((m) => m.id === id)) return fail({ code: 'notFound' })
  const remaining = s.library.projects.filter((m) => m.id !== id)
  const wasActive = id === s.library.activeId
  const damaged = { ...s.damaged }
  const damagedRaw = damaged[id]?.raw ?? null
  delete damaged[id]

  let next: { project: Project; id: string; extra?: LibraryIndex['projects'] } | null = null
  if (wasActive) {
    for (const m of remaining) {
      if (m.id in damaged) continue
      const rec = readRecord(backend!, m.id)
      if (rec.ok) {
        next = { project: rec.project, id: m.id }
        break
      }
    }
    if (!next) {
      const project = fresh()
      const nid = uid('p')
      const werr = writeVerified(backend!, recordKey(nid), serializeRecord(project))
      if (werr) return fail(werr)
      next = { project, id: nid, extra: [makeMeta(nid, project.name, Date.now())] }
    }
  }
  const index: LibraryIndex = {
    ...s.library,
    activeId: wasActive ? next!.id : s.library.activeId,
    projects: [...remaining, ...(next?.extra ?? [])],
  }
  const ierr = writeIndex(index)
  if (ierr) {
    if (next?.extra) {
      try {
        backend!.removeItem(recordKey(next.id))
      } catch {
        /* best effort */
      }
    }
    return fail(ierr)
  }
  if (damagedRaw) preserveUnreadable(damagedRaw, backend!, Date.now())
  // production progress is moved to the orphan namespace, never deleted with the project
  orphanProgress(backend!, id, s.library.projects.find((m) => m.id === id)?.name ?? id, Date.now())
  safe.discard(recordKey(id))
  try {
    backend!.removeItem(recordKey(id))
  } catch {
    /* an unlisted leftover record is harmless */
  }
  if (wasActive) {
    suppress = true
    s.swapActive({ project: next!.project, library: index, damaged })
    suppress = false
  } else setLibrary(index, damaged)
  return { ok: true }
}
