import { crossingOf, isDreamLayer, type Project } from './schema'

export type Severity = 'error' | 'warning' | 'info'
export interface Issue {
  id: string
  severity: Severity
  message: string
  sceneId?: string
}

export interface Analysis {
  issues: Issue[]
  reachable: Set<string>
  /** strongly connected components that form a cycle (size>1 or self-loop) */
  loops: string[][]
  stats: {
    scenes: number
    transitions: number
    triggers: number
    dreamScenes: number
    realityScenes: number
    crossings: number
    loops: number
    endings: number
    avgIntensity: number
  }
}

function adjacency(p: Project): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const s of p.scenes) adj.set(s.id, [])
  for (const t of p.transitions) {
    if (adj.has(t.source) && adj.has(t.target)) adj.get(t.source)!.push(t.target)
  }
  return adj
}

export function reachableFrom(adj: Map<string, string[]>, start: string | null): Set<string> {
  const seen = new Set<string>()
  if (!start || !adj.has(start)) return seen
  const stack = [start]
  while (stack.length) {
    const n = stack.pop()!
    if (seen.has(n)) continue
    seen.add(n)
    for (const m of adj.get(n) ?? []) if (!seen.has(m)) stack.push(m)
  }
  return seen
}

/** Tarjan SCC (iterative-safe enough for editor-sized graphs). */
export function findLoops(adj: Map<string, string[]>): string[][] {
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const out: string[][] = []

  const strong = (v: string) => {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      const selfLoop = comp.length === 1 && (adj.get(v) ?? []).includes(v)
      if (comp.length > 1 || selfLoop) out.push(comp)
    }
  }
  for (const v of adj.keys()) if (!idx.has(v)) strong(v)
  return out
}

export function analyze(p: Project): Analysis {
  const issues: Issue[] = []
  const adj = adjacency(p)
  const byId = new Map(p.scenes.map((s) => [s.id, s]))
  const reachable = reachableFrom(adj, p.startSceneId)
  const loops = findLoops(adj)
  const add = (severity: Severity, message: string, sceneId?: string) =>
    issues.push({ id: `${issues.length}`, severity, message, sceneId })

  if (p.scenes.length === 0) add('error', 'Project has no scenes.')
  else if (!p.startSceneId || !byId.has(p.startSceneId))
    add('error', 'No start scene is set. Mark one scene as the start.')

  for (const t of p.transitions) {
    if (!byId.has(t.source) || !byId.has(t.target))
      add('error', `Transition "${t.label || t.id}" references a missing scene.`)
  }

  const hasStart = !!p.startSceneId && byId.has(p.startSceneId)
  for (const s of p.scenes) {
    const out = p.transitions.filter((t) => t.source === s.id && byId.has(t.target))
    if (hasStart && !reachable.has(s.id))
      add('warning', `"${s.title}" is unreachable from the start scene.`, s.id)
    if (s.kind !== 'ending' && out.length === 0)
      add('warning', `"${s.title}" is a dead end (no outgoing transitions, not an ending).`, s.id)
    if (s.kind === 'ending' && out.length > 0)
      add('info', `Ending "${s.title}" has outgoing transitions.`, s.id)
    if (s.loop.enabled && !s.loop.exitCondition.trim() && s.loop.maxIterations === 0)
      add('warning', `Loop scene "${s.title}" has no exit condition or iteration cap.`, s.id)
    const late = s.triggers.filter((t) => t.time > s.duration)
    if (late.length)
      add('warning', `"${s.title}" has ${late.length} trigger(s) after its ${s.duration}s duration.`, s.id)
    for (const [cid, stid] of Object.entries(s.characterStates)) {
      const c = p.characters.find((c) => c.id === cid)
      if (!c || !c.states.some((st) => st.id === stid))
        add('warning', `"${s.title}" references a deleted character state.`, s.id)
    }
    if (isDreamLayer(s.kind) && hasStart && reachable.has(s.id)) {
      const back = reachableFrom(adj, s.id)
      const escapes = [...back].some((id) => {
        const k = byId.get(id)?.kind
        return k && !isDreamLayer(k)
      })
      if (!escapes)
        add('info', `Dream scene "${s.title}" never leads back to reality (inescapable).`, s.id)
    }
  }

  // Loops with no way out of the cycle at all
  for (const comp of loops) {
    const set = new Set(comp)
    const exits = comp.some((id) => (adj.get(id) ?? []).some((n) => !set.has(n)))
    if (!exits) {
      const titles = comp.map((id) => byId.get(id)?.title ?? id).join(' → ')
      add('warning', `Closed loop with no exit: ${titles}.`, comp[0])
    }
  }

  const triggers = p.scenes.flatMap((s) => s.triggers)
  const crossings = p.transitions.filter((t) => {
    const a = byId.get(t.source)
    const b = byId.get(t.target)
    return a && b && crossingOf(a.kind, b.kind) !== 'same-layer'
  }).length
  const dream = p.scenes.filter((s) => isDreamLayer(s.kind)).length

  const order = { error: 0, warning: 1, info: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity])

  return {
    issues,
    reachable,
    loops,
    stats: {
      scenes: p.scenes.length,
      transitions: p.transitions.length,
      triggers: triggers.length,
      dreamScenes: dream,
      realityScenes: p.scenes.filter((s) => !isDreamLayer(s.kind) && s.kind !== 'ending').length,
      crossings,
      loops: loops.length,
      endings: p.scenes.filter((s) => s.kind === 'ending').length,
      avgIntensity: triggers.length
        ? Math.round((triggers.reduce((a, t) => a + t.intensity, 0) / triggers.length) * 10) / 10
        : 0,
    },
  }
}
