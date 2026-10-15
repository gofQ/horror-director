import { z } from 'zod'
import {
  CORRUPT_PREFIX,
  describe as classify,
  hydrate,
  preserveUnreadable,
  STORAGE_KEY,
  type Backend,
  type SaveErrorReason,
} from './persist'
import { projectSchema, type Project } from './schema'
import { validateProject } from './validate'
import type { Diagnostic } from './diagnostics'

/**
 * Multi-project library storage (v0.4A).
 *
 *  - `LIBRARY_KEY`      → index: library metadata only (never part of a project or an export)
 *  - `RECORD_PREFIX+id` → `{ v: 7, project }` (`v: 1`–`v: 6` records from earlier builds are still read), the project exactly as exported
 *  - `STORAGE_KEY`      → legacy single-project data (v0.1–v0.3): read for migration, never modified
 */
export const LIBRARY_KEY = 'horror-director:library:v1'
export const RECORD_PREFIX = 'horror-director:proj:'
export const LEGACY_ID = 'legacy'
export const MAX_NAME = 120

export const recordKey = (id: string) => `${RECORD_PREFIX}${id}`

/* ---------- schemas & types ---------- */

const metaSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
const indexSchema = z.object({
  version: z.literal(1),
  activeId: z.string().nullable(),
  projects: z.array(metaSchema),
  migratedFrom: z.string().optional(),
})
/** Records are `v: 1`–`v: 6` (older builds; missing fields are normalized in memory on read) or `v: 7` (written now; older builds treat it as damaged and preserve it). */
const recordSchema = z.object({ v: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]), project: projectSchema })

export type ProjectMeta = z.infer<typeof metaSchema>
export type LibraryIndex = z.infer<typeof indexSchema>

export type LibErrorCode =
  | 'storageFull'
  | 'storageUnavailable'
  | 'verifyFailed'
  | 'saveFailed'
  | 'emptyName'
  | 'nameTooLong'
  | 'notFound'
  | 'damaged'
  | 'externalChange'
export interface LibError {
  code: LibErrorCode
  /** Only for `saveFailed`: why the pending save could not be written. */
  reason?: SaveErrorReason
}
export type LibResult<T = object> = ({ ok: true } & T) | { ok: false; error: LibError }

export type LoadNotice =
  | { kind: 'unreadable'; source: 'legacy' | 'index'; backedUp: boolean; raw: string | null }
  | { kind: 'migrated' }
  | { kind: 'migrationFailed'; reason: SaveErrorReason | 'verify' }
  | { kind: 'indexRebuilt'; n: number }
  | { kind: 'activeDamaged' }

export interface LoadedLibrary {
  index: LibraryIndex
  project: Project
  /** Listed projects whose stored record is missing or unreadable (raw kept untouched). */
  damaged: Record<string, DamagedEntry>
  notices: LoadNotice[]
  /** The index needs (re)writing; the store schedules it so failures surface in the save status. */
  indexDirty: boolean
  /** Initial writes failed; running from memory until a save succeeds. */
  bootError: SaveErrorReason | null
}

export interface LoadDeps {
  now: () => number
  newId: () => string
  /** First-run project (and replacement after a library was left empty or unreadable). */
  sample: () => Project
  empty: () => Project
}

/* ---------- low-level helpers ---------- */

export const serializeRecord = (project: Project) => JSON.stringify({ v: 7, project })
export const serializeIndex = (index: LibraryIndex) => JSON.stringify(index)

function safeGet(b: Backend, key: string): string | null {
  try {
    return b.getItem(key)
  } catch {
    return null
  }
}

function toError(e: unknown): LibError {
  return { code: classify(e) === 'full' ? 'storageFull' : 'storageUnavailable' }
}

/** Writes then reads back; a mismatch is reported instead of trusted. */
export function writeVerified(b: Backend, key: string, value: string): LibError | null {
  try {
    b.setItem(key, value)
    if (b.getItem(key) !== value) return { code: 'verifyFailed' }
    return null
  } catch (e) {
    return toError(e)
  }
}

export function parseIndex(raw: string): LibraryIndex | null {
  try {
    const r = indexSchema.safeParse(JSON.parse(raw))
    if (!r.success) return null
    const ids = r.data.projects.map((p) => p.id)
    if (new Set(ids).size !== ids.length) return null
    if (r.data.activeId !== null && !ids.includes(r.data.activeId)) return null
    return r.data
  } catch {
    return null
  }
}

/** A listed project whose stored record is unusable. `problems` is set for records that parse but are internally inconsistent. */
export interface DamagedEntry {
  raw: string | null
  problems?: Diagnostic[]
}

export type RecordRead =
  | { ok: true; project: Project }
  | { ok: false; reason: 'missing' | 'invalid'; raw: string | null }
  | { ok: false; reason: 'inconsistent'; raw: string; problems: Diagnostic[] }

/**
 * Reads one stored record. Beyond the schema check the project's references and graph are integrity-checked
 * (`validateProject` errors; warnings never block): an inconsistent record is reported, never repaired.
 * `integrity: false` skips that second check (used to verify a just-written migration).
 */
export function readRecord(b: Backend, id: string, integrity = true): RecordRead {
  const raw = safeGet(b, recordKey(id))
  if (raw === null) return { ok: false, reason: 'missing', raw: null }
  try {
    const r = recordSchema.safeParse(JSON.parse(raw))
    if (r.success) {
      if (!integrity) return { ok: true, project: r.data.project }
      const problems = validateProject(r.data.project).errors
      return problems.length === 0 ? { ok: true, project: r.data.project } : { ok: false, reason: 'inconsistent', raw, problems }
    }
  } catch {
    /* fall through */
  }
  return { ok: false, reason: 'invalid', raw }
}

export function validateName(input: string): { ok: true; name: string } | { ok: false; error: LibError } {
  const name = input.trim()
  if (!name) return { ok: false, error: { code: 'emptyName' } }
  if ([...name].length > MAX_NAME) return { ok: false, error: { code: 'nameTooLong' } }
  return { ok: true, name }
}

export const makeMeta = (id: string, name: string, now: number): ProjectMeta => ({
  id,
  name,
  createdAt: now,
  updatedAt: now,
})

/* ---------- loading, migration, recovery ---------- */

/** Rebuilds an index from the valid project records found in storage (used when the index is unreadable). */
function rebuildIndex(b: Backend, now: number): { index: LibraryIndex; damaged: LoadedLibrary['damaged'] } | null {
  let keys: string[] = []
  try {
    keys = b.keys().filter((k) => k.startsWith(RECORD_PREFIX))
  } catch {
    return null
  }
  const projects: ProjectMeta[] = []
  const damaged: LoadedLibrary['damaged'] = {}
  for (const k of keys.sort()) {
    const id = k.slice(RECORD_PREFIX.length)
    const rec = readRecord(b, id)
    if (rec.ok) projects.push(makeMeta(id, rec.project.name, now))
    else if (rec.reason !== 'missing') {
      projects.push(makeMeta(id, id, now))
      damaged[id] = rec.reason === 'inconsistent' ? { raw: rec.raw, problems: rec.problems } : { raw: rec.raw }
    }
  }
  if (projects.length === 0) return null
  const firstHealthy = projects.find((p) => !(p.id in damaged))
  return { index: { version: 1, activeId: (firstHealthy ?? projects[0]).id, projects }, damaged }
}

function parseLegacy(raw: string): Project | null {
  try {
    const parsed = JSON.parse(raw) as { state?: unknown }
    return hydrate(parsed?.state).project
  } catch {
    return null
  }
}

/** Single-project library held in memory only (no usable storage). */
function memoryLibrary(project: Project, deps: LoadDeps, extra: Partial<LoadedLibrary> = {}): LoadedLibrary {
  const id = deps.newId()
  return {
    index: { version: 1, activeId: id, projects: [makeMeta(id, project.name, deps.now())] },
    project,
    damaged: {},
    notices: [],
    indexDirty: true,
    bootError: null,
    ...extra,
  }
}

/** Creates a first project record + index. On write failure returns an in-memory library with bootError. */
function freshLibrary(b: Backend, project: Project, deps: LoadDeps, notices: LoadNotice[]): LoadedLibrary {
  const id = deps.newId()
  const index: LibraryIndex = { version: 1, activeId: id, projects: [makeMeta(id, project.name, deps.now())] }
  const err = writeVerified(b, recordKey(id), serializeRecord(project)) ?? writeVerified(b, LIBRARY_KEY, serializeIndex(index))
  if (err) {
    try {
      b.removeItem(recordKey(id))
    } catch {
      /* best effort */
    }
    return { index, project, damaged: {}, notices, indexDirty: true, bootError: err.code === 'storageFull' ? 'full' : 'unavailable' }
  }
  return { index, project, damaged: {}, notices, indexDirty: false, bootError: null }
}

/**
 * Idempotent, verified migration of v0.1–v0.3 single-project data. The legacy key is only ever read.
 * The index write is the commit point; the deterministic id makes a crash-and-retry rewrite the same record.
 */
function migrateLegacy(b: Backend, project: Project, deps: LoadDeps, notices: LoadNotice[]): LoadedLibrary {
  const index: LibraryIndex = {
    version: 1,
    activeId: LEGACY_ID,
    projects: [makeMeta(LEGACY_ID, project.name, deps.now())],
    migratedFrom: STORAGE_KEY,
  }
  const fail = (reason: SaveErrorReason | 'verify'): LoadedLibrary => {
    try {
      b.removeItem(recordKey(LEGACY_ID))
    } catch {
      /* best effort */
    }
    return {
      index,
      project,
      damaged: {},
      notices: [...notices, { kind: 'migrationFailed', reason }],
      indexDirty: true,
      bootError: reason === 'verify' ? 'unavailable' : reason,
    }
  }
  const werr = writeVerified(b, recordKey(LEGACY_ID), serializeRecord(project))
  if (werr) return fail(werr.code === 'storageFull' ? 'full' : werr.code === 'verifyFailed' ? 'verify' : 'unavailable')
  const back = readRecord(b, LEGACY_ID, false)
  if (!back.ok || JSON.stringify(back.project) !== JSON.stringify(project)) return fail('verify')
  const ierr = writeVerified(b, LIBRARY_KEY, serializeIndex(index))
  if (ierr) return fail(ierr.code === 'storageFull' ? 'full' : ierr.code === 'verifyFailed' ? 'verify' : 'unavailable')
  return { index, project, damaged: {}, notices: [...notices, { kind: 'migrated' }], indexDirty: false, bootError: null }
}

export function loadLibrary(b: Backend | null, deps: LoadDeps): LoadedLibrary {
  if (!b) return memoryLibrary(deps.sample(), deps)
  const notices: LoadNotice[] = []
  let index: LibraryIndex | null = null
  let damaged: LoadedLibrary['damaged'] = {}
  let rebuilt = false

  const rawIndex = safeGet(b, LIBRARY_KEY)
  if (rawIndex !== null) {
    index = parseIndex(rawIndex)
    if (!index) {
      // Never overwrite an unreadable index before its raw text is preserved.
      const backup = preserveUnreadable(rawIndex, b, deps.now())
      notices.push({ kind: 'unreadable', source: 'index', backedUp: backup !== null, raw: rawIndex })
      const r = rebuildIndex(b, deps.now())
      if (r) {
        index = r.index
        damaged = r.damaged
        rebuilt = true
        notices.push({ kind: 'indexRebuilt', n: r.index.projects.length })
      }
    }
  }

  if (index) {
    // Validate every listed record; the record's own name is the source of truth.
    let dirty = rebuilt
    const projects = index.projects.map((m) => {
      const rec = readRecord(b, m.id)
      if (rec.ok) {
        if (rec.project.name !== m.name) dirty = true
        return { ...m, name: rec.project.name }
      }
      damaged[m.id] = rec.reason === 'inconsistent' ? { raw: rec.raw, problems: rec.problems } : { raw: rec.raw }
      return m
    })
    const healthy = projects.filter((m) => !(m.id in damaged))
    let activeId = index.activeId
    if (!activeId || activeId in damaged || !projects.some((m) => m.id === activeId)) {
      if (index.activeId) notices.push({ kind: 'activeDamaged' })
      activeId = healthy[0]?.id ?? null
      dirty = true
    }
    if (!activeId) {
      // Everything listed is damaged: keep those entries, add a fresh project beside them.
      const fresh = deps.empty()
      const id = deps.newId()
      const err = writeVerified(b, recordKey(id), serializeRecord(fresh))
      const next: LibraryIndex = { ...index, activeId: id, projects: [...projects, makeMeta(id, fresh.name, deps.now())] }
      return { index: next, project: fresh, damaged, notices, indexDirty: true, bootError: err ? (err.code === 'storageFull' ? 'full' : 'unavailable') : null }
    }
    const rec = readRecord(b, activeId)
    return {
      index: { ...index, activeId, projects },
      project: (rec as { ok: true; project: Project }).project,
      damaged,
      notices,
      indexDirty: dirty,
      bootError: null,
    }
  }

  // No usable index: migrate legacy data, or start fresh.
  const rawLegacy = safeGet(b, STORAGE_KEY)
  if (rawLegacy === null) return freshLibrary(b, deps.sample(), deps, notices)
  const legacy = parseLegacy(rawLegacy)
  if (!legacy) {
    const backup = preserveUnreadable(rawLegacy, b, deps.now())
    notices.push({ kind: 'unreadable', source: 'legacy', backedUp: backup !== null, raw: rawLegacy })
    return freshLibrary(b, deps.sample(), deps, notices)
  }
  return migrateLegacy(b, legacy, deps, notices)
}

export { CORRUPT_PREFIX }
