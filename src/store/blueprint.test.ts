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
import type { Project } from '../lib/schema'

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

describe('connections', () => {
  it('connects scene → IF → scenes with the pin rules and default durations; invalid connections change nothing', () => {
    load({ ...emptyProject(), scenes: [], startSceneId: null })
    const a = st().addScene('reality', { x: 0, y: 0 })
    const c = st().addScene('dream', { x: 400, y: 0 })
    const d = st().addScene('reality', { x: 400, y: 200 })
    const n = st().addLogicNode({ x: 200, y: 100 })
    const into = st().addTransition(a, n)!
    expect(P().transitions.find((t) => t.id === into)).toMatchObject({ source: a, target: n, duration: 1 })
    const yes = st().addTransition(n, c, 'true')!
    const no = st().addTransition(n, d, 'false')!
    expect(P().transitions.filter((t) => t.id === yes || t.id === no).map((t) => [t.sourcePort, t.duration])).toEqual([['true', 0], ['false', 0]])
    const count = P().transitions.length
    const hist = st().past.length
    expect(st().addTransition(n, d, 'true')).toBeNull() // pin already used
    expect(st().addTransition(n, d)).toBeNull() // pin required
    expect(st().addTransition(a, d, 'true')).toBeNull() // pin on a scene
    expect(st().addTransition(a, n)).toBeNull() // duplicate
    expect(st().addTransition(n, n, 'false')).toBeNull()
    expect(P().transitions).toHaveLength(count)
    expect(st().past.length).toBe(hist)
  })
  it('keeps the legacy scene-to-scene rules (no duplicate pair, self-loops allowed)', () => {
    load(sampleProject())
    expect(st().addTransition('s_hall', 's_living')).toBeNull()
    expect(st().addTransition('s_hall', 's_hall')).not.toBeNull()
  })
  it('updateTransition cannot change endpoints or pins; designs cannot be attached to IF links', () => {
    load(branchProject())
    st().updateTransition('into', { label: 'x', ...({ target: 'talk', sourcePort: 'true' } as object) })
    expect(P().transitions.find((t) => t.id === 'into')).toMatchObject({ target: 'if1' })
    expect(st().updateDirection('into', { reveal: 'x' })).toBe(false)
  })
})

describe('creating nodes from a pin', () => {
  it('creates the node and its connection in ONE undo step, and undo removes both', () => {
    load(branchProject())
    const before = JSON.stringify(P())
    const r = st().addNodeFromPin({ fromId: 'talk', position: { x: 900, y: 40 }, node: { type: 'branch' } })!
    expect(P().logicNodes.map((n) => n.id)).toContain(r.nodeId)
    expect(P().transitions.find((t) => t.id === r.transitionId)).toMatchObject({ source: 'talk', target: r.nodeId, duration: 1 })
    expect(st().past.length).toBe(1)
    st().undo()
    expect(JSON.stringify(P())).toBe(before)
    st().redo()
    expect(P().logicNodes).toHaveLength(2)
  })
  it('creates a scene from a branch output pin; refuses (no change) when the pin is taken', () => {
    load(branchProject())
    expect(st().addNodeFromPin({ fromId: 'if1', fromPort: 'true', position: { x: 0, y: 0 }, node: { type: 'scene', kind: 'dream' } })).toBeNull()
    expect(P().scenes).toHaveLength(4)
    st().deleteTransition('yes')
    useStore.setState({ past: [], future: [] })
    const r = st().addNodeFromPin({ fromId: 'if1', fromPort: 'true', position: { x: 10, y: 20 }, node: { type: 'scene', kind: 'nightmare' } })!
    expect(P().scenes.find((s) => s.id === r.nodeId)).toMatchObject({ kind: 'nightmare', position: { x: 10, y: 20 } })
    expect(P().transitions.find((t) => t.id === r.transitionId)).toMatchObject({ source: 'if1', sourcePort: 'true', duration: 0 })
    expect(st().past.length).toBe(1)
  })
  it('creates a custom-type scene with the type defaults', () => {
    load(emptyProject())
    const ty = st().addSceneType('nightmare')
    st().updateSceneType(ty, { name: 'Chase Sequence', description: 'Run.', duration: 45 })
    const start = P().scenes[0].id
    const r = st().addNodeFromPin({ fromId: start, position: { x: 0, y: 0 }, node: { type: 'scene', kind: 'reality', typeId: ty } })!
    expect(P().scenes.find((s) => s.id === r.nodeId)).toMatchObject({ kind: 'nightmare', typeId: ty, title: 'Chase Sequence', description: 'Run.', duration: 45 })
  })
})

describe('insert IF between connection endpoints', () => {
  it('keeps the original connection id, retargets it to the IF and adds IF.TRUE → old target (one undo step)', () => {
    load(branchProject())
    const id = st().insertBranchOnTransition('c_end')!
    const orig = P().transitions.find((t) => t.id === 'c_end')!
    expect(orig).toMatchObject({ source: 'collapse', target: id })
    const out = P().transitions.find((t) => t.source === id)!
    expect(out).toMatchObject({ target: 'end', sourcePort: 'true', duration: 0 })
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().transitions.find((t) => t.id === 'c_end')).toMatchObject({ target: 'end' })
    expect(P().logicNodes).toHaveLength(1)
  })
  it('is refused when the connection carries a transition design', () => {
    load(sampleProject())
    const withDirection = P().transitions.find((t) => t.direction)!
    expect(st().insertBranchOnTransition(withDirection.id)).toBeNull()
    expect(P().logicNodes).toHaveLength(0)
  })
  it('the inserted IF participates in the simulation after the user connects FALSE', () => {
    load(branchProject())
    const id = st().insertBranchOnTransition('c_end')!
    const r = simulateRoute(P(), ['into', 'yes', 'c_end'])
    expect(r.pending?.nodeId).toBe(id)
  })
})

describe('delete, duplicate, undo', () => {
  it('deleting an IF node removes its connections in one undo step and leaves scene data untouched', () => {
    load(branchProject())
    const before = JSON.stringify(P().scenes)
    st().deleteScenes(['if1'])
    expect(P().logicNodes).toHaveLength(0)
    expect(P().transitions.map((t) => t.id)).toEqual(['c_end', 't_end'])
    expect(JSON.stringify(P().scenes)).toBe(before)
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().logicNodes).toHaveLength(1)
    expect(P().transitions).toHaveLength(5)
  })
  it('deleting a connected scene removes its links (including the IF links) in one step', () => {
    load(branchProject())
    st().deleteScenes(['collapse'])
    expect(P().transitions.map((t) => t.id)).toEqual(['into', 'no', 't_end'])
    expect(P().logicNodes).toHaveLength(1)
    st().undo()
    expect(P().transitions).toHaveLength(5)
  })
  it('deleting scenes, nodes and comments together is one step and clears the selection', () => {
    load(branchProject())
    const c = st().addComment({ x: 0, y: 0 })
    st().select({ type: 'comment', id: c })
    st().deleteScenes(['if1', c, 'talk'])
    expect(P().comments).toHaveLength(0)
    expect(st().selection).toBeNull()
    expect(P().transitions.map((t) => t.id)).toEqual(['c_end'])
  })
  it('duplicates scenes (fresh ids, no connections) and IF nodes without links', () => {
    load(sampleProject())
    const id = st().duplicateScene('s_hall', '(copy)')!
    const copy = P().scenes.find((s) => s.id === id)!
    const orig = P().scenes.find((s) => s.id === 's_hall')!
    expect(copy.title).toBe('Apartment Hallway (copy)')
    expect(copy.triggers.map((t) => t.id)).not.toEqual(orig.triggers.map((t) => t.id))
    expect(copy.triggers.map((t) => t.name)).toEqual(orig.triggers.map((t) => t.name))
    expect(copy.shots.length).toBe(orig.shots.length)
    expect(copy.audioCues.map((c) => c.id).some((x) => orig.audioCues.some((o) => o.id === x))).toBe(false)
    expect(P().transitions.some((t) => t.source === id || t.target === id)).toBe(false)
    load(branchProject())
    const n = st().duplicateNode('if1')!
    expect(P().logicNodes.find((x) => x.id === n)).toMatchObject({ condition: 'Did the protagonist insult the villagers?' })
    expect(P().transitions.some((t) => t.source === n || t.target === n)).toBe(false)
  })
  it('moveNode moves scenes, IF nodes and comments; Auto Arrange positions IF nodes', () => {
    load(branchProject())
    const c = st().addComment({ x: 5, y: 5 })
    st().moveNode('if1', { x: 11, y: 22 })
    st().moveNode(c, { x: 33, y: 44 })
    st().moveNode('sq', { x: 55, y: 66 })
    expect(P().logicNodes[0].position).toEqual({ x: 11, y: 22 })
    expect(P().comments[0].position).toEqual({ x: 33, y: 44 })
    expect(P().scenes[0].position).toEqual({ x: 55, y: 66 })
    expect(st().arrangeScenes()).toBe(true)
    expect(P().logicNodes[0].position).not.toEqual({ x: 11, y: 22 })
    expect(P().comments[0].position).toEqual({ x: 33, y: 44 }) // comments are never moved
    expect(st().arrangeScenes()).toBe(false)
  })
})

describe('custom scene types', () => {
  it('lifecycle: create, edit, apply, scene keeps canonical base kind, plain scenes unaffected', () => {
    load(sampleProject())
    const ty = st().addSceneType('dream')
    expect(st().updateSceneType(ty, { name: 'False Awakening', color: '#d98cff', icon: 'Moon', description: 'Wake up. Or not.', duration: 30 })).toBe(true)
    expect(st().updateSceneType(ty, { name: '  ' })).toBe(false)
    expect(st().applySceneType('s_hall', ty)).toBe(true)
    const s = P().scenes.find((x) => x.id === 's_hall')!
    expect(s).toMatchObject({ kind: 'dream', typeId: ty })
    // content stays untouched
    expect(s.title).toBe('Apartment Hallway')
    expect(s.shots.length).toBeGreaterThan(0)
    expect(s.triggers.length).toBeGreaterThan(0)
    // a custom scene is a normal scene: reality/dream crossings follow the base kind
    expect(P().scenes.find((x) => x.id === 's_hall')!.kind).toBe('dream')
    expect(st().applySceneType('s_hall', null, 'reality')).toBe(true)
    expect(P().scenes.find((x) => x.id === 's_hall')).toMatchObject({ kind: 'reality' })
    expect(P().scenes.find((x) => x.id === 's_hall')!.typeId).toBeUndefined()
  })
  it('addScene with a type applies its base kind and defaults', () => {
    load(emptyProject())
    const ty = st().addSceneType('memory')
    st().updateSceneType(ty, { name: 'Ritual Encounter', description: 'Candles.', duration: 80 })
    const id = st().addScene('reality', { x: 0, y: 0 }, ty)
    expect(P().scenes.find((s) => s.id === id)).toMatchObject({ kind: 'memory', typeId: ty, title: 'Ritual Encounter', description: 'Candles.', duration: 80 })
  })
  it('the base kind is immutable while scenes use the type; presentation fields stay editable', () => {
    load(emptyProject())
    const ty = st().addSceneType('reality')
    const sc = st().addScene('reality', { x: 0, y: 0 }, ty)
    expect(st().updateSceneType(ty, { baseKind: 'dream' })).toBe(false)
    expect(P().sceneTypes[0].baseKind).toBe('reality')
    expect(st().updateSceneType(ty, { name: 'Renamed', color: '#9ece6a' })).toBe(true)
    expect(P().scenes.find((s) => s.id === sc)!.typeId).toBe(ty)
    expect(st().deleteSceneType(ty)).toBe('inUse')
    expect(P().sceneTypes).toHaveLength(1)
    st().applySceneType(sc, null)
    expect(st().updateSceneType(ty, { baseKind: 'dream' })).toBe(true)
  })
  it('deleting a referenced type needs an explicit detach: scenes keep their kind, lose only typeId, one undo step', () => {
    load(emptyProject())
    const ty = st().addSceneType('nightmare')
    const sc = st().addScene('reality', { x: 0, y: 0 }, ty)
    useStore.setState({ past: [], future: [] })
    expect(st().deleteSceneType(ty, { detach: true })).toBe('deleted')
    expect(P().sceneTypes).toHaveLength(0)
    expect(P().scenes.find((s) => s.id === sc)).toMatchObject({ kind: 'nightmare' })
    expect(P().scenes.find((s) => s.id === sc)!.typeId).toBeUndefined()
    expect(st().past.length).toBe(1)
    st().undo()
    expect(P().sceneTypes).toHaveLength(1)
    expect(P().scenes.find((s) => s.id === sc)!.typeId).toBe(ty)
    expect(st().deleteSceneType('ghost')).toBe('missing')
  })
  it('changing the kind of a typed scene makes it a plain scene (never a mismatching type)', () => {
    load(emptyProject())
    const ty = st().addSceneType('dream')
    const sc = st().addScene('reality', { x: 0, y: 0 }, ty)
    st().updateScene(sc, { kind: 'nightmare' })
    expect(P().scenes.find((s) => s.id === sc)!.typeId).toBeUndefined()
  })
})

describe('persistence', () => {
  it('survives reload, project switching and duplication; projects are isolated', () => {
    const first = st().library.activeId!
    load(branchProject())
    const ty = st().addSceneType('dream')
    st().addComment({ x: 1, y: 2 })
    flushNow()
    expect(rawRecord().v).toBe(7)
    expect(rawRecord().project.logicNodes).toHaveLength(1)
    const other = addAndOpen(emptyProject())
    expect(other.ok).toBe(true)
    expect([P().logicNodes, P().comments, P().sceneTypes]).toEqual([[], [], []])
    openProject(first)
    expect(P().logicNodes[0].id).toBe('if1')
    expect(P().sceneTypes[0].id).toBe(ty)
    const dup = duplicateProject(first, 'Copy')
    if (dup.ok) {
      openProject(dup.id)
      expect(P().transitions.find((t) => t.id === 'yes')).toMatchObject({ sourcePort: 'true' })
    }
    bootLibrary(b)
    openProject(first)
    expect(P().comments).toHaveLength(1)
  })
  it('failed writes keep edits in memory and succeed on retry', () => {
    b.failWhen = () => true
    st().addLogicNode({ x: 0, y: 0 })
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    expect(P().logicNodes).toHaveLength(1)
    b.failWhen = null
    expect(flushNow()).toBe(true)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.logicNodes.length).toBe(1)
  })
})

describe('older stored data', () => {
  const stripNew = (p: Project) => {
    const { logicNodes, comments, sceneTypes, ...rest } = p
    void logicNodes, void comments, void sceneTypes
    return rest
  }
  it.each([1, 2, 3, 4])('reads a v:%i record without logic data and rewrites nothing until the first edit', (v) => {
    const id = st().library.activeId!
    const raw = JSON.stringify({ v, project: stripNew(sampleProject()) })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect([P().logicNodes, P().comments, P().sceneTypes]).toEqual([[], [], []])
    expect(P().transitions).toHaveLength(sampleProject().transitions.length)
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw)
    st().addLogicNode({ x: 0, y: 0 })
    flushNow()
    expect(rawRecord().v).toBe(7)
  })
  it('migrates the legacy single-project key without modifying it', () => {
    const legacy = JSON.stringify({ state: { project: stripNew(sampleProject()), timelineSceneId: 's_bed' }, version: 0 })
    const mem = memoryBackend({ [STORAGE_KEY]: legacy })
    bootLibrary(mem)
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    st().addLogicNode({ x: 0, y: 0 })
    flushNow()
    expect(mem.data.get(STORAGE_KEY)).toBe(legacy)
    expect(JSON.parse(mem.data.get(recordKey(st().library.activeId!))!).v).toBe(7)
  })
  it('treats a malformed v:6 record as damaged: raw preserved, never overwritten', () => {
    const bad = { v: 6, project: { ...structuredClone(branchProject()) } } as { v: number; project: Project }
    ;(bad.project.logicNodes[0] as { type: string }).type = 'and'
    const raw = JSON.stringify(bad)
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad1', name: 'Broken IF', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad1'), raw)
    bootLibrary(b)
    expect(st().damaged.bad1).toEqual({ raw })
    expect(openProject('bad1')).toEqual({ ok: false, error: { code: 'damaged' } })
    flushNow()
    expect(b.data.get(recordKey('bad1'))).toBe(raw)
  })
})
