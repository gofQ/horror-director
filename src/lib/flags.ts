import { EXPR_MAX_DEPTH, EXPR_MAX_NODES, type Expr, type Project } from './schema'

/**
 * Narrative flag logic. Expressions are plain data; evaluation is a pure, total function over a flag state.
 * Nothing here ever parses or evaluates free text.
 */
export type FlagState = Record<string, boolean>

/** Current value of a flag (an unknown id reads as FALSE; `validateProject` reports such references). */
export const flagValue = (state: FlagState, id: string): boolean => state[id] === true

export function evalExpr(e: Expr, state: FlagState): boolean {
  switch (e.op) {
    case 'flag':
      return flagValue(state, e.flagId) === e.is
    case 'not':
      return !evalExpr(e.arg, state)
    case 'and':
      return e.args.every((a) => evalExpr(a, state))
    case 'or':
      return e.args.some((a) => evalExpr(a, state))
  }
}

export const initialFlagState = (p: Pick<Project, 'flags'>): FlagState => Object.fromEntries(p.flags.map((f) => [f.id, f.defaultValue]))

/** Flag ids referenced by an expression (with repeats removed, in first-seen order). */
export function exprFlags(e: Expr): string[] {
  const out: string[] = []
  const walk = (x: Expr) => {
    if (x.op === 'flag') {
      if (!out.includes(x.flagId)) out.push(x.flagId)
    } else if (x.op === 'not') walk(x.arg)
    else x.args.forEach(walk)
  }
  walk(e)
  return out
}

export const exprSize = (e: Expr): number => (e.op === 'flag' ? 1 : e.op === 'not' ? 1 + exprSize(e.arg) : 1 + e.args.reduce((a, x) => a + exprSize(x), 0))
export const exprDepth = (e: Expr): number => (e.op === 'flag' ? 1 : e.op === 'not' ? 1 + exprDepth(e.arg) : 1 + Math.max(0, ...e.args.map(exprDepth)))
export const exprWithinLimits = (e: Expr): boolean => exprDepth(e) <= EXPR_MAX_DEPTH && exprSize(e) <= EXPR_MAX_NODES

/** Compact readable text, e.g. `NOT (A is TRUE AND B is FALSE)`. Words are passed in so the UI can localize them. */
export interface ExprWords {
  and: string
  or: string
  not: string
  isTrue: string
  isFalse: string
  unknown: string
}
export function exprToText(e: Expr, nameOf: (id: string) => string | undefined, w: ExprWords, top = true): string {
  switch (e.op) {
    case 'flag':
      return `${nameOf(e.flagId) ?? w.unknown} ${e.is ? w.isTrue : w.isFalse}`
    case 'not':
      return `${w.not} (${exprToText(e.arg, nameOf, w)})`
    case 'and':
    case 'or': {
      const body = e.args.map((a) => exprToText(a, nameOf, w, false)).join(` ${e.op === 'and' ? w.and : w.or} `)
      return top ? body : `(${body})`
    }
  }
}

/** Path of child indexes from the root; `not` has the single child index 0. */
export type ExprPath = number[]

export function exprAt(root: Expr, path: ExprPath): Expr | undefined {
  let cur: Expr | undefined = root
  for (const i of path) {
    if (!cur || cur.op === 'flag') return undefined
    cur = cur.op === 'not' ? (i === 0 ? cur.arg : undefined) : cur.args[i]
  }
  return cur
}

/** Immutably replaces the node at `path` (`next === null` removes it and collapses groups left with one child). */
export function exprReplace(root: Expr, path: ExprPath, next: Expr | null): Expr | null {
  if (path.length === 0) return next
  const [i, ...rest] = path
  if (root.op === 'flag') return root
  if (root.op === 'not') {
    const child = exprReplace(root.arg, rest, next)
    return child ? { op: 'not', arg: child } : null
  }
  const args = root.args.flatMap((a, k) => {
    if (k !== i) return [a]
    const r = exprReplace(a, rest, next)
    return r ? [r] : []
  })
  if (args.length === 0) return null
  if (args.length === 1) return args[0]
  return { ...root, args }
}

/** Appends `child` to the group at `path`. */
export function exprAppend(root: Expr, path: ExprPath, child: Expr): Expr {
  const target = exprAt(root, path)
  if (!target || target.op === 'flag' || target.op === 'not') return root
  const grown: Expr = { ...target, args: [...target.args, child] }
  return exprReplace(root, path, grown) ?? root
}

/** Removes every check of `flagId` (groups collapse; an empty result is `undefined`). */
export function exprWithoutFlag(e: Expr, flagId: string): Expr | undefined {
  const walk = (x: Expr): Expr | null => {
    if (x.op === 'flag') return x.flagId === flagId ? null : x
    if (x.op === 'not') {
      const a = walk(x.arg)
      return a ? { op: 'not', arg: a } : null
    }
    const args = x.args.map(walk).filter((a): a is Expr => a !== null)
    if (args.length === 0) return null
    return args.length === 1 ? args[0] : { ...x, args }
  }
  return walk(e) ?? undefined
}

export interface FlagUsage {
  setNodes: string[]
  branches: string[]
}
export const flagUsage = (p: Pick<Project, 'logicNodes'>, flagId: string): FlagUsage => ({
  setNodes: p.logicNodes.filter((n) => n.type === 'setFlag' && n.flagId === flagId).map((n) => n.id),
  branches: p.logicNodes.filter((n) => n.type === 'branch' && n.expression && exprFlags(n.expression).includes(flagId)).map((n) => n.id),
})
export const flagIsUsed = (p: Pick<Project, 'logicNodes'>, flagId: string): boolean => {
  const u = flagUsage(p, flagId)
  return u.setNodes.length + u.branches.length > 0
}

export const normalizeFlagName = (n: string) => n.trim().toLowerCase()
export const flagNameTaken = (p: Pick<Project, 'flags'>, name: string, exceptId?: string): boolean =>
  p.flags.some((f) => f.id !== exceptId && normalizeFlagName(f.name) === normalizeFlagName(name))
