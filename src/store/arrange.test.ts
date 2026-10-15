import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, flushNow, openProject } from './library'
import { memoryBackend } from '../test/memoryBackend'
import { readRecord } from '../lib/library'
import { emptyProject } from '../lib/factory'
import { computeLayout } from '../lib/layout'
import type { Project } from '../lib/schema'

const st = () => useStore.getState()
const positions = (p: Project) => Object.fromEntries(p.scenes.map((s) => [s.id, s.position]))
const withoutPositions = (p: Project) => ({ ...p, scenes: p.scenes.map(({ position: _p, ...rest }) => rest) })

let b: ReturnType<typeof memoryBackend>
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})

describe('arrangeScenes', () => {
  it('changes only scene positions', () => {
    const before = st().project
    expect(st().arrangeScenes()).toBe(true)
    const after = st().project
    expect(withoutPositions(after)).toEqual(withoutPositions(before)) // ids, transitions, triggers, characters, text…
    expect(after.scenes.map((s) => s.id)).toEqual(before.scenes.map((s) => s.id))
    expect(positions(after)).toEqual(computeLayout(before))
    expect(positions(after)).not.toEqual(positions(before))
  })

  it('is exactly one undo step; undo/redo restore exact positions', () => {
    const original = st().project
    st().arrangeScenes()
    const arranged = st().project
    expect(st().past).toEqual([original])
    st().undo()
    expect(st().project).toBe(original)
    expect(positions(st().project)).toEqual(positions(original))
    st().redo()
    expect(st().project).toBe(arranged)
    expect(st().past.length).toBe(1)
  })

  it('does nothing (no history entry) when already arranged', () => {
    st().arrangeScenes()
    const past = st().past
    const project = st().project
    expect(st().arrangeScenes()).toBe(false)
    expect(st().past).toBe(past)
    expect(st().project).toBe(project)
  })

  it('keeps manual drag editing separate: a drag after arranging is its own undo step', () => {
    st().arrangeScenes()
    const arranged = positions(st().project)
    st().moveScene('s_hall', { x: 5, y: 5 })
    expect(st().past.length).toBe(2)
    st().undo()
    expect(positions(st().project)).toEqual(arranged)
  })

  it('a drag right before arranging does not merge into the arrange step', () => {
    st().moveScene('s_hall', { x: 1, y: 1 })
    st().arrangeScenes()
    expect(st().past.length).toBe(2)
    st().undo()
    expect(st().project.scenes[0].position).toEqual({ x: 1, y: 1 })
  })

  it('never runs on load, reload or project switch', () => {
    const manual = { x: 999, y: 777 }
    st().moveScene('s_hall', manual)
    flushNow()
    const firstId = st().library.activeId!
    addAndOpen(emptyProject())
    expect(openProject(firstId).ok).toBe(true)
    expect(st().project.scenes.find((s) => s.id === 's_hall')!.position).toEqual(manual)
    bootLibrary(b) // reload
    expect(st().project.scenes.find((s) => s.id === 's_hall')!.position).toEqual(manual)
    expect(st().past).toEqual([])
  })

  it('arranged positions are persisted by autosave and survive a reload unchanged', () => {
    st().arrangeScenes()
    const arranged = positions(st().project)
    flushNow()
    expect(positions((readRecord(b, st().library.activeId!) as { project: Project }).project)).toEqual(arranged)
    bootLibrary(b)
    expect(positions(st().project)).toEqual(arranged)
  })
})
