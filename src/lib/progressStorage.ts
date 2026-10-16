import { z } from 'zod'
import type { Backend } from './persist'
import { writeVerified, type LibError } from './library'
import { progressSchema, entryKey, type Entries, type TaskProgress } from './production/progress'
import type { Engine } from './production/plan'

/**
 * Production progress storage: one record per library project, kept apart from the authored project record, the
 * library index and every export. Keys are deliberately NOT under `horror-director:proj:` (the index rebuild would adopt
 * them as projects). Every write is verified by reading back and guarded by a revision check (other tabs); damaged or
 * unsupported records are preserved and never overwritten.
 */
export const PROGRESS_PREFIX = 'horror-director:progress:v1:'
export const ORPHAN_PREFIX = 'horror-director:progress-orphan:v1:'
export const UNREADABLE_PREFIX = 'horror-director:progress-unreadable:'
export const progressKey = (projectId: string) => `${PROGRESS_PREFIX}${projectId}`
export const orphanKey = (projectId: string) => `${ORPHAN_PREFIX}${projectId}`

export const MAX_ENTRIES = 5000
const recordSchema = z
  .object({
    v: z.literal(1),
    projectId: z.string().min(1).max(120),
    rev: z.number().int().min(0),
    updatedAt: z.number(),
    entries: z.record(z.string().max(320), progressSchema),
    meta: z.object({ projectName: z.string().max(240), deletedAt: z.number() }).strict().optional(),
  })
  .strict()
export type ProgressRecord = z.infer<typeof recordSchema>

export const emptyRecord = (projectId: string, now: number): ProgressRecord => ({ v: 1, projectId, rev: 0, updatedAt: now, entries: {} })

export type ProgressLoad =
  | { state: 'ok'; record: ProgressRecord }
  | { state: 'empty' }
  | { state: 'damaged'; raw: string; reason: 'unreadable' | 'unsupported' | 'mismatch' }
  | { state: 'unavailable' }

export function parseRecord(raw: string, expectedId?: string): ProgressLoad {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { state: 'damaged', raw, reason: 'unreadable' }
  }
  const v = (data as { v?: unknown } | null)?.v
  if (typeof v === 'number' && v !== 1) return { state: 'damaged', raw, reason: 'unsupported' }
  const r = recordSchema.safeParse(data)
  if (!r.success || Object.keys(r.data.entries).length > MAX_ENTRIES) return { state: 'damaged', raw, reason: 'unreadable' }
  if (expectedId && r.data.projectId !== expectedId) return { state: 'damaged', raw, reason: 'mismatch' }
  return { state: 'ok', record: r.data }
}

export function loadProgress(b: Backend | null, projectId: string): ProgressLoad {
  if (!b) return { state: 'unavailable' }
  let raw: string | null
  try {
    raw = b.getItem(progressKey(projectId))
  } catch {
    return { state: 'unavailable' }
  }
  return raw === null ? { state: 'empty' } : parseRecord(raw, projectId)
}

export type SaveResult = { ok: true; record: ProgressRecord } | { ok: false; error: LibError | { code: 'conflict' | 'damaged' } }

/**
 * Compare-and-set save. `base` is the record the caller edited (or null when none existed). If the stored revision is
 * no longer the one the caller started from (another tab wrote), nothing is written. A damaged stored record is never replaced.
 */
export function saveProgress(b: Backend, projectId: string, base: ProgressRecord | null, entries: Entries, now: number): SaveResult {
  let stored: ProgressLoad
  try {
    const raw = b.getItem(progressKey(projectId))
    stored = raw === null ? { state: 'empty' } : parseRecord(raw, projectId)
  } catch {
    return { ok: false, error: { code: 'storageUnavailable' } }
  }
  if (stored.state === 'damaged') return { ok: false, error: { code: 'damaged' } }
  const storedRev = stored.state === 'ok' ? stored.record.rev : null
  const baseRev = base ? base.rev : null
  if (storedRev !== baseRev) return { ok: false, error: { code: 'conflict' } }
  const next: ProgressRecord = { v: 1, projectId, rev: (baseRev ?? -1) + 1, updatedAt: now, entries, ...(base?.meta ? { meta: base.meta } : {}) }
  const err = writeVerified(b, progressKey(projectId), JSON.stringify(next))
  return err ? { ok: false, error: err } : { ok: true, record: next }
}

/** Keeps a copy of unreadable progress data under a separate key before anything else touches the project's progress. */
export function preserveDamaged(raw: string, projectId: string, b: Backend, at: number): string | null {
  const key = `${UNREADABLE_PREFIX}${projectId}:${at}`
  try {
    b.setItem(key, raw)
    return key
  } catch {
    return null
  }
}

/** Duplicate: the copy gets the same records (history intact) plus a note. Best effort, never throws. */
export function copyProgress(b: Backend, fromId: string, toId: string, fromName: string, now: number): LibError | null {
  const src = loadProgress(b, fromId)
  if (src.state !== 'ok' || !Object.keys(src.record.entries).length) return null
  const entries: Entries = {}
  for (const [k, v] of Object.entries(src.record.entries)) {
    const note = `copied from "${fromName}"`
    entries[k] = { ...v, history: [...v.history, { at: now, from: v.status, to: v.status, note, by: 'user' as const }].slice(-50) }
  }
  const rec: ProgressRecord = { v: 1, projectId: toId, rev: 0, updatedAt: now, entries }
  return writeVerified(b, progressKey(toId), JSON.stringify(rec))
}

/** Delete: progress is moved to the orphan namespace (kept, listed, removable only explicitly). Returns an error only if the move failed (then nothing is removed). */
export function orphanProgress(b: Backend, projectId: string, projectName: string, now: number): LibError | null {
  let raw: string | null
  try {
    raw = b.getItem(progressKey(projectId))
  } catch {
    return { code: 'storageUnavailable' }
  }
  if (raw === null) return null
  const parsed = parseRecord(raw, projectId)
  const out = parsed.state === 'ok' ? JSON.stringify({ ...parsed.record, meta: { projectName, deletedAt: now } }) : raw
  const err = writeVerified(b, orphanKey(projectId), out)
  if (err) return err
  try {
    b.removeItem(progressKey(projectId))
  } catch {
    /* the orphan copy exists; a leftover live key is harmless and listed as unknown project */
  }
  return null
}

export interface OrphanProject {
  key: string
  projectId: string
  projectName: string
  entries: number
  readable: boolean
}
/** Progress belonging to deleted projects, or to a project id missing from the library index. */
export function listOrphans(b: Backend | null, knownIds: string[]): OrphanProject[] {
  if (!b) return []
  const out: OrphanProject[] = []
  let keys: string[] = []
  try {
    keys = b.keys()
  } catch {
    return []
  }
  for (const key of keys.sort()) {
    const live = key.startsWith(PROGRESS_PREFIX)
    if (!live && !key.startsWith(ORPHAN_PREFIX)) continue
    const projectId = key.slice((live ? PROGRESS_PREFIX : ORPHAN_PREFIX).length)
    if (live && knownIds.includes(projectId)) continue
    const raw = b.getItem(key)
    const p = raw === null ? null : parseRecord(raw)
    out.push({ key, projectId, projectName: p?.state === 'ok' ? (p.record.meta?.projectName ?? projectId) : projectId, entries: p?.state === 'ok' ? Object.keys(p.record.entries).length : 0, readable: p?.state === 'ok' })
  }
  return out
}
export const readOrphanRaw = (b: Backend, key: string): string | null => {
  if (!key.startsWith(ORPHAN_PREFIX) && !key.startsWith(PROGRESS_PREFIX)) return null
  try {
    return b.getItem(key)
  } catch {
    return null
  }
}
/** Explicit, confirmed removal of one orphan namespace entry only. */
export function discardOrphan(b: Backend, key: string): boolean {
  if (!key.startsWith(ORPHAN_PREFIX) && !key.startsWith(PROGRESS_PREFIX)) return false
  try {
    b.removeItem(key)
    return true
  } catch {
    return false
  }
}

/* ---------- backup / restore ---------- */

export const BACKUP_FORMAT = 'horror-director.progress-backup'
export const BACKUP_VERSION = 1
const backupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    exportedAt: z.number(),
    projects: z.array(z.object({ projectId: z.string().min(1).max(120), projectName: z.string().max(240), entries: z.record(z.string().max(320), progressSchema) }).strict()).max(200),
  })
  .strict()
export type ProgressBackup = z.infer<typeof backupSchema>

export function buildBackup(projects: { projectId: string; projectName: string; entries: Entries }[], now: number): ProgressBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, projects }
}
export const serializeBackup = (b: ProgressBackup) => JSON.stringify(b, null, 2)

export type BackupParse = { ok: true; backup: ProgressBackup } | { ok: false; code: 'notJson' | 'format' | 'version' | 'malformed' | 'tooLarge' }
export function parseBackup(text: string): BackupParse {
  if (text.length > 20_000_000) return { ok: false, code: 'tooLarge' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, code: 'notJson' }
  }
  const o = data as { format?: unknown; version?: unknown } | null
  if (!o || o.format !== BACKUP_FORMAT) return { ok: false, code: 'format' }
  if (o.version !== BACKUP_VERSION) return { ok: false, code: 'version' }
  const r = backupSchema.safeParse(data)
  return r.success ? { ok: true, backup: r.data } : { ok: false, code: 'malformed' }
}

export type RestoreKind = 'new' | 'identical' | 'collision'
export interface RestoreItem {
  key: string
  engine: Engine | null
  kind: RestoreKind
  incoming: TaskProgress
  existing?: TaskProgress
}
/** Compares incoming entries with what the target project already has. Nothing is written. */
export function planRestore(incoming: Entries, existing: Entries): RestoreItem[] {
  return Object.keys(incoming)
    .sort()
    .map((key) => {
      const have = existing[key]
      const kind: RestoreKind = !have ? 'new' : JSON.stringify(have) === JSON.stringify(incoming[key]) ? 'identical' : 'collision'
      return { key, engine: key.startsWith('unreal:') ? 'unreal' : key.startsWith('unity:') ? 'unity' : null, kind, incoming: incoming[key], ...(have ? { existing: have } : {}) }
    })
}
/** Merge result: new entries are added; collisions follow the explicit choice (default: keep existing). Entries with unknown engines are skipped. */
export function applyRestore(existing: Entries, items: RestoreItem[], useImported: Set<string>): Entries {
  const out: Entries = { ...existing }
  for (const it of items) {
    if (!it.engine) continue
    if (it.kind === 'new') out[it.key] = it.incoming
    else if (it.kind === 'collision' && useImported.has(it.key)) out[it.key] = it.incoming
  }
  return out
}
export { entryKey }
