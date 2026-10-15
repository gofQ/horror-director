import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, duplicateProject, flushNow, openProject } from './library'
import { LIBRARY_KEY, parseIndex, readRecord, recordKey } from '../lib/library'
import { STORAGE_KEY, useSaveStatus } from '../lib/persist'
import { emptyProject } from '../lib/factory'
import { sampleProject } from '../lib/sample'
import { simulateRoute } from '../lib/simulate'
import { branchProject } from '../test/branchProject'
import { check, stateProject } from '../test/stateProject'
import type { Expr, Project } from '../lib/schema'

const st = () => useStore.getState()
const P = () => st().project
let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
})
const load = (p: Project) => {
  st().loadProject(p)
  useStore.setState({ past: [], future: [] })
}
const rawRecord = (id = st().library.activeId!) => JSON.parse(b.data.get(recordKey(id))!) as { v: number; project: Project }

describe('flag CRUD', () => {
  it('adds flags with unique default names and stable ids; one undo step each', () => {
    load(emptyProject())
    const a = st().addFlag()
    const c = st().addFlag()
    expect(P().flags.map((f) => f.name)).toEqual(['New flag', 'New flag 2'])
    expect(P().flags.every((f) => f.defaultValue === false)).toBe(true)
    expect(new Set([a, c]).size).toBe(2)
    st().undo()
    expect(P().flags).toHaveLength(1)
    expect(st().addFlag('  Truth ')).toBeTruthy()
    expect(P().flags.at(-1)!.name).toBe('Truth')
  })
  it('renames keep every reference (ids), reject empty and duplicate names, and edit defaults', () => {
    load(stateProject())
    expect(st().updateFlag('insulted', { name: 'Renamed' })).toBe(true)
    expect(P().flags[0].name).toBe('Renamed')
    expect(P().logicNodes.find((n) => n.id === 'set1')!.flagId).toBe('insulted')
    expect(simulateRoute(P(), ['a', 'b']).pending!.evaluated).toBe(true) // still wired
    expect(st().updateFlag('insulted', { name: '   ' })).toBe(false)
    expect(st().updateFlag('insulted', { name: ' ritualcompleted ' })).toBe(false)
    expect(P().flags[0].name).toBe('Renamed')
    expect(st().updateFlag('ritual', { defaultValue: false, description: 'd' })).toBe(true)
    expect(P().flags[1]).toMatchObject({ defaultValue: false, description: 'd' })
    expect(st().updateFlag('nope', { name: 'x' })).toBe(false)
  })
  it('coalesces typing into one undo step', () => {
    load(stateProject())
    for (const n of ['A', 'Ab', 'Abc']) st().updateFlag('insulted', { name: n })
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().flags[0].name).toBe('VillagerWasInsulted')
  })
})

describe('flag deletion safety', () => {
  it('an unused flag is deleted at once', () => {
    load(stateProject())
    st().addFlag('Spare')
    const id = P().flags.at(-1)!.id
    expect(st().deleteFlag(id)).toBe('deleted')
    expect(P().flags.map((f) => f.id)).toEqual(['insulted', 'ritual'])
  })
  it('a referenced flag is refused (nothing changes) unless references are detached', () => {
    load(stateProject({ op: 'and', args: [check('insulted'), check('ritual')] }))
    const snapshot = JSON.stringify(P())
    expect(st().deleteFlag('insulted')).toBe('inUse')
    expect(JSON.stringify(P())).toBe(snapshot)
    expect(st().past.length).toBe(0)
    expect(st().deleteFlag('missing')).toBe('missing')
  })
  it('detach clears Set Flag assignments and removes the checks, in ONE undo step; no dangling reference remains', () => {
    load(stateProject({ op: 'and', args: [check('insulted'), check('ritual')] }))
    expect(st().deleteFlag('insulted', { detach: true })).toBe('deleted')
    expect(P().flags.map((f) => f.id)).toEqual(['ritual'])
    expect(P().logicNodes.find((n) => n.id === 'set1')).toMatchObject({ flagId: null })
    expect(P().logicNodes.find((n) => n.id === 'if1')!.expression).toEqual(check('ritual')) // group collapsed
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().flags).toHaveLength(2)
    expect(P().logicNodes.find((n) => n.id === 'set1')!.flagId).toBe('insulted')
    expect(P().logicNodes.find((n) => n.id === 'if1')!.expression).toEqual({ op: 'and', args: [check('insulted'), check('ritual')] })
  })
  it('when the only check is removed the IF falls back to manual choice (no expression key)', () => {
    load(stateProject())
    st().deleteFlag('insulted', { detach: true })
    const n = P().logicNodes.find((x) => x.id === 'if1')!
    expect('expression' in n).toBe(false)
    expect(n.condition).toBe('free text that must never be evaluated')
  })
})

describe('Set Flag nodes in the store', () => {
  it('addLogicNode creates an unassigned Set Flag; updateLogicNode assigns a flag and value', () => {
    load(stateProject())
    const id = st().addLogicNode({ x: 5, y: 6 }, 'setFlag')
    const n = P().logicNodes.find((x) => x.id === id)!
    expect(n).toMatchObject({ type: 'setFlag', flagId: null, value: true, title: 'Set flag' })
    st().updateLogicNode(id, { flagId: 'ritual', value: false })
    expect(P().logicNodes.find((x) => x.id === id)).toMatchObject({ flagId: 'ritual', value: false })
  })
  it('creates a Set Flag from an output pin in ONE undo step (scene output and IF output)', () => {
    load(stateProject())
    const r = st().addNodeFromPin({ fromId: 'good', position: { x: 10, y: 10 }, node: { type: 'setFlag' } })!
    expect(P().transitions.find((t) => t.id === r.transitionId)).toMatchObject({ source: 'good', target: r.nodeId, duration: 1 })
    expect(P().logicNodes.find((n) => n.id === r.nodeId)!.type).toBe('setFlag')
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().logicNodes.map((n) => n.id)).toEqual(['set1', 'if1'])
    expect(st().addNodeFromPin({ fromId: 'if1', fromPort: 'true', position: { x: 0, y: 0 }, node: { type: 'setFlag' } })).toBeNull() // pin taken
    expect(st().addNodeFromPin({ fromId: 'set1', position: { x: 0, y: 0 }, node: { type: 'setFlag' } })).toBeNull() // single output used
    expect(P().logicNodes).toHaveLength(2)
  })
  it('connection validation: a Set Flag only accepts one output, no pin', () => {
    load(stateProject())
    expect(st().addTransition('set1', 'good')).toBeNull()
    expect(st().addTransition('good', 'set1')).not.toBeNull()
    st().deleteTransition('b')
    expect(st().addTransition('set1', 'if1', 'true')).toBeNull()
    const id = st().addTransition('set1', 'good')!
    expect(P().transitions.find((t) => t.id === id)).toMatchObject({ duration: 0 })
    expect(P().transitions.find((t) => t.id === id)!.sourcePort).toBeUndefined()
  })
  it('duplicate copies assignment with a fresh id (no connections); delete removes its links in one step', () => {
    load(stateProject())
    const copy = st().duplicateNode('set1')!
    expect(copy).not.toBe('set1')
    expect(P().logicNodes.find((n) => n.id === copy)).toMatchObject({ type: 'setFlag', flagId: 'insulted', value: true })
    expect(P().transitions.some((t) => t.source === copy || t.target === copy)).toBe(false)
    const dupIf = st().duplicateNode('if1')!
    const e = P().logicNodes.find((n) => n.id === dupIf)!.expression as Expr
    expect(e).toEqual(check('insulted'))
    useStore.setState({ past: [], future: [] })
    st().deleteScenes(['set1'])
    expect(P().transitions.some((t) => t.source === 'set1' || t.target === 'set1')).toBe(false)
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().transitions.filter((t) => t.source === 'set1' || t.target === 'set1')).toHaveLength(2)
  })
  it('insertBranchOnTransition works on a link leaving a Set Flag', () => {
    load(stateProject())
    const n = st().insertBranchOnTransition('b')!
    expect(P().transitions.find((t) => t.id === 'b')).toMatchObject({ source: 'set1', target: n })
  })
  it('auto arrange positions Set Flag nodes as one undo step', () => {
    load(stateProject())
    expect(st().arrangeScenes()).toBe(true)
    const pos = P().logicNodes.find((n) => n.id === 'set1')!.position
    const start = P().scenes.find((s) => s.id === 'start')!.position
    expect(pos.x).toBeGreaterThan(start.x)
    expect(st().past.length).toBe(1)
    expect(st().arrangeScenes()).toBe(false)
  })
  it('simulator state never reaches project data or history', () => {
    load(stateProject())
    const before = JSON.stringify(P())
    simulateRoute(P(), ['a', 'b', 'yes'])
    expect(JSON.stringify(P())).toBe(before)
    expect(st().past.length).toBe(0)
  })
})

describe('persistence', () => {
  it('writes v6 records; flags, Set Flag nodes and conditions survive reload, switching and duplication', () => {
    const first = st().library.activeId!
    load(stateProject())
    st().addFlag('Extra')
    flushNow()
    expect(rawRecord().v).toBe(6)
    expect(rawRecord().project.flags).toHaveLength(3)
    const other = addAndOpen(emptyProject())
    expect(other.ok).toBe(true)
    expect(P().flags).toEqual([])
    openProject(first)
    const dup = duplicateProject(first, 'Copy')
    if (dup.ok) {
      openProject(dup.id)
      expect(P().logicNodes.find((n) => n.id === 'if1')!.expression).toEqual(check('insulted'))
    }
    bootLibrary(b)
    openProject(first)
    expect(P().flags.map((f) => f.name)).toEqual(['VillagerWasInsulted', 'RitualCompleted', 'Extra'])
    expect(P().logicNodes.find((n) => n.id === 'set1')).toMatchObject({ flagId: 'insulted', value: true })
  })
  it('failed writes keep edits in memory and succeed on retry', () => {
    b.failWhen = () => true
    st().addFlag('Kept')
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    expect(P().flags).toHaveLength(1)
    b.failWhen = null
    expect(flushNow()).toBe(true)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.flags.map((f) => f.name)).toEqual(['Kept'])
  })
})

describe('older stored data', () => {
  const strip = (p: Project) => {
    const { flags, ...rest } = p
    void flags
    return rest
  }
  it.each([1, 2, 3, 4, 5])('reads a v:%i record without flags and rewrites nothing until the first edit', (v) => {
    const id = st().library.activeId!
    const base = v === 5 ? branchProject() : sampleProject()
    const raw = JSON.stringify({ v, project: strip(base) })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect(P().flags).toEqual([])
    expect(P().transitions).toHaveLength(base.transitions.length)
    expect(P().logicNodes).toEqual(base.logicNodes)
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw)
    st().addFlag()
    flushNow()
    expect(rawRecord().v).toBe(6)
  })
  it('migrates the legacy single-project key without modifying it', () => {
    const legacy = JSON.stringify({ state: { project: strip(sampleProject()), timelineSceneId: 's_bed' }, version: 0 })
    const mem = memoryBackend({ [STORAGE_KEY]: legacy })
    bootLibrary(mem)
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    st().addFlag()
    flushNow()
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    expect(JSON.parse(mem.data.get(recordKey(st().library.activeId!))!).v).toBe(6)
  })
  it('a malformed v:6 record (bad expression) is damaged: raw preserved, never overwritten', () => {
    const bad = { v: 6, project: structuredClone(stateProject()) } as { v: number; project: Project }
    ;(bad.project.logicNodes[1] as { expression: unknown }).expression = { op: 'eval', code: '1' }
    const raw = JSON.stringify(bad)
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad1', name: 'Broken', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad1'), raw)
    bootLibrary(b)
    expect(st().damaged.bad1).toEqual({ raw })
    expect(openProject('bad1')).toEqual({ ok: false, error: { code: 'damaged' } })
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
  })
})
