import { emptyProject, newDelayNode, newEventNode, newRandomNode, newTrigger } from '../lib/factory'
import type { LogicNode, Project } from '../lib/schema'
import { link, scene } from './branchProject'

export const delayNode = (id: string, seconds: number, extra: Partial<LogicNode> = {}): LogicNode => ({ ...newDelayNode({ x: 0, y: 0 }), id, title: id, seconds, ...extra })
export const eventNode = (id: string, extra: Partial<LogicNode> = {}): LogicNode => ({ ...newEventNode({ x: 0, y: 0 }), id, title: id, ...extra })
export const randomNode = (id: string, probabilityA = 50, extra: Partial<LogicNode> = {}): LogicNode => ({ ...newRandomNode({ x: 0, y: 0 }), id, title: id, probabilityA, labelA: 'Door opens', labelB: 'Silence', ...extra })

/**
 * Start (60 s, trigger at 10 s) → Delay D (12 s) → Event E → Random R (A 30 % / B 70 %) → A (30 s, trigger at 5 s) / B (20 s) → End.
 * Link durations: `l1` 1 s, every link leaving a logic node 0 s.
 */
export function flowProject(): Project {
  return {
    ...emptyProject(),
    name: 'Flow',
    startSceneId: 'start',
    scenes: [
      scene('start', 'reality', { title: 'Start', duration: 60, triggers: [{ ...newTrigger(10), id: 'st_t', name: 'Knock', intensity: 4 }] }),
      scene('a', 'nightmare', { title: 'Door', duration: 30, triggers: [{ ...newTrigger(5), id: 'a_t', name: 'Whisper', intensity: 8 }] }),
      scene('b', 'reality', { title: 'Quiet', duration: 20 }),
      scene('end', 'ending', { title: 'End', duration: 10 }),
    ],
    logicNodes: [delayNode('D', 12), eventNode('E', { title: 'Church bell', eventCategory: 'reveal', description: 'The bell rings once' }), randomNode('R', 30)],
    transitions: [
      link('l1', 'start', 'D', { duration: 1 }),
      link('l2', 'D', 'E', { duration: 0 }),
      link('l3', 'E', 'R', { duration: 0 }),
      link('la', 'R', 'a', { sourcePort: 'a', duration: 0 }),
      link('lb', 'R', 'b', { sourcePort: 'b', duration: 0 }),
      link('a_end', 'a', 'end'),
      link('b_end', 'b', 'end'),
    ],
  }
}
