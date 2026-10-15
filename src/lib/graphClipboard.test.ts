import { describe, expect, it } from 'vitest'
import { copyGraph, pasteGraph } from './graphClipboard'
import { sampleProject } from './sample'
import { validateProject } from './validate'
import { branchProject } from '../test/branchProject'
import { check, stateProject } from '../test/stateProject'
import type { Project } from './schema'

/** Applies a paste result to a project the way the store does. */
const apply = (p: Project, r: ReturnType<typeof pasteGraph>): Project => ({
  ...p,
  scenes: [...p.scenes, ...r.scenes],
  logicNodes: [...p.logicNodes, ...r.logicNodes],
  comments: [...p.comments, ...r.comments],
  transitions: [...p.transitions, ...r.transitions],
})
const allIds = (p: Project) => [...p.scenes, ...p.logicNodes, ...p.comments].map((n) => n.id)

describe('copyGraph', () => {
  it('includes only connections whose both ends are copied; nothing when no node matches', () => {
    const p = stateProject()
    const c = copyGraph(p, ['start', 'set1'])!
    expect(c.transitions.map((t) => t.id)).toEqual(['a'])
    expect(copyGraph(p, ['nope'])).toBeNull()
    const all = copyGraph(p, allIds(p))!
    expect(all.transitions).toHaveLength(p.transitions.length)
  })
  it('is a deep copy', () => {
    const p = stateProject()
    const c = copyGraph(p, ['start'])!
    c.scenes[0].title = 'changed'
    expect(p.scenes[0].title).toBe('Start')
  })
})

describe('pasteGraph', () => {
  it('creates fresh ids everywhere and keeps the project consistent (sample project, every scene)', () => {
    const p = sampleProject()
    const data = copyGraph(p, allIds(p))!
    const r = pasteGraph(p, data, { x: 2000, y: 100 })
    const next = apply(p, r)
    expect(new Set(allIds(next)).size).toBe(allIds(next).length)
    const ids = (x: Project) => [...x.scenes.flatMap((s) => [...s.triggers.map((t) => t.id), ...s.shots.map((q) => q.id), ...s.audioCues.map((c) => c.id)]), ...x.transitions.map((t) => t.id)]
    expect(new Set(ids(next)).size).toBe(ids(next).length)
    expect(validateProject(next).errors).toEqual([])
    expect(next.startSceneId).toBe(p.startSceneId) // pasted scenes never take over the start
    expect(r.transitions).toHaveLength(p.transitions.length)
  })
  it('remaps shot-linked transition directions to the new scenes’ shots', () => {
    const p = sampleProject()
    const linked = p.transitions.filter((t) => t.direction?.sourceShotId || t.direction?.targetShotId)
    expect(linked.length).toBeGreaterThan(0)
    const r = pasteGraph(p, copyGraph(p, allIds(p))!, { x: 3000, y: 0 })
    const oldShots = new Set(p.scenes.flatMap((s) => s.shots.map((x) => x.id)))
    for (const t of r.transitions) {
      const src = r.scenes.find((s) => s.id === t.source)!
      const dst = r.scenes.find((s) => s.id === t.target)!
      if (t.direction?.sourceShotId) {
        expect(oldShots.has(t.direction.sourceShotId)).toBe(false)
        expect(src.shots.some((x) => x.id === t.direction!.sourceShotId)).toBe(true)
      }
      if (t.direction?.targetShotId) expect(dst.shots.some((x) => x.id === t.direction!.targetShotId)).toBe(true)
    }
  })
  it('keeps scene content (triggers, shots, audio cues, character states, custom type) and drops a type that no longer exists', () => {
    const p = sampleProject()
    const withType = { ...p, sceneTypes: [{ id: 'ty', name: 'T', color: '#c4263d' as const, icon: 'Skull' as const, baseKind: p.scenes[0].kind, description: '' }], scenes: p.scenes.map((s, i) => (i === 0 ? { ...s, typeId: 'ty' } : s)) }
    const data = copyGraph(withType, [withType.scenes[0].id])!
    const keep = pasteGraph(withType, data, { x: 0, y: 0 }).scenes[0]
    expect(keep).toMatchObject({ typeId: 'ty', title: withType.scenes[0].title })
    expect(keep.triggers.map((t) => [t.name, t.time])).toEqual(withType.scenes[0].triggers.map((t) => [t.name, t.time]))
    expect(keep.characterStates).toEqual(withType.scenes[0].characterStates)
    const gone = pasteGraph({ ...withType, sceneTypes: [] }, data, { x: 0, y: 0 }).scenes[0]
    expect(gone.typeId).toBeUndefined()
  })
  it('preserves Branch TRUE/FALSE ports and condition text, and offsets waypoints with the group', () => {
    const p = branchProject()
    p.transitions = p.transitions.map((t) => (t.id === 'yes' ? { ...t, waypoints: [{ x: 100, y: 100 }] } : t))
    p.scenes = p.scenes.map((s, i) => ({ ...s, position: { x: i * 10, y: 0 } }))
    p.logicNodes = p.logicNodes.map((n) => ({ ...n, position: { x: 5, y: 5 } }))
    const data = copyGraph(p, allIds(p))!
    const r = pasteGraph(p, data, { x: 500, y: 700 })
    expect(r.transitions.map((t) => t.sourcePort).sort()).toEqual([...p.transitions.map((t) => t.sourcePort)].sort())
    const ifNew = r.logicNodes[0]
    expect(r.transitions.filter((t) => t.source === ifNew.id).map((t) => t.sourcePort).sort()).toEqual(['false', 'true'])
    expect(ifNew.condition).toBe(p.logicNodes[0].condition)
    expect(Math.min(...[...r.scenes, ...r.logicNodes].map((n) => n.position.x))).toBe(500)
    const yes = r.transitions.find((t) => t.sourcePort === 'true')!
    expect(yes.waypoints).toEqual([{ x: 600, y: 800 }])
    expect(validateProject(apply(p, r)).errors).toEqual([])
  })
  it('keeps Set Flag assignments and structured conditions valid; a deleted flag detaches safely', () => {
    const p = stateProject({ op: 'and', args: [check('insulted'), check('ritual', false)] })
    const data = copyGraph(p, allIds(p))!
    const ok = pasteGraph(p, data, { x: 0, y: 900 })
    expect(ok.logicNodes.find((n) => n.type === 'setFlag')).toMatchObject({ flagId: 'insulted', value: true })
    expect(validateProject(apply(p, ok)).errors).toEqual([])
    const target = { ...p, flags: p.flags.filter((f) => f.id !== 'insulted') }
    const r = pasteGraph(target, data, { x: 0, y: 900 })
    expect(r.logicNodes.find((n) => n.type === 'setFlag')!.flagId).toBeNull()
    expect(r.logicNodes.find((n) => n.type === 'branch')!.expression).toEqual(check('ritual', false))
    const onlyDeleted = pasteGraph({ ...p, flags: [] }, copyGraph(stateProject(), ['if1'])!, { x: 0, y: 0 })
    expect('expression' in onlyDeleted.logicNodes[0]).toBe(false)
    expect(validateProject({ ...apply({ ...p, flags: [] }, onlyDeleted), logicNodes: onlyDeleted.logicNodes, scenes: [], transitions: [] }).errors.map((e) => e.code)).not.toContain('diag.flagMissing')
  })
  it('appends the duplicate suffix to scene titles only', () => {
    const p = stateProject()
    const r = pasteGraph(p, copyGraph(p, ['start', 'set1'])!, { x: 0, y: 0 }, '(copy)')
    expect(r.scenes[0].title).toBe('Start (copy)')
    expect(r.logicNodes[0].title).toBe(p.logicNodes[0].title)
  })
  it('a self-loop of a copied scene stays a self-loop on the copy', () => {
    const p = sampleProject()
    const loop = p.transitions.find((t) => t.source === t.target)!
    const r = pasteGraph(p, copyGraph(p, [loop.source])!, { x: 0, y: 0 })
    expect(r.transitions).toHaveLength(1)
    expect(r.transitions[0].source).toBe(r.transitions[0].target)
    expect(r.transitions[0].source).toBe(r.scenes[0].id)
  })
})
