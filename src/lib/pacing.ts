import { TRIGGER_KINDS, type TriggerKind } from './schema'
import type { SimEvent, SimResult } from './simulate'

/**
 * Deterministic, read-only pacing analysis of a simulated route (a `SimResult`).
 *
 * It looks only at *authored* trigger data on the chosen route. Intensity is design intent, not
 * measured player fear: findings are neutral observations to review, never verdicts, and there is
 * deliberately no continuous tension curve or quality score.
 *
 * Input events are the valid planned occurrences from the simulator: beyond-duration events are
 * excluded here and once-skipped repeats are already absent. Hypothetical (conditional) events stay
 * in, and findings that rely on them — or on assumed (conditional) transitions — say so.
 *
 * All comparisons are inclusive (`>=` / `<=`).
 */
export interface PacingOptions {
  /** cluster: at least this many events within `clusterWindow` seconds… */
  clusterCount: number
  clusterWindow: number
  /** …flagged as caution from this many events. */
  clusterCaution: number
  /** high-intensity repetition: events with intensity >= `highThreshold`, at least `highRepeatCount` within `highRepeatWindow` s. */
  highThreshold: number
  highRepeatCount: number
  highRepeatWindow: number
  highCaution: number
  /** repetitive scare type: at least `kindCount` events of one kind within the configurable `kindWindow` s. */
  kindCount: number
  kindWindow: number
  kindCaution: number
  /** extended trigger-free interval: gap of at least `silenceMin` seconds (reported neutrally). */
  silenceMin: number
  /** escalation: at least `escalationMin` consecutive events, strictly increasing intensity, each gap <= `escalationMaxGap` s. */
  escalationMin: number
  escalationMaxGap: number
}

export const DEFAULT_PACING: PacingOptions = {
  clusterCount: 4,
  clusterWindow: 20,
  clusterCaution: 6,
  highThreshold: 8,
  highRepeatCount: 2,
  highRepeatWindow: 45,
  highCaution: 3,
  kindCount: 4,
  kindWindow: 120,
  kindCaution: 6,
  silenceMin: 90,
  escalationMin: 3,
  escalationMaxGap: 60,
}

/** Fewer planned events than this ⇒ not enough data for pattern detection. */
export const MIN_EVENTS = 2

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}
export function clampPacing(o: Partial<PacingOptions> = {}): PacingOptions {
  const d = DEFAULT_PACING
  const count = (v: unknown, f: number) => Math.round(clamp(v, 2, 50, f))
  const secs = (v: unknown, f: number) => clamp(v, 1, 3600, f)
  return {
    clusterCount: count(o.clusterCount, d.clusterCount),
    clusterWindow: secs(o.clusterWindow, d.clusterWindow),
    clusterCaution: count(o.clusterCaution, d.clusterCaution),
    highThreshold: Math.round(clamp(o.highThreshold, 1, 10, d.highThreshold)),
    highRepeatCount: count(o.highRepeatCount, d.highRepeatCount),
    highRepeatWindow: secs(o.highRepeatWindow, d.highRepeatWindow),
    highCaution: count(o.highCaution, d.highCaution),
    kindCount: count(o.kindCount, d.kindCount),
    kindWindow: secs(o.kindWindow, d.kindWindow),
    kindCaution: count(o.kindCaution, d.kindCaution),
    silenceMin: secs(o.silenceMin, d.silenceMin),
    escalationMin: Math.round(clamp(o.escalationMin, 3, 20, d.escalationMin)),
    escalationMaxGap: secs(o.escalationMaxGap, d.escalationMaxGap),
  }
}

export const PACING_CATEGORIES = ['cluster', 'highRepeat', 'kindRepeat', 'silence', 'escalation'] as const
export type PacingCategory = (typeof PACING_CATEGORIES)[number]
export type PacingSeverity = 'informational' | 'caution'

export interface PacingFinding {
  /** Deterministic: category + kind + first event key (or the range for silences). */
  id: string
  category: PacingCategory
  severity: PacingSeverity
  /** Exact absolute time range in seconds. */
  start: number
  end: number
  /** Associated events (for silences: the events on either side of the gap). */
  eventKeys: string[]
  /** Unique scene ids touched by the range, in route order. */
  sceneIds: string[]
  kind?: TriggerKind
  /** Silence at the route start / after the last event of a finished route. */
  edge?: 'start' | 'end'
  values: {
    count: number
    peak: number
    spanSeconds: number
    firstIntensity: number
    lastIntensity: number
    /** The threshold values that were applied (for explaining the finding). */
    minCount: number
    windowSeconds: number
    intensityThreshold: number
  }
  /** Relies on at least one hypothetical (conditional) trigger. */
  dependsOnHypothetical: boolean
  /** Reaching it required choosing at least one conditional transition (an assumption). */
  dependsOnAssumedTransitions: boolean
}

export interface PacingOverview {
  plannedEvents: number
  /** Planned events per minute of route time, or null for a zero-length route. */
  eventsPerMinute: number | null
  perKind: Record<TriggerKind, number>
  highIntensity: number
  hypotheticalEvents: number
  longestSilence: { start: number; end: number; seconds: number; edge?: 'start' | 'end' } | null
  routeSeconds: number
  /** The route ended in an ending or dead end; otherwise trailing silence is not evaluated. */
  routeComplete: boolean
}

export interface PacingAnalysis {
  options: PacingOptions
  overview: PacingOverview
  findings: PacingFinding[]
  /** Fewer than `MIN_EVENTS` planned events: no pattern detection. */
  insufficient: boolean
}

type Ev = SimEvent

/** Indices of maximal runs of events that belong to at least one qualifying window (deduplicated). */
function windowRuns(evs: Ev[], minCount: number, window: number): number[][] {
  const marked = new Array<boolean>(evs.length).fill(false)
  let j = 0
  for (let i = 0; i < evs.length; i++) {
    if (j < i) j = i
    while (j + 1 < evs.length && evs[j + 1].absoluteTime - evs[i].absoluteTime <= window) j++
    if (j - i + 1 >= minCount) for (let k = i; k <= j; k++) marked[k] = true
  }
  const runs: number[][] = []
  let cur: number[] = []
  for (let i = 0; i < evs.length; i++) {
    if (!marked[i]) {
      if (cur.length) runs.push(cur)
      cur = []
    } else if (cur.length && evs[i].absoluteTime - evs[cur[cur.length - 1]].absoluteTime > window) {
      runs.push(cur)
      cur = [i]
    } else cur.push(i)
  }
  if (cur.length) runs.push(cur)
  return runs
}

export function analyzePacing(sim: SimResult, options: Partial<PacingOptions> = {}): PacingAnalysis {
  const opt = clampPacing(options)
  const evs = sim.events
    .filter((e) => !e.beyondDuration)
    .sort((a, b) => a.absoluteTime - b.absoluteTime || a.stepIndex - b.stepIndex || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const routeSeconds = sim.stats.totalDuration
  const routeComplete = sim.status === 'ending' || sim.status === 'deadEnd'
  const assumedStep = sim.steps.map((s) => !!s.via && s.via.condition.trim() !== '')
  const assumedUpTo = (stepIndex: number) => assumedStep.slice(0, stepIndex + 1).some(Boolean)
  const stepsOverlapping = (start: number, end: number) => {
    const hit = sim.steps.filter((s) => s.start < end && s.end > start)
    return hit.length ? hit : sim.steps.filter((s) => s.start <= start && s.end >= start).slice(0, 1)
  }

  // ----- trigger-free gaps (shared by the overview and the silence findings) -----
  interface Gap { start: number; end: number; before: Ev | null; after: Ev | null; edge?: 'start' | 'end' }
  const gaps: Gap[] = []
  if (evs.length === 0) {
    if (sim.steps.length > 0 && routeSeconds > 0) gaps.push({ start: 0, end: routeSeconds, before: null, after: null, edge: 'start' })
  } else {
    gaps.push({ start: 0, end: evs[0].absoluteTime, before: null, after: evs[0], edge: 'start' })
    for (let i = 0; i + 1 < evs.length; i++)
      gaps.push({ start: evs[i].absoluteTime, end: evs[i + 1].absoluteTime, before: evs[i], after: evs[i + 1] })
    if (routeComplete) {
      const last = evs[evs.length - 1]
      gaps.push({ start: last.absoluteTime, end: Math.max(routeSeconds, last.absoluteTime), before: last, after: null, edge: 'end' })
    }
  }
  const longest = gaps.reduce<Gap | null>((m, g) => (g.end - g.start > (m ? m.end - m.start : 0) ? g : m), null)

  const perKind = Object.fromEntries(TRIGGER_KINDS.map((k) => [k, 0])) as Record<TriggerKind, number>
  for (const e of evs) perKind[e.kind]++
  const overview: PacingOverview = {
    plannedEvents: evs.length,
    eventsPerMinute: routeSeconds > 0 ? Math.round((evs.length / (routeSeconds / 60)) * 10) / 10 : null,
    perKind,
    highIntensity: evs.filter((e) => e.intensity >= opt.highThreshold).length,
    hypotheticalEvents: evs.filter((e) => e.hypothetical).length,
    longestSilence: longest && longest.end > longest.start ? { start: longest.start, end: longest.end, seconds: longest.end - longest.start, edge: longest.edge } : null,
    routeSeconds,
    routeComplete,
  }

  const insufficient = evs.length < MIN_EVENTS
  const findings: PacingFinding[] = []
  if (!insufficient) {
    const make = (
      category: PacingCategory,
      severity: PacingSeverity,
      group: Ev[],
      thresholds: { minCount: number; windowSeconds: number; intensityThreshold?: number },
      extra: { kind?: TriggerKind } = {},
    ): PacingFinding => {
      const start = group[0].absoluteTime
      const end = group[group.length - 1].absoluteTime
      return {
        id: `${category}:${extra.kind ?? ''}:${group[0].key}`,
        category,
        severity,
        start,
        end,
        eventKeys: group.map((e) => e.key),
        sceneIds: [...new Set(group.map((e) => e.sceneId))],
        kind: extra.kind,
        values: {
          count: group.length,
          peak: Math.max(...group.map((e) => e.intensity)),
          spanSeconds: end - start,
          firstIntensity: group[0].intensity,
          lastIntensity: group[group.length - 1].intensity,
          minCount: thresholds.minCount,
          windowSeconds: thresholds.windowSeconds,
          intensityThreshold: thresholds.intensityThreshold ?? opt.highThreshold,
        },
        dependsOnHypothetical: group.some((e) => e.hypothetical),
        dependsOnAssumedTransitions: assumedUpTo(Math.max(...group.map((e) => e.stepIndex))),
      }
    }

    for (const run of windowRuns(evs, opt.clusterCount, opt.clusterWindow)) {
      const g = run.map((i) => evs[i])
      findings.push(make('cluster', g.length >= opt.clusterCaution ? 'caution' : 'informational', g, { minCount: opt.clusterCount, windowSeconds: opt.clusterWindow }))
    }

    const high = evs.filter((e) => e.intensity >= opt.highThreshold)
    for (const run of windowRuns(high, opt.highRepeatCount, opt.highRepeatWindow)) {
      const g = run.map((i) => high[i])
      findings.push(make('highRepeat', g.length >= opt.highCaution ? 'caution' : 'informational', g, { minCount: opt.highRepeatCount, windowSeconds: opt.highRepeatWindow }))
    }

    for (const kind of TRIGGER_KINDS) {
      const ofKind = evs.filter((e) => e.kind === kind)
      for (const run of windowRuns(ofKind, opt.kindCount, opt.kindWindow)) {
        const g = run.map((i) => ofKind[i])
        findings.push(make('kindRepeat', g.length >= opt.kindCaution ? 'caution' : 'informational', g, { minCount: opt.kindCount, windowSeconds: opt.kindWindow }, { kind }))
      }
    }

    for (const gap of gaps) {
      if (gap.end - gap.start < opt.silenceMin) continue
      const adjacent = [gap.before, gap.after].filter((e): e is Ev => e !== null)
      const touched = stepsOverlapping(gap.start, gap.end)
      findings.push({
        id: `silence::${gap.start}-${gap.end}`,
        category: 'silence',
        severity: 'informational',
        start: gap.start,
        end: gap.end,
        eventKeys: adjacent.map((e) => e.key),
        sceneIds: [...new Set(touched.map((s) => s.sceneId))],
        edge: gap.edge,
        values: {
          count: adjacent.length,
          peak: adjacent.length ? Math.max(...adjacent.map((e) => e.intensity)) : 0,
          spanSeconds: gap.end - gap.start,
          firstIntensity: gap.before?.intensity ?? 0,
          lastIntensity: gap.after?.intensity ?? 0,
          minCount: 0,
          windowSeconds: opt.silenceMin,
          intensityThreshold: opt.highThreshold,
        },
        dependsOnHypothetical: false,
        dependsOnAssumedTransitions: assumedUpTo(Math.max(...touched.map((s) => s.index))),
      })
    }

    let chain: Ev[] = []
    const flush = () => {
      if (chain.length >= opt.escalationMin) findings.push(make('escalation', 'informational', chain, { minCount: opt.escalationMin, windowSeconds: opt.escalationMaxGap }))
      chain = []
    }
    for (const e of evs) {
      const prev = chain[chain.length - 1]
      if (prev && e.intensity > prev.intensity && e.absoluteTime - prev.absoluteTime <= opt.escalationMaxGap) chain.push(e)
      else {
        flush()
        chain = [e]
      }
    }
    flush()
  }

  const order = (c: PacingCategory) => PACING_CATEGORIES.indexOf(c)
  findings.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      order(a.category) - order(b.category) ||
      TRIGGER_KINDS.indexOf(a.kind ?? TRIGGER_KINDS[0]) - TRIGGER_KINDS.indexOf(b.kind ?? TRIGGER_KINDS[0]) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return { options: opt, overview, findings, insufficient }
}
