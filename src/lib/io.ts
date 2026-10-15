import { crossingOf, exportSchema, FORMAT_ID, SCHEMA_VERSION, projectSchema, type Project } from './schema'

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

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string }

/** Accepts a full export file or a bare project object. */
export function parseProject(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  const wrapped = exportSchema.safeParse(raw)
  const result = wrapped.success
    ? { success: true as const, data: wrapped.data.project }
    : projectSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path.join('.') || 'root'
    return { ok: false, error: `Invalid project file (${where}): ${issue?.message ?? 'unknown error'}` }
  }
  const project = result.data
  // Drop dangling references rather than failing the whole import.
  const ids = new Set(project.scenes.map((s) => s.id))
  project.transitions = project.transitions.filter((t) => ids.has(t.source) && ids.has(t.target))
  if (project.startSceneId && !ids.has(project.startSceneId)) project.startSceneId = null
  return { ok: true, project }
}
