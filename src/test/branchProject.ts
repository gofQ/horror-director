import { emptyProject, newLogicNode, newScene, newTransition, newTrigger } from '../lib/factory'
import type { LogicNode, Project, Scene, SceneKind, Transition } from '../lib/schema'

/** Village Square → IF "insulted villagers?" → TRUE: Collapse (dream) / FALSE: Conversation (reality) → Ending. */
export const scene = (id: string, kind: SceneKind = 'reality', extra: Partial<Scene> = {}): Scene => ({
  ...newScene(kind, { x: 0, y: 0 }),
  id,
  title: id,
  duration: 60,
  ...extra,
})
export const branch = (id: string, extra: Partial<LogicNode> = {}): LogicNode => ({ ...newLogicNode({ x: 0, y: 0 }), id, title: id, condition: `${id}?`, ...extra })
export const link = (id: string, source: string, target: string, extra: Partial<Transition> = {}): Transition => ({ ...newTransition(source, target), id, ...extra })

export function branchProject(): Project {
  const sq = scene('sq', 'reality', { title: 'Village Square', triggers: [{ ...newTrigger(10), id: 'sq_t', name: 'Bell', intensity: 4 }] })
  const collapse = scene('collapse', 'dream', { title: 'Collapse', triggers: [{ ...newTrigger(5), id: 'co_t', name: 'Villagers appear', intensity: 8 }] })
  const talk = scene('talk', 'reality', { title: 'Conversation continues' })
  const end = scene('end', 'ending', { title: 'End' })
  return {
    ...emptyProject(),
    name: 'Branch',
    startSceneId: 'sq',
    scenes: [sq, collapse, talk, end],
    logicNodes: [branch('if1', { title: 'Insulted?', condition: 'Did the protagonist insult the villagers?' })],
    transitions: [
      link('into', 'sq', 'if1', { duration: 2, label: 'Talk' }),
      link('yes', 'if1', 'collapse', { sourcePort: 'true', duration: 0 }),
      link('no', 'if1', 'talk', { sourcePort: 'false', duration: 0 }),
      link('c_end', 'collapse', 'end'),
      link('t_end', 'talk', 'end'),
    ],
  }
}
