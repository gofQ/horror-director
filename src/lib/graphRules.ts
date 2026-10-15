import { BRANCH_PORTS, RANDOM_PORTS, type Port, type Project } from './schema'

/**
 * Connection semantics of the narrative graph (shared by the store, the canvas and import validation).
 * A connection is always a `Transition`: its source/target are scene or branch ids, and links that
 * leave a branch carry the output pin in `sourcePort`. Comments are never endpoints.
 */
type GraphData = Pick<Project, 'scenes' | 'logicNodes' | 'comments' | 'transitions'>

export type NodeKind = 'scene' | 'branch' | 'random' | 'setFlag' | 'event' | 'delay' | 'comment'
export type LogicKind = 'branch' | 'random' | 'setFlag' | 'event' | 'delay'
/** Logic nodes (IF, Random, Set Flag, Event, Delay): they are never scenes and create no scene visit. */
export const isLogicKind = (k: NodeKind | null): k is LogicKind =>
  k === 'branch' || k === 'random' || k === 'setFlag' || k === 'event' || k === 'delay'
/** Output pins of a node kind: IF has TRUE/FALSE, Random has A/B, everything else has one unnamed output. */
export const portsOf = (k: NodeKind | null): readonly Port[] => (k === 'branch' ? BRANCH_PORTS : k === 'random' ? RANDOM_PORTS : [])
/** Logic nodes with exactly one, port-less output. */
export const isSingleOutput = (k: NodeKind | null): boolean => k === 'setFlag' || k === 'event' || k === 'delay'
export type ConnectReason =
  | 'missing'
  | 'comment'
  | 'portMissing'
  | 'portUnexpected'
  | 'portWrong'
  | 'portTaken'
  | 'outputTaken'
  | 'duplicate'
  | 'pairExists'
  | 'self'
  | 'logicCycle'

export interface Connect {
  source: string
  sourcePort?: Port
  target: string
}
export type ConnectResult = { ok: true } | { ok: false; reason: ConnectReason }

export function nodeKind(p: GraphData, id: string): NodeKind | null {
  if (p.scenes.some((s) => s.id === id)) return 'scene'
  const n = p.logicNodes.find((x) => x.id === id)
  if (n) return n.type
  if (p.comments.some((c) => c.id === id)) return 'comment'
  return null
}

/** Any known output pin name (IF or Random). */
export const isPort = (v: unknown): v is Port => (BRANCH_PORTS as readonly unknown[]).includes(v) || (RANDOM_PORTS as readonly unknown[]).includes(v)

/** Logic node ids (IF and Set Flag) reachable from `from` through links that only touch logic nodes. */
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
  const ports = portsOf(a)
  if (ports.length > 0) {
    if (c.sourcePort === undefined) return { ok: false, reason: 'portMissing' }
    if (!ports.includes(c.sourcePort)) return { ok: false, reason: 'portWrong' }
    if (c.source === c.target) return { ok: false, reason: 'self' }
    if (p.transitions.some((t) => t.source === c.source && t.sourcePort === c.sourcePort))
      return { ok: false, reason: 'portTaken' }
  } else if (c.sourcePort !== undefined) {
    return { ok: false, reason: 'portUnexpected' }
  } else if (isSingleOutput(a)) {
    if (c.source === c.target) return { ok: false, reason: 'self' }
    if (p.transitions.some((t) => t.source === c.source)) return { ok: false, reason: 'outputTaken' }
  }
  if (a === 'scene' && b === 'scene') {
    if (p.transitions.some((t) => t.source === c.source && t.target === c.target)) return { ok: false, reason: 'pairExists' }
  } else if (p.transitions.some((t) => t.source === c.source && t.target === c.target && t.sourcePort === c.sourcePort)) {
    return { ok: false, reason: 'duplicate' }
  }
  if (isLogicKind(a) && isLogicKind(b) && logicReach(p, c.target).has(c.source)) return { ok: false, reason: 'logicCycle' }
  return { ok: true }
}

/** Default duration of a new link: transitions into a logic node keep the usual 1 s, logic node outputs take no time. */
export const linkDuration = (p: GraphData, source: string): number => (isLogicKind(nodeKind(p, source)) ? 0 : 1)
