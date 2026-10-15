import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import {
  addAndOpen,
  bootLibrary,
  deleteProject,
  duplicateProject,
  flushNow,
  openProject,
  renameProject,
} from './library'
import { LIBRARY_KEY, RECORD_PREFIX, parseIndex, readRecord, recordKey } from '../lib/library'
import { STORAGE_KEY, useSaveStatus } from '../lib/persist'
import { buildExport, parseProject, serializeProject } from '../lib/io'
import { emptyProject } from '../lib/factory'
import { sampleProject } from '../lib/sample'
import type { Project } from '../lib/schema'

const st = () => useStore.getState()
const activeId = () => st().library.activeId!
const mk = (name: string): Project => ({ ...emptyProject(), name })
const recordKeys = (b: MemoryBackend) => b.keys().filter((k) => k.startsWith(RECORD_PREFIX))
const storedIndex = (b: MemoryBackend) => parseIndex(b.data.get(LIBRARY_KEY)!)!
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok).toBe(true)
  return r as Extract<T, { ok: true }>
}

let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})

describe('create / open / persistence of the active project', () => {
  it('assigns stable ids independent of names and opens the new project', () => {
    const first = activeId()
    const { id } = must(addAndOpen(mk('Same name')))
    const { id: id2 } = must(addAndOpen(mk('Same name')))
    expect(new Set([first, id, id2]).size).toBe(3)
    expect(activeId()).toBe(id2)
    expect(st().library.projects.map((p) => p.name)).toEqual([sampleProject().name, 'Same name', 'Same name'])
    expect(storedIndex(b)).toEqual(st().library)
  })

  it('autosaves edits to the active project record only', () => {
    const a = activeId()
    const { id: other } = must(addAndOpen(mk('Other')))
    st().updateScene(st().project.scenes[0].id, { title: 'Edited in Other' })
    expect(flushNow()).toBe(true)
    expect((readRecord(b, other) as { project: Project }).project.scenes[0].title).toBe('Edited in Other')
    expect((readRecord(b, a) as { project: Project }).project).toEqual(sampleProject()) // untouched
    expect(useSaveStatus.getState().status.state).toBe('saved')
  })

  it('remembers the active project (and its content) after a reload', () => {
    const { id } = must(addAndOpen(mk('Second')))
    st().updateProject({ description: 'unsaved-until-flush' })
    flushNow()
    bootLibrary(b) // simulate reload
    expect(activeId()).toBe(id)
    expect(st().project.description).toBe('unsaved-until-flush')
    expect(st().library.projects).toHaveLength(2)
  })

  it('open switches to another project and persists the choice', () => {
    const a = activeId()
    must(addAndOpen(mk('B')))
    must(openProject(a))
    expect(activeId()).toBe(a)
    expect(st().project).toEqual(sampleProject())
    expect(storedIndex(b).activeId).toBe(a)
    bootLibrary(b)
    expect(activeId()).toBe(a)
  })

  it('opening an unknown or damaged project fails without changing anything', () => {
    const a = activeId()
    expect(openProject('nope')).toEqual({ ok: false, error: { code: 'notFound' } })
    const { id } = must(addAndOpen(mk('Bad')))
    must(openProject(a))
    b.data.set(recordKey(id), '{broken')
    expect(openProject(id)).toEqual({ ok: false, error: { code: 'damaged' } })
    expect(activeId()).toBe(a)
    expect(b.data.get(recordKey(id))).toBe('{broken')
  })
})

describe('rename / duplicate / delete', () => {
  it('renames the active project as an undoable edit and syncs record and index', () => {
    must(renameProject(activeId(), '  Yeni Ad Çalışması  '))
    expect(st().project.name).toBe('Yeni Ad Çalışması')
    expect(st().past.length).toBe(1)
    flushNow()
    expect(storedIndex(b).projects[0].name).toBe('Yeni Ad Çalışması')
    expect((readRecord(b, activeId()) as { project: Project }).project.name).toBe('Yeni Ad Çalışması')
    st().undo()
    expect(st().project.name).toBe(sampleProject().name)
  })

  it('renames a non-active project without opening it', () => {
    const a = activeId()
    const { id } = must(addAndOpen(mk('B')))
    must(renameProject(a, 'Renamed A'))
    expect(activeId()).toBe(id)
    expect(st().library.projects.find((p) => p.id === a)!.name).toBe('Renamed A')
    expect((readRecord(b, a) as { project: Project }).project.name).toBe('Renamed A')
    expect(storedIndex(b).projects.find((p) => p.id === a)!.name).toBe('Renamed A')
  })

  it('validates names', () => {
    expect(renameProject(activeId(), '   ')).toEqual({ ok: false, error: { code: 'emptyName' } })
    expect(renameProject(activeId(), 'x'.repeat(121))).toEqual({ ok: false, error: { code: 'nameTooLong' } })
    must(renameProject(activeId(), 'ç'.repeat(120)))
    expect(renameProject('nope', 'x')).toEqual({ ok: false, error: { code: 'notFound' } })
  })

  it('duplicates the active project (including unsaved edits) under a new id and stays put', () => {
    const a = activeId()
    st().updateProject({ description: 'edited, not yet flushed' })
    const { id } = must(duplicateProject(a, 'Kopya'))
    expect(id).not.toBe(a)
    expect(activeId()).toBe(a)
    const copy = (readRecord(b, id) as { project: Project }).project
    expect(copy.name).toBe('Kopya')
    expect(copy.description).toBe('edited, not yet flushed')
    // independent afterwards
    st().updateProject({ description: 'changed again' })
    flushNow()
    expect((readRecord(b, id) as { project: Project }).project.description).toBe('edited, not yet flushed')
  })

  it('duplicates a non-active project', () => {
    const a = activeId()
    must(addAndOpen(mk('B')))
    const { id } = must(duplicateProject(a, 'A copy'))
    expect((readRecord(b, id) as { project: Project }).project).toEqual({ ...sampleProject(), name: 'A copy' })
  })

  it('deletes a non-active project (index first, then record)', () => {
    const a = activeId()
    const { id } = must(addAndOpen(mk('B')))
    must(deleteProject(a, () => mk('unused')))
    expect(st().library.projects.map((p) => p.id)).toEqual([id])
    expect(b.data.has(recordKey(a))).toBe(false)
    expect(storedIndex(b).projects.map((p) => p.id)).toEqual([id])
    expect(activeId()).toBe(id)
  })

  it('deleting the active project opens another and drops its pending save', () => {
    const a = activeId()
    const { id } = must(addAndOpen(mk('B')))
    must(openProject(a))
    st().updateProject({ description: 'doomed edit' }) // pending save for a
    must(deleteProject(a, () => mk('unused')))
    expect(activeId()).toBe(id)
    expect(flushNow()).toBe(true)
    expect(b.data.has(recordKey(a))).toBe(false) // pending write did not resurrect it
  })

  it('deleting the last project creates a fresh empty one', () => {
    const a = activeId()
    must(deleteProject(a, () => mk('Fresh')))
    expect(st().library.projects).toHaveLength(1)
    expect(st().project.name).toBe('Fresh')
    expect(activeId()).not.toBe(a)
    expect(recordKeys(b)).toHaveLength(1)
  })

  it('removing a damaged project keeps its raw data as an unreadable backup', () => {
    const a = activeId()
    const { id } = must(addAndOpen(mk('B')))
    b.data.set(recordKey(id), '{raw damaged')
    bootLibrary(b)
    expect(st().damaged[id]).toEqual({ raw: '{raw damaged' })
    must(deleteProject(id, () => mk('x')))
    expect(st().library.projects.map((p) => p.id)).toEqual([a])
    expect([...b.data.values()]).toContain('{raw damaged')
  })
})

describe('switching safety', () => {
  it('flushes pending edits before switching and they survive the round trip', () => {
    const a = activeId()
    st().updateScene('s_hall', { title: 'Saved by switch' })
    const { id } = must(addAndOpen(mk('B')))
    expect((readRecord(b, a) as { project: Project }).project.scenes[0].title).toBe('Saved by switch')
    must(openProject(a))
    expect(st().project.scenes[0].title).toBe('Saved by switch')
    expect(id).toBeTruthy()
  })

  it('refuses to switch when pending edits cannot be saved, and changes nothing', () => {
    const a = activeId()
    must(addAndOpen(mk('B')))
    must(openProject(a))
    st().updateScene('s_hall', { title: 'Unsaved' })
    b.failWhen = () => true
    const before = { project: st().project, library: st().library, keys: [...b.keys()].sort() }
    const r = openProject(st().library.projects.find((p) => p.id !== a)!.id)
    expect(r).toEqual({ ok: false, error: { code: 'saveFailed', reason: 'full' } })
    expect(addAndOpen(mk('C'))).toEqual({ ok: false, error: { code: 'saveFailed', reason: 'full' } })
    expect(st().project).toBe(before.project) // edit still in memory
    expect(st().library).toBe(before.library)
    expect([...b.keys()].sort()).toEqual(before.keys)
    // backup is still possible from memory, and retrying after recovery works
    expect(serializeProject(st().project)).toContain('Unsaved')
    b.failWhen = null
    expect(flushNow()).toBe(true)
    must(openProject(st().library.projects.find((p) => p.id !== a)!.id))
    expect((readRecord(b, a) as { project: Project }).project.scenes[0].title).toBe('Unsaved')
  })

  it('resets selection, trigger selection and timeline on switch', () => {
    const a = activeId()
    st().select({ type: 'scene', id: 's_bed' })
    st().setTimelineScene('s_bed')
    st().selectTrigger('t6')
    const other = mk('B')
    const { id } = must(addAndOpen(other))
    expect(st().selection).toBeNull()
    expect(st().selectedTriggerId).toBeNull()
    expect(st().timelineSceneId).toBe(other.startSceneId)
    must(openProject(a))
    expect(st().selection).toBeNull()
    expect(st().timelineSceneId).toBe('s_hall')
    expect(id).toBeTruthy()
  })
})

describe('undo isolation between projects', () => {
  it('clears history on every switch and cannot undo across projects', () => {
    const a = activeId()
    st().updateScene('s_hall', { title: 'A edit 1' })
    st().addScene('dream', { x: 1, y: 1 })
    expect(st().past.length).toBe(2)
    const { id } = must(addAndOpen(mk('B')))
    expect(st().past).toEqual([])
    expect(st().future).toEqual([])
    const bProject = st().project
    st().undo()
    st().redo()
    expect(st().project).toBe(bProject) // nothing to undo; A's edits cannot leak in
    must(openProject(a))
    expect(st().past).toEqual([]) // switching back does not resurrect A's history
    st().undo()
    expect(st().project.scenes[0].title).toBe('A edit 1') // still the saved state of A
    expect(id).toBeTruthy()
  })

  it('does not merge a same-field edit in the new project into the old project’s history step', () => {
    const a = activeId()
    st().updateScene('s_hall', { title: 'A1' })
    const other = mk('B')
    must(addAndOpen(other))
    const sceneId = st().project.scenes[0].id
    st().updateScene(sceneId, { title: 'B1' })
    expect(st().past.length).toBe(1)
    st().undo()
    expect(st().project.scenes[0].title).toBe(other.scenes[0].title)
    expect((readRecord(b, a) as { project: Project }).project.scenes[0].title).toBe('A1')
  })

  it('redo stack is cleared on switch too', () => {
    st().updateScene('s_hall', { title: 'x' })
    st().undo()
    expect(st().future.length).toBe(1)
    must(addAndOpen(mk('B')))
    expect(st().future).toEqual([])
  })

  it('explicit replacement of the active project stays undoable within the same project', () => {
    const a = activeId()
    st().loadProject(mk('Replacement'))
    expect(activeId()).toBe(a)
    expect(st().past.length).toBe(1)
    flushNow()
    expect(storedIndex(b).projects[0].name).toBe('Replacement')
    st().undo()
    expect(st().project).toEqual(sampleProject())
  })
})

describe('import / export compatibility', () => {
  const when = new Date('2026-01-01T00:00:00Z')

  it('keeps library metadata out of exports and round-trips through strict import', () => {
    const p = { ...sampleProject(), name: 'Kâbus Üçgeni' }
    must(addAndOpen(p))
    flushNow()
    const text = serializeProject(st().project)
    const parsed = JSON.parse(text)
    expect(Object.keys(parsed).sort()).toEqual(['derived', 'exportedAt', 'format', 'project', 'schemaVersion'])
    expect(parsed.schemaVersion).toBe(1)
    expect(Object.keys(parsed.project).sort()).toEqual(Object.keys(sampleProject()).sort())
    expect(text).not.toMatch(/activeId|migratedFrom|createdAt|updatedAt|"library"/)
    const back = parseProject(text)
    expect(back.ok && back.project).toEqual(p)
  })

  it('import-as-new uses the strict parser: a rejected file never touches the library', () => {
    const before = st().library
    const keys = [...b.keys()].sort()
    const bad = parseProject(JSON.stringify({ ...sampleProject(), startSceneId: 'ghost' }))
    expect(bad.ok).toBe(false) // caller stops here; addAndOpen is never reached
    expect(st().library).toBe(before)
    expect([...b.keys()].sort()).toEqual(keys)
  })

  it('imports a valid export as a new project and leaves the previous one untouched', () => {
    const a = activeId()
    const file = serializeProject({ ...sampleProject(), name: 'Imported' })
    const r = parseProject(file)
    if (!r.ok) throw new Error('should parse')
    const { id } = must(addAndOpen(r.project))
    expect(st().project.name).toBe('Imported')
    expect((readRecord(b, a) as { project: Project }).project).toEqual(sampleProject())
    expect(id).not.toBe(a)
  })

  it('exports of a migrated project are identical to what v0.3 would have exported', () => {
    const legacy: Project = { ...sampleProject(), name: 'Legacy İş' }
    const mem = memoryBackend({ [STORAGE_KEY]: JSON.stringify({ state: { project: legacy, timelineSceneId: 's_bed' }, version: 0 }) })
    bootLibrary(mem)
    expect(JSON.stringify(buildExport(st().project, when))).toBe(JSON.stringify(buildExport(legacy, when)))
  })
})

describe('failed writes never leave partial state', () => {
  it('create: quota on the record → error, nothing changed', () => {
    const before = st().library
    const keys = [...b.keys()].sort()
    b.failWhen = (k) => k.startsWith(RECORD_PREFIX)
    expect(addAndOpen(mk('X'))).toEqual({ ok: false, error: { code: 'storageFull' } })
    expect(st().library).toBe(before)
    expect([...b.keys()].sort()).toEqual(keys)
  })

  it('create: failing index write removes the new record again', () => {
    const before = st().library
    b.failWhen = (k) => k === LIBRARY_KEY
    expect(addAndOpen(mk('X')).ok).toBe(false)
    expect(st().library).toBe(before)
    expect(recordKeys(b)).toHaveLength(1)
  })

  it('create: a backend that drops writes is reported as verifyFailed', () => {
    b.dropWrites = true
    expect(addAndOpen(mk('X'))).toEqual({ ok: false, error: { code: 'verifyFailed' } })
    expect(st().library.projects).toHaveLength(1)
  })

  it('duplicate: failing index write removes the copy', () => {
    b.failWhen = (k) => k === LIBRARY_KEY
    expect(duplicateProject(activeId(), 'Copy').ok).toBe(false)
    expect(recordKeys(b)).toHaveLength(1)
    expect(st().library.projects).toHaveLength(1)
  })

  it('rename (non-active): failing record write changes nothing', () => {
    const a = activeId()
    must(addAndOpen(mk('B')))
    const raw = b.data.get(recordKey(a))
    b.failWhen = (k) => k === recordKey(a)
    expect(renameProject(a, 'New').ok).toBe(false)
    expect(b.data.get(recordKey(a))).toBe(raw)
    expect(st().library.projects.find((p) => p.id === a)!.name).toBe(sampleProject().name)
  })

  it('delete: failing index write deletes nothing', () => {
    const a = activeId()
    must(addAndOpen(mk('B')))
    b.failWhen = (k) => k === LIBRARY_KEY
    expect(deleteProject(a, () => mk('x')).ok).toBe(false)
    expect(b.data.has(recordKey(a))).toBe(true)
    expect(st().library.projects).toHaveLength(2)
  })

  it('delete is possible while the active project cannot save (frees space)', () => {
    const a = activeId()
    must(addAndOpen(mk('B')))
    st().updateProject({ description: 'unsaved' })
    b.failWhen = (k) => k.startsWith(RECORD_PREFIX) // records full, index small enough
    must(deleteProject(a, () => mk('x')))
    expect(st().library.projects).toHaveLength(1)
    expect(st().project.description).toBe('unsaved') // active edits untouched
  })

  it('autosave failures surface in the save status and are retried', () => {
    b.failWhen = () => true
    st().updateProject({ description: 'will fail' })
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    b.failWhen = null
    expect(flushNow()).toBe(true)
    expect((readRecord(b, activeId()) as { project: Project }).project.description).toBe('will fail')
  })

  it('without any storage, operations fail cleanly', () => {
    bootLibrary(null)
    expect(addAndOpen(mk('X'))).toEqual({ ok: false, error: { code: 'storageUnavailable' } })
    expect(st().library.projects).toHaveLength(1)
  })
})

describe('multi-tab detection (not resolution)', () => {
  it('blocks library operations once another tab changed the library', () => {
    const a = activeId()
    const { id } = must(addAndOpen(mk('B')))
    useStore.setState({ externalChange: true })
    const err = { ok: false, error: { code: 'externalChange' } }
    expect(addAndOpen(mk('C'))).toEqual(err)
    expect(openProject(a)).toEqual(err)
    expect(renameProject(id, 'x')).toEqual(err)
    expect(duplicateProject(id, 'x')).toEqual(err)
    expect(deleteProject(id, () => mk('x'))).toEqual(err)
    expect(st().library.projects).toHaveLength(2)
    bootLibrary(b) // reload clears the flag
    expect(st().externalChange).toBe(false)
  })
})

