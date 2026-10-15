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
const tr = (id: string) => st().project.transitions.find((t) => t.id === id)!
const shots = (sceneId: string) => st().project.scenes.find((s) => s.id === sceneId)!.shots
let b: MemoryBackend

beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})
const rawRecord = (id = st().library.activeId!) => JSON.parse(b.data.get(recordKey(id))!) as { v: number; project: Project }

describe('editing a direction', () => {
  it('creates a default direction on the first edit and merges later patches', () => {
    expect(tr('e2').direction).toBeUndefined()
    expect(st().updateDirection('e2', { playerBelief: 'A normal stairwell.' })).toBe(true)
    expect(tr('e2').direction).toEqual({
      technique: 'none', playerBelief: 'A normal stairwell.', reality: '', visualContinuity: '', audioContinuity: '', reveal: '', unrealNotes: '', sourceShotId: null, targetShotId: null,
    })
    st().updateDirection('e2', { technique: 'reality-reveal', reveal: 'The stairs end.' })
    expect(tr('e2').direction).toMatchObject({ technique: 'reality-reveal', playerBelief: 'A normal stairwell.', reveal: 'The stairs end.' })
  })

  it('does not touch style, condition or duration of the transition', () => {
    const before = { ...tr('e2') }
    st().updateDirection('e2', { reality: 'x' })
    const after = tr('e2')
    expect([after.style, after.condition, after.duration, after.label]).toEqual([before.style, before.condition, before.duration, before.label])
  })

  it('supports undo/redo; typing coalesces into one step; clearing is one undoable step', () => {
    const base = st().past.length
    for (const v of ['W', 'Wa', 'Wal', 'Wall']) st().updateDirection('e2', { reveal: v })
    expect(st().past.length).toBe(base + 1)
    st().undo()
    expect(tr('e2').direction).toBeUndefined()
    st().redo()
    expect(tr('e2').direction?.reveal).toBe('Wall')
    st().clearDirection('e2')
    expect('direction' in tr('e2')).toBe(false)
    st().undo()
    expect(tr('e2').direction?.reveal).toBe('Wall')
    const n = st().past.length
    st().clearDirection('e3') // nothing to clear: no history entry
    expect(st().past.length).toBe(n)
  })

  it('unknown transitions are refused', () => {
    expect(st().updateDirection('ghost', { reveal: 'x' })).toBe(false)
  })
})

describe('shot links', () => {
  it('accepts shots of the source / destination scene and refuses any other', () => {
    expect(st().updateDirection('e1', { sourceShotId: 'sh1' })).toBe(true)
    expect(tr('e1').direction?.sourceShotId).toBe('sh1')
    const before = tr('e1').direction
    expect(st().updateDirection('e1', { targetShotId: 'sh1' })).toBe(false) // sh1 belongs to the source scene
    expect(st().updateDirection('e2', { sourceShotId: 'sh1' })).toBe(false) // wrong source scene
    expect(st().updateDirection('e1', { sourceShotId: 'ghost' })).toBe(false)
    expect(tr('e1').direction).toBe(before)
    expect(st().updateDirection('e1', { sourceShotId: null })).toBe(true)
  })

  it('self-loops can link both ends to shots of the same scene', () => {
    const a = st().addShot('s_loop')
    const c = st().addShot('s_loop')
    expect(st().updateDirection('e6', { sourceShotId: a, targetShotId: c })).toBe(true)
    expect(tr('e6').direction).toMatchObject({ sourceShotId: a, targetShotId: c })
    expect(st().updateDirection('e6', { targetShotId: 'sh1' })).toBe(false)
  })

  it('refuses to delete a linked shot unless the links are explicitly cleared (one undo step)', () => {
    // sample: e1 links sh2 as source shot
    const project = st().project
    expect(st().deleteShot('s_hall', 'sh2')).toBe(false)
    expect(st().project).toBe(project) // nothing changed, not even history
    const base = st().past.length
    expect(st().deleteShot('s_hall', 'sh2', { clearReferences: true })).toBe(true)
    expect(st().past.length).toBe(base + 1)
    expect(shots('s_hall').map((s) => s.id)).toEqual(['sh1', 'sh3'])
    expect(tr('e1').direction?.sourceShotId).toBeNull()
    expect(tr('e1').direction?.playerBelief).toContain('front door') // the rest of the direction is kept
    st().undo()
    expect(shots('s_hall').map((s) => s.id)).toEqual(['sh1', 'sh2', 'sh3'])
    expect(tr('e1').direction?.sourceShotId).toBe('sh2')
    st().redo()
    expect(tr('e1').direction?.sourceShotId).toBeNull()
  })

  it('clears both roles of a self-loop link when its shot is deleted', () => {
    const a = st().addShot('s_loop')
    st().updateDirection('e6', { sourceShotId: a, targetShotId: a })
    expect(st().deleteShot('s_loop', a)).toBe(false)
    expect(st().deleteShot('s_loop', a, { clearReferences: true })).toBe(true)
    expect(tr('e6').direction).toMatchObject({ sourceShotId: null, targetShotId: null })
  })

  it('unlinked shots delete normally; unknown shots are a no-op', () => {
    expect(st().deleteShot('s_hall', 'sh1')).toBe(true)
    expect(st().deleteShot('s_hall', 'sh1')).toBe(false)
  })

  it('reordering, duplicating and sorting shots keep the links intact', () => {
    st().moveShot('s_hall', 'sh2', -1)
    st().duplicateShot('s_hall', 'sh2', 'copy')
    st().sortShotsByTime('s_hall')
    expect(tr('e1').direction?.sourceShotId).toBe('sh2')
  })

  it('deleting a scene removes its transitions together with their directions in one undo step', () => {
    const base = st().past.length
    st().deleteScene('s_hall')
    expect(st().past.length).toBe(base + 1)
    expect(st().project.transitions.find((t) => t.id === 'e1')).toBeUndefined()
    st().undo()
    expect(tr('e1').direction?.sourceShotId).toBe('sh2')
    expect(shots('s_hall')).toHaveLength(3)
  })
})

describe('persistence and isolation', () => {
  it('keeps directions across reload, project switching and project duplication', () => {
    const first = st().library.activeId!
    st().updateDirection('e2', { technique: 'false-awakening', playerBelief: 'Waking up', reveal: 'Still dreaming' })
    flushNow()
    addAndOpen(emptyProject())
    expect(st().project.transitions).toEqual([])
    openProject(first)
    expect(tr('e2').direction).toMatchObject({ technique: 'false-awakening', reveal: 'Still dreaming' })
    const dup = duplicateProject(first, 'Copy')
    expect(dup.ok).toBe(true)
    if (dup.ok) {
      openProject(dup.id)
      expect(tr('e2').direction?.playerBelief).toBe('Waking up')
      expect(tr('e1').direction?.sourceShotId).toBe('sh2')
    }
    bootLibrary(b)
    openProject(first)
    expect(tr('e2').direction?.technique).toBe('false-awakening')
  })

  it('writes v:3 records', () => {
    st().updateDirection('e2', { reveal: 'x' })
    flushNow()
    const rec = rawRecord()
    expect(rec.v).toBe(8)
    expect(rec.project.transitions.find((t) => t.id === 'e2')!.direction?.reveal).toBe('x')
  })

  it('failed writes keep direction edits in memory and succeed on retry', () => {
    b.failWhen = () => true
    st().updateDirection('e2', { reveal: 'kept' })
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    expect(tr('e2').direction?.reveal).toBe('kept')
    b.failWhen = null
    expect(flushNow()).toBe(true)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.transitions.find((t) => t.id === 'e2')!.direction?.reveal).toBe('kept')
  })
})

describe('older stored data', () => {
  const stripNew = (p: Project) => ({
    ...p,
    scenes: p.scenes.map(({ shots, ...rest }) => (void shots, rest)),
    transitions: p.transitions.map(({ direction, ...rest }) => (void direction, rest)),
  })

  it.each([1, 2])('reads a v:%i record without shots/directions and rewrites nothing until the first edit', (v) => {
    const id = st().library.activeId!
    const raw = JSON.stringify({ v, project: stripNew(sampleProject()) })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect(st().project.scenes.every((s) => s.shots.length === 0)).toBe(true)
    expect(st().project.transitions.every((t) => t.direction === undefined)).toBe(true)
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw)
    st().updateDirection('e2', { reveal: 'first edit' })
    flushNow()
    expect(rawRecord().v).toBe(8)
  })

  it('migrates the legacy single-project key without modifying it', () => {
    const legacy = JSON.stringify({ state: { project: stripNew(sampleProject()), timelineSceneId: 's_bed' }, version: 0 })
    const mem = memoryBackend({ [STORAGE_KEY]: legacy })
    bootLibrary(mem)
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    st().updateDirection('e2', { reveal: 'x' })
    flushNow()
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    expect(JSON.parse(mem.data.get(recordKey(st().library.activeId!))!).v).toBe(8)
  })

  it('treats a malformed v:3 record as damaged: raw preserved, never overwritten', () => {
    const bad = { v: 3, project: structuredClone(sampleProject()) } as { v: number; project: Project }
    ;(bad.project.transitions[0].direction as { technique: string }).technique = 'jump-cut'
    const raw = JSON.stringify(bad)
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad1', name: 'Broken direction', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad1'), raw)
    bootLibrary(b)
    expect(st().damaged.bad1).toEqual({ raw })
    expect(openProject('bad1')).toEqual({ ok: false, error: { code: 'damaged' } })
    st().updateDirection('e2', { reveal: 'x' })
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
  })
})
