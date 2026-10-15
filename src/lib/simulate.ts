import { diag, type Diagnostic } from './diagnostics'
import { evalExpr, initialFlagState, type FlagState } from './flags'
import { crossingOf, type BranchPort, type CrossingType, type Project, type SceneKind, type Transition, type TransitionStyle, type TriggerKind } from './schema'

/**
 * Read-only story path simulation.
 *
 * The route is just the list of chosen transition ids; `simulateRoute` replays it from the start
 * scene every time, so edits to the graph automatically revalidate it. Nothing here evaluates
 * free-text conditions (they are surfaced as assumptions) and nothing mutates the project.
 *
 * Narrative flags: the route starts from the project's flag defaults; entering a Set Flag node applies its
 * assignment (in route order). Only *structured* IF conditions are evaluated against that state; free-text
 * conditions are never parsed. A structured IF still lets the user pick either output: the one matching the
 * evaluation is `valid`, the other is an explicit hypothetical `override` (never changed silently). State lives
 * only in the replay result: it is recomputed from the start every time and never persisted.
 *
 * IF (branch) nodes: every link is an explicit choice, so a branch hop is two choices — the link into the
 * branch (the route is then *pending* at the branch) and the TRUE or FALSE output the user picks. The branch
 * takes zero time, creates no visit and no trigger occurrence, and its condition is shown as an assumption.
 *
 * Loop semantics: `loop.maxIterations` counts *additional repeat visits after the first* (4 ⇒ at
 * most 5 visits) and only applies to scenes with `loop.enabled`. 0 means "unlimited", bounded by the
 * separate `unlimitedLimit` safety limit. Cycles through scenes without loop settings are bounded by
 * the hard `stepCap` (number of transitions taken).
 */
export const DEFAULT_STEP_CAP = 40
export const MAX_STEP_CAP = 200
export const DEFAULT_UNLIMITED_LIMIT = 5
export const MAX_UNLIMITED_LIMIT = 20

export interface SimOptions {
  /** Hard cap on transitions taken. */
  stepCap: number
  /** Allowed repeat visits for loop scenes whose `maxIterations` is 0 (unlimited). */
  unlimitedLimit: number
}

export const defaultOptions = (): SimOptions => ({ stepCap: DEFAULT_STEP_CAP, unlimitedLimit: DEFAULT_UNLIMITED_LIMIT })

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.min(max, Math.max(min, n))
}
export function clampOptions(o: Partial<SimOptions> = {}): SimOptions {
  return {
    stepCap: clampInt(o.stepCap, 1, MAX_STEP_CAP, DEFAULT_STEP_CAP),
    unlimitedLimit: clampInt(o.unlimitedLimit, 1, MAX_UNLIMITED_LIMIT, DEFAULT_UNLIMITED_LIMIT),
  }
}

export type SimStatus = 'empty' | 'noStart' | 'active' | 'ending' | 'deadEnd' | 'loopLimit' | 'stepLimit'
export type BlockReason = 'loopLimit' | 'safetyLimit' | 'stepLimit'

export interface SimOption {
  transitionId: string
  label: string
  style: TransitionStyle
  duration: number
  /** Free text, never evaluated: shown as an assumption the user makes by choosing this option. */
  condition: string
  crossing: CrossingType
  targetId: string
  targetTitle: string
  targetKind: SceneKind
  /** `branch`/`setFlag` options lead to a zero-time logic node (no visit); `scene` options enter a scene. */
  targetType: 'scene' | 'branch' | 'setFlag'
  /** Only for options leaving an IF node: how the output relates to the structured condition. */
  logic?: BranchLogic
  /** Output pin of the branch node this option leaves (only for options taken while pending at a branch). */
  port?: BranchPort
  /** Branch whose output this option is (assumption text, never evaluated). */
  fromBranch?: { nodeId: string; title: string; condition: string }
  blocked: BlockReason | null
}

/** `manual`: no structured condition; `valid`: matches the evaluation; `override`: contradicts it (hypothetical). */
export type BranchLogic = 'manual' | 'valid' | 'override'

/** One IF node passed on a hop: the user chose `port`; `condition` is the free text (never evaluated). */
export interface BranchPass {
  nodeId: string
  title: string
  condition: string
  port: BranchPort
  logic: BranchLogic
  /** Result of the structured condition at that moment (null when the IF has none). */
  evaluated: boolean | null
}

/** A Set Flag assignment applied while walking the route. */
export interface FlagChange {
  nodeId: string
  nodeTitle: string
  flagId: string
  flagName: string
  before: boolean
  after: boolean
  /** Index of the scene step the route was at when the node was entered. */
  stepIndex: number
}

export interface SimStep {
  index: number
  sceneId: string
  title: string
  kind: SceneKind
  /** 1-based visit number of this scene within the route. */
  visit: number
  /** Transition taken to enter this scene (null for the start scene). */
  via: {
    /** Id of the last link (the one entering this scene), unique per route choice. */
    transitionId: string
    label: string
    style: TransitionStyle
    /** Sum of the durations of all links of the hop (an IF node itself takes no time). */
    duration: number
    /** Link conditions and IF assumptions (raw user text); non-empty exactly when the hop rests on an assumption. */
    condition: string
    /** Only the link conditions (without IF assumptions). */
    linkCondition: string
    crossing: CrossingType
    linkIds: string[]
    branches: BranchPass[]
    /** Flag assignments applied on this hop, in order. */
    changes: FlagChange[]
  } | null
  /** Flag values after entering this scene. */
  flags: FlagState
  start: number
  end: number
  duration: number
}

export interface SimEvent {
  key: string
  stepIndex: number
  sceneId: string
  sceneTitle: string
  triggerId: string
  name: string
  kind: TriggerKind
  intensity: number
  description: string
  localTime: number
  /** `step.start + localTime`; never shifted, even when beyond the scene duration. */
  absoluteTime: number
  /** Non-empty condition text: the event is hypothetical, not a verified gameplay event. */
  condition: string
  hypothetical: boolean
  beyondDuration: boolean
}

export interface SimStats {
  totalDuration: number
  visits: number
  uniqueScenes: number
  /** Planned occurrences: excludes beyond-duration and once-skipped triggers. */
  occurrences: number
  hypothetical: number
  /** IF outputs taken against their structured condition (what-if choices). */
  overrides: number
  beyondDuration: number
  onceSkipped: number
  avgIntensity: number | null
  peakIntensity: number | null
  realityToDream: number
  dreamToReality: number
  /** Visits beyond the first to any scene (loop repetitions). */
  repeatVisits: number
}

export interface SimResult {
  status: SimStatus
  steps: SimStep[]
  current: SimStep | null
  options: SimOption[]
  /** Set while the route waits at a logic node (IF: explicit TRUE/FALSE choice; Set Flag: its single output). */
  pending: PendingNode | null
  /** Flag values at the current position (including a Set Flag node the route is pending at). */
  state: FlagState
  /** Every Set Flag assignment of the route, in order. */
  changes: FlagChange[]
  /** The leading part of the requested choices that is still valid. */
  validChoices: string[]
  /** Choices dropped because graph edits made them invalid. */
  invalidated: number
  events: SimEvent[]
  stats: SimStats
  warnings: Diagnostic[]
  /** Chart end: whichever is later, the route end or the latest event. */
  timelineEnd: number
}

export interface PendingNode {
  nodeId: string
  kind: 'branch' | 'setFlag'
  title: string
  condition: string
  /** IF with a structured condition: its result for the current state; otherwise null. */
  evaluated: boolean | null
}

const emptyStats = (): SimStats => ({
  totalDuration: 0,
  visits: 0,
  uniqueScenes: 0,
  occurrences: 0,
  hypothetical: 0,
  overrides: 0,
  beyondDuration: 0,
  onceSkipped: 0,
  avgIntensity: null,
  peakIntensity: null,
  realityToDream: 0,
  dreamToReality: 0,
  repeatVisits: 0,
})

const none = (status: SimStatus, invalidated = 0): SimResult => ({
  status,
  steps: [],
  current: null,
  options: [],
  pending: null,
  state: {},
  changes: [],
  validChoices: [],
  invalidated,
  events: [],
  stats: emptyStats(),
  warnings: [],
  timelineEnd: 0,
})

export function simulateRoute(project: Project, choices: readonly string[], options: Partial<SimOptions> = {}): SimResult {
  const opt = clampOptions(options)
  const scenes = new Map(project.scenes.map((s) => [s.id, s]))
  if (scenes.size === 0) return none('empty', choices.length)
  const start = project.startSceneId ? scenes.get(project.startSceneId) : undefined
  if (!start) return none('noStart', choices.length)

  const visits = new Map<string, number>()
  const state: FlagState = initialFlagState(project)
  const flagById = new Map(project.flags.map((f) => [f.id, f]))
  const changes: FlagChange[] = []
  const steps: SimStep[] = []
  const enter = (id: string, via: SimStep['via'], at: number) => {
    const scene = scenes.get(id)!
    const visit = (visits.get(id) ?? 0) + 1
    visits.set(id, visit)
    steps.push({ index: steps.length, sceneId: id, title: scene.title, kind: scene.kind, visit, via, flags: { ...state }, start: at, end: at + scene.duration, duration: scene.duration })
  }

  /** Loop-limit check for entering `id` again, given the visits so far. */
  const blockedBy = (id: string): 'loopLimit' | 'safetyLimit' | null => {
    const scene = scenes.get(id)!
    if (!scene.loop.enabled) return null
    const before = visits.get(id) ?? 0
    const limit = scene.loop.maxIterations > 0 ? scene.loop.maxIterations : opt.unlimitedLimit
    if (before <= limit) return null
    return scene.loop.maxIterations > 0 ? 'loopLimit' : 'safetyLimit'
  }

  enter(start.id, null, 0)
  const validChoices: string[] = []
  let invalidated = 0
  // Position between scenes: pending at an IF node, with the links walked since the last scene.
  const branches = new Map(project.logicNodes.map((n) => [n.id, n]))
  let pendingNode: (typeof project.logicNodes)[number] | null = null
  let pendingEval: boolean | null = null
  let pathLinks: Transition[] = []
  let pathBranches: BranchPass[] = []
  let pathChanges: FlagChange[] = []
  const assumption = (n: { title: string; condition: string; id: string }) => n.condition.trim() || n.title.trim() || n.id

  const logicOf = (evaluated: boolean | null, port: BranchPort): { logic: BranchLogic; evaluated: boolean | null } => ({
    evaluated,
    logic: evaluated === null ? 'manual' : evaluated === (port === 'true') ? 'valid' : 'override',
  })
  /** Entering a logic node: a Set Flag applies its assignment, an IF with a structured condition is evaluated. */
  const enterLogic = (node: NonNullable<typeof pendingNode>, stepIndex: number) => {
    pendingEval = null
    if (node.type === 'branch') {
      if (node.expression) pendingEval = evalExpr(node.expression, state)
      return
    }
    const flag = node.flagId ? flagById.get(node.flagId) : undefined
    if (!flag || node.value === undefined) return
    const before = state[flag.id] === true
    state[flag.id] = node.value
    const change: FlagChange = { nodeId: node.id, nodeTitle: node.title, flagId: flag.id, flagName: flag.name, before, after: node.value, stepIndex }
    changes.push(change)
    pathChanges = [...pathChanges, change]
  }

  for (let i = 0; i < choices.length; i++) {
    if (validChoices.length >= opt.stepCap) break // truncated by the step cap (not a graph invalidation)
    const here = steps[steps.length - 1]
    const tr = project.transitions.find((t) => t.id === choices[i])
    const fromId = pendingNode ? pendingNode.id : here.sceneId
    const toScene = tr ? scenes.has(tr.target) : false
    const toBranch = tr ? branches.has(tr.target) : false
    if (
      !tr ||
      tr.source !== fromId ||
      (!toScene && !toBranch) ||
      (!pendingNode && here.kind === 'ending') ||
      (toScene && blockedBy(tr.target))
    ) {
      invalidated = choices.length - i
      break
    }
    if (pendingNode && pendingNode.type === 'branch' && tr.sourcePort)
      pathBranches = [...pathBranches, { nodeId: pendingNode.id, title: pendingNode.title, condition: pendingNode.condition, port: tr.sourcePort, ...logicOf(pendingEval, tr.sourcePort) }]
    const links = [...pathLinks, tr]
    if (toBranch) {
      pendingNode = branches.get(tr.target)!
      pathLinks = links
      enterLogic(pendingNode, here.index)
    } else {
      const target = scenes.get(tr.target)!
      // A structured IF whose output matches its evaluation is logic, not an assumption.
      const conditions = [
        ...links.map((l) => l.condition.trim()),
        ...pathBranches.filter((b) => b.logic !== 'valid').map((b) => assumption({ id: b.nodeId, title: b.title, condition: b.condition })),
      ].filter(Boolean)
      enter(
        tr.target,
        {
          transitionId: tr.id,
          label: links.length === 1 ? tr.label : (links.map((l) => l.label).find((l) => l.trim() !== '') ?? ''),
          style: links[0].style,
          duration: links.reduce((a, l) => a + l.duration, 0),
          condition: conditions.join(' · '),
          linkCondition: links.map((l) => l.condition.trim()).filter(Boolean).join(' · '),
          crossing: crossingOf(here.kind, target.kind),
          linkIds: links.map((l) => l.id),
          branches: pathBranches,
          changes: pathChanges,
        },
        here.end + links.reduce((a, l) => a + l.duration, 0),
      )
      pendingNode = null
      pendingEval = null
      pathLinks = []
      pathBranches = []
      pathChanges = []
    }
    validChoices.push(tr.id)
  }

  const current = steps[steps.length - 1]
  const capReached = validChoices.length >= opt.stepCap
  const warnings: Diagnostic[] = []
  if (invalidated > 0) warnings.push(diag('diag.sim.invalidated', { n: invalidated }))

  // Options at the current position: the scene's outgoing links, or the pending IF node's TRUE/FALSE outputs
  // (ending scenes are terminal; their outgoing transitions are ignored).
  let simOptions: SimOption[] = []
  let missingTargets = 0
  const fromId = pendingNode ? pendingNode.id : current.sceneId
  if (pendingNode || current.kind !== 'ending') {
    for (const t of project.transitions) {
      if (t.source !== fromId) continue
      const target = scenes.get(t.target)
      const branch = branches.get(t.target)
      if (!target && !branch) {
        missingTargets++
        continue
      }
      simOptions.push({
        transitionId: t.id,
        label: t.label,
        style: t.style,
        duration: t.duration,
        condition: t.condition,
        crossing: target ? crossingOf(current.kind, target.kind) : 'same-layer',
        targetId: t.target,
        targetTitle: target ? target.title : branch!.title,
        targetKind: target ? target.kind : current.kind,
        targetType: target ? 'scene' : branch!.type === 'setFlag' ? 'setFlag' : 'branch',
        ...(pendingNode && pendingNode.type === 'branch' && t.sourcePort ? { port: t.sourcePort, logic: logicOf(pendingEval, t.sourcePort).logic } : {}),
        ...(pendingNode && pendingNode.type === 'branch' ? { fromBranch: { nodeId: pendingNode.id, title: pendingNode.title, condition: pendingNode.condition } } : {}),
        blocked: capReached ? 'stepLimit' : target ? blockedBy(t.target) : null,
      })
    }
  }
  if (pendingNode?.type === 'branch') simOptions.sort((a, b) => Number(b.port === 'true') - Number(a.port === 'true'))
  if (missingTargets > 0) warnings.push(diag('diag.sim.missingTarget', { n: missingTargets }))

  let status: SimStatus
  if (!pendingNode && current.kind === 'ending') status = 'ending'
  else if (simOptions.length === 0) status = 'deadEnd'
  else if (capReached) status = 'stepLimit'
  else if (simOptions.every((o) => o.blocked)) status = 'loopLimit'
  else status = 'active'
  if (status === 'stepLimit') warnings.push(diag('diag.sim.stepLimit', { n: opt.stepCap }))
  const seenBlocked = new Set<string>()
  for (const o of simOptions) {
    if ((o.blocked !== 'loopLimit' && o.blocked !== 'safetyLimit') || seenBlocked.has(o.targetId)) continue
    seenBlocked.add(o.targetId)
    const max = scenes.get(o.targetId)!.loop.maxIterations
    warnings.push(
      o.blocked === 'loopLimit'
        ? diag('diag.sim.loopLimit', { scene: o.targetTitle, n: max })
        : diag('diag.sim.safetyLimit', { scene: o.targetTitle, n: opt.unlimitedLimit }),
    )
  }

  // Absolute-time events.
  const events: SimEvent[] = []
  const onceSeen = new Set<string>()
  let onceSkipped = 0
  for (const step of steps) {
    const scene = scenes.get(step.sceneId)!
    const ordered = scene.triggers.map((t, i) => ({ t, i })).sort((a, b) => a.t.time - b.t.time || a.i - b.i)
    for (const { t } of ordered) {
      if (t.once) {
        const key = `${step.sceneId}\u0000${t.id}`
        if (onceSeen.has(key)) {
          onceSkipped++
          continue
        }
        onceSeen.add(key)
      }
      const condition = t.condition.trim()
      events.push({
        key: `${step.index}:${t.id}`,
        stepIndex: step.index,
        sceneId: step.sceneId,
        sceneTitle: step.title,
        triggerId: t.id,
        name: t.name,
        kind: t.kind,
        intensity: t.intensity,
        description: t.description,
        localTime: t.time,
        absoluteTime: step.start + t.time,
        condition,
        hypothetical: condition !== '',
        beyondDuration: t.time > step.duration,
      })
    }
  }
  const planned = events.filter((e) => !e.beyondDuration)
  const beyond = events.length - planned.length
  if (beyond > 0) warnings.push(diag('diag.sim.beyondDuration', { n: beyond }))

  let realityToDream = 0
  let dreamToReality = 0
  for (const s of steps) {
    if (s.via?.crossing === 'reality->dream') realityToDream++
    else if (s.via?.crossing === 'dream->reality') dreamToReality++
  }
  const unique = new Set(steps.map((s) => s.sceneId)).size
  const sum = planned.reduce((a, e) => a + e.intensity, 0)
  const stats: SimStats = {
    totalDuration: current.end,
    visits: steps.length,
    uniqueScenes: unique,
    occurrences: planned.length,
    hypothetical: planned.filter((e) => e.hypothetical).length,
    overrides: steps.reduce((a, st) => a + (st.via?.branches.filter((b) => b.logic === 'override').length ?? 0), 0),
    beyondDuration: beyond,
    onceSkipped,
    avgIntensity: planned.length ? Math.round((sum / planned.length) * 10) / 10 : null,
    peakIntensity: planned.length ? Math.max(...planned.map((e) => e.intensity)) : null,
    realityToDream,
    dreamToReality,
    repeatVisits: steps.length - unique,
  }

  return {
    status,
    steps,
    current,
    options: simOptions,
    pending: pendingNode ? { nodeId: pendingNode.id, kind: pendingNode.type, title: pendingNode.title, condition: pendingNode.condition, evaluated: pendingEval } : null,
    state,
    changes,
    validChoices,
    invalidated,
    events,
    stats,
    warnings,
    timelineEnd: Math.max(current.end, ...events.map((e) => e.absoluteTime)),
  }
}

/** m:ss (or h:mm:ss) clock text for an absolute time in seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
