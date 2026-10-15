import { emptyProject, newFlag, newSetFlagNode } from '../lib/factory'
import type { Expr, Flag, LogicNode, Project } from '../lib/schema'
import { branch, link, scene } from './branchProject'

export const flag = (id: string, name: string, defaultValue = false): Flag => ({ ...newFlag(name), id, defaultValue })
export const setNode = (id: string, flagId: string | null, value: boolean, extra: Partial<LogicNode> = {}): LogicNode => ({
  ...newSetFlagNode({ x: 0, y: 0 }),
  id,
  title: id,
  flagId,
  value,
  ...extra,
})
export const check = (flagId: string, is = true): Expr => ({ op: 'flag', flagId, is })

/**
 * Start → SET insulted=TRUE → IF [insulted is TRUE] → TRUE: Bad (nightmare) / FALSE: Good (reality) → End.
 * Flags: insulted (default FALSE), ritual (default TRUE).
 */
export function stateProject(expression: Expr | undefined = check('insulted')): Project {
  return {
    ...emptyProject(),
    name: 'State',
    startSceneId: 'start',
    scenes: [
      scene('start', 'reality', { title: 'Start' }),
      scene('bad', 'nightmare', { title: 'Bad' }),
      scene('good', 'reality', { title: 'Good' }),
      scene('end', 'ending', { title: 'End' }),
    ],
    flags: [flag('insulted', 'VillagerWasInsulted'), flag('ritual', 'RitualCompleted', true)],
    logicNodes: [setNode('set1', 'insulted', true), branch('if1', { title: 'Insulted?', condition: 'free text that must never be evaluated', expression })],
    transitions: [
      link('a', 'start', 'set1', { duration: 1 }),
      link('b', 'set1', 'if1', { duration: 0 }),
      link('yes', 'if1', 'bad', { sourcePort: 'true', duration: 0 }),
      link('no', 'if1', 'good', { sourcePort: 'false', duration: 0 }),
      link('bad_end', 'bad', 'end'),
      link('good_end', 'good', 'end'),
    ],
  }
}
