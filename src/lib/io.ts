import { crossingOf, exportSchema, FORMAT_ID, SCHEMA_VERSION, projectSchema, type Project } from './schema'
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
  return `${project.name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'project'}.horror.json`
}

export type ParseResult =
  | { ok: true; project: Project; warnings: string[] }
  | { ok: false; errors: string[] }

const MAX_LISTED = 50

function cap(list: string[]): string[] {
  return list.length > MAX_LISTED
    ? [...list.slice(0, MAX_LISTED), `…and ${list.length - MAX_LISTED} more.`]
    : list
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
    return { ok: false, errors: ['File is not valid JSON.'] }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['File must contain a JSON object.'] }

  const obj = raw as Record<string, unknown>
  const isExport = obj.format !== undefined || obj.schemaVersion !== undefined || obj.project !== undefined
  if (isExport) {
    if (obj.format !== FORMAT_ID)
      return { ok: false, errors: [`Unrecognised file format (expected "${FORMAT_ID}").`] }
    if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > SCHEMA_VERSION)
      return {
        ok: false,
        errors: [
          `File uses schema version ${obj.schemaVersion}, newer than this app supports (${SCHEMA_VERSION}). Update Horror Director to open it.`,
        ],
      }
  }

  const rawProject = isExport ? obj.project : raw
  const result = isExport ? exportSchema.safeParse(raw) : projectSchema.safeParse(raw)
  if (!result.success) {
    return {
      ok: false,
      errors: cap(
        result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`),
      ),
    }
  }
  const project = isExport ? (result.data as { project: Project }).project : (result.data as Project)

  const errors: string[] = []
  const warnings: string[] = []
  const dropped = findDroppedKeys(rawProject, project)
  if (dropped.length)
    errors.push(
      `Unrecognised field(s) that would be lost on import: ${dropped.slice(0, 10).join(', ')}${dropped.length > 10 ? ` (+${dropped.length - 10} more)` : ''}.`,
    )
  const v = validateProject(project)
  errors.push(...v.errors)
  warnings.push(...v.warnings)
  if (errors.length) return { ok: false, errors: cap(errors) }
  return { ok: true, project, warnings: cap(warnings) }
}
