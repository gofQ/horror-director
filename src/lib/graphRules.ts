import { BRANCH_PORTS, type BranchPort, type Project } from './schema'

/**
 * Connection semantics of the narrative graph (shared by the store, the canvas and import validation).
 * A connection is always a `Transition`: its source/target are scene or branch ids, and links that
 * leave a branch carry the output pin in `sourcePort`. Comments are never endpoints.
 */
type GraphData = Pick<Project, 'scenes' | 'logicNodes' | 'comments' | 'transitions'>

export type NodeKind = 'scene' | 'branch' | 'comment'
export type ConnectReason =
  | 'missing'
  | 'comment'
  | 'portMissing'
  | 'portUnexpected'
  | 'portTaken'
  | 'duplicate'
  | 'pairExists'
  | 'self'
  | 'logicCycle'

export interface Connect {
  source: string
  sourcePort?: BranchPort
  target: string
}
export type ConnectResult = { ok: true } | { ok: false; reason: ConnectReason }

export function nodeKind(p: GraphData, id: string): NodeKind | null {
  if (p.scenes.some((s) => s.id === id)) return 'scene'
  if (p.logicNodes.some((n) => n.id === id)) return 'branch'
  if (p.comments.some((c) => c.id === id)) return 'comment'
  return null
}

const isPort = (v: unknown): v is BranchPort => (BRANCH_PORTS as readonly unknown[]).includes(v)

/** Branch ids reachable from `from` through links that only touch branch nodes. */
function logicReach(p: GraphData, from: string): Set<string> {
  const branch = new Set(p.logicNodes.map((n) => n.id))
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const n = stack.pop()!
    for (const t of p.transitions)
      if (t.source === n && branch.has(t.target) && !seen.has(t.target)) {
        seen.add(t.target)
        stack.push(t.target)
      }
  }
  return seen
}

/** Cycles made only of branch nodes (a zero-time loop that never reaches a scene). */
export function logicCycles(p: GraphData): string[] {
  return p.logicNodes.filter((n) => logicReach(p, n.id).has(n.id)).map((n) => n.id)
}

export function canConnect(p: GraphData, c: Connect): ConnectResult {
  const a = nodeKind(p, c.source)
  const b = nodeKind(p, c.target)
  if (!a || !b) return { ok: false, reason: 'missing' }
  if (a === 'comment' || b === 'comment') return { ok: false, reason: 'comment' }
  if (a === 'branch') {
    if (!isPort(c.sourcePort)) return { ok: false, reason: 'portMissing' }
    if (c.source === c.target) return { ok: false, reason: 'self' }
    if (p.transitions.some((t) => t.source === c.source && t.sourcePort === c.sourcePort))
      return { ok: false, reason: 'portTaken' }
  } else if (c.sourcePort !== undefined) {
    return { ok: false, reason: 'portUnexpected' }
  }
  if (a === 'scene' && b === 'scene') {
    if (p.transitions.some((t) => t.source === c.source && t.target === c.target)) return { ok: false, reason: 'pairExists' }
  } else if (p.transitions.some((t) => t.source === c.source && t.target === c.target && t.sourcePort === c.sourcePort)) {
    return { ok: false, reason: 'duplicate' }
  }
  if (a === 'branch' && b === 'branch' && logicReach(p, c.target).has(c.source)) return { ok: false, reason: 'logicCycle' }
  return { ok: true }
}

/** Default duration of a new link: transitions into a branch keep the usual 1 s, branch outputs take no time. */
export const linkDuration = (p: GraphData, source: string): number => (nodeKind(p, source) === 'branch' ? 0 : 1)
