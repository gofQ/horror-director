import { diag, type Diagnostic } from './diagnostics'
import { crossingOf, type CrossingType, type Project, type SceneKind, type TransitionStyle, type TriggerKind } from './schema'

/**
 * Read-only story path simulation.
 *
 * The route is just the list of chosen transition ids; `simulateRoute` replays it from the start
 * scene every time, so edits to the graph automatically revalidate it. Nothing here evaluates
 * free-text conditions (they are surfaced as assumptions) and nothing mutates the project.
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
  blocked: BlockReason | null
}

export interface SimStep {
  index: number
  sceneId: string
  title: string
  kind: SceneKind
  /** 1-based visit number of this scene within the route. */
  visit: number
  /** Transition taken to enter this scene (null for the start scene). */
  via: { transitionId: string; label: string; style: TransitionStyle; duration: number; condition: string; crossing: CrossingType } | null
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

const emptyStats = (): SimStats => ({
  totalDuration: 0,
  visits: 0,
  uniqueScenes: 0,
  occurrences: 0,
  hypothetical: 0,
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
  const steps: SimStep[] = []
  const enter = (id: string, via: SimStep['via'], at: number) => {
    const scene = scenes.get(id)!
    const visit = (visits.get(id) ?? 0) + 1
    visits.set(id, visit)
    steps.push({ index: steps.length, sceneId: id, title: scene.title, kind: scene.kind, visit, via, start: at, end: at + scene.duration, duration: scene.duration })
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
  for (let i = 0; i < choices.length; i++) {
    if (validChoices.length >= opt.stepCap) break // truncated by the step cap (not a graph invalidation)
    const here = steps[steps.length - 1]
    const tr = project.transitions.find((t) => t.id === choices[i])
    if (
      !tr ||
      tr.source !== here.sceneId ||
      !scenes.has(tr.target) ||
      here.kind === 'ending' ||
      blockedBy(tr.target)
    ) {
      invalidated = choices.length - i
      break
    }
    const target = scenes.get(tr.target)!
    enter(
      tr.target,
      {
        transitionId: tr.id,
        label: tr.label,
        style: tr.style,
        duration: tr.duration,
        condition: tr.condition,
        crossing: crossingOf(scenes.get(tr.source)!.kind, target.kind),
      },
      here.end + tr.duration,
    )
    validChoices.push(tr.id)
  }

  const current = steps[steps.length - 1]
  const capReached = validChoices.length >= opt.stepCap
  const warnings: Diagnostic[] = []
  if (invalidated > 0) warnings.push(diag('diag.sim.invalidated', { n: invalidated }))

  // Options at the current scene (ending scenes are terminal; their outgoing transitions are ignored).
  let simOptions: SimOption[] = []
  let missingTargets = 0
  if (current.kind !== 'ending') {
    for (const t of project.transitions) {
      if (t.source !== current.sceneId) continue
      const target = scenes.get(t.target)
      if (!target) {
        missingTargets++
        continue
      }
      simOptions.push({
        transitionId: t.id,
        label: t.label,
        style: t.style,
        duration: t.duration,
        condition: t.condition,
        crossing: crossingOf(current.kind, target.kind),
        targetId: t.target,
        targetTitle: target.title,
        targetKind: target.kind,
        blocked: capReached ? 'stepLimit' : blockedBy(t.target),
      })
    }
  }
  if (missingTargets > 0) warnings.push(diag('diag.sim.missingTarget', { n: missingTargets }))

  let status: SimStatus
  if (current.kind === 'ending') status = 'ending'
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
