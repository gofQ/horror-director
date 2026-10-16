import { z } from 'zod'
import type { Engine } from './plan'

/**
 * External-agent completion report. Everything under `agentClaim` is what the agent SAYS it did: Horror Director
 * never verifies it, never executes it and never trusts a path to exist. `independentlyVerified` is part of the format
 * so claims and verified facts stay separate, but it is always empty in the template and ignored on import.
 */
export const REPORT_FORMAT = 'horror-director.completion-report'
export const REPORT_VERSION = 1
export const MAX_REPORT_CHARS = 100_000

const short = z.string().max(300)
const long = z.string().max(4000)
const list = (max: number) => z.array(long).max(max)

export const reportSchema = z
  .object({
    format: z.literal(REPORT_FORMAT),
    version: z.literal(REPORT_VERSION),
    projectId: z.string().min(1).max(120),
    engine: z.enum(['unreal', 'unity']),
    taskId: z.string().min(1).max(300),
    sourceFingerprint: z.string().min(1).max(64),
    agentClaim: z
      .object({
        outcome: z.enum(['completed', 'partial', 'blocked', 'failed']),
        changedFiles: z.array(z.object({ path: short, change: z.enum(['added', 'modified', 'deleted']), note: long.optional() }).strict()).max(200),
        checks: z
          .array(z.object({ name: short, command: short.optional(), result: z.enum(['passed', 'failed', 'notRun']), details: long.optional() }).strict())
          .max(100),
        limitations: list(50),
        questions: list(50),
        notes: z.string().max(8000),
      })
      .strict(),
    independentlyVerified: z.array(z.unknown()).max(0).optional(),
  })
  .strict()
export type CompletionReport = z.infer<typeof reportSchema>

export interface ReportContext {
  projectId: string
  engine: Engine
  taskId: string
  fingerprint: string
}

/** Removes control characters (keeps \n and \t) so pasted content cannot smuggle terminal / bidi tricks into the UI. */
export function sanitizeText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
}
const sanitizeDeep = <T,>(v: T): T => {
  if (typeof v === 'string') return sanitizeText(v) as T
  if (Array.isArray(v)) return v.map(sanitizeDeep) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitizeDeep(x)])) as T
  return v
}

export function buildReportTemplate(ctx: ReportContext): CompletionReport {
  return {
    format: REPORT_FORMAT,
    version: REPORT_VERSION,
    projectId: ctx.projectId,
    engine: ctx.engine,
    taskId: ctx.taskId,
    sourceFingerprint: ctx.fingerprint,
    agentClaim: {
      outcome: 'completed',
      changedFiles: [{ path: '<path relative to the engine project>', change: 'modified', note: '' }],
      checks: [{ name: '<test or check you ran>', command: '<command>', result: 'passed', details: '' }],
      limitations: [],
      questions: [],
      notes: '',
    },
    independentlyVerified: [],
  }
}
export const reportTemplateText = (ctx: ReportContext) => JSON.stringify(buildReportTemplate(ctx), null, 2)

export type ReportErrorCode = 'tooLarge' | 'notJson' | 'format' | 'version' | 'malformed' | 'project' | 'engine' | 'task'
export interface ReportError {
  code: ReportErrorCode
  /** Field path for `malformed` errors (never user content). */
  detail?: string
}
export type ReportWarning = 'outdatedSource' | 'verifiedIgnored'
export type ReportParse = { ok: true; report: CompletionReport; warnings: ReportWarning[] } | { ok: false; errors: ReportError[] }

/** Strictly validates pasted / manually entered report data against the identity of the task it is being attached to. */
export function parseReport(input: string | unknown, expected: ReportContext): ReportParse {
  let data: unknown = input
  if (typeof input === 'string') {
    if (input.length > MAX_REPORT_CHARS) return { ok: false, errors: [{ code: 'tooLarge' }] }
    try {
      data = JSON.parse(input)
    } catch {
      return { ok: false, errors: [{ code: 'notJson' }] }
    }
  }
  const raw = data as { format?: unknown; version?: unknown; independentlyVerified?: unknown[] } | null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: [{ code: 'malformed', detail: '(root)' }] }
  if (raw.format !== REPORT_FORMAT) return { ok: false, errors: [{ code: 'format' }] }
  if (raw.version !== REPORT_VERSION) return { ok: false, errors: [{ code: 'version' }] }
  const warnings: ReportWarning[] = []
  // `independentlyVerified` from an outside source is never trusted: dropped before validation.
  const candidate = { ...(raw as object), independentlyVerified: [] } as Record<string, unknown>
  if (Array.isArray(raw.independentlyVerified) && raw.independentlyVerified.length) warnings.push('verifiedIgnored')
  const r = reportSchema.safeParse(sanitizeDeep(candidate))
  if (!r.success) return { ok: false, errors: r.error.issues.slice(0, 8).map((i) => ({ code: 'malformed' as const, detail: i.path.join('.') || '(root)' })) }
  const errors: ReportError[] = []
  if (r.data.projectId !== expected.projectId) errors.push({ code: 'project' })
  if (r.data.engine !== expected.engine) errors.push({ code: 'engine' })
  if (r.data.taskId !== expected.taskId) errors.push({ code: 'task' })
  if (errors.length) return { ok: false, errors }
  if (r.data.sourceFingerprint !== expected.fingerprint) warnings.push('outdatedSource')
  return { ok: true, report: r.data, warnings }
}
