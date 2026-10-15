import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, duplicateProject, flushNow, openProject } from './library'
import { LIBRARY_KEY, parseIndex, readRecord, recordKey } from '../lib/library'
import { STORAGE_KEY, useSaveStatus } from '../lib/persist'
import { emptyProject } from '../lib/factory'
import { sampleProject } from '../lib/sample'
import type { Project } from '../lib/schema'

const SCENE = 's_living' // sample scene without cues (120 s)
const st = () => useStore.getState()
const cues = (sceneId = SCENE) => st().project.scenes.find((s) => s.id === sceneId)!.audioCues
const ids = () => cues().map((c) => c.id)
let b: MemoryBackend

beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})
const rawRecord = (id = st().library.activeId!) => JSON.parse(b.data.get(recordKey(id))!) as { v: number; project: Project }

describe('audio cue CRUD, ordering and history', () => {
  it('adds cues after the latest-ending one with defaults; authored order is kept', () => {
    const a = st().addAudioCue(SCENE)
    const c = st().addAudioCue(SCENE)
    expect(ids()).toEqual([a, c])
    expect(cues()[0]).toMatchObject({ start: 0, duration: 5, type: 'sfx', origin: 'non-diegetic', direction: 'nonspatial', level: 5, loop: false, asset: '', prompt: '' })
    expect(cues()[1].start).toBe(5)
  })

  it('updates fields, coalesces typing into one undo step and supports undo/redo', () => {
    const a = st().addAudioCue(SCENE)
    const base = st().past.length
    for (const v of ['W', 'Wh', 'Whi']) st().updateAudioCue(SCENE, a, { title: v })
    expect(st().past.length).toBe(base + 1)
    st().updateAudioCue(SCENE, a, { type: 'whisper', direction: 'behind', origin: 'ambiguous' })
    expect(cues()[0]).toMatchObject({ title: 'Whi', type: 'whisper', direction: 'behind', origin: 'ambiguous' })
    st().undo()
    expect(cues()[0]).toMatchObject({ type: 'sfx', direction: 'nonspatial' })
    st().undo()
    expect(cues()[0].title).not.toBe('Whi')
    st().redo()
    st().redo()
    expect(cues()[0].type).toBe('whisper')
  })

  it('refuses invalid values without any change or history entry', () => {
    const a = st().addAudioCue(SCENE)
    const n = st().past.length
    const before = structuredClone(cues())
    for (const patch of [{ start: -1 }, { duration: 0 }, { duration: -2 }, { fadeIn: -1 }, { fadeOut: -0.5 }, { level: 11 }, { level: -1 }, { start: NaN }])
      expect(st().updateAudioCue(SCENE, a, patch)).toBe(false)
    expect(st().updateAudioCue(SCENE, 'ghost', { title: 'x' })).toBe(false)
    expect(cues()).toEqual(before)
    expect(st().past.length).toBe(n)
  })

  it('accepts boundary values (start 0, fades 0, level 0 and 10)', () => {
    const a = st().addAudioCue(SCENE)
    expect(st().updateAudioCue(SCENE, a, { start: 0, fadeIn: 0, fadeOut: 0, level: 0 })).toBe(true)
    expect(st().updateAudioCue(SCENE, a, { level: 10 })).toBe(true)
  })

  it('does not change timing implicitly: moving, duplicating and deleting leave other cues untouched', () => {
    const a = st().addAudioCue(SCENE)
    const c = st().addAudioCue(SCENE)
    st().updateAudioCue(SCENE, a, { start: 30, duration: 8 })
    const d = st().duplicateAudioCue(SCENE, a, 'A (copy)')!
    expect(ids()).toEqual([a, d, c])
    expect(cues()[1]).toMatchObject({ title: 'A (copy)', start: 38, duration: 8 })
    expect(cues()[1].id).not.toBe(a)
    st().moveAudioCue(SCENE, c, -1)
    expect(ids()).toEqual([a, c, d])
    expect(cues().map((x) => x.start)).toEqual([30, 5, 38])
    st().moveAudioCue(SCENE, a, -1) // already first: no-op
    expect(ids()).toEqual([a, c, d])
    st().deleteAudioCue(SCENE, c)
    expect(ids()).toEqual([a, d])
    st().undo()
    expect(ids()).toEqual([a, c, d])
  })

  it('overlapping cues, silence and spatial metadata are stored as authored', () => {
    const a = st().addAudioCue(SCENE)
    const s = st().addAudioCue(SCENE)
    st().updateAudioCue(SCENE, a, { type: 'ambience', start: 0, duration: 60, loop: true })
    st().updateAudioCue(SCENE, s, { type: 'silence', start: 20, duration: 4, notes: 'ambience vanishes' })
    expect(cues()[0]).toMatchObject({ type: 'ambience', start: 0, duration: 60, loop: true })
    expect(cues()[1]).toMatchObject({ type: 'silence', start: 20, duration: 4 })
  })

  it('does not touch triggers, ambience, shots or transitions', () => {
    const before = structuredClone({ ...st().project, scenes: st().project.scenes.map(({ audioCues, ...r }) => (void audioCues, r)) })
    const a = st().addAudioCue('s_hall')
    st().updateAudioCue('s_hall', a, { notes: 'x', type: 'stinger' })
    st().duplicateAudioCue('s_hall', a, 'copy')
    const after = structuredClone({ ...st().project, scenes: st().project.scenes.map(({ audioCues, ...r }) => (void audioCues, r)) })
    expect(after).toEqual(before)
  })

  it('deleting a scene removes its cues in the same undoable step', () => {
    st().addAudioCue(SCENE)
    st().deleteScene(SCENE)
    expect(st().project.scenes.some((s) => s.id === SCENE)).toBe(false)
    st().undo()
    expect(cues().length).toBe(1)
  })
})

describe('persistence', () => {
  it('survives reload, project switching and duplication; projects are isolated', () => {
    const first = st().library.activeId!
    const a = st().addAudioCue(SCENE)
    st().updateAudioCue(SCENE, a, { title: 'Kalp atışı', type: 'music', prompt: 'slow heartbeat' })
    flushNow()
    expect(rawRecord().v).toBe(4)
    const other = addAndOpen(emptyProject())
    expect(other.ok).toBe(true)
    expect(st().project.scenes.every((s) => s.audioCues.length === 0)).toBe(true)
    openProject(first)
    expect(cues()[0]).toMatchObject({ title: 'Kalp atışı', type: 'music', prompt: 'slow heartbeat' })
    const dup = duplicateProject(first, 'Copy')
    if (dup.ok) {
      openProject(dup.id)
      expect(cues()[0].title).toBe('Kalp atışı')
      st().updateAudioCue(SCENE, cues()[0].id, { title: 'changed' })
      flushNow()
      openProject(first)
      expect(cues()[0].title).toBe('Kalp atışı')
    }
    bootLibrary(b)
    openProject(first)
    expect(cues()[0].title).toBe('Kalp atışı')
  })

  it('failed writes keep edits in memory and succeed on retry', () => {
    b.failWhen = () => true
    const a = st().addAudioCue(SCENE)
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    expect(ids()).toEqual([a])
    b.failWhen = null
    expect(flushNow()).toBe(true)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.scenes.find((s) => s.id === SCENE)!.audioCues.length).toBe(1)
  })
})

describe('older stored data', () => {
  const stripCues = (p: Project, ...extra: ('shots' | 'direction')[]) => ({
    ...p,
    scenes: p.scenes.map(({ audioCues, shots, ...rest }) => (void audioCues, extra.includes('shots') ? rest : { ...rest, shots })),
    transitions: p.transitions.map(({ direction, ...rest }) => (extra.includes('direction') ? rest : { ...rest, direction })),
  })

  it.each([1, 2, 3])('reads a v:%i record without audio cues and rewrites nothing until the first edit', (v) => {
    const id = st().library.activeId!
    const raw = JSON.stringify({ v, project: v === 3 ? stripCues(sampleProject()) : stripCues(sampleProject(), 'shots', 'direction') })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect(st().project.scenes.every((s) => s.audioCues.length === 0)).toBe(true)
    if (v === 3) {
      expect(st().project.scenes.find((s) => s.id === 's_hall')!.shots.length).toBeGreaterThan(0)
      expect(st().project.transitions.some((t) => t.direction)).toBe(true)
    }
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw)
    st().addAudioCue(SCENE)
    flushNow()
    expect(rawRecord().v).toBe(4)
  })

  it('migrates the legacy single-project key without modifying it', () => {
    const legacy = JSON.stringify({ state: { project: stripCues(sampleProject(), 'shots', 'direction'), timelineSceneId: 's_bed' }, version: 0 })
    const mem = memoryBackend({ [STORAGE_KEY]: legacy })
    bootLibrary(mem)
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    st().addAudioCue(SCENE)
    flushNow()
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    expect(JSON.parse(mem.data.get(recordKey(st().library.activeId!))!).v).toBe(4)
  })

  it('treats a malformed v:4 record as damaged: raw preserved, never overwritten', () => {
    const bad = { v: 4, project: structuredClone(sampleProject()) } as { v: number; project: Project }
    ;(bad.project.scenes[0].audioCues[0] as { type: string }).type = 'laser'
    const raw = JSON.stringify(bad)
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad1', name: 'Broken audio', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad1'), raw)
    bootLibrary(b)
    expect(st().damaged.bad1).toEqual({ raw })
    expect(openProject('bad1')).toEqual({ ok: false, error: { code: 'damaged' } })
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
  })
})
