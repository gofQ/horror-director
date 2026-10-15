import { describe, expect, it } from 'vitest'
import { memoryBackend } from '../test/memoryBackend'
import {
  CORRUPT_PREFIX,
  LEGACY_ID,
  LIBRARY_KEY,
  RECORD_PREFIX,
  loadLibrary,
  parseIndex,
  readRecord,
  recordKey,
  serializeIndex,
  serializeRecord,
  type LoadDeps,
} from './library'
import { STORAGE_KEY } from './persist'
import { emptyProject } from './factory'
import { sampleProject } from './sample'
import type { Project } from './schema'

let n = 0
const deps = (): LoadDeps => ({
  now: () => 1_000,
  newId: () => `p_${++n}`,
  sample: sampleProject,
  empty: () => emptyProject(),
})

/** Exactly what v0.1–v0.3 wrote: zustand persist shape, version 0. */
const legacyRaw = (project: Project, timelineSceneId: string | null = 's_bed') =>
  JSON.stringify({ state: { project, timelineSceneId }, version: 0 })

const turkish = (): Project => ({
  ...sampleProject(),
  name: 'Kâbus Üçgeni — İğdeli Çocuk',
  description: 'Işıklar sönüyor; “ğüşiöç”.',
})

const records = (b: { keys(): string[] }) => b.keys().filter((k) => k.startsWith(RECORD_PREFIX))

describe('first run', () => {
  it('creates a library holding the sample project', () => {
    const b = memoryBackend()
    const l = loadLibrary(b, deps())
    expect(l.index.projects).toHaveLength(1)
    expect(l.project).toEqual(sampleProject())
    expect(l.bootError).toBeNull()
    expect(parseIndex(b.data.get(LIBRARY_KEY)!)).toEqual(l.index)
    expect(readRecord(b, l.index.activeId!)).toEqual({ ok: true, project: sampleProject() })
    expect(b.data.has(STORAGE_KEY)).toBe(false)
  })
  it('falls back to memory without a backend', () => {
    const l = loadLibrary(null, deps())
    expect(l.project).toEqual(sampleProject())
    expect(l.index.projects).toHaveLength(1)
    expect(l.indexDirty).toBe(true)
  })
})

describe('legacy migration (v0.1–v0.3 single project)', () => {
  it('moves a valid legacy project into the library without touching the original', () => {
    const raw = legacyRaw(turkish())
    const b = memoryBackend({ [STORAGE_KEY]: raw })
    const l = loadLibrary(b, deps())
    expect(l.project).toEqual(turkish())
    expect(l.index.activeId).toBe(LEGACY_ID)
    expect(l.index.migratedFrom).toBe(STORAGE_KEY)
    expect(l.notices).toEqual([{ kind: 'migrated' }])
    expect(readRecord(b, LEGACY_ID)).toEqual({ ok: true, project: turkish() })
    expect(b.data.get(STORAGE_KEY)).toBe(raw) // byte-for-byte untouched
  })

  it('is idempotent: reloading never re-migrates or duplicates', () => {
    const raw = legacyRaw(turkish())
    const b = memoryBackend({ [STORAGE_KEY]: raw })
    const first = loadLibrary(b, deps())
    const keysAfterFirst = [...b.keys()].sort()
    const second = loadLibrary(b, deps())
    const third = loadLibrary(b, deps())
    expect(second.index).toEqual(first.index)
    expect(third.index.projects).toHaveLength(1)
    expect(second.notices).toEqual([])
    expect([...b.keys()].sort()).toEqual(keysAfterFirst)
    expect(b.data.get(STORAGE_KEY)).toBe(raw)
  })

  it('does not re-import legacy data after the user deleted the migrated project', () => {
    const b = memoryBackend({ [STORAGE_KEY]: legacyRaw(turkish()) })
    const first = loadLibrary(b, deps())
    // user created another project and deleted the migrated one
    const other = emptyProject()
    b.data.set(recordKey('x'), serializeRecord(other))
    b.data.set(LIBRARY_KEY, serializeIndex({ ...first.index, activeId: 'x', projects: [{ id: 'x', name: other.name, createdAt: 1, updatedAt: 1 }] }))
    b.data.delete(recordKey(LEGACY_ID))
    const l = loadLibrary(b, deps())
    expect(l.index.projects.map((p) => p.id)).toEqual(['x'])
  })

  it('resumes after a crash between the record write and the index write (no duplicates)', () => {
    const raw = legacyRaw(turkish())
    const b = memoryBackend({ [STORAGE_KEY]: raw, [recordKey(LEGACY_ID)]: serializeRecord(turkish()) })
    const l = loadLibrary(b, deps())
    expect(l.index.projects).toHaveLength(1)
    expect(records(b)).toEqual([recordKey(LEGACY_ID)])
    expect(l.notices).toEqual([{ kind: 'migrated' }])
  })

  it('migrates data from every previous schema-v1 shape (missing optional fields get defaults)', () => {
    const old = { name: 'Old', scenes: [{ id: 'a', title: 'A', kind: 'reality', position: { x: 1, y: 2 } }] }
    const b = memoryBackend({ [STORAGE_KEY]: JSON.stringify({ state: { project: old }, version: 0 }) })
    const l = loadLibrary(b, deps())
    expect(l.project.scenes[0].triggers).toEqual([])
    expect(l.index.activeId).toBe(LEGACY_ID)
  })

  it.each([
    ['invalid JSON', '{broken'],
    ['wrong shape', JSON.stringify({ state: { project: { name: 1 } }, version: 0 })],
    ['no state', JSON.stringify({ hello: 'world' })],
  ])('refuses to migrate unreadable legacy data (%s) and preserves it', (_label, raw) => {
    const b = memoryBackend({ [STORAGE_KEY]: raw })
    const l = loadLibrary(b, deps())
    expect(b.data.has(recordKey(LEGACY_ID))).toBe(false)
    expect(b.data.get(STORAGE_KEY)).toBe(raw)
    const backupKey = b.keys().find((k) => k.startsWith(CORRUPT_PREFIX))
    expect(backupKey && b.data.get(backupKey)).toBe(raw)
    expect(l.notices).toEqual([{ kind: 'unreadable', source: 'legacy', backedUp: true, raw }])
    expect(l.project).toEqual(sampleProject()) // fresh library; nothing lost, nothing mixed in
    // second boot does not retry or duplicate
    expect(loadLibrary(b, deps()).index.projects).toHaveLength(1)
  })

  it('on quota failure leaves the legacy data intact, writes no index, and keeps the project in memory', () => {
    const raw = legacyRaw(turkish())
    const b = memoryBackend({ [STORAGE_KEY]: raw })
    b.failWhen = (k) => k.startsWith(RECORD_PREFIX)
    const l = loadLibrary(b, deps())
    expect(l.project).toEqual(turkish())
    expect(l.bootError).toBe('full')
    expect(l.notices).toEqual([{ kind: 'migrationFailed', reason: 'full' }])
    expect(b.data.has(LIBRARY_KEY)).toBe(false)
    expect(records(b)).toEqual([])
    expect(b.data.get(STORAGE_KEY)).toBe(raw)
    // storage recovers → the next boot migrates cleanly
    b.failWhen = null
    const retry = loadLibrary(b, deps())
    expect(retry.notices).toEqual([{ kind: 'migrated' }])
    expect(retry.project).toEqual(turkish())
  })

  it('removes the partial record when the index write fails', () => {
    const raw = legacyRaw(turkish())
    const b = memoryBackend({ [STORAGE_KEY]: raw })
    b.failWhen = (k) => k === LIBRARY_KEY
    const l = loadLibrary(b, deps())
    expect(l.notices[0]).toEqual({ kind: 'migrationFailed', reason: 'full' })
    expect(records(b)).toEqual([])
    expect(b.data.get(STORAGE_KEY)).toBe(raw)
  })

  it('does not trust a backend that silently drops writes', () => {
    const raw = legacyRaw(turkish())
    const b = memoryBackend({ [STORAGE_KEY]: raw })
    b.dropWrites = true
    const l = loadLibrary(b, deps())
    expect(l.notices).toEqual([{ kind: 'migrationFailed', reason: 'verify' }])
    expect(l.project).toEqual(turkish())
    expect(b.data.get(STORAGE_KEY)).toBe(raw)
  })
})

describe('corrupt library data', () => {
  const seedTwo = () => {
    const a = emptyProject()
    a.name = 'A'
    const c = emptyProject()
    c.name = 'C'
    const index = {
      version: 1 as const,
      activeId: 'a',
      projects: [
        { id: 'a', name: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'c', name: 'C', createdAt: 2, updatedAt: 2 },
      ],
    }
    return memoryBackend({
      [LIBRARY_KEY]: serializeIndex(index),
      [recordKey('a')]: serializeRecord(a),
      [recordKey('c')]: serializeRecord(c),
    })
  }

  it('preserves an unreadable index and rebuilds it from the stored records', () => {
    const b = seedTwo()
    b.data.set(LIBRARY_KEY, '{oops')
    const l = loadLibrary(b, deps())
    expect(l.index.projects.map((p) => p.id).sort()).toEqual(['a', 'c'])
    expect(l.notices).toEqual([
      { kind: 'unreadable', source: 'index', backedUp: true, raw: '{oops' },
      { kind: 'indexRebuilt', n: 2 },
    ])
    const backupKey = b.keys().find((k) => k.startsWith(CORRUPT_PREFIX))!
    expect(b.data.get(backupKey)).toBe('{oops')
    expect(l.indexDirty).toBe(true)
  })

  it('rejects structurally wrong indexes (duplicate ids, unknown active id)', () => {
    const base = { version: 1, activeId: null, projects: [{ id: 'a', name: 'A', createdAt: 1, updatedAt: 1 }] }
    expect(parseIndex(JSON.stringify(base))).not.toBeNull()
    expect(parseIndex(JSON.stringify({ ...base, projects: [...base.projects, ...base.projects] }))).toBeNull()
    expect(parseIndex(JSON.stringify({ ...base, activeId: 'zzz' }))).toBeNull()
    expect(parseIndex(JSON.stringify({ ...base, version: 2 }))).toBeNull()
  })

  it('migrates legacy data when the index is unreadable and no records exist', () => {
    const b = memoryBackend({ [LIBRARY_KEY]: 'garbage', [STORAGE_KEY]: legacyRaw(turkish()) })
    const l = loadLibrary(b, deps())
    expect(l.project).toEqual(turkish())
    expect(l.notices.map((x) => x.kind)).toEqual(['unreadable', 'migrated'])
    expect([...b.keys()].some((k) => k.startsWith(CORRUPT_PREFIX))).toBe(true)
  })

  it('lists an unreadable record as damaged, never overwrites it, and opens a healthy project', () => {
    const b = seedTwo()
    b.data.set(recordKey('a'), '{"v":1,"project":')
    const l = loadLibrary(b, deps())
    expect(l.index.activeId).toBe('c')
    expect(l.damaged).toEqual({ a: { raw: '{"v":1,"project":' } })
    expect(l.notices).toEqual([{ kind: 'activeDamaged' }])
    expect(b.data.get(recordKey('a'))).toBe('{"v":1,"project":')
    expect(l.index.projects.map((p) => p.id)).toEqual(['a', 'c']) // still listed
  })

  it('a listed project with a missing record is damaged without raw data', () => {
    const b = seedTwo()
    b.data.delete(recordKey('c'))
    const l = loadLibrary(b, deps())
    expect(l.damaged).toEqual({ c: { raw: null } })
    expect(l.index.activeId).toBe('a')
  })

  it('adds a fresh project next to damaged ones when nothing is readable', () => {
    const b = seedTwo()
    b.data.set(recordKey('a'), 'x')
    b.data.set(recordKey('c'), 'y')
    const l = loadLibrary(b, deps())
    expect(Object.keys(l.damaged).sort()).toEqual(['a', 'c'])
    expect(l.index.projects).toHaveLength(3)
    expect(l.index.activeId).not.toMatch(/^[ac]$/)
    expect(b.data.get(recordKey('a'))).toBe('x')
  })

  it('treats the record as the source of truth for project names', () => {
    const b = seedTwo()
    const renamed = { ...emptyProject(), name: 'Renamed after crash' }
    b.data.set(recordKey('c'), serializeRecord(renamed))
    const l = loadLibrary(b, deps())
    expect(l.index.projects.find((p) => p.id === 'c')!.name).toBe('Renamed after crash')
    expect(l.indexDirty).toBe(true)
  })
})
