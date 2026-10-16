import type { Plan, PlanTask } from './plan'

/**
 * Task-source fingerprint: a pure, deterministic hash of the authored information a task is built from.
 * It is read from the Plan, which carries no UI-only data (positions, waypoints), no language and no clock; on top of that
 * schedule data (order, wave, dependency lists), engine wording and globally derived values (reachability, upstream /
 * downstream lists) are left out so unrelated edits never change it. `parts` keeps one hash per authored component so a
 * change can be explained ("scene:s_cottage changed").
 */
export interface Fingerprint {
  fp: string
  parts: Record<string, string>
}

/** Key-sorted JSON so equal data always serializes equally. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** cyrb53: small 53-bit string hash, no dependencies; rendered as 14 hex digits. */
export function hash53(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

const h = (v: unknown) => hash53(canonical(v))

function partsOf(plan: Plan, task: PlanTask): Record<string, unknown> {
  const parts: Record<string, unknown> = {}
  const scene = (id: string, withNeighbours: boolean) => {
    const s = plan.scenes.find((x) => x.id === id)
    // `reachable` is derived from the whole graph: leaving it out keeps unrelated edits from staling this task.
    if (s) {
      const { reachable: _r, ...own } = s
      void _r
      parts[`scene:${id}`] = own
    } else parts[`scene:${id}`] = null
    if (withNeighbours)
      parts[`links:${id}`] = plan.links
        .filter((l) => l.from === id || l.to === id)
        .map(({ fromTitle: _a, toTitle: _b, ...l }) => (void _a, void _b, l))
  }
  for (const src of task.sources) {
    switch (src.kind) {
      case 'project':
        parts['project:project'] = { name: plan.overview.name, description: plan.overview.description, start: plan.overview.startSceneId, scenes: plan.scenes.length, nodes: plan.nodes.length }
        break
      case 'scene':
        switch (task.kind) {
          case 'level':
            scene(src.id, true)
            break
          case 'cinematic':
            scene(src.id, true)
            parts[`shots:${src.id}`] = plan.shots.filter((x) => x.sceneId === src.id)
            break
          case 'assetAudio':
            parts[`cues:${src.id}`] = plan.cues.filter((x) => x.sceneId === src.id)
            break
          case 'audio':
            scene(src.id, false)
            parts[`cues:${src.id}`] = plan.cues.filter((x) => x.sceneId === src.id)
            break
          case 'trigger':
            scene(src.id, false)
            break
          default:
            scene(src.id, false)
        }
        break
      case 'transition': {
        const link = plan.links.find((l) => l.linkIds.includes(src.id))
        parts[`transition:${src.id}`] = link ? (({ fromTitle: _a, toTitle: _b, ...l }) => (void _a, void _b, l))(link) : null
        break
      }
      case 'node': {
        const n = plan.nodes.find((x) => x.id === src.id)
        parts[`node:${src.id}`] = n ? (({ upstream: _u, downstream: _d, ...rest }) => (void _u, void _d, rest))(n) : null
        break
      }
      case 'trigger':
        parts[`trigger:${src.id}`] = plan.triggers.find((x) => x.id === src.id) ?? null
        break
      case 'character':
        parts[`character:${src.id}`] = plan.characters.find((x) => x.id === src.id) ?? null
        break
      case 'flag':
        parts[`flag:${src.id}`] = plan.flags.find((x) => x.id === src.id) ?? null
        break
    }
  }
  if (task.kind === 'sequence') parts[`sequence:${task.sources[0].id}`] = plan.sequences.find((x) => x.id === task.sources[0].id) ?? null
  return parts
}

export function taskFingerprint(plan: Plan, task: PlanTask): Fingerprint {
  const raw = partsOf(plan, task)
  const parts: Record<string, string> = {}
  for (const k of Object.keys(raw).sort()) parts[k] = h(raw[k])
  return { fp: hash53(canonical(parts)), parts }
}

export function fingerprints(plan: Plan): Map<string, Fingerprint> {
  return new Map(plan.tasks.map((t) => [t.id, taskFingerprint(plan, t)]))
}

export interface PartsDiff {
  added: string[]
  removed: string[]
  changed: string[]
}
export function diffParts(before: Record<string, string>, after: Record<string, string>): PartsDiff {
  const keys = (o: Record<string, string>) => Object.keys(o)
  return {
    added: keys(after).filter((k) => !(k in before)).sort(),
    removed: keys(before).filter((k) => !(k in after)).sort(),
    changed: keys(after).filter((k) => k in before && before[k] !== after[k]).sort(),
  }
}
