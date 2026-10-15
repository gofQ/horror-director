import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { useSim } from './simulator'
import { addAndOpen, bootLibrary, flushNow } from './library'
import { LIBRARY_KEY, parseIndex, readRecord, recordKey } from '../lib/library'
import { emptyProject } from '../lib/factory'
import { simulateRoute } from '../lib/simulate'
import { reachableIds } from '../lib/graph'
import { rollRandom } from '../lib/random'
import { validateProject } from '../lib/validate'
import { flowProject } from '../test/flowProject'
import { branchProject } from '../test/branchProject'
import type { Project } from '../lib/schema'

const st = () => useStore.getState()
const sim = () => useSim.getState()
const P = () => st().project
let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
  sim().reset()
  sim().setSeed('seed')
})
const load = (p: Project) => {
  st().loadProject(p)
  useStore.setState({ past: [], future: [] })
}
const rawRecord = () => JSON.parse(b.data.get(recordKey(st().library.activeId!))!) as { v: number; project: Project }

describe('creating and editing the new nodes', () => {
  it('addLogicNode creates each type with its defaults, a distinct id prefix and one undo step', () => {
    load(emptyProject())
    const e = st().addLogicNode({ x: 0, y: 0 }, 'event')
    const d = st().addLogicNode({ x: 10, y: 0 }, 'delay')
    const r = st().addLogicNode({ x: 20, y: 0 }, 'random')
    const byId = (id: string) => P().logicNodes.find((n) => n.id === id)!
    expect(byId(e)).toMatchObject({ type: 'event', eventCategory: 'story' })
    expect(byId(d)).toMatchObject({ type: 'delay', seconds: 5 })
    expect(byId(r)).toMatchObject({ type: 'random', probabilityA: 50, labelA: 'Outcome A', labelB: 'Outcome B' })
    expect([e, d, r].map((id) => id.split('_')[0])).toEqual(['evt', 'dly', 'rnd'])
    expect(st().past).toHaveLength(3)
    st().undo()
    expect(P().logicNodes.map((n) => n.type)).toEqual(['event', 'delay'])
    expect(validateProject(P()).errors).toEqual([])
  })
  it('clamps durations and probabilities into the schema bounds and keeps labels short', () => {
    load(flowProject())
    st().updateLogicNode('D', { seconds: 99999 })
    expect(P().logicNodes.find((n) => n.id === 'D')!.seconds).toBe(3600)
    st().updateLogicNode('D', { seconds: -4 })
    expect(P().logicNodes.find((n) => n.id === 'D')!.seconds).toBe(0)
    st().updateLogicNode('R', { probabilityA: 140 })
    expect(P().logicNodes.find((n) => n.id === 'R')!.probabilityA).toBe(100)
    st().updateLogicNode('R', { probabilityA: 12.3456 })
    expect(P().logicNodes.find((n) => n.id === 'R')!.probabilityA).toBe(12.35)
    st().updateLogicNode('R', { labelA: 'x'.repeat(100) })
    expect(P().logicNodes.find((n) => n.id === 'R')!.labelA).toHaveLength(40)
    expect(validateProject(P()).errors).toEqual([])
  })
  it('connections obey the rules: Random ports, single outputs, no logic-only cycle', () => {
    load(emptyProject())
    const s = st().addScene('reality', { x: 0, y: 0 })
    const r = st().addLogicNode({ x: 0, y: 0 }, 'random')
    const e = st().addLogicNode({ x: 0, y: 0 }, 'event')
    const d = st().addLogicNode({ x: 0, y: 0 }, 'delay')
    expect(st().addTransition(s, r)).toBeTruthy()
    expect(st().addTransition(r, e)).toBeNull() // Random needs a port
    expect(st().addTransition(r, e, 'a')).toBeTruthy()
    expect(st().addTransition(r, d, 'a')).toBeNull() // port taken
    expect(st().addTransition(r, d, 'true')).toBeNull() // wrong pin type
    expect(st().addTransition(e, d)).toBeTruthy()
    expect(st().addTransition(e, s)).toBeNull() // Event has a single output
    expect(st().addTransition(d, r)).toBeNull() // logic-only cycle
    expect(st().addTransition(d, s)).toBeTruthy()
    expect(validateProject(P()).errors).toEqual([])
  })
  it('drag-to-create from an output pin connects the new node with the right port, in one step', () => {
    load(flowProject())
    const before = P().logicNodes.length
    const r = st().addNodeFromPin({ fromId: 'R', fromPort: 'a', position: { x: 5, y: 5 }, node: { type: 'delay' } })
    expect(r).toBeNull() // A is already connected in the fixture
    const free = { ...flowProject() }
    free.transitions = free.transitions.filter((t) => t.id !== 'la')
    load(free)
    const out = st().addNodeFromPin({ fromId: 'R', fromPort: 'a', position: { x: 5, y: 5 }, node: { type: 'event' } })
    expect(out).not.toBeNull()
    expect(P().logicNodes).toHaveLength(before + 1)
    expect(P().transitions.find((t) => t.id === out!.transitionId)).toMatchObject({ source: 'R', target: out!.nodeId, sourcePort: 'a', duration: 0 })
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(P().logicNodes).toHaveLength(before)
  })
})

describe('copy, paste, duplicate, delete, arrange, reachability', () => {
  it('copies the new nodes with their fields and internal connections, with fresh ids; undo removes them all at once', () => {
    load(flowProject())
    st().selectNodes(['D', 'E', 'R'])
    expect(st().copySelection()).toBe(3)
    expect(st().paste({ x: 500, y: 500 })).toBeTruthy()
    const added = P().logicNodes.slice(3)
    expect(added.map((n) => n.type)).toEqual(['delay', 'event', 'random'])
    expect(added.map((n) => n.id).every((id) => !['D', 'E', 'R'].includes(id))).toBe(true)
    expect(added[0]).toMatchObject({ seconds: 12 })
    expect(added[1]).toMatchObject({ eventCategory: 'reveal', description: 'The bell rings once' })
    expect(added[2]).toMatchObject({ probabilityA: 30, labelA: 'Door opens', labelB: 'Silence' })
    const [nd, ne, nr] = added.map((n) => n.id)
    const internal = P().transitions.filter((t) => [nd, ne, nr].includes(t.source) && [nd, ne, nr].includes(t.target))
    expect(internal.map((t) => [t.source, t.target])).toEqual([[nd, ne], [ne, nr]])
    expect(P().transitions.filter((t) => t.source === nr)).toHaveLength(0) // links to scenes outside the copy are not copied
    expect(validateProject(P()).errors).toEqual([])
    st().undo()
    expect(P().logicNodes).toHaveLength(3)
    expect(P().transitions).toHaveLength(7)
  })
  it('keeps Random ports and reroute points when the whole chain is duplicated with its scenes', () => {
    load(flowProject())
    st().addWaypoint('la', 0, { x: 3, y: 4 })
    st().selectNodes(['R', 'a'])
    st().duplicateSelection('')
    const copiedLink = P().transitions.find((t) => t.sourcePort === 'a' && t.id !== 'la')!
    expect(copiedLink.waypoints).toBeDefined()
    expect(copiedLink.source).not.toBe('R')
    expect(validateProject(P()).errors).toEqual([])
  })
  it('batch delete removes nodes and their connections in one undo step', () => {
    load(flowProject())
    st().deleteScenes(['D', 'R'])
    expect(P().logicNodes.map((n) => n.id)).toEqual(['E'])
    expect(P().transitions.map((t) => t.id)).toEqual(['a_end', 'b_end'])
    expect(validateProject(P()).errors).toEqual([])
    st().undo()
    expect(P().logicNodes).toHaveLength(3)
    expect(P().transitions).toHaveLength(7)
  })
  it('Auto Arrange places the new nodes and is undoable; reachability covers them', () => {
    load(flowProject())
    const before = P().logicNodes.map((n) => n.position)
    st().arrangeScenes()
    expect(P().logicNodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true)
    const xs = ['start', 'D', 'E', 'R', 'a'].map((id) => (P().scenes.find((s) => s.id === id) ?? P().logicNodes.find((n) => n.id === id))!.position.x)
    expect([...xs].sort((a, c) => a - c)).toEqual(xs) // left to right along the chain
    st().undo()
    expect(P().logicNodes.map((n) => n.position)).toEqual(before)
    const reach = reachableIds(P())
    for (const id of ['D', 'E', 'R', 'a', 'b', 'end']) expect(reach.has(id)).toBe(true)
    const cut = { ...P(), transitions: P().transitions.filter((t) => t.id !== 'l2') }
    expect(reachableIds(cut).has('E')).toBe(false)
    expect(reachableIds(cut).has('R')).toBe(false)
  })
  it('reroute points on the new connections change nothing in the simulation', () => {
    load(flowProject())
    const plain = simulateRoute(P(), ['l1', 'l2', 'l3', 'la'])
    for (const id of ['l1', 'l2', 'l3', 'la']) st().addWaypoint(id, 0, { x: 9, y: 9 })
    expect(simulateRoute(P(), ['l1', 'l2', 'l3', 'la'])).toEqual(plain)
  })
})

describe('session-only seeded roll', () => {
  const route = (...ids: string[]) => ids.forEach((id) => sim().choose(id))
  it('rolling only previews the outcome; committing appends the transition with rolled provenance', () => {
    load(flowProject())
    route('l1', 'l2', 'l3')
    sim().setSeed('night-1')
    sim().rollOutcome('R', 30)
    const pre = sim().rollPreview!
    expect(pre).toMatchObject({ index: 3, nodeId: 'R', seed: 'night-1' })
    expect(pre).toMatchObject(rollRandom({ seed: 'night-1', nodeId: 'R', index: 3, probabilityA: 30 }))
    expect(sim().choices).toEqual(['l1', 'l2', 'l3']) // not followed until committed
    const tid = pre.outcome === 'a' ? 'la' : 'lb'
    sim().choose(tid, { mode: 'rolled', seed: pre.seed, u: pre.u })
    expect(sim().choices).toEqual(['l1', 'l2', 'l3', tid])
    expect(sim().marks[3]).toMatchObject({ mode: 'rolled', seed: 'night-1' })
    expect(sim().rollPreview).toBeNull()
  })
  it('the same seed and context give the same draw after Back, replay, project edits and a seed round trip', () => {
    load(flowProject())
    route('l1', 'l2', 'l3')
    sim().setSeed('abc')
    sim().rollOutcome('R', 50)
    const first = sim().rollPreview!
    sim().back()
    sim().back()
    route('l2', 'l3')
    sim().rollOutcome('R', 50)
    expect(sim().rollPreview).toEqual(first)
    st().updateLogicNode('E', { title: 'Renamed' })
    sim().rollOutcome('R', 50)
    expect(sim().rollPreview).toEqual(first)
    sim().setSeed('xyz')
    expect(sim().rollPreview).toBeNull()
    sim().setSeed('abc')
    sim().rollOutcome('R', 50)
    expect(sim().rollPreview).toEqual(first)
  })
  it('a committed choice is never rerolled by replay, Back/forward, edits of other nodes or reload of the store state', () => {
    load(flowProject())
    route('l1', 'l2', 'l3')
    sim().choose('lb', { mode: 'manual' })
    const before = simulateRoute(P(), sim().choices)
    st().updateLogicNode('R', { probabilityA: 100 }) // 100 % A: the manual B choice is still honoured
    const after = simulateRoute(P(), sim().choices)
    expect(after.validChoices).toEqual(before.validChoices)
    expect(after.steps[1].sceneId).toBe('b')
    expect(sim().marks[3]).toEqual({ mode: 'manual' })
  })
  it('provenance is truncated by Back, Restart and prune, cleared on project switch, and never reaches the project or storage', () => {
    load(flowProject())
    route('l1', 'l2', 'l3')
    sim().choose('la', { mode: 'rolled', seed: 'abc', u: 0.1 })
    sim().back()
    expect(sim().marks).toEqual({})
    sim().choose('lb', { mode: 'manual' })
    sim().pinRouteA()
    expect(sim().pinned!.marks[3]).toEqual({ mode: 'manual' })
    sim().prune(['l1'], 3)
    expect(sim().marks).toEqual({})
    sim().choose('l2')
    sim().restart()
    expect(sim().marks).toEqual({})
    sim().choose('l1')
    sim().choose('l2')
    sim().choose('l3')
    sim().choose('la', { mode: 'rolled', seed: 'abc', u: 0.1 })
    flushNow()
    const raw = b.data.get(recordKey(st().library.activeId!))!
    expect(raw).not.toMatch(/rolled|abc|marks|seed/)
    expect(JSON.stringify(P())).not.toMatch(/rolled|"seed"/)
    expect(st().past).toHaveLength(0)
    addAndOpen(emptyProject())
    expect(sim().choices).toEqual([])
    expect(sim().marks).toEqual({})
    expect(sim().pinned).toBeNull()
  })
})

describe('older records and recovery', () => {
  it.each([5, 6, 7])('reads a v:%i record and rewrites nothing until the first edit', (v) => {
    const id = st().library.activeId!
    const raw = JSON.stringify({ v, project: branchProject() })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect(P().logicNodes).toHaveLength(1)
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw)
    st().updateLogicNode('if1', { title: 'edited' })
    flushNow()
    expect(rawRecord().v).toBe(8)
  })
  it('writes v:8 records with the new nodes and reads them back', () => {
    load(flowProject())
    flushNow()
    expect(rawRecord().v).toBe(8)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.logicNodes.map((n) => n.type)).toEqual(['delay', 'event', 'random'])
  })
  it('a v:8 record with an inconsistent flow graph is preserved raw and never overwritten', () => {
    const bad = flowProject()
    bad.transitions = bad.transitions.map((t) => (t.id === 'lb' ? { ...t, sourcePort: 'a' as const } : t)) // two connections on output A
    const raw = JSON.stringify({ v: 8, project: bad })
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad8', name: 'Broken flow', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad8'), raw)
    bootLibrary(b)
    expect(st().damaged.bad8.raw).toBe(raw)
    expect(st().damaged.bad8.problems?.length).toBeGreaterThan(0)
    flushNow()
    expect(b.data.get(recordKey('bad8'))).toBe(raw)
  })
})
