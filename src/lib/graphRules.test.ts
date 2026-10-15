import { describe, expect, it } from 'vitest'
import { canConnect, logicCycles, linkDuration, nodeKind } from './graphRules'
import { branch, branchProject, link, scene } from '../test/branchProject'
import { emptyProject, newComment } from './factory'

const p = branchProject()

describe('canConnect', () => {
  it('accepts the Village Square pattern: scene → IF, IF.TRUE → scene, IF.FALSE → scene', () => {
    const empty = { ...p, transitions: [] }
    expect(canConnect(empty, { source: 'sq', target: 'if1' })).toEqual({ ok: true })
    expect(canConnect(empty, { source: 'if1', sourcePort: 'true', target: 'collapse' })).toEqual({ ok: true })
    expect(canConnect(empty, { source: 'if1', sourcePort: 'false', target: 'talk' })).toEqual({ ok: true })
  })
  it('requires a TRUE/FALSE pin when leaving an IF node and forbids pins elsewhere', () => {
    const empty = { ...p, transitions: [] }
    expect(canConnect(empty, { source: 'if1', target: 'talk' })).toEqual({ ok: false, reason: 'portMissing' })
    expect(canConnect(empty, { source: 'sq', sourcePort: 'true', target: 'talk' })).toEqual({ ok: false, reason: 'portUnexpected' })
  })
  it('allows one connection per branch output pin', () => {
    expect(canConnect(p, { source: 'if1', sourcePort: 'true', target: 'talk' })).toEqual({ ok: false, reason: 'portTaken' })
    expect(canConnect(p, { source: 'if1', sourcePort: 'false', target: 'collapse' })).toEqual({ ok: false, reason: 'portTaken' })
  })
  it('rejects duplicates: scene pairs and scene → IF repeats; a scene may feed several IF nodes', () => {
    expect(canConnect(p, { source: 'collapse', target: 'end' })).toEqual({ ok: false, reason: 'pairExists' })
    expect(canConnect(p, { source: 'sq', target: 'if1' })).toEqual({ ok: false, reason: 'duplicate' })
    const q = { ...p, logicNodes: [...p.logicNodes, branch('if2')] }
    expect(canConnect(q, { source: 'sq', target: 'if2' })).toEqual({ ok: true })
    expect(canConnect(q, { source: 'talk', target: 'if1' })).toEqual({ ok: true }) // several inputs per IF are fine
  })
  it('rejects missing endpoints and comments', () => {
    const c = newComment()
    const q = { ...p, comments: [c] }
    expect(canConnect(q, { source: 'nope', target: 'sq' })).toEqual({ ok: false, reason: 'missing' })
    expect(canConnect(q, { source: 'sq', target: c.id })).toEqual({ ok: false, reason: 'comment' })
    expect(canConnect(q, { source: c.id, target: 'sq' })).toEqual({ ok: false, reason: 'comment' })
  })
  it('rejects an IF node connected to itself and logic-only cycles, but allows cycles through scenes', () => {
    const q = { ...p, logicNodes: [...p.logicNodes, branch('if2'), branch('if3')], transitions: [] as typeof p.transitions }
    expect(canConnect(q, { source: 'if1', sourcePort: 'true', target: 'if1' })).toEqual({ ok: false, reason: 'self' })
    const chain = { ...q, transitions: [link('a', 'if1', 'if2', { sourcePort: 'true' }), link('b', 'if2', 'if3', { sourcePort: 'true' })] }
    expect(canConnect(chain, { source: 'if3', sourcePort: 'true', target: 'if1' })).toEqual({ ok: false, reason: 'logicCycle' })
    expect(canConnect(chain, { source: 'if3', sourcePort: 'true', target: 'talk' })).toEqual({ ok: true })
    // loop back to an earlier scene is an intentional cycle (limited by the existing safety limits)
    expect(canConnect(p, { source: 'end', target: 'sq' })).toEqual({ ok: true })
    const loop = { ...p, transitions: [...p.transitions, link('back', 'collapse', 'sq')] }
    expect(logicCycles(loop)).toEqual([])
  })
})

describe('helpers', () => {
  it('nodeKind and default link durations', () => {
    expect(nodeKind(p, 'sq')).toBe('scene')
    expect(nodeKind(p, 'if1')).toBe('branch')
    expect(nodeKind(p, 'zzz')).toBeNull()
    expect(linkDuration(p, 'sq')).toBe(1)
    expect(linkDuration(p, 'if1')).toBe(0)
  })
  it('an empty project has nothing to cycle', () => {
    expect(logicCycles(emptyProject())).toEqual([])
    expect(scene('x').id).toBe('x')
  })
})
