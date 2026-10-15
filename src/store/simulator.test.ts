import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { useSim } from './simulator'
import { addAndOpen, bootLibrary, deleteProject, flushNow, openProject } from './library'
import { simulateRoute } from '../lib/simulate'
import { emptyProject } from '../lib/factory'
import { sampleProject } from '../lib/sample'

const st = () => useStore.getState()
const sim = () => useSim.getState()
let b: MemoryBackend

beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
  sim().reset()
  sim().setOptions({ stepCap: 40, unlimitedLimit: 5 })
})

describe('simulator state', () => {
  it('chooses, goes back and restarts', () => {
    sim().choose('e1')
    sim().choose('e2')
    expect(sim().choices).toEqual(['e1', 'e2'])
    sim().back()
    expect(sim().choices).toEqual(['e1'])
    sim().restart()
    expect(sim().choices).toEqual([])
    sim().back() // no-op on an empty route
    expect(sim().choices).toEqual([])
  })

  it('clamps configured limits', () => {
    sim().setOptions({ stepCap: 100000, unlimitedLimit: 0 })
    expect(sim().options).toEqual({ stepCap: 200, unlimitedLimit: 1 })
  })

  it('prune keeps the valid prefix and remembers how many steps were dropped', () => {
    sim().choose('e1')
    sim().choose('zzz')
    const r = simulateRoute(st().project, sim().choices)
    sim().prune(r.validChoices, r.invalidated)
    expect(sim().choices).toEqual(['e1'])
    expect(sim().invalidatedNotice).toBe(1)
    sim().choose('e2')
    expect(sim().invalidatedNotice).toBe(0)
  })
})

describe('project switching resets the route', () => {
  it('on open, create and delete of the active project; keeps the limits', () => {
    const first = st().library.activeId!
    sim().setOptions({ stepCap: 12 })
    sim().choose('e1')
    addAndOpen(emptyProject())
    expect(sim().choices).toEqual([])
    expect(sim().options.stepCap).toBe(12)

    sim().choose('x')
    openProject(first)
    expect(sim().choices).toEqual([])

    sim().choose('e1')
    deleteProject(first, () => emptyProject())
    expect(sim().choices).toEqual([])
  })

  it('does not reset when the project is merely edited (it is revalidated instead)', () => {
    sim().choose('e1')
    st().updateProject({ description: 'edit' })
    expect(sim().choices).toEqual(['e1'])
  })
})

describe('isolation from project data, autosave and history', () => {
  it('never touches the project, undo/redo history or storage', () => {
    flushNow()
    const project = st().project
    const past = st().past
    const future = st().future
    const library = st().library
    const writes = vi.spyOn(b, 'setItem')
    const snapshot = JSON.stringify([...b.data])

    for (const id of ['e1', 'e2', 'e5', 'e6', 'e6']) sim().choose(id)
    simulateRoute(st().project, sim().choices, sim().options)
    sim().back()
    sim().restart()
    sim().setOptions({ stepCap: 7 })

    expect(st().project).toBe(project)
    expect(st().past).toBe(past)
    expect(st().future).toBe(future)
    expect(st().library).toBe(library)
    expect(flushNow()).toBe(true) // nothing pending
    expect(writes).not.toHaveBeenCalled()
    expect(JSON.stringify([...b.data])).toBe(snapshot)
    expect(st().project).toEqual(sampleProject())
    writes.mockRestore()
  })
})
