import type { z } from 'zod'
import { crossingOf, exportSchema, FORMAT_ID, SCHEMA_VERSION, projectSchema, type Project } from './schema'
import { diag, type Diagnostic } from './diagnostics'
import { findDroppedKeys, validateProject } from './validate'

export interface ExportFile {
  format: typeof FORMAT_ID
  schemaVersion: number
  exportedAt: string
  project: Project
  /** Derived, read-only convenience data for engine-side consumers. Ignored on import. */
  derived: {
    transitions: { id: string; crossing: string }[]
    startSceneId: string | null
  }
}

export function buildExport(project: Project, now = new Date()): ExportFile {
  const kind = new Map(project.scenes.map((s) => [s.id, s.kind]))
  return {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    project,
    derived: {
      startSceneId: project.startSceneId,
      transitions: project.transitions.map((t) => {
        const a = kind.get(t.source)
        const b = kind.get(t.target)
        return { id: t.id, crossing: a && b ? crossingOf(a, b) : 'unknown' }
      }),
    },
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(buildExport(project), null, 2)
}

export function exportFileName(project: Project): string {
  // Unicode-aware so Turkish (and other) letters survive in file names.
  return `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'project'}.horror.json`
}

export type ParseResult =
  | { ok: true; project: Project; warnings: Diagnostic[]; /** Declared schema version of the file (null for a bare project object). */ schemaVersion: number | null }
  | { ok: false; errors: Diagnostic[] }

const MAX_LISTED = 50

function cap(list: Diagnostic[]): Diagnostic[] {
  return list.length > MAX_LISTED
    ? [...list.slice(0, MAX_LISTED), diag('diag.moreItems', { n: list.length - MAX_LISTED })]
    : list
}

const TYPE_KEYS = ['string', 'number', 'boolean', 'array', 'object', 'null'] as const
type TypeKey = (typeof TYPE_KEYS)[number]

/** JSON type of the value at `path` in `raw`, or 'undefined' when absent. */
function jsonTypeAt(raw: unknown, path: PropertyKey[]): TypeKey | 'undefined' | 'unknown' {
  let cur: unknown = raw
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return 'undefined'
    cur = (cur as Record<PropertyKey, unknown>)[key]
  }
  if (cur === undefined) return 'undefined'
  if (cur === null) return 'null'
  if (Array.isArray(cur)) return 'array'
  const t = typeof cur
  return (TYPE_KEYS as readonly string[]).includes(t) ? (t as TypeKey) : 'unknown'
}

/** Maps a Zod issue to a language-neutral diagnostic (by issue code, never by message text). */
function schemaDiagnostic(issue: z.core.$ZodIssue, raw: unknown): Diagnostic {
  const path = issue.path.join('.') || '$'
  const got = jsonTypeAt(raw, issue.path)
  // A missing value is reported as "required" whichever schema rule it tripped (type, enum, …).
  if (got === 'undefined') return diag('diag.schema.required', { path })
  switch (issue.code) {
    case 'invalid_type': {
      const expected = (TYPE_KEYS as readonly string[]).includes(issue.expected) ? issue.expected : 'unknown'
      return diag('diag.schema.invalidType', { path, expected, received: got })
    }
    case 'too_small': {
      const min = Number(issue.minimum)
      if (issue.origin === 'string') return diag('diag.schema.tooShort', { path, min })
      if (issue.origin === 'array') return diag('diag.schema.tooFew', { path, min })
      return issue.inclusive === false
        ? diag('diag.schema.tooSmallExclusive', { path, min })
        : diag('diag.schema.tooSmall', { path, min })
    }
    case 'too_big': {
      const max = Number(issue.maximum)
      if (issue.origin === 'string') return diag('diag.schema.tooLong', { path, max })
      if (issue.origin === 'array') return diag('diag.schema.tooMany', { path, max })
      return issue.inclusive === false
        ? diag('diag.schema.tooBigExclusive', { path, max })
        : diag('diag.schema.tooBig', { path, max })
    }
    case 'invalid_value':
      return diag('diag.schema.invalidValue', { path, values: issue.values.map(String).join(', ') })
    default:
      return diag('diag.schema.generic', { path })
  }
}

/**
 * Parses and validates an import file (full export or bare project object).
 * Nothing is repaired or dropped: any integrity error or unrecognised field blocks the import.
 */
export function parseProject(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: [diag('diag.json')] }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: [diag('diag.notObject')] }

  const obj = raw as Record<string, unknown>
  const isExport = obj.format !== undefined || obj.schemaVersion !== undefined || obj.project !== undefined
  if (isExport) {
    if (obj.format !== FORMAT_ID) return { ok: false, errors: [diag('diag.format', { expected: FORMAT_ID })] }
    if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > SCHEMA_VERSION)
      return {
        ok: false,
        errors: [diag('diag.newerSchema', { found: String(obj.schemaVersion), supported: String(SCHEMA_VERSION) })],
      }
  }

  const rawProject = isExport ? obj.project : raw
  const result = isExport ? exportSchema.safeParse(raw) : projectSchema.safeParse(raw)
  if (!result.success) {
    return { ok: false, errors: cap(result.error.issues.map((i) => schemaDiagnostic(i, raw))) }
  }
  const project = isExport ? (result.data as { project: Project }).project : (result.data as Project)

  const errors: Diagnostic[] = []
  const dropped = findDroppedKeys(rawProject, project)
  if (dropped.length) {
    const fields = dropped.slice(0, 10).join(', ')
    errors.push(
      dropped.length > 10
        ? diag('diag.droppedFieldsMore', { fields, n: dropped.length - 10 })
        : diag('diag.droppedFields', { fields }),
    )
  }
  const v = validateProject(project)
  errors.push(...v.errors)
  if (errors.length) return { ok: false, errors: cap(errors) }
  const declared = isExport ? (result.data as { schemaVersion: number }).schemaVersion : null
  // Files older than schema 2 carry no shots or directions (and none carry audio cues): they start empty and the next export is the current schema.
  const warnings = declared === null || declared < 2 ? [diag('diag.migratedV1'), ...v.warnings] : v.warnings
  return { ok: true, project, warnings: cap(warnings), schemaVersion: declared }
}
