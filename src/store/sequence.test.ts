import { beforeEach, describe, expect, it } from 'vitest'
import { memoryBackend, type MemoryBackend } from '../test/memoryBackend'
import { useStore } from './useStore'
import { useSim } from './simulator'
import { bootLibrary, flushNow } from './library'
import { LIBRARY_KEY, parseIndex, readRecord, recordKey } from '../lib/library'
import { emptyProject } from '../lib/factory'
import { simulateRoute } from '../lib/simulate'
import { reachableIds, analyze } from '../lib/graph'
import { validateProject } from '../lib/validate'
import { FULL, seqProject } from '../test/seqProject'
import { branchProject } from '../test/branchProject'
import type { Project } from '../lib/schema'

const st = () => useStore.getState()
const P = () => st().project
let b: MemoryBackend
beforeEach(() => {
  b = memoryBackend()
  bootLibrary(b)
  useSim.getState().reset()
})
const load = (p: Project) => {
  st().loadProject(p)
  useStore.setState({ past: [], future: [] })
}
const rawRecord = () => JSON.parse(b.data.get(recordKey(st().library.activeId!))!) as { v: number; project: Project }
const byType = (type: string) => P().logicNodes.filter((n) => n.type === type)

describe('creating the Sequence graph in the store', () => {
  it('drag-to-create from the Then pins builds a valid, owned stage; one undo step each', () => {
    load(emptyProject())
    const start = st().addScene('reality', { x: 0, y: 0 })
    const q = st().addLogicNode({ x: 100, y: 0 }, 'sequence')
    expect(q.split('_')[0]).toBe('seq')
    expect(st().addTransition(start, q)).toBeTruthy()
    const ev = st().addNodeFromPin({ fromId: q, fromPort: 'then0', position: { x: 200, y: 0 }, node: { type: 'event' } })
    const ret0 = st().addNodeFromPin({ fromId: ev!.nodeId, position: { x: 300, y: 0 }, node: { type: 'seqReturn' } })
    expect(ret0).not.toBeNull()
    expect(P().logicNodes.find((n) => n.id === ret0!.nodeId)).toMatchObject({ type: 'seqReturn', sequenceId: q, stage: 0 })
    const ret1 = st().addNodeFromPin({ fromId: q, fromPort: 'then1', position: { x: 300, y: 100 }, node: { type: 'seqReturn' } })
    expect(P().logicNodes.find((n) => n.id === ret1!.nodeId)).toMatchObject({ sequenceId: q, stage: 1 })
    // from Completed a Return is refused (it can only close a stage) and nothing is created
    const count = P().logicNodes.length
    expect(st().addNodeFromPin({ fromId: q, fromPort: 'completed', position: { x: 300, y: 200 }, node: { type: 'seqReturn' } })).toBeNull()
    expect(P().logicNodes).toHaveLength(count)
    expect(validateProject(P()).errors).toEqual([])
    expect(st().past).toHaveLength(6)
  })
  it('refuses forbidden targets from a stage, and unassigned or wrong Returns, with nothing changed', () => {
    load(seqProject())
    const before = JSON.stringify(P())
    expect(st().addNodeFromPin({ fromId: 'E0', position: { x: 0, y: 0 }, node: { type: 'scene', kind: 'reality' } })).toBeNull() // E0 already has its output
    expect(st().addTransition('S1', 'door')).toBeNull()
    expect(st().addTransition('Q', 'door', 'then0')).toBeNull()
    expect(st().addTransition('R0', 'door')).toBeNull()
    expect(JSON.stringify(P())).toBe(before)
    expect(st().past).toHaveLength(0)
  })
  it('updateLogicNode keeps the Return stage in range', () => {
    load(seqProject())
    st().updateLogicNode('R0', { stage: 7 })
    expect(P().logicNodes.find((n) => n.id === 'R0')!.stage).toBe(1)
    st().updateLogicNode('R0', { stage: -3 })
    expect(P().logicNodes.find((n) => n.id === 'R0')!.stage).toBe(0)
  })
})

describe('copy, paste, duplicate with ownership', () => {
  it('copying the complete Sequence subgraph remaps owners, stages and links; paste is valid and undoes in one step', () => {
    load(seqProject())
    const ids = ['Q', 'E0', 'R0', 'D1', 'S1', 'R1']
    st().selectNodes(ids)
    expect(st().copySelection()).toBe(6)
    expect(st().paste({ x: 900, y: 900 })).toBeTruthy()
    const q2 = byType('sequence')[1]
    const rets = byType('seqReturn').slice(2)
    expect(q2.id).not.toBe('Q')
    expect(rets.map((r) => [r.sequenceId, r.stage])).toEqual([[q2.id, 0], [q2.id, 1]])
    expect(P().logicNodes.filter((n) => n.type !== 'sequence').map((n) => n.id).slice(6).every((id) => !ids.includes(id))).toBe(true)
    expect(validateProject(P()).errors).toEqual([])
    // the pasted copy is a complete, working Sequence (Completed is not copied: its target scene was not selected)
    const tlinks = P().transitions.filter((t) => t.source === q2.id)
    expect(tlinks.map((t) => t.sourcePort).sort()).toEqual(['then0', 'then1'])
    st().undo()
    expect(byType('sequence')).toHaveLength(1)
    expect(P().transitions).toHaveLength(8)
  })
  it('a partial copy never produces a dangling owner: the Return becomes unassigned', () => {
    load(seqProject())
    st().selectNodes(['E0', 'R0'])
    st().copySelection()
    st().paste({ x: 500, y: 500 })
    const pasted = byType('seqReturn').find((n) => n.id !== 'R0' && n.id !== 'R1')!
    expect(pasted.sequenceId).toBeNull()
    expect(pasted.stage).toBe(0)
    expect(validateProject(P()).errors).toEqual([])
    // only the Sequence: no Returns, no dangling references either
    st().selectNodes(['Q'])
    st().duplicateSelection('')
    expect(validateProject(P()).errors).toEqual([])
    expect(byType('sequence')).toHaveLength(2)
  })
  it('duplicating a single Return keeps its (valid) owner reference', () => {
    load(seqProject())
    const id = st().duplicateNode('R0')!
    expect(P().logicNodes.find((n) => n.id === id)).toMatchObject({ sequenceId: 'Q', stage: 0 })
    expect(validateProject(P()).errors).toEqual([])
  })
})

describe('delete, undo, arrange, analysis', () => {
  it('deleting a Sequence detaches its Returns (never a dangling owner) in the same undo step', () => {
    load(seqProject())
    st().deleteScenes(['Q'])
    expect(byType('sequence')).toHaveLength(0)
    expect(byType('seqReturn').map((n) => n.sequenceId)).toEqual([null, null])
    expect(validateProject(P()).errors).toEqual([])
    st().undo()
    expect(byType('seqReturn').map((n) => n.sequenceId)).toEqual(['Q', 'Q'])
    expect(P().transitions).toHaveLength(8)
  })
  it('batch delete of stage nodes leaves valid, visibly incomplete authoring', () => {
    load(seqProject())
    st().deleteScenes(['E0', 'D1'])
    const v = validateProject(P())
    expect(v.errors).toEqual([])
    expect(v.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['diag.seqOpenOutput']))
    st().undo()
    expect(P().logicNodes).toHaveLength(6)
  })
  it('Auto Arrange places Sequence stages left to right and is undoable', () => {
    load(seqProject())
    const before = P().logicNodes.map((n) => n.position)
    st().arrangeScenes()
    const x = (id: string) => (P().scenes.find((s) => s.id === id) ?? P().logicNodes.find((n) => n.id === id))!.position.x
    expect(x('start')).toBeLessThan(x('Q'))
    expect(x('Q')).toBeLessThan(x('E0'))
    expect(x('E0')).toBeLessThan(x('R0'))
    expect(x('Q')).toBeLessThan(x('door'))
    st().undo()
    expect(P().logicNodes.map((n) => n.position)).toEqual(before)
  })
  it('reachability and analysis understand valid Sequence paths: no false dead ends or unreachable scenes', () => {
    const p = seqProject()
    const reach = reachableIds(p)
    for (const id of ['Q', 'E0', 'R0', 'D1', 'S1', 'R1', 'door', 'end']) expect(reach.has(id)).toBe(true)
    const a = analyze(p)
    expect(a.issues.filter((i) => i.severity !== 'info').map((i) => i.diagnostic.code)).toEqual([])
    expect(a.stats.sequences).toBe(1)
    // a real problem is still reported: Completed not connected leaves the Door and End unreachable
    const cut = { ...p, transitions: p.transitions.filter((t) => t.id !== 'done') }
    expect(analyze(cut).issues.map((i) => i.diagnostic.code)).toEqual(expect.arrayContaining(['diag.unreachable', 'diag.seqOpenOutput']))
  })
  it('reroute points on Sequence connections change nothing in the simulation', () => {
    load(seqProject())
    const plain = simulateRoute(P(), FULL)
    for (const id of FULL) st().addWaypoint(id, 0, { x: 5, y: 5 })
    expect(simulateRoute(P(), FULL)).toEqual(plain)
  })
})

describe('storage', () => {
  it.each([5, 6, 7, 8])('reads a v:%i record and rewrites nothing until the first edit', (v) => {
    const id = st().library.activeId!
    const raw = JSON.stringify({ v, project: branchProject() })
    b.data.set(recordKey(id), raw)
    bootLibrary(b)
    expect(flushNow()).toBe(true)
    expect(b.data.get(recordKey(id))).toBe(raw)
    st().updateLogicNode('if1', { title: 'edited' })
    flushNow()
    expect(rawRecord().v).toBe(9)
  })
  it('writes v:9 with the Sequence nodes and reads them back; session route state never reaches storage', () => {
    load(seqProject())
    useSim.getState().choose('in')
    flushNow()
    expect(rawRecord().v).toBe(9)
    const r = readRecord(b, st().library.activeId!)
    expect(r.ok && r.project.logicNodes.map((n) => n.type)).toEqual(['sequence', 'event', 'seqReturn', 'delay', 'setFlag', 'seqReturn'])
    expect(b.data.get(recordKey(st().library.activeId!))).not.toMatch(/stageEnter|rollPreview|marks/)
  })
  it('an inconsistent v:9 Sequence record is preserved raw and never overwritten', () => {
    const bad = seqProject()
    bad.logicNodes = bad.logicNodes.map((n) => (n.id === 'R1' ? { ...n, sequenceId: 'ghost' } : n))
    const raw = JSON.stringify({ v: 9, project: bad })
    const index = parseIndex(b.data.get(LIBRARY_KEY)!)!
    index.projects.push({ id: 'bad9', name: 'Broken sequence', createdAt: 1, updatedAt: 1 })
    b.data.set(LIBRARY_KEY, JSON.stringify(index))
    b.data.set(recordKey('bad9'), raw)
    bootLibrary(b)
    expect(st().damaged.bad9.raw).toBe(raw)
    expect(st().damaged.bad9.problems?.length).toBeGreaterThan(0)
    flushNow()
    expect(b.data.get(recordKey('bad9'))).toBe(raw)
  })
})
