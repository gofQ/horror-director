import { analyze, effectiveHops, type Issue } from '../graph'
import { exprFlags } from '../flags'
import { stageOf } from '../seqflow'
import { crossingOf, type CrossingType, type Expr, type LogicNode, type Project, type Scene, type Transition, type TransitionDirection } from '../schema'

/**
 * Engine-agnostic production plan derived from a project. Pure and deterministic: the input is never mutated,
 * nothing reads the clock, randomness, storage or the DOM. Engine adapters (`engines.ts`) and the renderers
 * (`render.ts`) only add wording on top of this data.
 */
export type Engine = 'unreal' | 'unity'
export const ENGINES: readonly Engine[] = ['unreal', 'unity']

export type SourceKind = 'project' | 'scene' | 'node' | 'transition' | 'trigger' | 'character' | 'flag'
export interface SourceRef {
  kind: SourceKind
  id: string
}

export type TaskKind =
  | 'foundation' | 'state' | 'level' | 'transition' | 'branch' | 'random' | 'event' | 'delay'
  | 'sequence' | 'cinematic' | 'audio' | 'character' | 'trigger' | 'assets' | 'verify'

/** Development phases in order. */
export const PHASES: readonly { n: number; kinds: readonly TaskKind[] }[] = [
  { n: 0, kinds: ['foundation'] },
  { n: 1, kinds: ['state'] },
  { n: 2, kinds: ['level'] },
  { n: 3, kinds: ['transition', 'branch', 'random', 'event', 'delay', 'sequence'] },
  { n: 4, kinds: ['cinematic'] },
  { n: 5, kinds: ['audio'] },
  { n: 6, kinds: ['character'] },
  { n: 7, kinds: ['trigger'] },
  { n: 8, kinds: ['assets'] },
  { n: 9, kinds: ['verify'] },
]
const phaseOf = (k: TaskKind): number => PHASES.find((p) => p.kinds.includes(k))!.n

/** Missing information that the plan marks `TBD`. */
export type TbdCode = 'levelPath' | 'audioAsset' | 'ifCondition' | 'stageContent' | 'ownerApproval' | 'engineVersion'

export interface PlanTask {
  /** `T-<phase>-<kind>-<sourceId>`: derived from source ids only, so it is stable across rebuilds. */
  id: string
  phase: number
  kind: TaskKind
  /** Title (or id) of the main source; user content, never translated. */
  subject: string
  sources: SourceRef[]
  dependsOn: string[]
  params: Record<string, string | number>
  tbd: TbdCode[]
}

export interface PlanScene {
  id: string
  title: string
  kind: Scene['kind']
  customType: string | null
  duration: number
  levelPath: string
  reachable: boolean
  ending: boolean
  loop: Scene['loop']
  ambience: string
  description: string
  characterStates: { characterId: string; character: string; stateId: string; state: string }[]
  counts: { triggers: number; shots: number; audio: number }
  outgoing: number
}

export interface PlanVia {
  id: string
  type: LogicNode['type']
  title: string
  /** Output pin taken out of this node on the way (IF true/false, Random a/b), when there is one. */
  port: string | null
}
export interface PlanLink {
  key: string
  from: string
  to: string
  fromTitle: string
  toTitle: string
  linkIds: string[]
  via: PlanVia[]
  labels: string[]
  styles: string[]
  /** Free-text link conditions: assumptions, never evaluated. */
  conditions: string[]
  /** Sum of the link durations plus Delay seconds: extra time between the two scenes. */
  gapSeconds: number
  delaySeconds: number
  crossing: CrossingType
  direction: TransitionDirection | null
}

export interface PlanPort {
  port: string
  targetId: string
  targetTitle: string
  label: string
}
export interface PlanNode {
  id: string
  type: LogicNode['type']
  title: string
  description: string
  condition: string
  expression: Expr | null
  flagId: string | null
  value: boolean | null
  eventCategory: string | null
  seconds: number | null
  probabilityA: number | null
  labelA: string
  labelB: string
  /** Owning Sequence stage when the node lives inside one. */
  stage: { sequenceId: string; stage: number } | null
  ports: PlanPort[]
  upstream: string[]
  downstream: string[]
}

export interface PlanStage {
  stage: number
  chain: { id: string; type: LogicNode['type']; title: string }[]
  returnId: string | null
  complete: boolean
}
export interface PlanSequence {
  id: string
  title: string
  stages: PlanStage[]
  completed: { id: string; title: string } | null
}

export interface PlanFlag {
  id: string
  name: string
  description: string
  defaultValue: boolean
  setBy: { nodeId: string; title: string; value: boolean }[]
  testedBy: { nodeId: string; title: string }[]
}
export interface PlanShot { sceneId: string; id: string; title: string; start: number; duration: number; framing: string; movement: string; technique: string; soundNotes: string; visualNotes: string }
export interface PlanCue { sceneId: string; id: string; title: string; start: number; duration: number; type: string; origin: string; direction: string; level: number; loop: boolean; asset: string; fadeIn: number; fadeOut: number }
export interface PlanTrigger { sceneId: string; id: string; name: string; kind: string; time: number; intensity: number; once: boolean; condition: string; description: string }
export interface PlanCharacter {
  id: string
  name: string
  role: string
  description: string
  states: { id: string; name: string; behavior: string; aggression: number; scenes: string[] }[]
}
export interface PlanAssetItem { kind: 'level' | 'audio'; sceneId: string; id: string; title: string; value: string }
export type GapCode = 'noStart' | 'unreachable' | 'noEnding' | 'levelPathTbd' | 'audioAssetTbd'
export interface PlanGap {
  code: GapCode
  severity: 'warning' | 'info'
  ids: string[]
  params: Record<string, string | number>
}

export interface Plan {
  overview: { name: string; description: string; startSceneId: string | null; startTitle: string; counts: Record<string, number> }
  scenes: PlanScene[]
  links: PlanLink[]
  nodes: PlanNode[]
  sequences: PlanSequence[]
  flags: PlanFlag[]
  shots: PlanShot[]
  cues: PlanCue[]
  triggers: PlanTrigger[]
  characters: PlanCharacter[]
  assets: PlanAssetItem[]
  /** Diagnostics from the project analysis (unreachable, dead ends, incomplete stages, ...); never filtered. */
  issues: Issue[]
  gaps: PlanGap[]
  tasks: PlanTask[]
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const uniq = <T,>(a: T[]): T[] => [...new Set(a)]

export function buildPlan(project: Project): Plan {
  const p = project
  const analysis = analyze(p)
  const sceneTitle = new Map(p.scenes.map((s) => [s.id, s.title]))
  const nodeTitle = new Map(p.logicNodes.map((n) => [n.id, n.title || n.id]))
  const titleOf = (id: string) => sceneTitle.get(id) ?? nodeTitle.get(id) ?? id
  const sceneById = new Map(p.scenes.map((s) => [s.id, s]))
  const typeName = new Map(p.sceneTypes.map((t) => [t.id, t.name]))
  const tById = new Map(p.transitions.map((t) => [t.id, t]))
  const charById = new Map(p.characters.map((c) => [c.id, c]))
  const outgoingOf = (id: string) => p.transitions.filter((t) => t.source === id)

  const scenes: PlanScene[] = [...p.scenes].sort(byId).map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    customType: s.typeId ? (typeName.get(s.typeId) ?? null) : null,
    duration: s.duration,
    levelPath: s.unrealLevel.trim(),
    reachable: analysis.reachable.has(s.id),
    ending: s.kind === 'ending',
    loop: s.loop,
    ambience: s.ambience,
    description: s.description,
    characterStates: Object.entries(s.characterStates)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([cid, sid]) => ({
        characterId: cid,
        character: charById.get(cid)?.name ?? cid,
        stateId: sid,
        state: charById.get(cid)?.states.find((x) => x.id === sid)?.name ?? sid,
      })),
    counts: { triggers: s.triggers.length, shots: s.shots.length, audio: s.audioCues.length },
    outgoing: outgoingOf(s.id).length,
  }))

  // Scene → (logic)* → scene hops, deterministic order.
  const links: PlanLink[] = effectiveHops(p)
    .map((h) => {
      const ts = h.links.map((id) => tById.get(id)).filter((t): t is Transition => !!t)
      const via: PlanVia[] = ts.slice(1).map((t) => {
        const n = p.logicNodes.find((x) => x.id === t.source)!
        return { id: n.id, type: n.type, title: n.title || n.id, port: null }
      })
      // the pin is carried by the link leaving each node
      ts.forEach((t) => {
        const v = via.find((x) => x.id === t.source)
        if (v) v.port = t.sourcePort ?? null
      })
      const delaySeconds = via.reduce((a, v) => a + (p.logicNodes.find((n) => n.id === v.id)?.seconds ?? 0) * (v.type === 'delay' ? 1 : 0), 0)
      const last = ts[ts.length - 1]
      const direction = ts.length === 1 && last?.direction ? last.direction : null
      return {
        key: `${h.from}>${h.links[h.links.length - 1]}`,
        from: h.from,
        to: h.to,
        fromTitle: titleOf(h.from),
        toTitle: titleOf(h.to),
        linkIds: h.links,
        via,
        labels: ts.map((t) => t.label).filter(Boolean),
        styles: uniq(ts.map((t) => t.style)),
        conditions: ts.map((t) => t.condition.trim()).filter(Boolean),
        gapSeconds: ts.reduce((a, t) => a + t.duration, 0) + delaySeconds,
        delaySeconds,
        crossing: crossingOf(sceneById.get(h.from)!.kind, sceneById.get(h.to)!.kind),
        direction,
      }
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  // Logic nodes with their pins and the scenes around them.
  const around = new Map<string, { up: Set<string>; down: Set<string> }>()
  for (const h of effectiveHops(p))
    for (const t of h.links) {
      const n = tById.get(t)
      if (!n) continue
      for (const id of [n.source, n.target]) {
        if (sceneById.has(id)) continue
        const a = around.get(id) ?? { up: new Set<string>(), down: new Set<string>() }
        a.up.add(h.from)
        a.down.add(h.to)
        around.set(id, a)
      }
    }
  const nodes: PlanNode[] = [...p.logicNodes].sort(byId).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title || n.id,
    description: n.description,
    condition: n.condition.trim(),
    expression: n.expression ?? null,
    flagId: n.flagId ?? null,
    value: n.type === 'setFlag' ? (n.value ?? true) : null,
    eventCategory: n.eventCategory ?? null,
    seconds: n.type === 'delay' ? (n.seconds ?? 0) : null,
    probabilityA: n.type === 'random' ? (n.probabilityA ?? 50) : null,
    labelA: n.labelA ?? '',
    labelB: n.labelB ?? '',
    stage: ((): PlanNode['stage'] => {
      const s = stageOf(p, n.id)
      return s ? { sequenceId: s.seqId, stage: s.stage } : null
    })(),
    ports: outgoingOf(n.id)
      .map((t) => ({ port: t.sourcePort ?? '', targetId: t.target, targetTitle: titleOf(t.target), label: t.label }))
      .sort((a, b) => (a.port < b.port ? -1 : a.port > b.port ? 1 : 0)),
    upstream: [...(around.get(n.id)?.up ?? [])].sort(),
    downstream: [...(around.get(n.id)?.down ?? [])].sort(),
  }))

  // Ordered Sequence stages: Then 0 → Return 0 → Then 1 → Return 1 → Completed.
  const sequences: PlanSequence[] = nodes
    .filter((n) => n.type === 'sequence')
    .map((n) => {
      const stages: PlanStage[] = [0, 1].map((stage) => {
        const chain: PlanStage['chain'] = []
        let returnId: string | null = null
        let at = outgoingOf(n.id).find((t) => t.sourcePort === (stage === 0 ? 'then0' : 'then1'))?.target
        for (let i = 0; at && i < 64; i++) {
          const node = p.logicNodes.find((x) => x.id === at)
          if (!node) break
          if (node.type === 'seqReturn') {
            returnId = node.id
            break
          }
          chain.push({ id: node.id, type: node.type, title: node.title || node.id })
          at = outgoingOf(node.id)[0]?.target
        }
        const ret = returnId ? p.logicNodes.find((x) => x.id === returnId) : null
        const complete = !!ret && ret.sequenceId === n.id && ret.stage === stage
        return { stage, chain, returnId, complete }
      })
      const comp = outgoingOf(n.id).find((t) => t.sourcePort === 'completed')
      return { id: n.id, title: n.title, stages, completed: comp ? { id: comp.target, title: titleOf(comp.target) } : null }
    })

  const flags: PlanFlag[] = [...p.flags].sort(byId).map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    defaultValue: f.defaultValue,
    setBy: nodes.filter((n) => n.type === 'setFlag' && n.flagId === f.id).map((n) => ({ nodeId: n.id, title: n.title, value: n.value ?? true })),
    testedBy: nodes.filter((n) => n.type === 'branch' && n.expression && exprFlags(n.expression).includes(f.id)).map((n) => ({ nodeId: n.id, title: n.title })),
  }))

  const shots: PlanShot[] = scenes.flatMap((s) =>
    [...sceneById.get(s.id)!.shots].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)).map((x) => ({ sceneId: s.id, ...x })),
  )
  const cues: PlanCue[] = scenes.flatMap((s) =>
    [...sceneById.get(s.id)!.audioCues].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1)).map((x) => ({
      sceneId: s.id, id: x.id, title: x.title, start: x.start, duration: x.duration, type: x.type, origin: x.origin, direction: x.direction,
      level: x.level, loop: x.loop, asset: x.asset.trim(), fadeIn: x.fadeIn, fadeOut: x.fadeOut,
    })),
  )
  const triggers: PlanTrigger[] = scenes.flatMap((s) =>
    [...sceneById.get(s.id)!.triggers].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1)).map((x) => ({
      sceneId: s.id, id: x.id, name: x.name, kind: x.kind, time: x.time, intensity: x.intensity, once: x.once, condition: x.condition.trim(), description: x.description,
    })),
  )
  const characters: PlanCharacter[] = [...p.characters].sort(byId).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    description: c.description,
    states: c.states.map((st) => ({
      id: st.id,
      name: st.name,
      behavior: st.behavior,
      aggression: st.aggression,
      scenes: scenes.filter((s) => s.characterStates.some((x) => x.characterId === c.id && x.stateId === st.id)).map((s) => s.id),
    })),
  }))

  const assets: PlanAssetItem[] = [
    ...scenes.map((s) => ({ kind: 'level' as const, sceneId: s.id, id: s.id, title: s.title, value: s.levelPath })),
    ...cues.map((c) => ({ kind: 'audio' as const, sceneId: c.sceneId, id: c.id, title: c.title, value: c.asset })),
  ]

  // Planner-only gaps (analysis issues are carried over unchanged in `issues`).
  const gaps: PlanGap[] = []
  if (!p.startSceneId || !sceneById.has(p.startSceneId)) gaps.push({ code: 'noStart', severity: 'warning', ids: [], params: {} })
  for (const s of scenes) if (!s.reachable && p.startSceneId && sceneById.has(p.startSceneId)) gaps.push({ code: 'unreachable', severity: 'warning', ids: [s.id], params: { title: s.title } })
  if (!scenes.some((s) => s.ending)) gaps.push({ code: 'noEnding', severity: 'warning', ids: [], params: {} })
  for (const a of assets) {
    if (a.kind === 'level' && !a.value) gaps.push({ code: 'levelPathTbd', severity: 'info', ids: [a.sceneId], params: { title: a.title } })
    if (a.kind === 'audio' && !a.value) gaps.push({ code: 'audioAssetTbd', severity: 'info', ids: [a.sceneId, a.id], params: { title: a.title } })
  }

  // ---- tasks ----
  const tasks: PlanTask[] = []
  const add = (kind: TaskKind, sourceId: string, subject: string, sources: SourceRef[], deps: string[], params: Record<string, string | number> = {}, tbd: TbdCode[] = []) => {
    const id = `T-${phaseOf(kind)}-${kind}-${sourceId}`
    tasks.push({ id, phase: phaseOf(kind), kind, subject, sources, dependsOn: uniq(deps).sort(), params, tbd })
    return id
  }
  const foundation = add('foundation', 'project', p.name, [{ kind: 'project', id: 'project' }], [], { scenes: scenes.length, nodes: nodes.length }, ['engineVersion'])
  const hasState = flags.length > 0 || nodes.some((n) => n.type === 'setFlag')
  const state = hasState
    ? add('state', 'flags', p.name, [...flags.map((f) => ({ kind: 'flag' as const, id: f.id })), ...nodes.filter((n) => n.type === 'setFlag').map((n) => ({ kind: 'node' as const, id: n.id }))], [foundation], { flags: flags.length, setters: nodes.filter((n) => n.type === 'setFlag').length })
    : null
  const levelOf = new Map<string, string>()
  for (const s of scenes)
    levelOf.set(s.id, add('level', s.id, s.title, [{ kind: 'scene', id: s.id }], [foundation], { kind: s.kind, duration: s.duration, reachable: s.reachable ? 1 : 0, ending: s.ending ? 1 : 0, loopMax: s.loop.enabled ? s.loop.maxIterations : -1 }, s.levelPath ? [] : ['levelPath']))
  const lv = (ids: string[]) => ids.map((i) => levelOf.get(i)).filter((x): x is string => !!x)
  for (const l of links) {
    if (l.via.length) continue // routed through logic nodes: covered by their own tasks, links listed in the plan
    add('transition', l.key.replace('>', '-'), `${l.fromTitle} → ${l.toTitle}`, [{ kind: 'transition', id: l.linkIds[0] }, { kind: 'scene', id: l.from }, { kind: 'scene', id: l.to }], lv([l.from, l.to]), { style: l.styles[0] ?? 'cut', seconds: l.gapSeconds, technique: l.direction?.technique ?? 'none' })
  }
  for (const n of nodes) {
    if (n.stage) continue // authored inside a Sequence stage: planned by the Sequence task
    const around = lv([...n.upstream, ...n.downstream])
    const deps = [foundation, ...(around.length ? around : []), ...(state && (n.type === 'branch' || n.type === 'setFlag') ? [state] : [])]
    const src: SourceRef[] = [{ kind: 'node', id: n.id }]
    if (n.type === 'branch') add('branch', n.id, n.title, src, deps, { structured: n.expression ? 1 : 0 }, n.expression || n.condition ? [] : ['ifCondition'])
    else if (n.type === 'random') add('random', n.id, n.title, src, deps, { a: n.probabilityA ?? 50, b: 100 - (n.probabilityA ?? 50) })
    else if (n.type === 'event') add('event', n.id, n.title, src, deps, { category: n.eventCategory ?? 'story' })
    else if (n.type === 'delay') add('delay', n.id, n.title, src, deps, { seconds: n.seconds ?? 0 })
  }
  for (const sq of sequences) {
    const n = nodes.find((x) => x.id === sq.id)!
    const stageIds = sq.stages.flatMap((s) => [...s.chain.map((c) => c.id), ...(s.returnId ? [s.returnId] : [])])
    const needsState = sq.stages.some((s) => s.chain.some((c) => c.type === 'setFlag'))
    add('sequence', sq.id, sq.title, [{ kind: 'node', id: sq.id }, ...stageIds.map((id) => ({ kind: 'node' as const, id }))], [foundation, ...lv([...n.upstream, ...n.downstream]), ...(needsState && state ? [state] : [])], { stages: 2, complete: sq.stages.every((s) => s.complete) ? 1 : 0 }, sq.stages.every((s) => s.complete) ? [] : ['stageContent'])
  }
  for (const s of scenes) if (s.counts.shots) add('cinematic', s.id, s.title, [{ kind: 'scene', id: s.id }], lv([s.id]), { shots: s.counts.shots })
  for (const s of scenes) if (s.counts.audio) add('audio', s.id, s.title, [{ kind: 'scene', id: s.id }], lv([s.id]), { cues: s.counts.audio }, cues.some((c) => c.sceneId === s.id && !c.asset) ? ['audioAsset'] : [])
  for (const c of characters) add('character', c.id, c.name, [{ kind: 'character', id: c.id }], [foundation], { states: c.states.length, role: c.role })
  for (const s of scenes) if (s.counts.triggers) add('trigger', s.id, s.title, [{ kind: 'scene', id: s.id }, ...triggers.filter((t) => t.sceneId === s.id).map((t) => ({ kind: 'trigger' as const, id: t.id }))], lv([s.id]), { triggers: s.counts.triggers })
  const preAssets = tasks.filter((t) => t.kind === 'cinematic' || t.kind === 'audio' || t.kind === 'character').map((t) => t.id)
  add('assets', 'project', p.name, [{ kind: 'project', id: 'project' }], preAssets.length ? preAssets : [foundation], { missing: gaps.filter((g) => g.code === 'levelPathTbd' || g.code === 'audioAssetTbd').length })
  const all = tasks.map((t) => t.id)
  add('verify', 'project', p.name, [{ kind: 'project', id: 'project' }], all, { endings: scenes.filter((s) => s.ending).length }, ['ownerApproval'])

  tasks.sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return {
    overview: {
      name: p.name,
      description: p.description,
      startSceneId: p.startSceneId,
      startTitle: p.startSceneId ? (sceneTitle.get(p.startSceneId) ?? '') : '',
      counts: { ...analysis.stats },
    },
    scenes,
    links,
    nodes,
    sequences,
    flags,
    shots,
    cues,
    triggers,
    characters,
    assets,
    issues: analysis.issues,
    gaps,
    tasks,
  }
}
