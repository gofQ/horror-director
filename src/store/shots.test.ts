import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, duplicateProject, flushNow, openProject } from './library'
import { LIBRARY_KEY, parseIndex, readRecord, recordKey } from '../lib/library'
import { STORAGE_KEY, useSaveStatus } from '../lib/persist'
import { emptyProject } from '../lib/factory'
import { sampleProject } from '../lib/sample'
import type { Project } from '../lib/schema'

const st = () => useStore.getState()
const SCENE = 's_living' // no shots in the sample
const shotsOf = (id = SCENE) => st().project.scenes.find((s) => s.id === id)!.shots
const titles = () => shotsOf().map((s) => s.title)
let b: MemoryBackend

beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})

const stored = (id = st().library.activeId!) => {
  const r = readRecord(b, id)
  if (!r.ok) throw new Error('unreadable record')
  return r.project
}
const rawRecord = (id = st().library.activeId!) => JSON.parse(b.data.get(recordKey(id))!) as { v: number; project: Project }

describe('shot CRUD and ordering', () => {
  it('adds shots after the latest-ending shot with planning defaults', () => {
    const a = st().addShot(SCENE)
    const c = st().addShot(SCENE)
    const [x, y] = shotsOf()
    expect([x.id, y.id]).toEqual([a, c])
    expect(x).toMatchObject({ start: 0, duration: 5, framing: 'medium', movement: 'static', technique: 'none', soundNotes: '', visualNotes: '' })
    expect(y.start).toBe(5)
    expect(x.title).toBe('New shot')
  })

  it('updates, duplicates after the original (original untouched), moves and deletes', () => {
    const a = st().addShot(SCENE)
    st().updateShot(SCENE, a, { title: 'A', start: 2, duration: 3, framing: 'pov', technique: 'match-cut' })
    const b2 = st().addShot(SCENE)
    st().updateShot(SCENE, b2, { title: 'B' })
    const original = { ...shotsOf()[0] }
    const copy = st().duplicateShot(SCENE, a, 'A (copy)')!
    expect(shotsOf().map((s) => s.id)).toEqual([a, copy, b2])
    expect(shotsOf()[0]).toEqual(original)
    expect(shotsOf()[1]).toMatchObject({ title: 'A (copy)', start: 5, duration: 3, framing: 'pov', technique: 'match-cut' })
    expect(copy).not.toBe(a)
    st().moveShot(SCENE, b2, -1)
    expect(shotsOf().map((s) => s.id)).toEqual([a, b2, copy])
    st().moveShot(SCENE, a, -1) // at the top: no-op
    st().moveShot(SCENE, copy, 1) // at the bottom: no-op
    expect(shotsOf().map((s) => s.id)).toEqual([a, b2, copy])
    expect(shotsOf().find((s) => s.id === b2)!.start).toBe(5) // reordering never changes timing
    st().deleteShot(SCENE, b2)
    expect(shotsOf().map((s) => s.id)).toEqual([a, copy])
    expect(st().duplicateShot(SCENE, 'ghost', 'x')).toBeNull()
  })

  it('sorts by time as one undo step and does nothing when already sorted', () => {
    const a = st().addShot(SCENE)
    const c = st().addShot(SCENE)
    st().updateShot(SCENE, a, { start: 30 })
    st().moveShot(SCENE, a, 1)
    st().moveShot(SCENE, a, -1)
    const before = st().past.length
    st().sortShotsByTime(SCENE)
    expect(shotsOf().map((s) => s.id)).toEqual([c, a])
    expect(st().past.length).toBe(before + 1)
    expect(shotsOf().map((s) => s.start)).toEqual([5, 30]) // timing untouched
    st().sortShotsByTime(SCENE)
    expect(st().past.length).toBe(before + 1) // no new history entry
    st().undo()
    expect(shotsOf().map((s) => s.id)).toEqual([a, c])
  })

  it('does not touch triggers, transitions or other scenes', () => {
    const before = structuredClone(st().project)
    st().addShot(SCENE)
    const after = st().project
    expect(after.transitions).toEqual(before.transitions)
    expect(after.scenes.find((s) => s.id === SCENE)!.triggers).toEqual(before.scenes.find((s) => s.id === SCENE)!.triggers)
    expect(after.scenes.find((s) => s.id === 's_hall')).toEqual(before.scenes.find((s) => s.id === 's_hall'))
  })
})

describe('undo / redo', () => {
  it('each structural action is one step and redo restores it', () => {
    const base = st().past.length
    const a = st().addShot(SCENE)
    st().duplicateShot(SCENE, a, 'copy')
    st().deleteShot(SCENE, a)
    expect(st().past.length).toBe(base + 3)
    st().undo()
    expect(shotsOf()).toHaveLength(2)
    st().undo()
    expect(shotsOf()).toHaveLength(1)
    st().undo()
    expect(shotsOf()).toHaveLength(0)
    st().redo()
    st().redo()
    expect(shotsOf().map((s) => s.title)).toEqual(['New shot', 'copy'])
    st().redo()
    expect(titles()).toEqual(['copy'])
  })

  it('typing in one field coalesces into a single undo step', () => {
    const a = st().addShot(SCENE)
    const base = st().past.length
    for (const v of ['W', 'Wi', 'Wid', 'Wide']) st().updateShot(SCENE, a, { title: v })
    expect(st().past.length).toBe(base + 1)
    st().undo()
    expect(titles()).toEqual(['New shot'])
  })
})

describe('persistence and isolation', () => {
  it('persists shots across reload, project switching and project duplication', () => {
    const first = st().library.activeId!
    const a = st().addShot(SCENE)
    st().updateShot(SCENE, a, { title: 'Persisted', soundNotes: 'low drone', technique: 'impossible-space' })
    flushNow()
    expect(stored().scenes.find((s) => s.id === SCENE)!.shots[0].title).toBe('Persisted')

    addAndOpen(emptyProject())
    expect(st().project.scenes.every((s) => s.shots.length === 0)).toBe(true) // isolated
    openProject(first)
    expect(titles()).toEqual(['Persisted'])

    const dup = duplicateProject(first, 'Copy')
    expect(dup.ok).toBe(true)
    if (dup.ok) {
      openProject(dup.id)
      expect(shotsOf()[0]).toMatchObject({ title: 'Persisted', soundNotes: 'low drone', technique: 'impossible-space' })
    }

    bootLibrary(b) // reload
    openProject(first)
    expect(shotsOf()[0].title).toBe('Persisted')
  })

  it('new record writes use v:3 and keep the project unchanged otherwise', () => {
    st().addShot(SCENE)
    flushNow()
    const rec = rawRecord()
    expect(rec.v).toBe(6)
    expect(rec.project.scenes.find((s) => s.id === SCENE)!.shots).toHaveLength(1)
  })

  it('failed writes keep shots in memory, report the error and succeed on retry', () => {
    b.failWhen = () => true
    const a = st().addShot(SCENE)
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    expect(shotsOf().map((s) => s.id)).toEqual([a])
    b.failWhen = null
    expect(flushNow()).toBe(true)
    expect(stored().scenes.find((s) => s.id === SCENE)!.shots.map((s) => s.id)).toEqual([a])
  })
})

describe('migration of older stored data', () => {
  const noShots = (p: Project) => ({ ...p, scenes: p.scenes.map(({ shots, ...rest }) => (void shots, rest)) })

  it('reads a v:1 record without shots as empty shot lists and rewrites nothing until the first edit', () => {
    const id = st().library.activeId!
    const raw = JSON.stringify({ v: 1, project: noShots(sampleProject()) })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect(st().project.scenes.every((s) => Array.isArray(s.shots) && s.shots.length === 0)).toBe(true)
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw) // not rewritten at boot
    st().updateProject({ description: 'edit' })
    flushNow()
    const rec = rawRecord()
    expect(rec.v).toBe(6)
    expect(rec.project.description).toBe('edit')
    expect(rec.project.scenes.every((s) => Array.isArray(s.shots))).toBe(true)
  })

  it('migrates the legacy single-project key without modifying it', () => {
    const legacy = JSON.stringify({ state: { project: noShots(sampleProject()), timelineSceneId: 's_bed' }, version: 0 })
    const mem = memoryBackend({ [STORAGE_KEY]: legacy })
    bootLibrary(mem)
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    expect(st().project.scenes.every((s) => s.shots.length === 0)).toBe(true)
    expect(st().project.name).toBe(sampleProject().name)
    const rec = readRecord(mem, st().library.activeId!)
    expect(rec.ok && rec.project.scenes[0].shots).toEqual([])
    st().addShot(SCENE)
    flushNow()
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
  })

  it('treats a malformed v:3 record as damaged: raw data preserved, never overwritten', () => {
    const good = st().library.activeId!
    const bad = JSON.parse(JSON.stringify({ v: 3, project: sampleProject() })) as { v: number; project: Project }
    bad.project.scenes[0].shots[0].framing = 'dutch-angle' as never
    const raw = JSON.stringify(bad)
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad1', name: 'Broken shots', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad1'), raw)
    bootLibrary(b)
    expect(st().damaged.bad1).toEqual({ raw })
    expect(st().library.activeId).toBe(good)
    expect(openProject('bad1')).toEqual({ ok: false, error: { code: 'damaged' } })
    st().addShot(SCENE)
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
  })
})
