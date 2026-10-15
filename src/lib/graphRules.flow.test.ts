import { describe, expect, it } from 'vitest'
import { canConnect, linkDuration, logicCycles, nodeKind, portsOf } from './graphRules'
import { flowProject, delayNode, eventNode, randomNode } from '../test/flowProject'
import { branch, link } from '../test/branchProject'
import type { Project } from './schema'

const base = (): Project => {
  const p = flowProject()
  p.transitions = []
  p.logicNodes = [eventNode('E'), delayNode('D', 5), randomNode('R'), branch('IF'), eventNode('E2'), delayNode('D2', 1), randomNode('R2')]
  return p
}
const reason = (p: Project, c: Parameters<typeof canConnect>[1]) => {
  const r = canConnect(p, c)
  return r.ok ? 'ok' : r.reason
}

describe('connection rules for Event, Delay and Random Branch', () => {
  it('classifies the node kinds explicitly', () => {
    const p = base()
    expect(['E', 'D', 'R', 'IF', 'start'].map((id) => nodeKind(p, id))).toEqual(['event', 'delay', 'random', 'branch', 'scene'])
    expect(portsOf('random')).toEqual(['a', 'b'])
    expect(portsOf('branch')).toEqual(['true', 'false'])
    expect(portsOf('event')).toEqual([])
  })
  it('Random needs a port of its own type; IF keeps TRUE/FALSE only', () => {
    const p = base()
    expect(reason(p, { source: 'R', target: 'a' })).toBe('portMissing')
    expect(reason(p, { source: 'R', sourcePort: 'true', target: 'a' })).toBe('portWrong')
    expect(reason(p, { source: 'R', sourcePort: 'a', target: 'a' })).toBe('ok')
    expect(reason(p, { source: 'R', sourcePort: 'b', target: 'b' })).toBe('ok')
    expect(reason(p, { source: 'IF', sourcePort: 'a', target: 'a' })).toBe('portWrong')
    expect(reason(p, { source: 'IF', sourcePort: 'true', target: 'a' })).toBe('ok')
    expect(reason(p, { source: 'R', sourcePort: 'a', target: 'R' })).toBe('self')
  })
  it('allows one connection per Random output', () => {
    const p = base()
    p.transitions = [link('x', 'R', 'a', { sourcePort: 'a' })]
    expect(reason(p, { source: 'R', sourcePort: 'a', target: 'b' })).toBe('portTaken')
    expect(reason(p, { source: 'R', sourcePort: 'b', target: 'b' })).toBe('ok')
  })
  it('Event and Delay reject pins and allow a single outgoing connection', () => {
    const p = base()
    for (const id of ['E', 'D']) {
      expect(reason(p, { source: id, sourcePort: 'a', target: 'a' })).toBe('portUnexpected')
      expect(reason(p, { source: id, target: 'a' })).toBe('ok')
      expect(reason({ ...p, transitions: [link('x', id, 'a')] }, { source: id, target: 'b' })).toBe('outputTaken')
      expect(reason(p, { source: id, target: id })).toBe('self')
    }
  })
  it('accepts incoming connections from scenes and from every logic node', () => {
    const p = base()
    for (const target of ['E', 'D', 'R']) {
      expect(reason(p, { source: 'start', target })).toBe('ok')
      expect(reason(p, { source: 'IF', sourcePort: 'true', target })).toBe('ok')
    }
    expect(reason(p, { source: 'E', target: 'R' })).toBe('ok')
    expect(reason(p, { source: 'D', target: 'E' })).toBe('ok')
    expect(reason(p, { source: 'note-missing', target: 'E' })).toBe('missing')
  })
  it('prevents logic-only cycles through the new nodes but not loops through a scene', () => {
    const p = base()
    p.transitions = [link('1', 'E', 'D'), link('2', 'D', 'R'), link('3', 'R', 'E2', { sourcePort: 'a' })]
    expect(reason(p, { source: 'E2', target: 'E' })).toBe('logicCycle')
    expect(reason(p, { source: 'R', sourcePort: 'b', target: 'E' })).toBe('logicCycle')
    expect(reason(p, { source: 'start', target: 'E' })).toBe('ok')
    const loop = { ...p, transitions: [link('1', 'start', 'D'), link('2', 'D', 'R'), link('3', 'R', 'start', { sourcePort: 'a' })] }
    expect(logicCycles(loop)).toEqual([])
    const cyc = { ...p, transitions: [link('1', 'D', 'R'), link('2', 'R', 'D', { sourcePort: 'a' })] }
    expect(logicCycles(cyc).sort()).toEqual(['D', 'R'])
  })
  it('logic outputs default to no extra time', () => {
    const p = base()
    for (const id of ['E', 'D', 'R']) expect(linkDuration(p, id)).toBe(0)
    expect(linkDuration(p, 'start')).toBe(1)
  })
})
