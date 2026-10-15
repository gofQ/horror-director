import { emptyProject, newSeqReturnNode, newSequenceNode, newTrigger } from '../lib/factory'
import type { LogicNode, Project } from '../lib/schema'
import { link, scene } from './branchProject'
import { delayNode, eventNode } from './flowProject'
import { flag, setNode } from './stateProject'

export const sequenceNode = (id: string, extra: Partial<LogicNode> = {}): LogicNode => ({ ...newSequenceNode({ x: 0, y: 0 }), id, title: id, ...extra })
export const returnNode = (id: string, sequenceId: string | null, stage: number, extra: Partial<LogicNode> = {}): LogicNode => ({
  ...newSeqReturnNode({ x: 0, y: 0 }, undefined, sequenceId, stage),
  id,
  title: id,
  ...extra,
})

/**
 * Start (60 s, trigger at 10 s) → Sequence Q
 *   Then 0 → Event "Whisper" (E0) → Return 0 (R0)
 *   Then 1 → Delay 7 s (D1) → Set Flag RealityBroken = TRUE (S1) → Return 1 (R1)
 *   Completed → Door (30 s, trigger at 5 s) → End
 * Only the link Start → Q takes time (1 s).
 */
export function seqProject(): Project {
  return {
    ...emptyProject(),
    name: 'Sequence',
    startSceneId: 'start',
    scenes: [
      scene('start', 'reality', { title: 'Start', duration: 60, triggers: [{ ...newTrigger(10), id: 'st_t', name: 'Knock', intensity: 4 }] }),
      scene('door', 'nightmare', { title: 'Door', duration: 30, triggers: [{ ...newTrigger(5), id: 'dr_t', name: 'Whisper', intensity: 8 }] }),
      scene('end', 'ending', { title: 'End', duration: 10 }),
    ],
    flags: [flag('broken', 'RealityBroken')],
    logicNodes: [
      sequenceNode('Q', { title: 'Haunting' }),
      eventNode('E0', { title: 'Whisper', eventCategory: 'threat' }),
      returnNode('R0', 'Q', 0),
      delayNode('D1', 7),
      setNode('S1', 'broken', true),
      returnNode('R1', 'Q', 1),
    ],
    transitions: [
      link('in', 'start', 'Q', { duration: 1 }),
      link('t0', 'Q', 'E0', { sourcePort: 'then0', duration: 0 }),
      link('e0r', 'E0', 'R0', { duration: 0 }),
      link('t1', 'Q', 'D1', { sourcePort: 'then1', duration: 0 }),
      link('d1s', 'D1', 'S1', { duration: 0 }),
      link('s1r', 'S1', 'R1', { duration: 0 }),
      link('done', 'Q', 'door', { sourcePort: 'completed', duration: 0 }),
      link('door_end', 'door', 'end'),
    ],
  }
}
/** The full route through both stages into the Door scene. */
export const FULL = ['in', 't0', 'e0r', 't1', 'd1s', 's1r', 'done']
