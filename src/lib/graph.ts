import { diag, type Diagnostic } from './diagnostics'
import { exprFlags } from './flags'
import { sequenceIssues } from './seqflow'
import { BRANCH_PORTS, RANDOM_PORTS, crossingOf, isDreamLayer, type Project } from './schema'

export type Severity = 'error' | 'warning' | 'info'
export interface Issue {
  id: string
  severity: Severity
  /** Language-neutral message; render with `formatDiagnostic`. */
  diagnostic: Diagnostic
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
    branches: number
    setFlags: number
    sequences: number
    events: number
    delays: number
    randoms: number
    flags: number
    loops: number
    endings: number
    avgIntensity: number
  }
}

/** Adjacency over scenes **and** branch nodes (comments are not part of the narrative graph). */
function adjacency(p: Project): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const s of p.scenes) adj.set(s.id, [])
  for (const n of p.logicNodes) adj.set(n.id, [])
  for (const t of p.transitions) {
    if (adj.has(t.source) && adj.has(t.target)) adj.get(t.source)!.push(t.target)
  }
  return adj
}

/** A scene-to-scene hop, possibly through one or more IF nodes. */
export interface Hop {
  from: string
  to: string
  /** Transition ids in order (a plain scene-to-scene transition has exactly one). */
  links: string[]
  /** Branch node ids passed through. */
  via: string[]
}

/** Effective narrative hops between scenes (IF nodes are traversed, never counted as scenes). */
export function effectiveHops(p: Pick<Project, 'scenes' | 'logicNodes' | 'transitions'>): Hop[] {
  const scenes = new Set(p.scenes.map((s) => s.id))
  const branches = new Set(p.logicNodes.map((n) => n.id))
  const out: Hop[] = []
  const walk = (from: string, at: string, links: string[], via: string[]) => {
    for (const t of p.transitions) {
      if (t.source !== at) continue
      if (scenes.has(t.target)) out.push({ from, to: t.target, links: [...links, t.id], via })
      else if (branches.has(t.target) && !via.includes(t.target)) walk(from, t.target, [...links, t.id], [...via, t.target])
    }
  }
  for (const s of p.scenes) walk(s.id, s.id, [], [])
  return out
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

/** Scenes and logic nodes reachable from the start scene (cheap: no diagnostics; used while dragging in the editor). */
export function reachableIds(p: Pick<Project, 'scenes' | 'logicNodes' | 'transitions' | 'startSceneId'>): Set<string> {
  const adj = new Map<string, string[]>()
  for (const s of p.scenes) adj.set(s.id, [])
  for (const n of p.logicNodes) adj.set(n.id, [])
  for (const t of p.transitions) if (adj.has(t.source) && adj.has(t.target)) adj.get(t.source)!.push(t.target)
  return reachableFrom(adj, p.startSceneId)
}

export function analyze(p: Project): Analysis {
  const issues: Issue[] = []
  const adj = adjacency(p)
  const byId = new Map(p.scenes.map((s) => [s.id, s]))
  const titleOf = new Map<string, string>([...p.scenes.map((s) => [s.id, s.title] as const), ...p.logicNodes.map((n) => [n.id, n.title || n.id] as const)])
  const known = (id: string) => adj.has(id)
  const reachable = reachableFrom(adj, p.startSceneId)
  const loops = findLoops(adj)
  const add = (severity: Severity, diagnostic: Diagnostic, sceneId?: string) =>
    issues.push({ id: `${issues.length}`, severity, diagnostic, sceneId })

  if (p.scenes.length === 0) add('error', diag('diag.noScenes'))
  else if (!p.startSceneId || !byId.has(p.startSceneId))
    add('error', diag('diag.noStartSet'))

  for (const t of p.transitions) {
    if (!known(t.source) || !known(t.target))
      add('error', diag('diag.transitionMissingScene', { name: t.label || t.id }))
  }

  const hasStart = !!p.startSceneId && byId.has(p.startSceneId)
  for (const s of p.scenes) {
    const out = p.transitions.filter((t) => t.source === s.id && known(t.target))
    if (hasStart && !reachable.has(s.id))
      add('warning', diag('diag.unreachable', { scene: s.title }), s.id)
    if (s.kind !== 'ending' && out.length === 0)
      add('warning', diag('diag.deadEnd', { scene: s.title }), s.id)
    if (s.kind === 'ending' && out.length > 0)
      add('info', diag('diag.endingHasOutgoing', { scene: s.title }), s.id)
    if (s.loop.enabled && !s.loop.exitCondition.trim() && s.loop.maxIterations === 0)
      add('warning', diag('diag.loopNoExit', { scene: s.title }), s.id)
    const late = s.triggers.filter((t) => t.time > s.duration)
    if (late.length)
      add('warning', diag('diag.lateTriggers', { scene: s.title, n: late.length, duration: s.duration }), s.id)
    for (const [cid, stid] of Object.entries(s.characterStates)) {
      const c = p.characters.find((c) => c.id === cid)
      if (!c || !c.states.some((st) => st.id === stid))
        add('warning', diag('diag.staleState', { scene: s.title }), s.id)
    }
    if (isDreamLayer(s.kind) && hasStart && reachable.has(s.id)) {
      const back = reachableFrom(adj, s.id)
      const escapes = [...back].some((id) => {
        const k = byId.get(id)?.kind
        return k && !isDreamLayer(k)
      })
      if (!escapes)
        add('info', diag('diag.inescapableDream', { scene: s.title }), s.id)
    }
  }

  // Loops with no way out of the cycle at all
  for (const comp of loops) {
    const set = new Set(comp)
    const exits = comp.some((id) => (adj.get(id) ?? []).some((n) => !set.has(n)))
    if (!exits) {
      const titles = comp.map((id) => titleOf.get(id) ?? id).join(' → ')
      add('warning', diag('diag.closedLoop', { path: titles }), comp[0])
    }
  }

  for (const n of p.logicNodes) {
    const label = n.title || n.id
    if (hasStart && !reachable.has(n.id)) add('warning', diag('diag.branchUnreachable', { node: label }))
    switch (n.type) {
      case 'branch':
        for (const port of BRANCH_PORTS)
          if (!p.transitions.some((t) => t.source === n.id && t.sourcePort === port && known(t.target)))
            add('warning', diag('diag.branchOpenOutput', { node: label, port: port.toUpperCase() }))
        if (!n.condition.trim() && !n.expression) add('info', diag('diag.branchNoCondition', { node: label }))
        break
      case 'random':
        for (const port of RANDOM_PORTS)
          if (!p.transitions.some((t) => t.source === n.id && t.sourcePort === port && known(t.target)))
            add('warning', diag('diag.randomOpenOutput', { node: label, port: port.toUpperCase() }))
        break
      case 'setFlag':
        if (!n.flagId) add('warning', diag('diag.setFlagNoFlag', { node: label }))
        if (!p.transitions.some((t) => t.source === n.id && known(t.target))) add('warning', diag('diag.setFlagNoOutput', { node: label }))
        break
      case 'sequence':
      case 'seqReturn':
        break // reported from sequenceIssues below
      case 'event':
      case 'delay':
        if (!p.transitions.some((t) => t.source === n.id && known(t.target))) add('warning', diag('diag.flowNoOutput', { node: label }))
        break
    }
  }
  for (const i of sequenceIssues(p)) add(i.severity === 'error' ? 'error' : 'warning', i.diagnostic)
  // Flags that structured conditions test but that no Set Flag node ever changes: the test always yields the default.
  const setIds = new Set(p.logicNodes.filter((n) => n.type === 'setFlag' && n.flagId).map((n) => n.flagId as string))
  const flagName = new Map(p.flags.map((f) => [f.id, f.name]))
  const tested = new Set(p.logicNodes.flatMap((n) => (n.type === 'branch' && n.expression ? exprFlags(n.expression) : [])))
  for (const id of tested) if (flagName.has(id) && !setIds.has(id)) add('info', diag('diag.flagNeverSet', { flag: flagName.get(id)! }))

  const triggers = p.scenes.flatMap((s) => s.triggers)
  const crossings = effectiveHops(p).filter((h) => crossingOf(byId.get(h.from)!.kind, byId.get(h.to)!.kind) !== 'same-layer').length
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
      branches: p.logicNodes.filter((n) => n.type === 'branch').length,
      setFlags: p.logicNodes.filter((n) => n.type === 'setFlag').length,
      sequences: p.logicNodes.filter((n) => n.type === 'sequence').length,
      events: p.logicNodes.filter((n) => n.type === 'event').length,
      delays: p.logicNodes.filter((n) => n.type === 'delay').length,
      randoms: p.logicNodes.filter((n) => n.type === 'random').length,
      flags: p.flags.length,
      loops: loops.length,
      endings: p.scenes.filter((s) => s.kind === 'ending').length,
      avgIntensity: triggers.length
        ? Math.round((triggers.reduce((a, t) => a + t.intensity, 0) / triggers.length) * 10) / 10
        : 0,
    },
  }
}
