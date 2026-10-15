import { exprFlags, exprWithoutFlag } from './flags'
import { uid } from './id'
import type { Expr, GraphComment, LogicNode, Project, Scene, Transition } from './schema'
import { translate } from './waypoints'

/**
 * Graph-local clipboard: a deep copy of selected scenes, logic nodes and comments plus the connections whose
 * *both* ends were copied. Pasting always creates fresh ids and never produces dangling references.
 * Pure functions: the store applies the result in one undoable step.
 */
export interface ClipboardData {
  scenes: Scene[]
  logicNodes: LogicNode[]
  comments: GraphComment[]
  transitions: Transition[]
}

export const clipboardSize = (c: ClipboardData | null) => (c ? c.scenes.length + c.logicNodes.length + c.comments.length : 0)

export function copyGraph(p: Project, ids: readonly string[]): ClipboardData | null {
  const want = new Set(ids)
  const scenes = p.scenes.filter((x) => want.has(x.id))
  const logicNodes = p.logicNodes.filter((x) => want.has(x.id))
  const comments = p.comments.filter((x) => want.has(x.id))
  if (scenes.length + logicNodes.length + comments.length === 0) return null
  const copied = new Set([...scenes, ...logicNodes, ...comments].map((x) => x.id))
  const transitions = p.transitions.filter((t) => copied.has(t.source) && copied.has(t.target))
  return structuredClone({ scenes, logicNodes, comments, transitions })
}

const topLeft = (c: ClipboardData) => {
  const pts = [...c.scenes, ...c.logicNodes, ...c.comments].map((n) => n.position)
  return { x: Math.min(...pts.map((q) => q.x)), y: Math.min(...pts.map((q) => q.y)) }
}

export interface PasteResult {
  scenes: Scene[]
  logicNodes: LogicNode[]
  comments: GraphComment[]
  transitions: Transition[]
  /** Ids of the new nodes (scenes, logic nodes, comments). */
  ids: string[]
}

/**
 * `at` is the flow position the group's top-left corner lands on; `suffix` is appended to scene titles
 * (used by Duplicate). The target project is only read (type, flag and character references are re-checked).
 */
export function pasteGraph(p: Pick<Project, 'sceneTypes' | 'flags'>, data: ClipboardData, at: { x: number; y: number }, suffix = ''): PasteResult {
  const origin = topLeft(data)
  const dx = Math.round(at.x - origin.x)
  const dy = Math.round(at.y - origin.y)
  const shift = (q: { x: number; y: number }) => ({ x: q.x + dx, y: q.y + dy })
  const idMap = new Map<string, string>()
  const shotMap = new Map<string, string>()
  const types = new Set(p.sceneTypes.map((t) => t.id))
  const flags = new Set(p.flags.map((f) => f.id))

  const scenes = data.scenes.map((src): Scene => {
    const id = uid('scene')
    idMap.set(src.id, id)
    const copy: Scene = {
      ...structuredClone(src),
      id,
      title: suffix ? `${src.title} ${suffix}`.trim() : src.title,
      position: shift(src.position),
      triggers: src.triggers.map((t) => ({ ...t, id: uid('trg') })),
      shots: src.shots.map((x) => {
        const nid = uid('shot')
        shotMap.set(x.id, nid)
        return { ...x, id: nid }
      }),
      audioCues: src.audioCues.map((c) => ({ ...c, id: uid('cue') })),
    }
    if (copy.typeId !== undefined && !types.has(copy.typeId)) delete copy.typeId
    return copy
  })
  const logicNodes = data.logicNodes.map((src): LogicNode => {
    const id = uid(src.type === 'setFlag' ? 'set' : 'if')
    idMap.set(src.id, id)
    const copy: LogicNode = { ...structuredClone(src), id, position: shift(src.position) }
    if (copy.type === 'setFlag' && copy.flagId && !flags.has(copy.flagId)) copy.flagId = null
    if (copy.expression) {
      let next: Expr | undefined = copy.expression
      for (const f of exprFlags(copy.expression)) if (!flags.has(f)) next = next && exprWithoutFlag(next, f)
      if (next) copy.expression = next
      else delete copy.expression
    }
    return copy
  })
  const comments = data.comments.map((src): GraphComment => {
    const id = uid('note')
    idMap.set(src.id, id)
    return { ...structuredClone(src), id, position: shift(src.position) }
  })
  const transitions = data.transitions.map((src): Transition => {
    const copy: Transition = { ...structuredClone(src), id: uid('tr'), source: idMap.get(src.source)!, target: idMap.get(src.target)! }
    if (copy.waypoints) copy.waypoints = translate(copy.waypoints, dx, dy)
    if (copy.direction) {
      const d = copy.direction
      copy.direction = {
        ...d,
        sourceShotId: d.sourceShotId ? (shotMap.get(d.sourceShotId) ?? null) : null,
        targetShotId: d.targetShotId ? (shotMap.get(d.targetShotId) ?? null) : null,
      }
    }
    return copy
  })
  return { scenes, logicNodes, comments, transitions, ids: [...scenes, ...logicNodes, ...comments].map((x) => x.id) }
}
