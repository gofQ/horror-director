import type { Project, TriggerKind } from './schema'
import { TRIGGER_KINDS } from './schema'
import { simulateRoute, type SimOptions, type SimResult, type SimStatus } from './simulate'
import { analyzePacing, PACING_CATEGORIES, type PacingAnalysis, type PacingCategory, type PacingOptions, type PacingSeverity } from './pacing'

/**
 * Read-only A/B comparison of two simulated routes of the same project.
 *
 * Both routes are produced by the existing `simulateRoute` and `analyzePacing` with the *same*
 * simulator limits and pacing thresholds; nothing is traversed or analyzed a second way. The result
 * is descriptive only: there is no ranking, no "better route" and no score. Deltas are `B − A` and
 * exist only for numeric measures where a difference is meaningful.
 */
export type Side = 'a' | 'b'

export interface RouteSummary {
  status: SimStatus
  /** Empty project or missing start scene: nothing to compare. */
  unavailable: boolean
  /** Ended in an ending or a dead end. */
  finished: boolean
  /** Requested choices that are no longer part of the route (graph edits or a lowered step cap). */
  dropped: number
  duration: number
  visits: number
  uniqueScenes: number
  repeatVisits: number
  events: number
  hypothetical: number
  assumedTransitions: number
  /** IF outputs taken against their structured condition: the route is a what-if, not validated logic. */
  overrides: number
  /** Seconds of Delay nodes on the route (already part of `duration` once a later scene is entered). */
  delayTotal: number
  /** Event nodes passed (authored milestones; separate from scene trigger `events`). */
  eventNodes: number
  /** Random Branch outputs chosen, split by how they were picked (provenance is session-only; `unknown` when absent). */
  randomDecisions: number
  randomManual: number
  randomRolled: number
  eventsPerMinute: number | null
  avgIntensity: number | null
  peakIntensity: number | null
  perKind: Record<TriggerKind, number>
  findingsTotal: number
  findingsByCategory: Record<PacingCategory, number>
  findingsBySeverity: Record<PacingSeverity, number>
}

/** B − A, `null` when either side has no value. */
export type Delta = number | null

export interface SummaryDeltas {
  duration: Delta
  visits: Delta
  uniqueScenes: Delta
  repeatVisits: Delta
  events: Delta
  hypothetical: Delta
  assumedTransitions: Delta
  eventsPerMinute: Delta
  avgIntensity: Delta
  peakIntensity: Delta
  perKind: Record<TriggerKind, Delta>
  findingsTotal: Delta
  findingsByCategory: Record<PacingCategory, Delta>
  findingsBySeverity: Record<PacingSeverity, Delta>
}

export interface SceneRef {
  id: string
  title: string
  visitsA: number
  visitsB: number
}
export interface TransitionRef {
  id: string
  label: string
  style: string
  sourceTitle: string
  targetTitle: string
  /** Choosing it assumes a (never evaluated) condition. */
  assumed: boolean
}

export type Divergence =
  | { kind: 'unavailable' }
  | { kind: 'identical' }
  | {
      kind: 'diverges'
      /** Number of identical leading steps (scene visits). */
      sharedSteps: number
      sceneId: string
      sceneTitle: string
      /** Route time at which the shared part ends. */
      time: number
      /** What each route does next; `null` when that route ends in this scene. */
      next: Record<Side, { transitionId: string; label: string; targetTitle: string; assumed: boolean } | null>
    }

export interface CompareEvent {
  /** Stable identity: scene id, trigger id and the visit occurrence of that scene. */
  identity: string
  key: string
  name: string
  kind: TriggerKind
  intensity: number
  sceneId: string
  sceneTitle: string
  visit: number
  time: number
  hypothetical: boolean
  shared: boolean
}
export interface SharedEvent {
  identity: string
  name: string
  kind: TriggerKind
  intensity: number
  sceneTitle: string
  visit: number
  timeA: number
  timeB: number
  /** timeB − timeA: later divergence-dependent timing differences stay visible. */
  shift: number
  hypothetical: boolean
}

export interface RouteComparison {
  a: RouteSummary
  b: RouteSummary
  deltas: SummaryDeltas
  /** Either route is unavailable, shortened (`dropped > 0`) or otherwise not complete as requested. */
  incomplete: boolean
  identical: boolean
  divergence: Divergence
  scenes: { shared: SceneRef[]; onlyA: SceneRef[]; onlyB: SceneRef[] }
  transitions: { shared: TransitionRef[]; onlyA: TransitionRef[]; onlyB: TransitionRef[] }
  events: {
    /** All planned events per route, in route order. */
    a: CompareEvent[]
    b: CompareEvent[]
    shared: SharedEvent[]
    onlyA: CompareEvent[]
    onlyB: CompareEvent[]
  }
  /** Common time axis end for aligned timelines. */
  timelineEnd: number
  /** Where the routes diverge (null if identical or unavailable). */
  divergenceTime: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10
const diff = (a: number | null, b: number | null): Delta => (a === null || b === null ? null : round1(b - a))

function plannedEvents(sim: SimResult): CompareEvent[] {
  return sim.events
    .filter((e) => !e.beyondDuration)
    .sort((x, y) => x.absoluteTime - y.absoluteTime || x.stepIndex - y.stepIndex || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .map((e) => {
      const visit = sim.steps[e.stepIndex].visit
      return {
        identity: `${e.sceneId}\u0000${e.triggerId}\u0000${visit}`,
        key: e.key,
        name: e.name,
        kind: e.kind,
        intensity: e.intensity,
        sceneId: e.sceneId,
        sceneTitle: e.sceneTitle,
        visit,
        time: e.absoluteTime,
        hypothetical: e.hypothetical,
        shared: false,
      }
    })
}

/** How each Random Branch decision (by choice index) was made; supplied by the session store when known. */
export type RandomProvenance = Record<number, { mode: 'manual' | 'rolled' }>

function summarize(sim: SimResult, analysis: PacingAnalysis, requested: number, marks: RandomProvenance = {}): RouteSummary {
  const perKind = Object.fromEntries(TRIGGER_KINDS.map((k) => [k, analysis.overview.perKind[k]])) as Record<TriggerKind, number>
  const findingsByCategory = Object.fromEntries(PACING_CATEGORIES.map((c) => [c, 0])) as Record<PacingCategory, number>
  const findingsBySeverity: Record<PacingSeverity, number> = { informational: 0, caution: 0 }
  for (const f of analysis.findings) {
    findingsByCategory[f.category]++
    findingsBySeverity[f.severity]++
  }
  const unavailable = sim.status === 'empty' || sim.status === 'noStart'
  return {
    status: sim.status,
    unavailable,
    finished: sim.status === 'ending' || sim.status === 'deadEnd',
    dropped: unavailable ? requested : Math.max(0, requested - sim.validChoices.length),
    duration: sim.stats.totalDuration,
    visits: sim.stats.visits,
    uniqueScenes: sim.stats.uniqueScenes,
    repeatVisits: sim.stats.repeatVisits,
    events: sim.stats.occurrences,
    hypothetical: sim.stats.hypothetical,
    assumedTransitions: sim.steps.filter((s) => s.via && s.via.condition.trim() !== '').length,
    overrides: sim.stats.overrides,
    delayTotal: sim.stats.delayTotal,
    eventNodes: sim.stats.eventCount,
    randomDecisions: sim.stats.randomDecisions,
    randomManual: sim.flow.filter((f) => f.kind === 'random' && f.choiceIndex !== undefined && marks[f.choiceIndex]?.mode === 'manual').length,
    randomRolled: sim.flow.filter((f) => f.kind === 'random' && f.choiceIndex !== undefined && marks[f.choiceIndex]?.mode === 'rolled').length,
    eventsPerMinute: analysis.overview.eventsPerMinute,
    avgIntensity: sim.stats.avgIntensity,
    peakIntensity: sim.stats.peakIntensity,
    perKind,
    findingsTotal: analysis.findings.length,
    findingsByCategory,
    findingsBySeverity,
  }
}

function deltasOf(a: RouteSummary, b: RouteSummary): SummaryDeltas {
  const rec = <K extends string>(keys: readonly K[], get: (s: RouteSummary) => Record<K, number>) =>
    Object.fromEntries(keys.map((k) => [k, diff(get(a)[k], get(b)[k])])) as Record<K, Delta>
  return {
    duration: diff(a.duration, b.duration),
    visits: diff(a.visits, b.visits),
    uniqueScenes: diff(a.uniqueScenes, b.uniqueScenes),
    repeatVisits: diff(a.repeatVisits, b.repeatVisits),
    events: diff(a.events, b.events),
    hypothetical: diff(a.hypothetical, b.hypothetical),
    assumedTransitions: diff(a.assumedTransitions, b.assumedTransitions),
    eventsPerMinute: diff(a.eventsPerMinute, b.eventsPerMinute),
    avgIntensity: diff(a.avgIntensity, b.avgIntensity),
    peakIntensity: diff(a.peakIntensity, b.peakIntensity),
    perKind: rec(TRIGGER_KINDS, (s) => s.perKind),
    findingsTotal: diff(a.findingsTotal, b.findingsTotal),
    findingsByCategory: rec(PACING_CATEGORIES, (s) => s.findingsByCategory),
    findingsBySeverity: rec(['informational', 'caution'] as const, (s) => s.findingsBySeverity),
  }
}

function sceneVisits(sim: SimResult): Map<string, { title: string; n: number }> {
  const m = new Map<string, { title: string; n: number }>()
  for (const s of sim.steps) m.set(s.sceneId, { title: s.title, n: (m.get(s.sceneId)?.n ?? 0) + 1 })
  return m
}

function transitionsOf(sim: SimResult): Map<string, TransitionRef> {
  const m = new Map<string, TransitionRef>()
  sim.steps.forEach((s, i) => {
    if (!s.via || m.has(s.via.transitionId)) return
    m.set(s.via.transitionId, {
      id: s.via.transitionId,
      label: s.via.label,
      style: s.via.style,
      sourceTitle: sim.steps[i - 1].title,
      targetTitle: s.title,
      assumed: s.via.condition.trim() !== '',
    })
  })
  return m
}

function split<T>(a: Map<string, T>, b: Map<string, T>) {
  return {
    shared: [...a.keys()].filter((k) => b.has(k)),
    onlyA: [...a.keys()].filter((k) => !b.has(k)),
    onlyB: [...b.keys()].filter((k) => !a.has(k)),
  }
}

function divergenceOf(a: SimResult, b: SimResult): Divergence {
  let i = 0
  while (i < a.steps.length && i < b.steps.length && a.steps[i].sceneId === b.steps[i].sceneId && a.steps[i].via?.transitionId === b.steps[i].via?.transitionId) i++
  if (i === a.steps.length && i === b.steps.length) return { kind: 'identical' }
  const last = a.steps[i - 1]
  const nextOf = (sim: SimResult) => {
    const s = sim.steps[i]
    return s?.via ? { transitionId: s.via.transitionId, label: s.via.label, targetTitle: s.title, assumed: s.via.condition.trim() !== '' } : null
  }
  return { kind: 'diverges', sharedSteps: i, sceneId: last.sceneId, sceneTitle: last.title, time: last.end, next: { a: nextOf(a), b: nextOf(b) } }
}

export function compareRoutes(
  project: Project,
  choicesA: readonly string[],
  choicesB: readonly string[],
  simOptions: Partial<SimOptions> = {},
  pacingOptions: Partial<PacingOptions> = {},
  marks: { a?: RandomProvenance; b?: RandomProvenance } = {},
): RouteComparison {
  const simA = simulateRoute(project, choicesA, simOptions)
  const simB = simulateRoute(project, choicesB, simOptions)
  const a = summarize(simA, analyzePacing(simA, pacingOptions), choicesA.length, marks.a)
  const b = summarize(simB, analyzePacing(simB, pacingOptions), choicesB.length, marks.b)
  const unavailable = a.unavailable || b.unavailable
  const divergence: Divergence = unavailable ? { kind: 'unavailable' } : divergenceOf(simA, simB)

  const va = sceneVisits(simA)
  const vb = sceneVisits(simB)
  const sceneSplit = split(va, vb)
  const ref = (id: string): SceneRef => ({ id, title: (va.get(id) ?? vb.get(id))!.title, visitsA: va.get(id)?.n ?? 0, visitsB: vb.get(id)?.n ?? 0 })

  const ta = transitionsOf(simA)
  const tb = transitionsOf(simB)
  const trSplit = split(ta, tb)

  const evA = plannedEvents(simA)
  const evB = plannedEvents(simB)
  const byIdA = new Map(evA.map((e) => [e.identity, e]))
  const byIdB = new Map(evB.map((e) => [e.identity, e]))
  const shared: SharedEvent[] = []
  for (const e of evA) {
    const o = byIdB.get(e.identity)
    if (!o) continue
    e.shared = true
    o.shared = true
    shared.push({ identity: e.identity, name: e.name, kind: e.kind, intensity: e.intensity, sceneTitle: e.sceneTitle, visit: e.visit, timeA: e.time, timeB: o.time, shift: round1(o.time - e.time), hypothetical: e.hypothetical || o.hypothetical })
  }

  return {
    a,
    b,
    deltas: deltasOf(a, b),
    incomplete: unavailable || a.dropped > 0 || b.dropped > 0,
    identical: divergence.kind === 'identical',
    divergence,
    scenes: { shared: sceneSplit.shared.map(ref), onlyA: sceneSplit.onlyA.map(ref), onlyB: sceneSplit.onlyB.map(ref) },
    transitions: {
      shared: trSplit.shared.map((k) => ta.get(k)!),
      onlyA: trSplit.onlyA.map((k) => ta.get(k)!),
      onlyB: trSplit.onlyB.map((k) => tb.get(k)!),
    },
    events: { a: evA, b: evB, shared, onlyA: evA.filter((e) => !byIdB.has(e.identity)), onlyB: evB.filter((e) => !byIdA.has(e.identity)) },
    timelineEnd: Math.max(simA.timelineEnd, simB.timelineEnd, 1),
    divergenceTime: divergence.kind === 'diverges' ? divergence.time : null,
  }
}
