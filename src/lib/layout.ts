import type { Project } from './schema'

/**
 * Deterministic left-to-right layered layout for the scene graph.
 *
 * A pure function of the graph *structure* and scene order — current positions are never read —
 * so it is reproducible and idempotent (arranging an arranged graph changes nothing). Only
 * positions are produced; callers must not touch any other project data.
 */
export const NODE_W = 240
export const NODE_H = 150
export const GAP_X = 110
/** Leaves room for self-loop arcs above and back-edge arcs below a row of nodes. */
export const GAP_Y = 110
export const COMPONENT_GAP = 80
export const MARGIN = 60
export const PITCH_X = NODE_W + GAP_X
export const PITCH_Y = NODE_H + GAP_Y

export type Positions = Record<string, { x: number; y: number }>
type LayoutInput = Pick<Project, 'scenes' | 'transitions' | 'startSceneId'>

const SWEEPS = 4

export function computeLayout(p: LayoutInput): Positions {
  const ids = p.scenes.map((s) => s.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const kind = new Map(p.scenes.map((s) => [s.id, s.kind]))

  // Unique, valid, non-self edges in transition order.
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const inn = new Map<string, string[]>(ids.map((id) => [id, []]))
  const seen = new Set<string>()
  for (const t of p.transitions) {
    if (t.source === t.target || !index.has(t.source) || !index.has(t.target)) continue
    const key = `${t.source}\u0000${t.target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.get(t.source)!.push(t.target)
    inn.get(t.target)!.push(t.source)
  }

  // Weakly connected components (union-find, smallest index as representative).
  const parent = ids.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  for (const [u, vs] of out) for (const v of vs) union(index.get(u)!, index.get(v)!)
  const groups = new Map<number, string[]>()
  ids.forEach((id, i) => {
    const r = find(i)
    groups.set(r, [...(groups.get(r) ?? []), id])
  })
  const startRoot = p.startSceneId && index.has(p.startSceneId) ? find(index.get(p.startSceneId)!) : -1
  const components = [...groups.entries()]
    .sort(([a], [b]) => Number(b === startRoot) - Number(a === startRoot) || a - b)
    .map(([, members]) => members)

  const result: Positions = {}
  let offsetY = 0
  for (const members of components) {
    const placed = layoutComponent(members, p.startSceneId, index, out, inn, kind)
    for (const [id, pos] of Object.entries(placed.positions)) result[id] = { x: pos.x, y: pos.y + offsetY }
    offsetY += placed.height + COMPONENT_GAP
  }

  for (const id of Object.keys(result)) {
    result[id] = { x: Math.round(result[id].x + MARGIN), y: Math.round(result[id].y + MARGIN) }
  }
  return result
}

function layoutComponent(
  members: string[],
  startId: string | null,
  index: Map<string, number>,
  out: Map<string, string[]>,
  inn: Map<string, string[]>,
  kind: Map<string, string>,
) {
  const inComp = new Set(members)
  const byIndex = (a: string, b: string) => index.get(a)! - index.get(b)!

  // DFS from the start scene, then other sources, then anything left → discovery order + back edges.
  const roots = [
    ...(startId && inComp.has(startId) ? [startId] : []),
    ...members.filter((m) => m !== startId && inn.get(m)!.length === 0).sort(byIndex),
    ...members.filter((m) => m !== startId).sort(byIndex),
  ]
  const state = new Map<string, 0 | 1 | 2>()
  const discovery: string[] = []
  const back = new Set<string>()
  for (const root of roots) {
    if (state.get(root)) continue
    state.set(root, 1)
    discovery.push(root)
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }]
    while (stack.length) {
      const top = stack[stack.length - 1]
      const targets = out.get(top.id)!
      if (top.next >= targets.length) {
        state.set(top.id, 2)
        stack.pop()
        continue
      }
      const v = targets[top.next++]
      const s = state.get(v) ?? 0
      if (s === 1) back.add(`${top.id}\u0000${v}`)
      else if (s === 0) {
        state.set(v, 1)
        discovery.push(v)
        stack.push({ id: v, next: 0 })
      }
    }
  }
  const dagOut = (id: string) => out.get(id)!.filter((v) => !back.has(`${id}\u0000${v}`))
  const dagIn = (id: string) => inn.get(id)!.filter((u) => !back.has(`${u}\u0000${id}`))

  // Longest-path layering over the acyclic remainder (Kahn, deterministic by index).
  const layer = new Map<string, number>(members.map((m) => [m, 0]))
  const indeg = new Map(members.map((m) => [m, dagIn(m).length]))
  const queue = members.filter((m) => indeg.get(m) === 0).sort(byIndex)
  while (queue.length) {
    const u = queue.shift()!
    for (const v of dagOut(u)) {
      layer.set(v, Math.max(layer.get(v)!, layer.get(u)! + 1))
      indeg.set(v, indeg.get(v)! - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }

  // Terminal endings share the last column.
  const endingSinks = members.filter((m) => kind.get(m) === 'ending' && out.get(m)!.length === 0)
  if (endingSinks.length) {
    const others = members.filter((m) => !endingSinks.includes(m))
    const last = Math.max(
      others.length ? Math.max(...others.map((m) => layer.get(m)!)) + 1 : 0,
      ...endingSinks.map((m) => layer.get(m)!),
    )
    for (const m of endingSinks) layer.set(m, last)
  }

  // Order within layers: discovery order refined by barycenter sweeps (index tie-breaks).
  const maxLayer = Math.max(...members.map((m) => layer.get(m)!))
  const disc = new Map(discovery.map((id, i) => [id, i]))
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const m of [...members].sort((a, b) => disc.get(a)! - disc.get(b)!)) columns[layer.get(m)!].push(m)
  const rank = new Map<string, number>()
  const reindex = () => columns.forEach((col) => col.forEach((id, i) => rank.set(id, i)))
  reindex()
  const sortBy = (col: string[], neighbours: (id: string) => string[]) => {
    const bary = new Map<string, number>()
    for (const id of col) {
      const ns = neighbours(id)
      bary.set(id, ns.length ? ns.reduce((a, n) => a + rank.get(n)!, 0) / ns.length : rank.get(id)!)
    }
    col.sort((a, b) => bary.get(a)! - bary.get(b)! || disc.get(a)! - disc.get(b)!)
    col.forEach((id, i) => rank.set(id, i))
  }
  for (let s = 0; s < SWEEPS; s++) {
    for (let l = 1; l <= maxLayer; l++) sortBy(columns[l], dagIn)
    for (let l = maxLayer - 1; l >= 0; l--) sortBy(columns[l], dagOut)
  }

  const tallest = Math.max(...columns.map((c) => c.length))
  const positions: Positions = {}
  columns.forEach((col, l) => {
    const pad = ((tallest - col.length) * PITCH_Y) / 2
    col.forEach((id, i) => {
      positions[id] = { x: l * PITCH_X, y: pad + i * PITCH_Y }
    })
  })
  return { positions, height: tallest * PITCH_Y }
}
