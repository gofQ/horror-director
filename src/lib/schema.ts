import { z } from 'zod'

export const SCHEMA_VERSION = 1
export const FORMAT_ID = 'horror-director'

export const SCENE_KINDS = ['reality', 'dream', 'nightmare', 'memory', 'ending'] as const
export const TRANSITION_STYLES = ['cut', 'fade', 'glitch', 'blackout', 'morph', 'loopback'] as const
export const TRIGGER_KINDS = [
  'jumpscare',
  'audio',
  'visual',
  'ai',
  'environment',
  'narrative',
] as const
export const CHARACTER_ROLES = ['player', 'entity', 'npc'] as const

export type SceneKind = (typeof SCENE_KINDS)[number]
export type TransitionStyle = (typeof TRANSITION_STYLES)[number]
export type TriggerKind = (typeof TRIGGER_KINDS)[number]
export type CharacterRole = (typeof CHARACTER_ROLES)[number]

const id = z.string().min(1)

export const triggerSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(TRIGGER_KINDS),
  time: z.number().min(0),
  intensity: z.number().min(0).max(10),
  description: z.string().default(''),
  condition: z.string().default(''),
  once: z.boolean().default(true),
})

export const sceneSchema = z.object({
  id,
  title: z.string(),
  kind: z.enum(SCENE_KINDS),
  position: z.object({ x: z.number(), y: z.number() }),
  description: z.string().default(''),
  unrealLevel: z.string().default(''),
  ambience: z.string().default(''),
  duration: z.number().positive().default(120),
  loop: z
    .object({
      enabled: z.boolean(),
      maxIterations: z.number().int().min(0),
      exitCondition: z.string(),
    })
    .default({ enabled: false, maxIterations: 0, exitCondition: '' }),
  triggers: z.array(triggerSchema).default([]),
  /** characterId -> characterStateId */
  characterStates: z.record(z.string(), z.string()).default({}),
})

export const transitionSchema = z.object({
  id,
  source: id,
  target: id,
  label: z.string().default(''),
  style: z.enum(TRANSITION_STYLES).default('cut'),
  condition: z.string().default(''),
  duration: z.number().min(0).default(1),
})

export const characterStateSchema = z.object({
  id,
  name: z.string(),
  behavior: z.string().default(''),
  aggression: z.number().min(0).max(10).default(0),
})

export const characterSchema = z.object({
  id,
  name: z.string(),
  role: z.enum(CHARACTER_ROLES),
  color: z.string().default('#9aa0b4'),
  description: z.string().default(''),
  states: z.array(characterStateSchema).default([]),
})

export const projectSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  startSceneId: z.string().nullable().default(null),
  scenes: z.array(sceneSchema),
  transitions: z.array(transitionSchema).default([]),
  characters: z.array(characterSchema).default([]),
})

export const exportSchema = z.object({
  format: z.literal(FORMAT_ID),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  exportedAt: z.string().optional(),
  /** Derived convenience data written by the exporter; regenerated on export, ignored on import. */
  derived: z.unknown().optional(),
  project: projectSchema,
})

export type Trigger = z.infer<typeof triggerSchema>
export type Scene = z.infer<typeof sceneSchema>
export type Transition = z.infer<typeof transitionSchema>
export type CharacterState = z.infer<typeof characterStateSchema>
export type Character = z.infer<typeof characterSchema>
export type Project = z.infer<typeof projectSchema>

export const isDreamLayer = (k: SceneKind) => k === 'dream' || k === 'nightmare' || k === 'memory'

export type CrossingType = 'reality->dream' | 'dream->reality' | 'same-layer'
export function crossingOf(a: SceneKind, b: SceneKind): CrossingType {
  const da = isDreamLayer(a)
  const db = isDreamLayer(b)
  if (!da && db) return 'reality->dream'
  if (da && !db) return 'dream->reality'
  return 'same-layer'
}
