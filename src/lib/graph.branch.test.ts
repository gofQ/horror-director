import { describe, expect, it } from 'vitest'
import { analyze, effectiveHops } from './graph'
import { computeLayout, NODE_H, NODE_W } from './layout'
import { formatDiagnostics } from './diagnostics'
import { sampleProject } from './sample'
import { branch, branchProject, link, scene } from '../test/branchProject'
import type { Project } from './schema'

const base = branchProject()
const text = (p: Project) => formatDiagnostics('en', analyze(p).issues.map((i) => i.diagnostic)).join('\n')

describe('effective hops', () => {
  it('walks through IF nodes and keeps plain transitions as single-link hops', () => {
    const hops = effectiveHops(base).map((h) => [h.from, h.to, h.links.join('+'), h.via.join(',')])
    expect(hops).toEqual([
      ['sq', 'collapse', 'into+yes', 'if1'],
      ['sq', 'talk', 'into+no', 'if1'],
      ['collapse', 'end', 'c_end', ''],
      ['talk', 'end', 't_end', ''],
    ])
  })
  it('does not loop forever on a malformed logic cycle', () => {
    const p = { ...base, logicNodes: [...base.logicNodes, branch('if2')], transitions: [link('a', 'sq', 'if1'), link('b', 'if1', 'if2', { sourcePort: 'true' }), link('c', 'if2', 'if1', { sourcePort: 'true' })] }
    expect(effectiveHops(p)).toEqual([])
  })
  it('the sample project has exactly its plain transitions as hops', () => {
    const s = sampleProject()
    expect(effectiveHops(s)).toHaveLength(s.transitions.length)
  })
})

describe('analysis with IF nodes', () => {
  it('reports no false unreachable scenes or dead ends for scenes reached only through a branch', () => {
    const a = analyze(base)
    expect([...a.reachable].sort()).toEqual(['collapse', 'end', 'if1', 'sq', 'talk'])
    const t = text(base)
    expect(t).not.toMatch(/not reachable|unreachable/i)
    expect(t).not.toMatch(/dead end/i)
    expect(a.stats.branches).toBe(1)
    expect(a.stats.crossings).toBe(2) // reality → dream through the IF node (counted once) and dream → ending
    expect(a.stats.transitions).toBe(5)
  })
  it('reports a scene that is disconnected from the start, and an IF node that cannot be reached', () => {
    const p: Project = { ...base, scenes: [...base.scenes, scene('island')], logicNodes: [...base.logicNodes, branch('orphan')] }
    const t = text(p)
    expect(t).toMatch(/island/)
    expect(t).toMatch(/IF node "orphan" cannot be reached/)
  })
  it('warns about unconnected TRUE/FALSE outputs and treats a scene feeding only an IF node as having an exit', () => {
    const p: Project = { ...base, transitions: base.transitions.filter((t) => t.id !== 'no') }
    const t = text(p)
    expect(t).toMatch(/FALSE output of IF node "Insulted\?" is not connected/)
    expect(t).not.toMatch(/Village Square.*dead end/i)
    // "Conversation continues" is now unreachable
    expect(analyze(p).reachable.has('talk')).toBe(false)
  })
  it('finds loops that pass through an IF node', () => {
    const p: Project = { ...base, transitions: [...base.transitions, link('back', 'end', 'sq')], scenes: base.scenes.map((s) => (s.id === 'end' ? { ...s, kind: 'reality' as const } : s)) }
    const a = analyze(p)
    expect(a.loops.length).toBeGreaterThan(0)
    expect(a.loops.flat()).toContain('if1')
  })
  it('legacy projects keep identical statistics (no branches, same transitions and crossings)', () => {
    const s = sampleProject()
    const a = analyze(s)
    expect(a.stats.branches).toBe(0)
    expect(a.stats.transitions).toBe(s.transitions.length)
    expect(a.issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('auto arrange with IF nodes', () => {
  const rects = (pos: Record<string, { x: number; y: number }>) => Object.entries(pos).map(([id, p]) => ({ id, x: p.x, y: p.y, w: NODE_W, h: NODE_H }))
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  it('places scenes and IF nodes without overlap, left to right, deterministically and idempotently', () => {
    const pos = computeLayout(base)
    expect(Object.keys(pos).sort()).toEqual(['collapse', 'end', 'if1', 'sq', 'talk'])
    const r = rects(pos)
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlap(r[i], r[j])).toBe(false)
    expect(pos.sq.x).toBeLessThan(pos.if1.x)
    expect(pos.if1.x).toBeLessThan(pos.collapse.x)
    expect(pos.collapse.x).toBeLessThan(pos.end.x)
    expect(computeLayout(base)).toEqual(pos)
    const arranged: Project = { ...base, scenes: base.scenes.map((s) => ({ ...s, position: pos[s.id] })), logicNodes: base.logicNodes.map((n) => ({ ...n, position: pos[n.id] })) }
    expect(computeLayout(arranged)).toEqual(pos)
  })
  it('never positions comments and keeps the sample layout independent of the new fields', () => {
    const s = sampleProject()
    const withEmpty = computeLayout({ ...s, logicNodes: [] })
    expect(computeLayout(s)).toEqual(withEmpty)
    expect(Object.keys(withEmpty)).toHaveLength(s.scenes.length)
  })
})
