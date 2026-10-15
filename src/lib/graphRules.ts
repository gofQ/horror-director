import { BRANCH_PORTS, RANDOM_PORTS, SEQUENCE_PORTS, type Port, type Project } from './schema'
import { isStageNodeType, stageOf, stageOfPort } from './seqflow'

/**
 * Connection semantics of the narrative graph (shared by the store, the canvas and import validation).
 * A connection is always a `Transition`: its source/target are scene or branch ids, and links that
 * leave a branch carry the output pin in `sourcePort`. Comments are never endpoints.
 */
type GraphData = Pick<Project, 'scenes' | 'logicNodes' | 'comments' | 'transitions'>

export type NodeKind = 'scene' | 'branch' | 'random' | 'setFlag' | 'event' | 'delay' | 'sequence' | 'seqReturn' | 'comment'
export type LogicKind = 'branch' | 'random' | 'setFlag' | 'event' | 'delay' | 'sequence' | 'seqReturn'
/** Logic nodes (IF, Random, Set Flag, Event, Delay): they are never scenes and create no scene visit. */
export const isLogicKind = (k: NodeKind | null): k is LogicKind =>
  k === 'branch' || k === 'random' || k === 'setFlag' || k === 'event' || k === 'delay' || k === 'sequence' || k === 'seqReturn'
/** Output pins of a node kind: IF has TRUE/FALSE, Random has A/B, Sequence has Then 0 / Then 1 / Completed, everything else one unnamed output (a Sequence Return has none). */
export const portsOf = (k: NodeKind | null): readonly Port[] => (k === 'branch' ? BRANCH_PORTS : k === 'random' ? RANDOM_PORTS : k === 'sequence' ? SEQUENCE_PORTS : [])
/** Logic nodes with exactly one, port-less output. */
export const isSingleOutput = (k: NodeKind | null): boolean => k === 'setFlag' || k === 'event' || k === 'delay'
export type ConnectReason =
  | 'missing'
  | 'comment'
  | 'portMissing'
  | 'portUnexpected'
  | 'portWrong'
  | 'noOutput'
  | 'inputTaken'
  | 'seqStageForbidden'
  | 'seqStageShortcut'
  | 'seqReturnUnowned'
  | 'seqReturnMismatch'
  | 'seqReturnOutside'
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

/**
 * Ordered Sequence stages: a stage is entered only through its Then pin, may hold only Event / Delay / Set Flag nodes
 * and ends in the matching Sequence Return; nothing can enter a stage from outside or escape it.
 */
function stageRule(p: GraphData, c: Connect, a: NodeKind, b: NodeKind): ConnectReason | null {
  const logicNodes = p.logicNodes
  const graph = { logicNodes, transitions: p.transitions }
  const here =
    a === 'sequence' && stageOfPort(c.sourcePort) >= 0
      ? { seqId: c.source, stage: stageOfPort(c.sourcePort) }
      : isStageNodeType(a === 'setFlag' || a === 'event' || a === 'delay' ? a : null)
        ? stageOf(graph, c.source)
        : null
  const hasInput = p.transitions.some((t) => t.target === c.target)
  if (here) {
    if (b === 'seqReturn') {
      const r = logicNodes.find((n) => n.id === c.target)!
      if (!r.sequenceId) return 'seqReturnUnowned'
      if (r.sequenceId !== here.seqId || r.stage !== here.stage) return 'seqReturnMismatch'
      return hasInput ? 'inputTaken' : null
    }
    if (b === 'event' || b === 'delay' || b === 'setFlag') return hasInput ? 'seqStageShortcut' : null
    return 'seqStageForbidden'
  }
  if (b === 'seqReturn') return 'seqReturnOutside'
  if ((b === 'event' || b === 'delay' || b === 'setFlag') && stageOf(graph, c.target)) return 'seqStageShortcut'
  return null
}

export function canConnect(p: GraphData, c: Connect): ConnectResult {
  const a = nodeKind(p, c.source)
  const b = nodeKind(p, c.target)
  if (!a || !b) return { ok: false, reason: 'missing' }
  if (a === 'comment' || b === 'comment') return { ok: false, reason: 'comment' }
  if (a === 'seqReturn') return { ok: false, reason: 'noOutput' }
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
  const stage = stageRule(p, c, a, b)
  if (stage) return { ok: false, reason: stage }
  if (isLogicKind(a) && isLogicKind(b) && logicReach(p, c.target).has(c.source)) return { ok: false, reason: 'logicCycle' }
  return { ok: true }
}

/** Default duration of a new link: transitions into a logic node keep the usual 1 s, logic node outputs take no time. */
export const linkDuration = (p: GraphData, source: string): number => (isLogicKind(nodeKind(p, source)) ? 0 : 1)
