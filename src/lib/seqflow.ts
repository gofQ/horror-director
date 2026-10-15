import { diag, type Diagnostic } from './diagnostics'
import { SEQUENCE_PORTS, SEQUENCE_STAGES, type LogicNode, type Project } from './schema'

/**
 * Structural rules of the ordered Sequence node (schema 9), shared by connection checks, project validation,
 * analysis and the editor. Pure functions over the graph; nothing here is stored.
 *
 * A Sequence has one input and three outputs: `then0`, `then1` and `completed`. Each Then output starts a LINEAR
 * stage made only of Event, Delay and Set Flag nodes that ends in the matching Sequence Return of the owning
 * Sequence. The stages run one after the other (never as alternatives), and only `completed` continues the
 * narrative. Scenes, IF, Random Branch and Sequence nodes are not allowed inside a stage, and a stage can only be
 * entered through its own Then output and left through its own Return.
 */
type Graph = Pick<Project, 'scenes' | 'logicNodes' | 'transitions'>

export interface StageInfo {
  seqId: string
  stage: number
}

/** The node types a stage may contain besides its closing Return. */
export const isStageNodeType = (type: LogicNode['type'] | null | undefined): boolean => type === 'event' || type === 'delay' || type === 'setFlag'
/** Output pin of a stage (0-based). */
export const stagePort = (stage: number) => SEQUENCE_PORTS[stage]
/** Stage index of a Then pin, or -1 (also for `completed`). */
export const stageOfPort = (port: string | undefined): number => {
  const i = SEQUENCE_PORTS.indexOf(port as (typeof SEQUENCE_PORTS)[number])
  return i >= 0 && i < SEQUENCE_STAGES ? i : -1
}

/**
 * The stage a node sits in, found by walking its single input backwards to a Then pin through Event/Delay/Set Flag
 * nodes; null when it is not (yet) inside a stage. Used while authoring, before the whole chain exists.
 */
export function stageOf(p: Pick<Graph, 'logicNodes' | 'transitions'>, nodeId: string, guard: Set<string> = new Set()): StageInfo | null {
  if (guard.has(nodeId)) return null
  const incoming = p.transitions.filter((t) => t.target === nodeId)
  if (incoming.length !== 1) return null
  const t = incoming[0]
  const src = p.logicNodes.find((n) => n.id === t.source)
  if (!src) return null
  if (src.type === 'sequence') {
    const k = stageOfPort(t.sourcePort)
    return k >= 0 ? { seqId: src.id, stage: k } : null
  }
  if (isStageNodeType(src.type)) return stageOf(p, src.id, new Set(guard).add(nodeId))
  return null
}

export interface SeqIssue {
  severity: 'error' | 'warning'
  /** The node the message is about (for badges in the editor). */
  nodeId: string
  diagnostic: Diagnostic
}

const title = (n: { title: string; id: string }) => n.title || n.id

/**
 * Errors are structural problems (imports with them are rejected); warnings are incomplete authoring (an
 * unconnected output, a stage without its Return, a Return without an owner) that simulation reports and never
 * silently treats as complete.
 */
export function sequenceIssues(p: Graph): SeqIssue[] {
  const out: SeqIssue[] = []
  const nodes = new Map(p.logicNodes.map((n) => [n.id, n]))
  const scenes = new Map(p.scenes.map((s) => [s.id, s]))
  const incoming = (id: string) => p.transitions.filter((t) => t.target === id)
  const outgoing = (id: string) => p.transitions.filter((t) => t.source === id)
  const err = (nodeId: string, d: Diagnostic) => out.push({ severity: 'error', nodeId, diagnostic: d })
  const warn = (nodeId: string, d: Diagnostic) => out.push({ severity: 'warning', nodeId, diagnostic: d })
  const members = new Map<string, StageInfo>()
  /** True when walking back from a stage-type node reaches a node with no input at all (never a scene, IF or Sequence pin). */
  const detachedChain = (id: string): boolean => {
    const seen = new Set<string>()
    for (let cur = id; !seen.has(cur); ) {
      seen.add(cur)
      const ins = incoming(cur)
      if (ins.length === 0) return true
      if (ins.length > 1) return false
      const pred = nodes.get(ins[0].source)
      if (!pred || !isStageNodeType(pred.type)) return false
      cur = pred.id
    }
    return false
  }

  for (const s of p.logicNodes) {
    if (s.type !== 'sequence') continue
    const name = title(s)
    for (const port of SEQUENCE_PORTS) {
      if (!outgoing(s.id).some((t) => t.sourcePort === port)) warn(s.id, diag('diag.seqOpenOutput', { node: name, port }))
    }
    for (let k = 0; k < SEQUENCE_STAGES; k++) {
      const first = outgoing(s.id).find((t) => t.sourcePort === stagePort(k))
      if (!first) continue
      const seen = new Set<string>()
      let cur = first.target
      for (;;) {
        const node = nodes.get(cur)
        if (!node) {
          const sc = scenes.get(cur)
          if (sc) err(s.id, diag('diag.seqStageForbidden', { node: name, stage: k, what: title(sc) }))
          break
        }
        if (seen.has(cur)) {
          err(s.id, diag('diag.seqStageCycle', { node: name, stage: k }))
          break
        }
        seen.add(cur)
        if (incoming(cur).length > 1) err(cur, diag('diag.seqStageShortcut', { node: name, stage: k, what: title(node) }))
        if (node.type === 'seqReturn') {
          if (node.sequenceId !== s.id || node.stage !== k) err(cur, diag('diag.seqReturnMismatch', { node: name, stage: k, what: title(node) }))
          break
        }
        if (!isStageNodeType(node.type)) {
          err(s.id, diag('diag.seqStageForbidden', { node: name, stage: k, what: title(node) }))
          break
        }
        members.set(cur, { seqId: s.id, stage: k })
        const next = outgoing(cur)[0]
        if (!next) {
          warn(s.id, diag('diag.seqStageOpen', { node: name, stage: k }))
          break
        }
        cur = next.target
      }
    }
  }

  for (const r of p.logicNodes) {
    if (r.type !== 'seqReturn') continue
    const name = title(r)
    const owner = r.sequenceId ? nodes.get(r.sequenceId) : undefined
    if (r.sequenceId && owner?.type !== 'sequence') err(r.id, diag('diag.seqReturnOwner', { node: name, id: r.sequenceId }))
    if (!r.sequenceId) warn(r.id, diag('diag.seqReturnUnowned', { node: name }))
    if (outgoing(r.id).length > 0) err(r.id, diag('diag.seqReturnOutput', { node: name }))
    const ins = incoming(r.id)
    if (ins.length > 1) err(r.id, diag('diag.seqReturnInputs', { node: name }))
    for (const t of r.sequenceId ? ins : []) {
      const src = nodes.get(t.source)
      const fromOwner = src?.type === 'sequence' && src.id === r.sequenceId && stageOfPort(t.sourcePort) === r.stage
      const m = members.get(t.source)
      const fromStage = !!m && m.seqId === r.sequenceId && m.stage === r.stage
      if (fromOwner || fromStage) continue
      // A chain that is not attached to a Then output (e.g. the link was removed while editing) is incomplete authoring;
      // anything else (another stage, a scene, IF, the Completed pin) is a structural error.
      if (!m && src && isStageNodeType(src.type) && detachedChain(src.id)) warn(r.id, diag('diag.seqStageDetached', { node: name }))
      else err(r.id, diag('diag.seqReturnOutside', { node: name }))
    }
  }
  return out
}
