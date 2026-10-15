import { create } from 'zustand'
import type { StateStorage } from 'zustand/middleware'
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
}

function describe(e: unknown): SaveErrorReason {
  const name = (e as { name?: string })?.name ?? ''
  return /quota/i.test(name) || (e as { code?: number })?.code === 22 ? 'full' : 'unavailable'
}

/**
 * localStorage wrapper that coalesces rapid writes, reports status, and keeps unsaved data
 * pending (so the next change or flush retries) when a write fails.
 */
export function createSafeStorage(
  backend: () => Backend,
  opts: { delay?: number; now?: () => number } = {},
): StateStorage & { flush: () => void } {
  const delay = opts.delay ?? 300
  const now = opts.now ?? Date.now
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: [string, string] | null = null

  const flush = () => {
    clearTimeout(timer)
    if (!pending) return
    const [k, v] = pending
    try {
      backend().setItem(k, v)
      pending = null
      setStatus({ state: 'saved', at: now() })
    } catch (e) {
      // keep `pending` so a later flush retries
      setStatus({ state: 'error', reason: describe(e) })
    }
  }

  return {
    flush,
    getItem: (name) => {
      try {
        return backend().getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending = [name, value]
      setStatus({ state: 'pending' })
      clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    removeItem: (name) => {
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
