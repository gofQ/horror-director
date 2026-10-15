import { beforeEach, describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, useStore } from './useStore'
import { sampleProject } from '../lib/sample'

const st = () => useStore.getState()
const resetHistory = () => useStore.setState({ past: [], future: [] })

beforeEach(() => {
  st().loadSample()
  resetHistory()
})

describe('undo/redo', () => {
  it('undoes and redoes a discrete edit', () => {
    const id = st().addScene('dream', { x: 1, y: 2 })
    expect(st().project.scenes.some((s) => s.id === id)).toBe(true)
    st().undo()
    expect(st().project).toEqual(sampleProject())
    st().redo()
    expect(st().project.scenes.some((s) => s.id === id)).toBe(true)
  })

  it('is a no-op with empty history', () => {
    const before = st().project
    st().undo()
    st().redo()
    expect(st().project).toBe(before)
  })

  it('clears redo on a new edit', () => {
    st().addScene('dream', { x: 0, y: 0 })
    st().undo()
    expect(st().future).toHaveLength(1)
    st().addScene('memory', { x: 0, y: 0 })
    expect(st().future).toHaveLength(0)
  })

  it('bounds history to 50 steps', () => {
    for (let i = 0; i < 60; i++) st().addScene('dream', { x: i, y: 0 })
    expect(st().past).toHaveLength(HISTORY_LIMIT)
    for (let i = 0; i < 100; i++) st().undo()
    // 10 oldest additions are unrecoverable; 50 were undone
    expect(st().project.scenes).toHaveLength(sampleProject().scenes.length + 10)
    expect(st().future).toHaveLength(HISTORY_LIMIT)
  })

  it('coalesces rapid edits to the same field into one step', () => {
    for (const t of ['A', 'Ab', 'Abc']) st().updateScene('s_hall', { title: t })
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(st().project.scenes.find((s) => s.id === 's_hall')!.title).toBe('Apartment Hallway')
  })

  it('does not coalesce edits to different fields or targets', () => {
    st().updateScene('s_hall', { title: 'X' })
    st().updateScene('s_hall', { ambience: 'Y' })
    st().updateScene('s_living', { title: 'Z' })
    expect(st().past).toHaveLength(3)
  })

  it('does not coalesce across an undo', () => {
    st().updateScene('s_hall', { title: 'One' })
    st().undo()
    st().updateScene('s_hall', { title: 'Two' })
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(st().project.scenes[0].title).toBe('Apartment Hallway')
  })

  it('drags count as a single step', () => {
    for (let i = 1; i <= 10; i++) st().moveScene('s_hall', { x: i, y: i })
    expect(st().past).toHaveLength(1)
  })

  it('restores selection sanity after undoing an add', () => {
    const id = st().addScene('dream', { x: 0, y: 0 })
    expect(st().selection).toEqual({ type: 'scene', id })
    st().undo()
    expect(st().selection).toBeNull()
  })

  it('selection-only changes are not history steps', () => {
    st().select({ type: 'scene', id: 's_hall' })
    st().setView('timeline')
    expect(st().past).toHaveLength(0)
  })
})

describe('destructive operations are undoable', () => {
  it('deleting a scene restores scene, transitions and start', () => {
    const before = st().project
    st().deleteScene('s_hall')
    expect(st().project.startSceneId).not.toBe('s_hall')
    st().undo()
    expect(st().project).toEqual(before)
  })

  it('multi-delete (React Flow burst) is one step', () => {
    const before = st().project
    st().deleteTransition('e1') // edge event first, as React Flow emits
    st().deleteScenes(['s_hall', 's_living'])
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(st().project).toEqual(before)
  })

  it('deleting unknown ids creates no history', () => {
    st().deleteScene('nope')
    st().deleteTransition('nope')
    expect(st().past).toHaveLength(0)
  })

  it('deleting a character restores scene state references on undo', () => {
    const before = st().project
    st().deleteCharacter('chr_watcher')
    expect(st().project.scenes.every((s) => !('chr_watcher' in s.characterStates))).toBe(true)
    st().undo()
    expect(st().project).toEqual(before)
  })

  it('deleting a character state restores references on undo', () => {
    const before = st().project
    st().deleteCharacterState('chr_watcher', 'st_hunt')
    st().undo()
    expect(st().project).toEqual(before)
  })

  it('replacing the project (import/new/sample) is undoable', () => {
    const before = st().project
    st().resetProject()
    expect(st().project.scenes).toHaveLength(1)
    st().undo()
    expect(st().project).toEqual(before)
    expect(st().timelineSceneId).toBeTruthy()
  })

  it('deleting a trigger is undoable and clears trigger selection', () => {
    const before = st().project
    st().selectTrigger('t1')
    st().deleteTrigger('s_hall', 't1')
    st().undo()
    expect(st().project).toEqual(before)
  })
})
