import { diag, type Diagnostic } from './diagnostics'
import type { Project } from './schema'
import { analyzeAudioCues } from './audio'
import { analyzeShots } from './shots'
import { logicCycles } from './graphRules'
import { exprFlags, exprWithinLimits, normalizeFlagName } from './flags'

export interface ValidationResult {
  /** Blocking problems: the project is internally inconsistent. */
  errors: Diagnostic[]
  /** Non-blocking oddities worth showing to the user. */
  warnings: Diagnostic[]
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const id of ids) (seen.has(id) ? dup : seen).add(id)
  return [...dup]
}

/** Structural integrity checks for a parsed project (IDs, references, consistency). */
export function validateProject(p: Project): ValidationResult {
  const errors: Diagnostic[] = []
  const warnings: Diagnostic[] = []
  const q = (s: string) => `"${s}"`

  for (const id of duplicates(p.scenes.map((s) => s.id))) errors.push(diag('diag.dupScene', { id }))
  for (const id of duplicates(p.transitions.map((t) => t.id))) errors.push(diag('diag.dupTransition', { id }))
  for (const id of duplicates(p.characters.map((c) => c.id))) errors.push(diag('diag.dupCharacter', { id }))
  for (const c of p.characters)
    for (const id of duplicates(c.states.map((s) => s.id)))
      errors.push(diag('diag.dupState', { id, character: c.name }))
  for (const s of p.scenes)
    for (const id of duplicates(s.triggers.map((t) => t.id)))
      errors.push(diag('diag.dupTrigger', { id, scene: s.title }))

  for (const s of p.scenes)
    for (const id of duplicates(s.shots.map((x) => x.id))) errors.push(diag('diag.dupShot', { id, scene: s.title }))

  for (const s of p.scenes)
    for (const id of duplicates(s.audioCues.map((x) => x.id))) errors.push(diag('diag.dupAudioCue', { id, scene: s.title }))

  for (const id of duplicates(p.logicNodes.map((n) => n.id))) errors.push(diag('diag.dupNode', { id }))
  for (const id of duplicates(p.comments.map((c) => c.id))) errors.push(diag('diag.dupNode', { id }))
  for (const id of duplicates(p.flags.map((f) => f.id))) errors.push(diag('diag.dupFlag', { id }))
  for (const name of duplicates(p.flags.map((f) => normalizeFlagName(f.name)))) errors.push(diag('diag.dupFlagName', { name }))
  for (const id of duplicates(p.sceneTypes.map((x) => x.id))) errors.push(diag('diag.dupSceneType', { id }))
  // Scenes, branch nodes and comments share one id space (transitions reference scenes and branches).
  const sceneIds = new Set(p.scenes.map((s) => s.id))
  const logicIds = new Set(p.logicNodes.map((n) => n.id))
  const branchIds = new Set(p.logicNodes.filter((n) => n.type === 'branch').map((n) => n.id))
  const commentIds = new Set(p.comments.map((c) => c.id))
  for (const id of logicIds) if (sceneIds.has(id) || commentIds.has(id)) errors.push(diag('diag.dupNode', { id }))
  for (const id of commentIds) if (sceneIds.has(id)) errors.push(diag('diag.dupNode', { id }))
  const typeById = new Map(p.sceneTypes.map((x) => [x.id, x]))
  for (const s of p.scenes) {
    if (s.typeId === undefined) continue
    const ty = typeById.get(s.typeId)
    if (!ty) errors.push(diag('diag.sceneTypeMissing', { scene: s.title, id: s.typeId }))
    else if (ty.baseKind !== s.kind) errors.push(diag('diag.sceneTypeKind', { scene: s.title, type: ty.name, kind: ty.baseKind }))
  }
  if (p.startSceneId !== null && !sceneIds.has(p.startSceneId))
    errors.push(diag('diag.badStart', { id: p.startSceneId }))
  if (p.startSceneId === null && p.scenes.length > 0)
    warnings.push(diag('diag.noStart'))

  for (const t of p.transitions) {
    const name = t.label ? `${q(t.label)} (${t.id})` : q(t.id)
    const known = (id: string) => sceneIds.has(id) || logicIds.has(id)
    if (commentIds.has(t.source) || commentIds.has(t.target)) errors.push(diag('diag.linkComment', { name }))
    else {
      if (!known(t.source)) errors.push(diag('diag.transitionMissingSource', { name, id: t.source }))
      if (!known(t.target)) errors.push(diag('diag.transitionMissingTarget', { name, id: t.target }))
    }
    if (branchIds.has(t.source) && t.sourcePort === undefined) errors.push(diag('diag.portMissing', { name }))
    if (!branchIds.has(t.source) && t.sourcePort !== undefined) errors.push(diag('diag.portUnexpected', { name }))
    if (logicIds.has(t.source) && t.source === t.target) errors.push(diag('diag.logicSelf', { name }))
    if (t.direction && (logicIds.has(t.source) || logicIds.has(t.target))) errors.push(diag('diag.dirOnLogicLink', { name }))
  }
  const seenOut = new Set<string>()
  const seenLink = new Set<string>()
  for (const t of p.transitions) {
    const name = t.label ? `${q(t.label)} (${t.id})` : q(t.id)
    if (branchIds.has(t.source) && t.sourcePort) {
      const pin = `${t.source}\u0000${t.sourcePort}`
      if (seenOut.has(pin)) errors.push(diag('diag.portTaken', { name, node: t.source, port: t.sourcePort.toUpperCase() }))
      seenOut.add(pin)
    }
    if (logicIds.has(t.source) || logicIds.has(t.target)) {
      const key = `${t.source}\u0000${t.sourcePort ?? ''}\u0000${t.target}`
      if (seenLink.has(key)) errors.push(diag('diag.logicDuplicate', { name }))
      seenLink.add(key)
    }
  }
  for (const id of logicCycles(p)) errors.push(diag('diag.logicCycle', { id }))
  const pairs = p.transitions.filter((t) => sceneIds.has(t.source) && sceneIds.has(t.target)).map((t) => `${t.source}\u0000${t.target}`)
  const dupPairs = duplicates(pairs).length
  if (dupPairs > 0) warnings.push(diag('diag.multiTransitions', { n: dupPairs }))

  const sceneById = new Map(p.scenes.map((s) => [s.id, s]))
  for (const t of p.transitions) {
    const d = t.direction
    const src = sceneById.get(t.source)
    const dst = sceneById.get(t.target)
    if (!d || !src || !dst) continue
    const name = t.label ? `${q(t.label)} (${t.id})` : q(t.id)
    const elsewhere = (id: string) => p.scenes.some((s) => s.shots.some((x) => x.id === id))
    if (d.sourceShotId !== null && !src.shots.some((x) => x.id === d.sourceShotId))
      errors.push(diag(elsewhere(d.sourceShotId) ? 'diag.dirSourceMismatch' : 'diag.dirSourceDangling', { name, id: d.sourceShotId, scene: src.title }))
    if (d.targetShotId !== null && !dst.shots.some((x) => x.id === d.targetShotId))
      errors.push(diag(elsewhere(d.targetShotId) ? 'diag.dirTargetMismatch' : 'diag.dirTargetDangling', { name, id: d.targetShotId, scene: dst.title }))
  }

  const flagIds = new Set(p.flags.map((f) => f.id))
  for (const n of p.logicNodes) {
    const label = n.title || n.id
    const outs = p.transitions.filter((t) => t.source === n.id)
    const hasInput = p.transitions.some((t) => t.target === n.id)
    if (n.type === 'branch') {
      if (n.flagId !== undefined || n.value !== undefined) errors.push(diag('diag.nodeFields', { node: label }))
      if (n.expression) {
        if (!exprWithinLimits(n.expression)) errors.push(diag('diag.exprLimits', { node: label }))
        else for (const f of exprFlags(n.expression)) if (!flagIds.has(f)) errors.push(diag('diag.flagMissing', { node: label, id: f }))
      }
      if (!n.condition.trim() && !n.expression) warnings.push(diag('diag.branchNoCondition', { node: label }))
      for (const port of ['true', 'false'] as const)
        if (!outs.some((t) => t.sourcePort === port)) warnings.push(diag('diag.branchOpenOutput', { node: label, port: port.toUpperCase() }))
    } else {
      if (n.expression) errors.push(diag('diag.nodeFields', { node: label }))
      if (n.flagId && !flagIds.has(n.flagId)) errors.push(diag('diag.flagMissing', { node: label, id: n.flagId }))
      if (!n.flagId) warnings.push(diag('diag.setFlagNoFlag', { node: label }))
      if (outs.length > 1) errors.push(diag('diag.setFlagOutputs', { node: label }))
      if (outs.length === 0) warnings.push(diag('diag.setFlagNoOutput', { node: label }))
    }
    if (!hasInput) warnings.push(diag('diag.branchNoInput', { node: label }))
  }

  const chars = new Map(p.characters.map((c) => [c.id, c]))
  for (const s of p.scenes) {
    for (const [cid, stid] of Object.entries(s.characterStates)) {
      const c = chars.get(cid)
      if (!c) errors.push(diag('diag.sceneMissingChar', { scene: s.title, id: cid }))
      else if (!c.states.some((st) => st.id === stid))
        errors.push(diag('diag.sceneMissingState', { scene: s.title, id: stid, character: c.name }))
    }
    if (s.loop.enabled && s.loop.maxIterations === 0 && !s.loop.exitCondition.trim())
      warnings.push(diag('diag.loopNoExit', { scene: s.title }))
    const late = s.triggers.filter((t) => t.time > s.duration).length
    if (late) warnings.push(diag('diag.lateTriggers', { scene: s.title, n: late, duration: s.duration }))
    const sa = analyzeShots(s)
    if (sa.overlapPairs) warnings.push(diag('diag.shotOverlap', { scene: s.title, n: sa.overlapPairs }))
    if (sa.exceeding) warnings.push(diag('diag.shotLate', { scene: s.title, n: sa.exceeding, duration: s.duration }))
    const au = analyzeAudioCues(s)
    if (au.exceeding) warnings.push(diag('diag.audioLate', { scene: s.title, n: au.exceeding, duration: s.duration }))
    if (au.fadeTooLong) warnings.push(diag('diag.audioFade', { scene: s.title, n: au.fadeTooLong }))
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
