import { describe, expect, it } from 'vitest'
import { evalExpr, exprAppend, exprDepth, exprFlags, exprReplace, exprSize, exprToText, exprWithoutFlag, exprWithinLimits, flagNameTaken, flagUsage, initialFlagState } from './flags'
import { canConnect, nodeKind } from './graphRules'
import { EXPR_MAX_DEPTH, EXPR_MAX_NODES, type Expr } from './schema'
import { validateProject } from './validate'
import { analyze } from './graph'
import { computeLayout } from './layout'
import { check, flag, stateProject } from '../test/stateProject'
import { link, scene } from '../test/branchProject'
import { emptyProject } from './factory'

const A = check('a')
const B = check('b')
const state = (a: boolean, b: boolean) => ({ a, b })
const words = { and: 'AND', or: 'OR', not: 'NOT', isTrue: 'is TRUE', isFalse: 'is FALSE', unknown: '?' }

describe('expression evaluation (truth tables)', () => {
  const cases: [boolean, boolean][] = [[false, false], [false, true], [true, false], [true, true]]
  it('check flag is TRUE / is FALSE', () => {
    expect(evalExpr(A, state(true, false))).toBe(true)
    expect(evalExpr(check('a', false), state(true, false))).toBe(false)
    expect(evalExpr(check('a', false), state(false, false))).toBe(true)
  })
  it.each(cases)('AND / OR / NOT for a=%s b=%s', (a, b) => {
    const s = state(a, b)
    expect(evalExpr({ op: 'and', args: [A, B] }, s)).toBe(a && b)
    expect(evalExpr({ op: 'or', args: [A, B] }, s)).toBe(a || b)
    expect(evalExpr({ op: 'not', arg: A }, s)).toBe(!a)
    expect(evalExpr({ op: 'not', arg: { op: 'and', args: [A, B] } }, s)).toBe(!(a && b))
    expect(evalExpr({ op: 'and', args: [A, { op: 'or', args: [B, { op: 'not', arg: A }] }] }, s)).toBe(a && (b || !a))
  })
  it('an unknown flag reads as FALSE and never throws', () => {
    expect(evalExpr(check('ghost'), {})).toBe(false)
    expect(evalExpr(check('ghost', false), {})).toBe(true)
  })
  it('initial state comes from the flag defaults', () => {
    expect(initialFlagState(stateProject())).toEqual({ insulted: false, ritual: true })
  })
})

describe('expression helpers', () => {
  const tree: Expr = { op: 'and', args: [A, { op: 'or', args: [B, { op: 'not', arg: check('c') }] }] }
  it('size, depth, flags and text', () => {
    expect(exprSize(tree)).toBe(6)
    expect(exprDepth(tree)).toBe(4)
    expect(exprFlags(tree)).toEqual(['a', 'b', 'c'])
    const names = new Map([['a', 'A'], ['b', 'B']])
    expect(exprToText(tree, (id) => names.get(id), words)).toBe('A is TRUE AND (B is TRUE OR NOT (? is TRUE))')
  })
  it('limits', () => {
    let deep: Expr = A
    for (let i = 0; i < EXPR_MAX_DEPTH; i++) deep = { op: 'not', arg: deep }
    expect(exprWithinLimits(deep)).toBe(false)
    const wide: Expr = { op: 'and', args: Array.from({ length: EXPR_MAX_NODES }, () => A) }
    expect(exprWithinLimits(wide)).toBe(false)
    expect(exprWithinLimits(tree)).toBe(true)
  })
  it('replace / append / remove collapse groups and never mutate', () => {
    const copy = structuredClone(tree)
    expect(exprReplace(tree, [1, 0], check('z'))).toEqual({ op: 'and', args: [A, { op: 'or', args: [check('z'), { op: 'not', arg: check('c') }] }] })
    expect(exprReplace(tree, [1, 1], null)).toEqual({ op: 'and', args: [A, B] }) // or-group collapses to its remaining child
    expect(exprReplace(A, [], null)).toBeNull()
    expect(exprAppend(tree, [], check('d'))).toMatchObject({ op: 'and', args: [A, expect.anything(), check('d')] })
    expect(tree).toEqual(copy)
  })
  it('removing a flag everywhere collapses or clears the expression', () => {
    expect(exprWithoutFlag(tree, 'c')).toEqual({ op: 'and', args: [A, B] })
    expect(exprWithoutFlag({ op: 'and', args: [A, { op: 'not', arg: A }] }, 'a')).toBeUndefined()
    expect(exprWithoutFlag(tree, 'nope')).toEqual(tree)
  })
})

describe('flag usage and names', () => {
  it('lists Set Flag nodes and IF conditions that reference a flag', () => {
    const p = stateProject({ op: 'and', args: [check('insulted'), check('ritual', false)] })
    expect(flagUsage(p, 'insulted')).toEqual({ setNodes: ['set1'], branches: ['if1'] })
    expect(flagUsage(p, 'ritual')).toEqual({ setNodes: [], branches: ['if1'] })
    expect(flagUsage(p, 'other')).toEqual({ setNodes: [], branches: [] })
  })
  it('names are compared trimmed and case-insensitively', () => {
    const p = stateProject()
    expect(flagNameTaken(p, '  villagerwasinsulted ')).toBe(true)
    expect(flagNameTaken(p, 'VillagerWasInsulted', 'insulted')).toBe(false)
    expect(flagNameTaken(p, 'New')).toBe(false)
  })
})

describe('Set Flag graph rules', () => {
  const p = stateProject()
  it('Set Flag has one input, one output and no pin id', () => {
    expect(nodeKind(p, 'set1')).toBe('setFlag')
    expect(canConnect(p, { source: 'set1', target: 'good' })).toEqual({ ok: false, reason: 'outputTaken' })
    const free = { ...p, transitions: p.transitions.filter((t) => t.id !== 'b') }
    expect(canConnect(free, { source: 'set1', target: 'if1' })).toEqual({ ok: true })
    expect(canConnect(free, { source: 'set1', sourcePort: 'true', target: 'if1' })).toEqual({ ok: false, reason: 'portUnexpected' })
    expect(canConnect(free, { source: 'set1', target: 'set1' })).toEqual({ ok: false, reason: 'self' })
  })
  it('scene → Set Flag and IF → Set Flag are allowed; duplicates and logic-only loops are not', () => {
    expect(canConnect(p, { source: 'good', target: 'set1' })).toEqual({ ok: true })
    expect(canConnect({ ...p, transitions: p.transitions.filter((t) => t.id !== 'no') }, { source: 'if1', sourcePort: 'false', target: 'set1' })).toEqual({ ok: false, reason: 'logicCycle' })
    expect(canConnect(p, { source: 'start', target: 'set1' })).toEqual({ ok: false, reason: 'duplicate' })
  })
  it('Branch port validation is unchanged', () => {
    expect(canConnect(p, { source: 'if1', target: 'good' })).toEqual({ ok: false, reason: 'portMissing' })
    expect(canConnect(p, { source: 'if1', sourcePort: 'true', target: 'end' })).toEqual({ ok: false, reason: 'portTaken' })
  })
})

describe('validation of flags, Set Flag nodes and expressions', () => {
  const errs = (p: ReturnType<typeof stateProject>) => validateProject(p).errors.map((e) => e.code)
  it('a consistent project has no errors', () => expect(errs(stateProject())).toEqual([]))
  it('dangling flag references and duplicate flags are errors', () => {
    const p = stateProject(check('ghost'))
    expect(errs(p)).toContain('diag.flagMissing')
    const q = stateProject()
    q.logicNodes = q.logicNodes.map((n) => (n.id === 'set1' ? { ...n, flagId: 'ghost' } : n))
    expect(errs(q)).toContain('diag.flagMissing')
    const d = stateProject()
    d.flags = [...d.flags, flag('insulted', 'Other'), flag('x', 'ritualcompleted')]
    expect(errs(d)).toEqual(expect.arrayContaining(['diag.dupFlag', 'diag.dupFlagName']))
  })
  it('expression limits, wrong-type fields and extra Set Flag outputs are errors', () => {
    let deep: Expr = check('insulted')
    for (let i = 0; i < EXPR_MAX_DEPTH; i++) deep = { op: 'not', arg: deep }
    expect(errs(stateProject(deep))).toContain('diag.exprLimits')
    const q = stateProject()
    q.logicNodes = q.logicNodes.map((n) => (n.id === 'if1' ? { ...n, flagId: 'insulted' } : n))
    expect(errs(q)).toContain('diag.nodeFields')
    const m = stateProject()
    m.transitions = [...m.transitions, link('extra', 'set1', 'bad')]
    expect(errs(m)).toContain('diag.setFlagOutputs')
    const pt = stateProject()
    pt.transitions = pt.transitions.map((t) => (t.id === 'b' ? { ...t, sourcePort: 'true' as const } : t))
    expect(errs(pt)).toContain('diag.portUnexpected')
  })
  it('an unassigned Set Flag and a missing structured condition are only warnings', () => {
    const p = stateProject()
    p.logicNodes = p.logicNodes.map((n) => (n.id === 'set1' ? { ...n, flagId: null } : n)).map((n) => (n.id === 'if1' ? { ...n, condition: '', expression: undefined } : n))
    const v = validateProject(p)
    expect(v.errors).toEqual([])
    expect(v.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['diag.setFlagNoFlag', 'diag.branchNoCondition']))
  })
})

describe('analysis and layout with Set Flag nodes', () => {
  it('reachability passes through Set Flag; no false unreachable warnings; stats count nodes', () => {
    const a = analyze(stateProject())
    expect(a.reachable.has('set1')).toBe(true)
    expect(a.issues.filter((i) => i.diagnostic.code === 'diag.unreachable' || i.diagnostic.code === 'diag.branchUnreachable')).toEqual([])
    expect(a.stats).toMatchObject({ scenes: 4, branches: 1, setFlags: 1, flags: 2, crossings: 2 })
  })
  it('reports a Set Flag without output, and flags tested but never set', () => {
    const p = stateProject(check('ritual'))
    const codes = analyze(p).issues.map((i) => i.diagnostic.code)
    expect(codes).toContain('diag.flagNeverSet')
    const q = stateProject()
    q.transitions = q.transitions.filter((t) => t.id !== 'b')
    expect(analyze(q).issues.map((i) => i.diagnostic.code)).toContain('diag.setFlagNoOutput')
  })
  it('auto arrange positions Set Flag nodes without overlap and is idempotent', () => {
    const p = stateProject()
    const pos = computeLayout(p)
    expect(Object.keys(pos).sort()).toEqual(['bad', 'end', 'good', 'if1', 'set1', 'start'])
    const cells = new Set(Object.values(pos).map((q) => `${q.x},${q.y}`))
    expect(cells.size).toBe(6)
    expect(pos.start.x).toBeLessThan(pos.set1.x)
    expect(pos.set1.x).toBeLessThan(pos.if1.x)
    const moved = { ...p, logicNodes: p.logicNodes.map((n) => ({ ...n, position: pos[n.id] })), scenes: p.scenes.map((s) => ({ ...s, position: pos[s.id] })) }
    expect(computeLayout(moved)).toEqual(pos)
  })
  it('an empty project has no flags', () => expect(emptyProject().flags).toEqual([]))
  it('a scene-only project is unaffected by logic-node unions', () => {
    const p = { ...emptyProject(), scenes: [scene('x')], startSceneId: 'x' }
    expect(analyze(p).stats.setFlags).toBe(0)
  })
})
