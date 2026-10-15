import { describe, expect, it } from 'vitest'
import { analyze, findLoops } from './graph'
import { buildExport, parseProject, serializeProject } from './io'
import { emptyProject, newScene, newTransition } from './factory'
import { sampleProject } from './sample'
import { crossingOf, projectSchema } from './schema'

describe('crossingOf', () => {
  it('classifies dream/reality transitions', () => {
    expect(crossingOf('reality', 'dream')).toBe('reality->dream')
    expect(crossingOf('reality', 'nightmare')).toBe('reality->dream')
    expect(crossingOf('memory', 'reality')).toBe('dream->reality')
    expect(crossingOf('dream', 'nightmare')).toBe('same-layer')
  })
})

describe('sample project', () => {
  const p = sampleProject()
  it('conforms to the schema', () => {
    expect(projectSchema.safeParse(p).success).toBe(true)
  })
  it('has no errors and detects its loops', () => {
    const a = analyze(p)
    expect(a.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(a.loops.length).toBeGreaterThanOrEqual(2) // self-loop + living/wake/bedroom cycle
    expect(a.reachable.size).toBe(p.scenes.length)
    expect(a.stats.crossings).toBeGreaterThan(0)
  })
})

describe('analyze', () => {
  it('flags missing start, unreachable scenes and dead ends', () => {
    const p = emptyProject()
    const orphan = newScene('dream')
    p.scenes.push(orphan)
    const a = analyze(p)
    const msgs = a.issues.map((i) => i.message).join('\n')
    expect(msgs).toMatch(/unreachable/)
    expect(msgs).toMatch(/dead end/)
    p.startSceneId = null
    expect(analyze(p).issues.some((i) => i.severity === 'error')).toBe(true)
  })
  it('flags a closed loop without exit', () => {
    const p = emptyProject()
    const a = newScene('dream')
    p.scenes.push(a)
    p.transitions.push(newTransition(p.startSceneId!, a.id), newTransition(a.id, a.id))
    const res = analyze(p)
    expect(res.issues.some((i) => /Closed loop/.test(i.message))).toBe(true)
    expect(res.issues.some((i) => /never leads back to reality/.test(i.message))).toBe(true)
  })
  it('findLoops handles self loops and ignores DAGs', () => {
    const dag = new Map([['a', ['b']], ['b', []]])
    expect(findLoops(dag)).toEqual([])
    const self = new Map([['a', ['a']]])
    expect(findLoops(self)).toEqual([['a']])
  })
})

describe('import/export', () => {
  it('round-trips a project', () => {
    const p = sampleProject()
    const res = parseProject(serializeProject(p))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.project).toEqual(p)
  })
  it('includes derived crossing data', () => {
    const e = buildExport(sampleProject())
    expect(e.derived.transitions.find((t) => t.id === 'e2')?.crossing).toBe('reality->dream')
  })
  it('accepts a bare project object and fills defaults', () => {
    const res = parseProject(JSON.stringify({ name: 'x', scenes: [{ id: 'a', title: 'A', kind: 'reality', position: { x: 0, y: 0 } }] }))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.project.scenes[0].triggers).toEqual([])
  })
  it('rejects invalid input with a readable error', () => {
    expect(parseProject('nope')).toMatchObject({ ok: false })
    const bad = parseProject(JSON.stringify({ name: 'x', scenes: [{ id: 'a', title: 'A', kind: 'bogus', position: { x: 0, y: 0 } }] }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/scenes\.0\.kind/)
  })
  it('drops dangling transitions and start references', () => {
    const p = sampleProject()
    p.transitions.push(newTransition('ghost', 's_hall'))
    p.startSceneId = 'ghost'
    const res = parseProject(JSON.stringify(p))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.project.transitions.length).toBe(sampleProject().transitions.length)
      expect(res.project.startSceneId).toBeNull()
    }
  })
})
