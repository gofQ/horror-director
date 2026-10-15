import { create } from 'zustand'
import { projectSchema, type Project } from './schema'

export const STORAGE_KEY = 'horror-director:project:v1'
export const CORRUPT_PREFIX = 'horror-director:unreadable:'

/* ---------- save status ---------- */

export type SaveErrorReason = 'full' | 'unavailable'

export type SaveStatus =
  | { state: 'saved'; at: number | null }
  | { state: 'pending' }
  | { state: 'error'; reason: SaveErrorReason }

export const useSaveStatus = create<{ status: SaveStatus }>(() => ({
  status: { state: 'saved', at: null },
}))
const setStatus = (status: SaveStatus) => useSaveStatus.setState({ status })

/* ---------- storage ---------- */

export interface Backend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** All stored keys (used to rebuild a damaged library index). */
  keys(): string[]
}

/** The browser's localStorage as a Backend, or null when unavailable (tests, blocked storage). */
export function browserBackend(): Backend | null {
  try {
    const ls = globalThis.localStorage
    if (!ls) return null
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => k !== null),
    }
  } catch {
    return null
  }
}

export function describe(e: unknown): SaveErrorReason {
  const name = (e as { name?: string })?.name ?? ''
  return /quota/i.test(name) || (e as { code?: number })?.code === 22 ? 'full' : 'unavailable'
}

export interface SafeStorage {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
  /** Writes everything pending now. Returns true only if nothing is left pending afterwards. */
  flush: () => boolean
  hasPending: () => boolean
  /** Drops a pending write (e.g. for a project that was just deleted). */
  discard: (name: string) => void
}

/**
 * Storage wrapper that coalesces rapid writes per key, reports save status, and keeps unsaved
 * data pending (so the next change or flush retries) when a write fails. `lastKey` (the library
 * index) is always written after the other keys so a record never trails its index.
 */
export function createSafeStorage(
  backend: () => Backend,
  opts: { delay?: number; now?: () => number; lastKey?: string } = {},
): SafeStorage {
  const delay = opts.delay ?? 300
  const now = opts.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<string, string>()

  const flush = (): boolean => {
    clearTimeout(timer)
    if (pending.size === 0) return true
    const entries = [...pending].sort(([a], [b]) => Number(a === opts.lastKey) - Number(b === opts.lastKey))
    for (const [k, v] of entries) {
      try {
        backend().setItem(k, v)
        if (pending.get(k) === v) pending.delete(k)
      } catch (e) {
        // keep the entry pending so a later flush retries; stop so ordering is preserved
        setStatus({ state: 'error', reason: describe(e) })
        return false
      }
    }
    setStatus({ state: 'saved', at: now() })
    return pending.size === 0
  }

  return {
    flush,
    hasPending: () => pending.size > 0,
    discard: (name) => void pending.delete(name),
    getItem: (name) => {
      try {
        return backend().getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending.set(name, value)
      setStatus({ state: 'pending' })
      clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    removeItem: (name) => {
      pending.delete(name)
      try {
        backend().removeItem(name)
      } catch {
        /* ignore */
      }
    },
  }
}

/* ---------- hydration ---------- */

export interface Hydrated {
  project: Project | null
  timelineSceneId: string | null
  /** Set when stored data existed but could not be read. */
  unreadable: boolean
}

/** Reads the persisted `{project, timelineSceneId}` slice (schema v1, unchanged since v0.1). */
export function hydrate(persisted: unknown): Hydrated {
  if (persisted === undefined || persisted === null)
    return { project: null, timelineSceneId: null, unreadable: false }
  const p = persisted as { project?: unknown; timelineSceneId?: unknown }
  const parsed = projectSchema.safeParse(p.project)
  if (!parsed.success) return { project: null, timelineSceneId: null, unreadable: true }
  return {
    project: parsed.data,
    timelineSceneId: typeof p.timelineSceneId === 'string' ? p.timelineSceneId : null,
    unreadable: false,
  }
}

/**
 * Preserves the raw stored string under a separate key before it can be overwritten.
 * Returns the key used, or null if even the backup could not be written.
 */
export function preserveUnreadable(raw: string | null, backend: Backend, at = Date.now()): string | null {
  if (!raw) return null
  const key = `${CORRUPT_PREFIX}${at}`
  try {
    backend.setItem(key, raw)
    return key
  } catch {
    return null
  }
}
