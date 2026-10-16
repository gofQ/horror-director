import { z } from 'zod'
import type { Engine, Plan } from './plan'
import type { Readiness, TaskAssessment } from './readiness'
import { diffParts, fingerprints, type Fingerprint, type PartsDiff } from './fingerprint'
import { reportSchema } from './report'

/**
 * Implementation progress: user-recorded, separate from authoring readiness (derived from authored data) and from
 * source freshness (derived by comparing fingerprints). Pure: reducers return new records, nothing touches storage.
 * `verified` is reachable ONLY through the explicit `approve` action.
 */
export const STATUSES = ['notStarted', 'inProgress', 'submitted', 'verified', 'blocked'] as const
export type ProgressStatus = (typeof STATUSES)[number]
export const MAX_NOTES = 2000
export const MAX_HISTORY = 50

const status = z.enum(STATUSES)
const capturedSchema = z.object({ fp: z.string().max(64), parts: z.record(z.string().max(200), z.string().max(64)), at: z.number() }).strict()
export const progressSchema = z
  .object({
    status,
    notes: z.string().max(MAX_NOTES),
    history: z
      .array(z.object({ at: z.number(), from: status, to: status, note: z.string().max(MAX_NOTES).optional(), by: z.enum(['user', 'report']) }).strict())
      .max(MAX_HISTORY),
    captured: capturedSchema.optional(),
    review: z
      .object({ outcome: z.enum(['approved', 'changesRequested']), note: z.string().max(MAX_NOTES), at: z.number(), fp: z.string().max(64).optional() })
      .strict()
      .optional(),
    report: z.object({ report: reportSchema, savedAt: z.number(), outdated: z.boolean() }).strict().optional(),
    orphaned: z.boolean().optional(),
  })
  .strict()
export type TaskProgress = z.infer<typeof progressSchema>
export type Entries = Record<string, TaskProgress>

export const entryKey = (engine: Engine, taskId: string) => `${engine}:${taskId}`
export const splitKey = (key: string): { engine: Engine; taskId: string } | null => {
  const i = key.indexOf(':')
  const engine = key.slice(0, i)
  return engine === 'unreal' || engine === 'unity' ? { engine, taskId: key.slice(i + 1) } : null
}

export const emptyProgress = (): TaskProgress => ({ status: 'notStarted', notes: '', history: [] })

/** Allowed manual moves. `verified` is intentionally absent as a target: see `approve`. */
export const TRANSITIONS: Record<ProgressStatus, readonly ProgressStatus[]> = {
  notStarted: ['inProgress', 'blocked'],
  inProgress: ['submitted', 'blocked', 'notStarted'],
  submitted: ['inProgress', 'blocked'],
  verified: ['inProgress'],
  blocked: ['inProgress', 'notStarted'],
}

export type Staleness = { stale: false } | { stale: true; diff: PartsDiff }
/** Only submitted / verified records that captured a fingerprint can be stale; the saved status is never rewritten. */
export function staleness(rec: TaskProgress | undefined, current: Fingerprint | undefined): Staleness {
  if (!rec || !rec.captured || !current) return { stale: false }
  if (rec.status !== 'submitted' && rec.status !== 'verified') return { stale: false }
  if (rec.captured.fp === current.fp) return { stale: false }
  return { stale: true, diff: diffParts(rec.captured.parts, current.parts) }
}

export type Action =
  | { type: 'move'; to: ProgressStatus; note?: string }
  | { type: 'setNotes'; notes: string }
  | { type: 'approve'; confirmed: boolean; note: string; acknowledgedChanges?: boolean }
  | { type: 'requestChanges'; note: string }
  | { type: 'attachReport'; report: z.infer<typeof reportSchema>; outdated: boolean; markSubmitted: boolean }
export interface ActionContext {
  now: number
  fingerprint: Fingerprint
  stale: boolean
}
export type ActionError = 'transition' | 'notConfirmed' | 'staleNotAcknowledged' | 'notSubmitted' | 'noNotes' | 'tooLong'
export type ActionResult = { ok: true; record: TaskProgress } | { ok: false; error: ActionError }

const withHistory = (r: TaskProgress, to: ProgressStatus, ctx: ActionContext, by: 'user' | 'report', note?: string): TaskProgress => ({
  ...r,
  status: to,
  history: [...r.history, { at: ctx.now, from: r.status, to, ...(note ? { note: note.slice(0, MAX_NOTES) } : {}), by }].slice(-MAX_HISTORY),
})

export function applyAction(prev: TaskProgress | undefined, action: Action, ctx: ActionContext): ActionResult {
  const r = prev ?? emptyProgress()
  const capture = { fp: ctx.fingerprint.fp, parts: ctx.fingerprint.parts, at: ctx.now }
  switch (action.type) {
    case 'setNotes':
      return action.notes.length > MAX_NOTES ? { ok: false, error: 'tooLong' } : { ok: true, record: { ...r, notes: action.notes } }
    case 'move': {
      if (!TRANSITIONS[r.status].includes(action.to)) return { ok: false, error: 'transition' }
      const next = withHistory(r, action.to, ctx, 'user', action.note)
      if (action.to === 'submitted') return { ok: true, record: { ...next, captured: capture } }
      // leaving submitted/verified keeps the evidence (captured fp, review, report) for the history
      return { ok: true, record: next }
    }
    case 'requestChanges': {
      if (r.status !== 'submitted') return { ok: false, error: 'notSubmitted' }
      if (!action.note.trim()) return { ok: false, error: 'noNotes' }
      const next = withHistory(r, 'inProgress', ctx, 'user', action.note)
      return { ok: true, record: { ...next, review: { outcome: 'changesRequested', note: action.note.slice(0, MAX_NOTES), at: ctx.now, fp: r.captured?.fp } } }
    }
    case 'approve': {
      if (!action.confirmed) return { ok: false, error: 'notConfirmed' }
      const reapprove = r.status === 'verified' && ctx.stale
      if (r.status !== 'submitted' && !reapprove) return { ok: false, error: 'notSubmitted' }
      if (ctx.stale && !action.acknowledgedChanges) return { ok: false, error: 'staleNotAcknowledged' }
      const next = withHistory(r, 'verified', ctx, 'user', action.note)
      return { ok: true, record: { ...next, captured: capture, review: { outcome: 'approved', note: action.note.slice(0, MAX_NOTES), at: ctx.now, fp: ctx.fingerprint.fp } } }
    }
    case 'attachReport': {
      const base: TaskProgress = { ...r, report: { report: action.report, savedAt: ctx.now, outdated: action.outdated } }
      // a report can move a task to Submitted only on explicit request, and never to Verified
      if (action.markSubmitted && TRANSITIONS[r.status].includes('submitted')) return { ok: true, record: { ...withHistory(base, 'submitted', ctx, 'report'), captured: capture } }
      return { ok: true, record: base }
    }
  }
}

export interface ProgressSummary {
  total: number
  counts: Record<ProgressStatus, number>
  /** Submitted / verified tasks whose authored source changed since capture. */
  stale: string[]
  /** Tasks downstream of a stale task (derived, not stored). */
  recheck: string[]
  /** Not started, authoring-ready, and every dependency verified and fresh. */
  ready: string[]
  /** Records of this engine whose task no longer exists in the plan (kept as history). */
  orphans: string[]
}

export function dependencyProgress(plan: Plan, engine: Engine, entries: Entries, taskId: string, fps = fingerprints(plan)): { done: number; total: number; pending: string[] } {
  const t = plan.tasks.find((x) => x.id === taskId)
  const deps = t?.dependsOn ?? []
  const pending = deps.filter((d) => {
    const rec = entries[entryKey(engine, d)]
    return !(rec?.status === 'verified' && !staleness(rec, fps.get(d)).stale)
  })
  return { done: deps.length - pending.length, total: deps.length, pending }
}

export function summarize(plan: Plan, engine: Engine, entries: Entries, assess: Map<string, TaskAssessment>): ProgressSummary {
  const fps = fingerprints(plan)
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ProgressStatus, number>
  const stale: string[] = []
  const ready: string[] = []
  for (const t of plan.tasks) {
    const rec = entries[entryKey(engine, t.id)]
    const st = rec?.status ?? 'notStarted'
    counts[st]++
    if (staleness(rec, fps.get(t.id)).stale) stale.push(t.id)
    const readiness: Readiness | undefined = assess.get(t.id)?.readiness
    if (st === 'notStarted' && readiness === 'ready' && dependencyProgress(plan, engine, entries, t.id, fps).pending.length === 0) ready.push(t.id)
  }
  const recheck = new Set<string>()
  const visit = (id: string) => {
    for (const d of plan.tasks.find((x) => x.id === id)?.dependents ?? []) if (!recheck.has(d)) (recheck.add(d), visit(d))
  }
  stale.forEach(visit)
  const ids = new Set(plan.tasks.map((t) => t.id))
  const orphans = Object.keys(entries)
    .map((k) => ({ k, s: splitKey(k) }))
    .filter((x) => x.s && x.s.engine === engine && !ids.has(x.s.taskId))
    .map((x) => x.s!.taskId)
    .sort()
  return { total: plan.tasks.length, counts, stale, recheck: [...recheck].filter((x) => !stale.includes(x)).sort(), ready, orphans }
}
