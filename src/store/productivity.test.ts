import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { addAndOpen, bootLibrary, flushNow, openProject } from './library'
import { recordKey, readRecord } from '../lib/library'
import { useSaveStatus } from '../lib/persist'
import { emptyProject } from '../lib/factory'
import { sampleProject } from '../lib/sample'
import { validateProject } from '../lib/validate'
import { stateProject } from '../test/stateProject'
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
const rawRecord = () => JSON.parse(b.data.get(recordKey(st().library.activeId!))!) as { v: number; project: Project }
const pts = (id: string) => P().transitions.find((t) => t.id === id)?.waypoints

describe('reroute points', () => {
  it('add / move / remove / clear keep order, ids, endpoints, ports and conditions untouched; each is one undo step', () => {
    load(stateProject())
    const before = P().transitions.find((t) => t.id === 'yes')!
    expect(st().addWaypoint('yes', 0, { x: 10, y: 10 })).toBe(true)
    expect(st().addWaypoint('yes', 1, { x: 30, y: 30 })).toBe(true)
    expect(st().addWaypoint('yes', 1, { x: 20, y: 20 })).toBe(true)
    expect(pts('yes')!.map((p) => p.x)).toEqual([10, 20, 30])
    st().setWaypoints('yes', [{ x: 10, y: 10 }, { x: 25, y: 25 }, { x: 30, y: 30 }])
    expect(pts('yes')![1]).toEqual({ x: 25, y: 25 })
    st().removeWaypoint('yes', 0)
    expect(pts('yes')!.map((p) => p.x)).toEqual([25, 30])
    const t = P().transitions.find((x) => x.id === 'yes')!
    expect({ ...t, waypoints: undefined }).toEqual({ ...before, waypoints: undefined })
    expect(st().past).toHaveLength(5)
    st().clearWaypoints('yes')
    expect(pts('yes')).toBeUndefined()
    expect('waypoints' in P().transitions.find((x) => x.id === 'yes')!).toBe(false)
    st().undo()
    expect(pts('yes')!.map((p) => p.x)).toEqual([25, 30])
    st().undo()
    expect(pts('yes')!.map((p) => p.x)).toEqual([10, 25, 30])
    st().redo()
    expect(pts('yes')!.map((p) => p.x)).toEqual([25, 30])
  })
  it('works on scene, IF and Set Flag connections; the 17th point is refused; no-op writes add no history', () => {
    load(stateProject())
    for (const id of ['a', 'b', 'yes', 'good_end']) expect(st().addWaypoint(id, 0, { x: 1, y: 2 })).toBe(true)
    for (let i = 0; i < 20; i++) st().addWaypoint('a', 0, { x: i, y: i })
    expect(pts('a')).toHaveLength(16)
    expect(st().addWaypoint('a', 0, { x: 0, y: 0 })).toBe(false)
    const hist = st().past.length
    st().setWaypoints('a', pts('a')!)
    st().removeWaypoint('a', 99)
    st().clearWaypoints('good_end')
    st().clearWaypoints('good_end') // second clear is a no-op
    expect(st().past.length).toBe(hist + 1)
    expect(st().addWaypoint('missing', 0, { x: 0, y: 0 })).toBe(false)
  })
  it('updateTransition cannot touch waypoints; validation stays clean', () => {
    load(stateProject())
    st().addWaypoint('a', 0, { x: 5, y: 5 })
    st().updateTransition('a', { label: 'x', ...({ waypoints: [] } as object) })
    expect(pts('a')).toEqual([{ x: 5, y: 5 }])
    expect(validateProject(P()).errors).toEqual([])
  })
  it('single-node moves leave points where they are; batch moves translate the points of internal links; deleting a node removes its links with their points', () => {
    load(stateProject())
    st().addWaypoint('b', 0, { x: 100, y: 100 }) // set1 → if1
    st().addWaypoint('a', 0, { x: 50, y: 50 }) // start → set1 (set1 moves, start does not)
    const pos = (id: string) => [...P().scenes, ...P().logicNodes].find((n) => n.id === id)!.position
    st().moveNodes({ set1: { x: pos('set1').x + 10, y: pos('set1').y } })
    expect(pts('b')).toEqual([{ x: 100, y: 100 }])
    const s = pos('set1')
    const i = pos('if1')
    st().moveNodes({ set1: { x: s.x + 30, y: s.y + 40 }, if1: { x: i.x + 30, y: i.y + 40 } })
    expect(pts('b')).toEqual([{ x: 130, y: 140 }])
    expect(pts('a')).toEqual([{ x: 50, y: 50 }]) // only one end moved
    st().deleteScenes(['set1'])
    expect(P().transitions.some((t) => t.id === 'a' || t.id === 'b')).toBe(false)
  })
  it('Auto Arrange clears points in the same single undo step (undo restores them)', () => {
    load(stateProject())
    st().addWaypoint('a', 0, { x: 5, y: 5 })
    useStore.setState({ past: [], future: [] })
    expect(st().arrangeScenes()).toBe(true)
    expect(P().transitions.every((t) => t.waypoints === undefined)).toBe(true)
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(pts('a')).toEqual([{ x: 5, y: 5 }])
  })
  it('Insert IF keeps the points on the original connection', () => {
    load(stateProject())
    st().addWaypoint('bad_end', 0, { x: 7, y: 7 })
    const n = st().insertBranchOnTransition('bad_end')!
    const t = P().transitions.find((x) => x.id === 'bad_end')!
    expect(t.target).toBe(n)
    expect(t.waypoints).toEqual([{ x: 7, y: 7 }])
  })
  it('points persist in the stored record as schema 7', () => {
    load(stateProject())
    st().addWaypoint('yes', 0, { x: 3, y: 4 })
    flushNow()
    const rec = rawRecord()
    expect(rec.v).toBe(8)
    expect(rec.project.transitions.find((t) => t.id === 'yes')!.waypoints).toEqual([{ x: 3, y: 4 }])
  })
})

describe('multi-selection and batch actions', () => {
  it('selectNodes drives selection: one node = Inspector selection, several = none, no-op when unchanged', () => {
    load(stateProject())
    st().selectNodes(['start'])
    expect(st().selection).toEqual({ type: 'scene', id: 'start' })
    st().selectNodes(['start', 'set1', 'if1'])
    expect(st().selection).toBeNull()
    expect(st().selectedNodeIds).toEqual(['start', 'set1', 'if1'])
    const ref = st().selectedNodeIds
    st().selectNodes(['if1', 'set1', 'start'])
    expect(st().selectedNodeIds).toBe(ref) // unchanged (same set): untouched
    st().selectNodes(['set1'])
    expect(st().selection).toEqual({ type: 'node', id: 'set1' })
    st().select({ type: 'edge', id: 'a' })
    expect(st().selectedNodeIds).toEqual([])
    st().selectNodes([]) // an empty node selection never clears an edge selection
    expect(st().selection).toEqual({ type: 'edge', id: 'a' })
  })
  it('programmatic selection writes keep the node selection in sync', () => {
    load(stateProject())
    st().selectNodes(['start', 'set1'])
    const id = st().addScene('dream', { x: 0, y: 0 })
    expect(st().selectedNodeIds).toEqual([id])
  })
  it('moveNodes: one history step per drag, none for zero movement', () => {
    load(stateProject())
    const p = (id: string) => P().scenes.find((s) => s.id === id)!.position
    const a = p('start')
    const g = p('good')
    st().moveNodes({ start: a, good: g })
    expect(st().past).toHaveLength(0)
    for (let k = 1; k <= 5; k++) st().moveNodes({ start: { x: a.x + k, y: a.y }, good: { x: g.x + k, y: g.y } })
    expect(st().past).toHaveLength(1)
    expect(p('good').x).toBe(g.x + 5)
    st().undo()
    expect(p('start')).toEqual(a)
    expect(p('good')).toEqual(g)
  })
  it('batch delete removes nodes and their connections in ONE undo step and clears stale selection', () => {
    load(stateProject())
    st().selectNodes(['set1', 'if1', 'bad'])
    st().deleteScenes(st().selectedNodeIds)
    expect(P().logicNodes).toEqual([])
    expect(P().scenes.map((s) => s.id)).toEqual(['start', 'good', 'end'])
    expect(P().transitions.map((t) => t.id)).toEqual(['good_end'])
    expect(st().selectedNodeIds).toEqual([])
    expect(st().selection).toBeNull()
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(P().transitions).toHaveLength(6)
    expect(validateProject(P()).errors).toEqual([])
  })
  it('undo/redo drop stale selected ids (reconcile)', () => {
    load(stateProject())
    const id = st().addScene('dream', { x: 0, y: 0 })
    st().selectNodes([id, 'start'])
    st().undo() // the scene no longer exists
    expect(st().selectedNodeIds).toEqual(['start'])
  })
  it('project switching clears selection and clipboard', () => {
    const first = st().library.activeId!
    load(stateProject())
    st().selectNodes(['start', 'set1'])
    st().copySelection()
    expect(st().clipboard).not.toBeNull()
    expect(addAndOpen(emptyProject()).ok).toBe(true)
    expect(st().selectedNodeIds).toEqual([])
    expect(st().clipboard).toBeNull()
    expect(st().paste()).toBeNull()
    openProject(first)
    expect(st().clipboard).toBeNull()
    st().loadProject(sampleProject())
    expect(st().selectedNodeIds).toEqual([])
  })
})

describe('copy, paste and duplicate', () => {
  it('copy/paste is atomic: one undo step, fresh ids, selection moves to the new nodes, repeated pastes cascade', () => {
    load(stateProject())
    st().selectNodes(['set1', 'if1', 'bad', 'good'])
    expect(st().copySelection()).toBe(4)
    expect(P().scenes).toHaveLength(4) // copying changes nothing
    expect(st().past).toHaveLength(0)
    const ids = st().paste()!
    expect(ids).toHaveLength(4)
    expect(st().past).toHaveLength(1)
    expect(P().scenes).toHaveLength(6)
    expect(P().logicNodes).toHaveLength(4)
    expect(P().transitions).toHaveLength(6 + 3) // yes, no, b are internal; a, bad_end, good_end are not
    expect(st().selectedNodeIds.sort()).toEqual([...ids].sort())
    expect(validateProject(P()).errors).toEqual([])
    const second = st().paste()!
    expect(second.some((i) => ids.includes(i))).toBe(false)
    const pos = (id: string) => [...P().scenes, ...P().logicNodes].find((n) => n.id === id)!.position
    expect(pos(second[0]).x).toBeGreaterThan(pos(ids[0]).x) // cascade offset
    st().undo()
    st().undo()
    expect(P().scenes).toHaveLength(4)
    expect(P().logicNodes).toHaveLength(2)
  })
  it('paste at an anchor lands the group top-left there', () => {
    load(stateProject())
    st().selectNodes(['start'])
    st().copySelection()
    const [id] = st().paste({ x: 777, y: 888 })!
    expect(P().scenes.find((s) => s.id === id)!.position).toEqual({ x: 777, y: 888 })
  })
  it('duplicateSelection copies content and internal links in one step without touching the clipboard', () => {
    load(stateProject())
    st().selectNodes(['set1', 'if1'])
    const ids = st().duplicateSelection('(copy)')!
    expect(ids).toHaveLength(2)
    expect(st().past).toHaveLength(1)
    expect(st().clipboard).toBeNull()
    expect(P().transitions.filter((t) => ids.includes(t.source) && ids.includes(t.target))).toHaveLength(1) // set → if
    const copyIf = P().logicNodes.find((n) => ids.includes(n.id) && n.type === 'branch')!
    expect(copyIf.expression).toEqual(P().logicNodes.find((n) => n.id === 'if1')!.expression)
    expect(P().startSceneId).toBe('start')
    expect(st().duplicateSelection()).not.toBeNull()
    st().selectNodes([])
    expect(st().duplicateSelection()).toBeNull()
  })
  it('paste into a project where the copied flag was deleted never leaves a dangling reference', () => {
    load(stateProject())
    st().selectNodes(['set1', 'if1'])
    st().copySelection()
    st().deleteFlag('insulted', { detach: true })
    st().paste()
    expect(validateProject(P()).errors).toEqual([])
    expect(P().logicNodes.filter((n) => n.type === 'setFlag').every((n) => n.flagId === null)).toBe(true)
  })
  it('a failed write keeps pasted edits in memory and succeeds on retry', () => {
    load(stateProject())
    st().selectNodes(['start'])
    st().copySelection()
    b.failWhen = () => true
    st().paste()
    expect(flushNow()).toBe(false)
    expect(useSaveStatus.getState().status).toEqual({ state: 'error', reason: 'full' })
    expect(P().scenes).toHaveLength(5)
    b.failWhen = null
    expect(flushNow()).toBe(true)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.scenes.length).toBe(5)
  })
})
