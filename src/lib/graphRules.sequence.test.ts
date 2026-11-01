import { describe, expect, it } from 'vitest'
import { canConnect, isSingleOutput, nodeKind, portsOf } from './graphRules'
import { stageOf } from './seqflow'
import { returnNode, seqProject, sequenceNode } from '../test/seqProject'
import { branch, link } from '../test/branchProject'
import { delayNode, eventNode, randomNode } from '../test/flowProject'
import type { Project } from './schema'

const empty = (): Project => {
  const p = seqProject()
  p.transitions = []
  p.logicNodes = [sequenceNode('Q'), sequenceNode('Q2'), returnNode('R0', 'Q', 0), returnNode('R1', 'Q', 1), returnNode('RU', null, 0), eventNode('E'), delayNode('D', 1), eventNode('E2'), branch('IF'), randomNode('RND')]
  return p
}
const why = (p: Project, c: Parameters<typeof canConnect>[1]) => {
  const r = canConnect(p, c)
  return r.ok ? 'ok' : r.reason
}

describe('Sequence connection rules', () => {
  it('classifies kinds and pins', () => {
    const p = empty()
    expect(['Q', 'R0', 'E'].map((id) => nodeKind(p, id))).toEqual(['sequence', 'seqReturn', 'event'])
    expect(portsOf('sequence')).toEqual(['then0', 'then1', 'completed'])
    expect(portsOf('seqReturn')).toEqual([])
    expect(isSingleOutput('seqReturn')).toBe(false)
  })
  it('requires a Sequence pin of the right type, one connection per pin', () => {
    const p = empty()
    expect(why(p, { source: 'Q', target: 'E' })).toBe('portMissing')
    expect(why(p, { source: 'Q', sourcePort: 'true', target: 'E' })).toBe('portWrong')
    expect(why(p, { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('ok')
    expect(why(p, { source: 'IF', sourcePort: 'then0', target: 'E' })).toBe('portWrong')
    expect(why(p, { source: 'RND', sourcePort: 'then1', target: 'E' })).toBe('portWrong')
    expect(why({ ...p, transitions: [link('x', 'Q', 'E', { sourcePort: 'then0' })] }, { source: 'Q', sourcePort: 'then0', target: 'E2' })).toBe('portTaken')
  })
  it('a Return has no output', () => {
    expect(why(empty(), { source: 'R0', target: 'E' })).toBe('noOutput')
    expect(why(empty(), { source: 'R0', sourcePort: 'then0', target: 'E' })).toBe('noOutput')
  })
  it('builds a stage: Event / Delay / Set Flag chain closed by the matching Return', () => {
    let p = empty()
    expect(why(p, { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('ok')
    p = { ...p, transitions: [link('a', 'Q', 'E', { sourcePort: 'then0' })] }
    expect(stageOf(p, 'E')).toEqual({ seqId: 'Q', stage: 0 })
    expect(why(p, { source: 'E', target: 'D' })).toBe('ok')
    p = { ...p, transitions: [...p.transitions, link('b', 'E', 'D')] }
    expect(stageOf(p, 'D')).toEqual({ seqId: 'Q', stage: 0 })
    expect(why(p, { source: 'D', target: 'R0' })).toBe('ok')
    expect(why(p, { source: 'D', target: 'R1' })).toBe('seqReturnMismatch') // wrong stage
    expect(why(p, { source: 'D', target: 'RU' })).toBe('seqReturnUnowned')
    const other = { ...p, logicNodes: [...p.logicNodes, returnNode('RQ2', 'Q2', 0)] }
    expect(why(other, { source: 'D', target: 'RQ2' })).toBe('seqReturnMismatch') // wrong owner
  })
  it('forbids scenes, IF, Random Branch and nested Sequences inside a stage', () => {
    const p = { ...empty(), transitions: [link('a', 'Q', 'E', { sourcePort: 'then0' })] }
    for (const target of ['start', 'IF', 'RND', 'Q2']) expect(why(p, { source: 'E', target })).toBe('seqStageForbidden')
    expect(why(empty(), { source: 'Q', sourcePort: 'then1', target: 'start' })).toBe('seqStageForbidden')
    expect(why(empty(), { source: 'Q', sourcePort: 'then1', target: 'Q2' })).toBe('seqStageForbidden')
    expect(why(empty(), { source: 'Q', sourcePort: 'then1', target: 'IF' })).toBe('seqStageForbidden')
  })
  it('forbids shortcuts into a stage and stage-to-stage links', () => {
    const p = { ...empty(), transitions: [link('a', 'Q', 'E', { sourcePort: 'then0' }), link('b', 'Q', 'D', { sourcePort: 'then1' })] }
    expect(why(p, { source: 'start', target: 'E' })).toBe('seqStageShortcut')
    expect(why(p, { source: 'Q', sourcePort: 'completed', target: 'D' })).toBe('seqStageShortcut')
    expect(why(p, { source: 'E', target: 'D' })).toBe('seqStageShortcut') // stage 0 → stage 1
    expect(why(p, { source: 'E2', target: 'E' })).toBe('seqStageShortcut')
    expect(why(p, { source: 'start', target: 'R0' })).toBe('seqReturnOutside')
    expect(why(p, { source: 'Q', sourcePort: 'completed', target: 'R1' })).toBe('seqReturnOutside')
    expect(why(p, { source: 'IF', sourcePort: 'true', target: 'R0' })).toBe('seqReturnOutside')
  })
  it('a Return accepts only one input', () => {
    const p = { ...empty(), transitions: [link('a', 'Q', 'R0', { sourcePort: 'then0' })] }
    expect(why(p, { source: 'Q', sourcePort: 'then0', target: 'R0' })).toBe('portTaken')
    expect(why({ ...p, transitions: [link('a', 'Q', 'E', { sourcePort: 'then0' }), link('b', 'E', 'R0')] }, { source: 'D', target: 'R0' })).toBe('seqReturnOutside')
  })
  it('Completed continues the normal graph and chaining Sequences is allowed (not nesting)', () => {
    const p = empty()
    expect(why(p, { source: 'Q', sourcePort: 'completed', target: 'start' })).toBe('ok')
    expect(why(p, { source: 'Q', sourcePort: 'completed', target: 'Q2' })).toBe('ok')
    expect(why(p, { source: 'start', target: 'Q' })).toBe('ok')
    expect(why(p, { source: 'IF', sourcePort: 'true', target: 'Q' })).toBe('ok')
    expect(why({ ...p, transitions: [link('c', 'Q', 'Q2', { sourcePort: 'completed' })] }, { source: 'Q2', sourcePort: 'completed', target: 'Q' })).toBe('logicCycle')
  })
  it('existing node behaviour is unchanged', () => {
    const p = empty()
    expect(why(p, { source: 'IF', sourcePort: 'true', target: 'start' })).toBe('ok')
    expect(why(p, { source: 'IF', sourcePort: 'a', target: 'start' })).toBe('portWrong')
    expect(why(p, { source: 'E', target: 'start' })).toBe('ok')
    expect(why({ ...p, transitions: [link('x', 'E', 'start')] }, { source: 'E', target: 'D' })).toBe('outputTaken')
    expect(why(p, { source: 'start', target: 'RND' })).toBe('ok')
  })
})

describe('pulling an existing chain into a stage (audit fix)', () => {
  it('refuses chains that would break the stage: scenes, IF, Random, shortcuts, wrong Return', () => {
    const base = empty()
    const withLinks = (...ts: ReturnType<typeof link>[]) => ({ ...base, transitions: ts })
    expect(why(withLinks(link('x', 'E', 'start')), { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('seqStageForbidden')
    expect(why(withLinks(link('x', 'E', 'IF')), { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('seqStageForbidden')
    expect(why(withLinks(link('x', 'E', 'D'), link('y', 'D', 'RND')), { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('seqStageForbidden')
    expect(why(withLinks(link('x', 'E', 'D'), link('y', 'E2', 'D')), { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('seqStageShortcut')
    expect(why(withLinks(link('x', 'E', 'R1')), { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('seqReturnMismatch')
    expect(why(withLinks(link('x', 'E', 'RU')), { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('seqReturnUnowned')
  })
  it('accepts a valid open chain or one closed by the matching Return, and no accepted connection fails validation', async () => {
    const { validateProject } = await import('./validate')
    const base = empty()
    const ok1 = { ...base, transitions: [link('x', 'E', 'D')] }
    expect(why(ok1, { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('ok')
    const ok2 = { ...base, transitions: [link('x', 'E', 'D'), link('y', 'D', 'R0')] }
    expect(why(ok2, { source: 'Q', sourcePort: 'then0', target: 'E' })).toBe('ok')
    const joined = { ...ok2, transitions: [...ok2.transitions, link('z', 'Q', 'E', { sourcePort: 'then0' })] }
    const seqErrors = validateProject(joined).errors.filter((e) => /seq/i.test(JSON.stringify(e)))
    expect(seqErrors).toEqual([])
  })
})
