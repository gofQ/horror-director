import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { useSim } from './simulator'
import { addAndOpen, bootLibrary, deleteProject, flushNow, openProject } from './library'
import { simulateRoute } from '../lib/simulate'
import { analyzePacing } from '../lib/pacing'
import { compareRoutes } from '../lib/compare'
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
  sim().setPacing({ kindWindow: 120, silenceMin: 90 })
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

describe('pacing state', () => {
  it('toggles the selected finding and clears it when the route changes or the project switches', () => {
    sim().selectFinding('f1')
    expect(sim().selectedFindingId).toBe('f1')
    sim().selectFinding('f1')
    expect(sim().selectedFindingId).toBeNull()
    for (const action of [() => sim().choose('e1'), () => sim().back(), () => sim().restart(), () => sim().reset()]) {
      sim().selectFinding('f2')
      action()
      expect(sim().selectedFindingId).toBeNull()
    }
    sim().selectFinding('f3')
    addAndOpen(emptyProject())
    expect(sim().selectedFindingId).toBeNull()
  })

  it('clamps the adjustable thresholds and keeps them across project switches', () => {
    sim().setPacing({ kindWindow: 99999, silenceMin: 0 })
    expect(sim().pacing.kindWindow).toBe(3600)
    expect(sim().pacing.silenceMin).toBe(1)
    sim().setPacing({ kindWindow: 60 })
    addAndOpen(emptyProject())
    expect(sim().pacing.kindWindow).toBe(60)
  })

  it('analysis never touches project data, history or storage', () => {
    flushNow()
    const project = st().project
    const past = st().past
    const writes = vi.spyOn(b, 'setItem')
    for (const id of ['e1', 'e2', 'e5']) sim().choose(id)
    const result = simulateRoute(st().project, sim().choices, sim().options)
    analyzePacing(result, sim().pacing)
    sim().setPacing({ silenceMin: 30 })
    sim().selectFinding('x')
    expect(st().project).toBe(project)
    expect(st().past).toBe(past)
    expect(flushNow()).toBe(true)
    expect(writes).not.toHaveBeenCalled()
    writes.mockRestore()
  })
})

describe('route comparison state', () => {
  it('pins a copy of the current route for the active project and keeps it when Route B changes', () => {
    sim().choose('e1')
    sim().choose('e2')
    sim().pinRouteA()
    expect(sim().pinned).toEqual({ projectId: st().library.activeId, choices: ['e1', 'e2'], marks: {} })
    sim().restart()
    sim().choose('e1')
    sim().choose('e3')
    sim().back()
    expect(sim().pinned?.choices).toEqual(['e1', 'e2'])
    expect(sim().choices).toEqual(['e1'])
  })

  it('replaces and clears the pin without touching the live route', () => {
    sim().choose('e1')
    sim().pinRouteA()
    sim().choose('e2')
    sim().pinRouteA()
    expect(sim().pinned?.choices).toEqual(['e1', 'e2'])
    sim().clearPin()
    expect(sim().pinned).toBeNull()
    expect(sim().choices).toEqual(['e1', 'e2'])
  })

  it('is not pruned when graph edits invalidate it (the comparison reports it instead)', () => {
    sim().choose('e1')
    sim().choose('e2')
    sim().pinRouteA()
    st().deleteTransition('e2')
    expect(sim().pinned?.choices).toEqual(['e1', 'e2'])
    const c = compareRoutes(st().project, sim().pinned!.choices, ['e1'], sim().options, sim().pacing)
    expect(c.a.dropped).toBe(1)
    expect(c.incomplete).toBe(true)
  })

  it('resets on project switch, create and delete', () => {
    const first = st().library.activeId!
    sim().choose('e1')
    sim().pinRouteA()
    addAndOpen(emptyProject())
    expect(sim().pinned).toBeNull()
    sim().pinRouteA()
    expect(sim().pinned?.projectId).toBe(st().library.activeId)
    openProject(first)
    expect(sim().pinned).toBeNull()
    sim().pinRouteA()
    deleteProject(first, () => emptyProject())
    expect(sim().pinned).toBeNull()
  })

  it('comparing never touches project data, history or storage', () => {
    flushNow()
    const project = st().project
    const past = st().past
    const library = st().library
    const writes = vi.spyOn(b, 'setItem')
    const snapshot = JSON.stringify([...b.data])
    for (const id of ['e1', 'e2', 'e5']) sim().choose(id)
    sim().pinRouteA()
    sim().restart()
    sim().choose('e1')
    compareRoutes(st().project, sim().pinned!.choices, sim().choices, sim().options, sim().pacing)
    sim().clearPin()
    expect(st().project).toBe(project)
    expect(st().past).toBe(past)
    expect(st().library).toBe(library)
    expect(flushNow()).toBe(true)
    expect(writes).not.toHaveBeenCalled()
    expect(JSON.stringify([...b.data])).toBe(snapshot)
    writes.mockRestore()
  })
})
