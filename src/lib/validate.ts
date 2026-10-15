import type { Project } from './schema'

export interface ValidationResult {
  /** Blocking problems: the project is internally inconsistent. */
  errors: string[]
  /** Non-blocking oddities worth showing to the user. */
  warnings: string[]
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const id of ids) (seen.has(id) ? dup : seen).add(id)
  return [...dup]
}

/** Structural integrity checks for a parsed project (IDs, references, consistency). */
export function validateProject(p: Project): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const q = (s: string) => `"${s}"`

  for (const id of duplicates(p.scenes.map((s) => s.id))) errors.push(`Duplicate scene id ${q(id)}.`)
  for (const id of duplicates(p.transitions.map((t) => t.id))) errors.push(`Duplicate transition id ${q(id)}.`)
  for (const id of duplicates(p.characters.map((c) => c.id))) errors.push(`Duplicate character id ${q(id)}.`)
  for (const c of p.characters)
    for (const id of duplicates(c.states.map((s) => s.id)))
      errors.push(`Duplicate state id ${q(id)} in character ${q(c.name)}.`)
  for (const s of p.scenes)
    for (const id of duplicates(s.triggers.map((t) => t.id)))
      errors.push(`Duplicate trigger id ${q(id)} in scene ${q(s.title)}.`)

  const sceneIds = new Set(p.scenes.map((s) => s.id))
  if (p.startSceneId !== null && !sceneIds.has(p.startSceneId))
    errors.push(`startSceneId ${q(p.startSceneId)} does not match any scene.`)
  if (p.startSceneId === null && p.scenes.length > 0)
    warnings.push('No start scene is set.')

  for (const t of p.transitions) {
    const name = t.label ? `${q(t.label)} (${t.id})` : q(t.id)
    if (!sceneIds.has(t.source)) errors.push(`Transition ${name} has missing source scene ${q(t.source)}.`)
    if (!sceneIds.has(t.target)) errors.push(`Transition ${name} has missing target scene ${q(t.target)}.`)
  }
  const pairs = p.transitions.map((t) => `${t.source}\u0000${t.target}`)
  const dupPairs = duplicates(pairs).length
  if (dupPairs > 0) warnings.push(`${dupPairs} scene pair(s) are connected by more than one transition.`)

  const chars = new Map(p.characters.map((c) => [c.id, c]))
  for (const s of p.scenes) {
    for (const [cid, stid] of Object.entries(s.characterStates)) {
      const c = chars.get(cid)
      if (!c) errors.push(`Scene ${q(s.title)} references missing character ${q(cid)}.`)
      else if (!c.states.some((st) => st.id === stid))
        errors.push(`Scene ${q(s.title)} references missing state ${q(stid)} of character ${q(c.name)}.`)
    }
    if (s.loop.enabled && s.loop.maxIterations === 0 && !s.loop.exitCondition.trim())
      warnings.push(`Loop scene ${q(s.title)} has no iteration cap or exit condition.`)
    const late = s.triggers.filter((t) => t.time > s.duration).length
    if (late) warnings.push(`Scene ${q(s.title)} has ${late} trigger(s) after its ${s.duration}s duration.`)
  }

  return { errors, warnings }
}

/**
 * Lists object keys present in `raw` that did not survive schema parsing into `parsed`
 * (zod strips unknown keys). Used so imports never silently drop data.
 */
export function findDroppedKeys(raw: unknown, parsed: unknown, path = ''): string[] {
  if (Array.isArray(raw)) {
    if (!Array.isArray(parsed)) return []
    return raw.flatMap((item, i) => findDroppedKeys(item, parsed[i], `${path}[${i}]`))
  }
  if (raw && typeof raw === 'object') {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    const out: string[] = []
    const pr = parsed as Record<string, unknown>
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const here = path ? `${path}.${k}` : k
      if (!(k in pr)) out.push(here)
      else out.push(...findDroppedKeys(v, pr[k], here))
    }
    return out
  }
  return []
}
