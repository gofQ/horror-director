import { analyzeAudioCues, assignLanes } from './audio'
import type { AudioCue, Scene, Shot, Trigger } from './schema'
import { analyzeShots } from './shots'

/**
 * Derived, read-only cinematic sequence of one scene: shots, audio cues and triggers on one
 * scene-relative time axis (seconds). Nothing here changes or clamps authored timing, and the
 * result is never persisted. It is authored planning timing, not a simulation of runtime conditions.
 */
export type SequenceKind = 'shot' | 'audio' | 'trigger'

interface Base {
  /** `<kind>:<id>` — stable across renders and unique within a scene. */
  key: string
  id: string
  title: string
  start: number
  /** `start + duration`; equals `start` for instantaneous triggers. */
  end: number
  /** Ends (or, for a trigger, occurs) after the scene duration. */
  exceeds: boolean
  /** Display lane inside its track (overlaps use more lanes; never stored). */
  lane: number
}
export interface ShotItem extends Base { kind: 'shot'; ref: Shot }
export interface AudioItem extends Base { kind: 'audio'; ref: AudioCue; silence: boolean; fadeTooLong: boolean }
export interface TriggerItem extends Base { kind: 'trigger'; ref: Trigger; /** Has a free-text condition: it may never happen in play. */ hypothetical: boolean }
export type SequenceItem = ShotItem | AudioItem | TriggerItem

export interface SequenceWarnings {
  shotsBeyond: number
  audioBeyond: number
  triggersBeyond: number
  fadesTooLong: number
  /** No shots, cues or triggers at all. */
  empty: boolean
  /** Some, but not all, of the three tracks are empty. */
  partial: boolean
}

export interface Sequence {
  /** Chronological: start, then shot < audio < trigger, then authored order. */
  items: SequenceItem[]
  /** Displayed axis length: the scene duration, extended when authored items run past it. */
  range: number
  sceneEnd: number
  laneCount: Record<SequenceKind, number>
  counts: Record<SequenceKind, number>
  warnings: SequenceWarnings
}

const RANK: Record<SequenceKind, number> = { shot: 0, audio: 1, trigger: 2 }

export function buildSequence(scene: Pick<Scene, 'shots' | 'audioCues' | 'triggers' | 'duration'>): Sequence {
  const sa = analyzeShots(scene)
  const au = analyzeAudioCues(scene)
  const shotLanes = assignLanes(scene.shots)
  const audioLanes = assignLanes(scene.audioCues)

  const tagged: { item: SequenceItem; index: number }[] = [
    ...scene.shots.map((s, index) => ({
      index,
      item: { kind: 'shot', key: `shot:${s.id}`, id: s.id, title: s.title, start: s.start, end: sa.byId[s.id].end, exceeds: sa.byId[s.id].exceeds, lane: shotLanes.lanes[s.id], ref: s } as ShotItem,
    })),
    ...scene.audioCues.map((c, index) => ({
      index,
      item: { kind: 'audio', key: `audio:${c.id}`, id: c.id, title: c.title, start: c.start, end: au.byId[c.id].end, exceeds: au.byId[c.id].exceeds, lane: audioLanes.lanes[c.id], ref: c, silence: c.type === 'silence', fadeTooLong: au.byId[c.id].fadeTooLong } as AudioItem,
    })),
    ...scene.triggers.map((t, index) => ({
      index,
      item: { kind: 'trigger', key: `trigger:${t.id}`, id: t.id, title: t.name, start: t.time, end: t.time, exceeds: t.time > scene.duration, lane: 0, ref: t, hypothetical: t.condition.trim() !== '' } as TriggerItem,
    })),
  ]
  tagged.sort((a, b) => a.item.start - b.item.start || RANK[a.item.kind] - RANK[b.item.kind] || a.index - b.index)
  const items = tagged.map((x) => x.item)

  const counts = { shot: scene.shots.length, audio: scene.audioCues.length, trigger: scene.triggers.length }
  const nonEmpty = Object.values(counts).filter((n) => n > 0).length
  return {
    items,
    range: Math.max(scene.duration, 1, ...items.map((i) => i.end)),
    sceneEnd: scene.duration,
    laneCount: { shot: Math.max(1, shotLanes.count), audio: Math.max(1, audioLanes.count), trigger: 1 },
    counts,
    warnings: {
      shotsBeyond: sa.exceeding,
      audioBeyond: au.exceeding,
      triggersBeyond: items.filter((i) => i.kind === 'trigger' && i.exceeds).length,
      fadesTooLong: au.fadeTooLong,
      empty: nonEmpty === 0,
      partial: nonEmpty > 0 && nonEmpty < 3,
    },
  }
}
