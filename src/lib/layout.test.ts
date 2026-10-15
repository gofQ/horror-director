import { describe, expect, it } from 'vitest'
import { computeLayout, NODE_H, NODE_W, PITCH_X, type Positions } from './layout'
import { sampleProject } from './sample'
import { newScene, newTransition } from './factory'
import type { Project, Scene, SceneKind } from './schema'

const scene = (id: string, kind: SceneKind = 'reality'): Scene => ({ ...newScene(kind), id, title: id })
const edge = (s: string, t: string) => ({ ...newTransition(s, t), id: `${s}>${t}` })
const graph = (ids: string[], edges: [string, string][], opts: { start?: string | null; kinds?: Record<string, SceneKind> } = {}): Project => ({
  name: 'g',
  description: '',
  startSceneId: opts.start === undefined ? (ids[0] ?? null) : opts.start,
  scenes: ids.map((id) => scene(id, opts.kinds?.[id])),
  transitions: edges.map(([s, t]) => edge(s, t)),
  logicNodes: [], comments: [], sceneTypes: [], flags: [], characters: [],
})

const overlaps = (pos: Positions) => {
  const ids = Object.keys(pos)
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos[ids[i]]
      const b = pos[ids[j]]
      if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) return [ids[i], ids[j]]
    }
  return null
}

describe('computeLayout', () => {
  it('is deterministic and idempotent (positions are never an input)', () => {
    const p = sampleProject()
    const a = computeLayout(p)
    expect(computeLayout(p)).toEqual(a)
    const moved: Project = { ...p, scenes: p.scenes.map((s, i) => ({ ...s, position: { x: i * 7, y: -i * 13 } })) }
    expect(computeLayout(moved)).toEqual(a)
    const arranged: Project = { ...p, scenes: p.scenes.map((s) => ({ ...s, position: a[s.id] })) }
    expect(computeLayout(arranged)).toEqual(a)
  })

  it('places every scene exactly once, with integer coordinates and no overlaps', () => {
    const p = sampleProject()
    const pos = computeLayout(p)
    expect(Object.keys(pos).sort()).toEqual(p.scenes.map((s) => s.id).sort())
    for (const v of Object.values(pos)) {
      expect(Number.isInteger(v.x) && Number.isInteger(v.y)).toBe(true)
    }
    expect(overlaps(pos)).toBeNull()
  })

  it('lays a DAG out left to right with branching and merging', () => {
    const p = graph(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e']])
    const pos = computeLayout(p)
    for (const t of p.transitions) expect(pos[t.source].x).toBeLessThan(pos[t.target].x)
    expect(pos.b.x).toBe(pos.c.x) // siblings share a column
    expect(pos.b.y).not.toBe(pos.c.y)
    expect(pos.d.x - pos.a.x).toBe(2 * PITCH_X)
    expect(overlaps(pos)).toBeNull()
  })

  it('uses the longest path so a shortcut edge does not collapse layers', () => {
    const pos = computeLayout(graph(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']]))
    expect(pos.c.x).toBe(pos.a.x + 2 * PITCH_X)
  })

  it('handles cycles without hanging and keeps forward flow from the start scene', () => {
    const p = graph(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd']])
    const pos = computeLayout(p)
    expect(pos.a.x).toBeLessThan(pos.b.x)
    expect(pos.b.x).toBeLessThan(pos.c.x)
    expect(pos.c.x).toBeLessThan(pos.d.x)
    expect(overlaps(pos)).toBeNull()
  })

  it('treats a pure cycle with no sources deterministically (start first)', () => {
    const pos = computeLayout(graph(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']], { start: 'b' }))
    expect(pos.b.x).toBeLessThan(pos.c.x)
    expect(pos.c.x).toBeLessThan(pos.a.x)
  })

  it('ignores self-loops for layering but still places the scene', () => {
    const withLoop = graph(['a', 'b'], [['a', 'b'], ['b', 'b'], ['a', 'a']])
    const without = graph(['a', 'b'], [['a', 'b']])
    expect(computeLayout(withLoop)).toEqual(computeLayout(without))
  })

  it('reciprocal edges form a cycle that is laid out forward', () => {
    const pos = computeLayout(graph(['a', 'b'], [['a', 'b'], ['b', 'a']]))
    expect(pos.a.x).toBeLessThan(pos.b.x)
  })

  it('aligns multiple terminal endings in one final column', () => {
    const p = graph(['a', 'b', 'c', 'e1', 'e2', 'e3'], [['a', 'b'], ['b', 'c'], ['a', 'e1'], ['c', 'e2'], ['c', 'e3']], {
      kinds: { e1: 'ending', e2: 'ending', e3: 'ending' },
    })
    const pos = computeLayout(p)
    expect(new Set(['e1', 'e2', 'e3'].map((id) => pos[id].x)).size).toBe(1)
    for (const id of ['a', 'b', 'c']) expect(pos[id].x).toBeLessThan(pos.e1.x)
    expect(new Set(['e1', 'e2', 'e3'].map((id) => pos[id].y)).size).toBe(3)
    expect(overlaps(pos)).toBeNull()
  })

  it('stacks disconnected components vertically, start component first, without overlap', () => {
    const p = graph(['a', 'b', 'x', 'y', 'solo'], [['a', 'b'], ['x', 'y']])
    const pos = computeLayout(p)
    expect(pos.a.y).toBeLessThan(pos.x.y)
    expect(pos.x.y).toBeLessThan(pos.solo.y)
    expect(overlaps(pos)).toBeNull()
    // the start scene's component stays on top even when it is listed last
    const q = graph(['x', 'y', 'a', 'b'], [['x', 'y'], ['a', 'b']], { start: 'a' })
    const qp = computeLayout(q)
    expect(qp.a.y).toBeLessThan(qp.x.y)
  })

  it('ignores missing endpoints and duplicate transitions', () => {
    const base = graph(['a', 'b'], [['a', 'b']])
    const noisy: Project = {
      ...base,
      transitions: [...base.transitions, edge('a', 'b'), { ...edge('a', 'ghost'), id: 'g1' }, { ...edge('ghost', 'b'), id: 'g2' }],
    }
    expect(computeLayout(noisy)).toEqual(computeLayout(base))
  })

  it('handles empty graphs, one scene, and a missing start scene', () => {
    expect(computeLayout(graph([], []))).toEqual({})
    expect(computeLayout(graph(['only'], []))).toEqual({ only: { x: 60, y: 60 } })
    const p = graph(['a', 'b'], [['a', 'b']], { start: null })
    expect(computeLayout(p).a.x).toBeLessThan(computeLayout(p).b.x)
    expect(computeLayout(graph(['a', 'b'], [['a', 'b']], { start: 'nope' })).a.x).toBeLessThan(60 + PITCH_X)
  })

  it('breaks ties by transition order (siblings) and scene order (unrelated roots), deterministically', () => {
    const ab = computeLayout(graph(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']]))
    const ac = computeLayout(graph(['a', 'b', 'c'], [['a', 'c'], ['a', 'b']]))
    expect(ab.b.y).toBeLessThan(ab.c.y)
    expect(ac.c.y).toBeLessThan(ac.b.y)
    expect(computeLayout(graph(['a', 'b', 'c'], [['a', 'c'], ['a', 'b']]))).toEqual(ac)
    const xy = computeLayout(graph(['x', 'y'], [], { start: null }))
    const yx = computeLayout(graph(['y', 'x'], [], { start: null }))
    expect(xy.x.y).toBeLessThan(xy.y.y)
    expect(yx.y.y).toBeLessThan(yx.x.y)
  })

  it('scales to a larger branching graph without overlaps', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `n${i}`)
    const edges: [string, string][] = ids.slice(1).map((id, i) => [ids[Math.floor(i / 2)], id])
    edges.push(['n39', 'n3'], ['n20', 'n20'])
    const pos = computeLayout(graph(ids, edges))
    expect(Object.keys(pos)).toHaveLength(40)
    expect(overlaps(pos)).toBeNull()
  })
})
