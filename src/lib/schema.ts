import { z } from 'zod'

/**
 * 2 added `scene.shots`; 3 the optional `transition.direction`; 4 `scene.audioCues`; 5 adds logic (branch) nodes,
 * graph comments, custom scene types and branch-port links; 6 adds narrative flags, Set Flag nodes and optional
 * structured branch conditions. Older files and bare projects are still imported.
 */
export const SCHEMA_VERSION = 6
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
export const SHOT_FRAMINGS = ['wide', 'medium', 'close-up', 'extreme-close-up', 'pov'] as const
export const SHOT_MOVEMENTS = ['static', 'pan', 'tilt', 'tracking', 'handheld'] as const
export const SHOT_TECHNIQUES = ['none', 'match-cut', 'impossible-space', 'identity-discontinuity', 'false-awakening'] as const
/** Psychological techniques for transition direction: the shot techniques plus the reality reveal. */
export const DIRECTION_TECHNIQUES = [...SHOT_TECHNIQUES, 'reality-reveal'] as const
export const AUDIO_CUE_TYPES = ['ambience', 'music', 'sfx', 'voice', 'whisper', 'stinger', 'silence'] as const
export const AUDIO_ORIGINS = ['diegetic', 'non-diegetic', 'ambiguous'] as const
export const AUDIO_DIRECTIONS = ['nonspatial', 'front', 'behind', 'left', 'right', 'above', 'moving'] as const
export const LOGIC_NODE_TYPES = ['branch', 'setFlag'] as const
export const BRANCH_PORTS = ['true', 'false'] as const
/** Curated, safe presentation sets for custom scene types and comments (hex colors / lucide icon names). */
export const TYPE_COLORS = ['#c4263d', '#d98cff', '#7dcfff', '#9ece6a', '#e0af68', '#ff9e64', '#bb9af7', '#9aa0b4'] as const
export const TYPE_ICONS = ['Skull', 'Ghost', 'Eye', 'Moon', 'Flame', 'Footprints', 'Bell', 'Radio', 'Brain', 'Church', 'Siren', 'Wind'] as const
export const CHARACTER_ROLES = ['player', 'entity', 'npc'] as const

export type SceneKind = (typeof SCENE_KINDS)[number]
export type TransitionStyle = (typeof TRANSITION_STYLES)[number]
export type TriggerKind = (typeof TRIGGER_KINDS)[number]
export type ShotFraming = (typeof SHOT_FRAMINGS)[number]
export type ShotMovement = (typeof SHOT_MOVEMENTS)[number]
export type ShotTechnique = (typeof SHOT_TECHNIQUES)[number]
export type DirectionTechnique = (typeof DIRECTION_TECHNIQUES)[number]
export type AudioCueType = (typeof AUDIO_CUE_TYPES)[number]
export type AudioOrigin = (typeof AUDIO_ORIGINS)[number]
export type AudioDirection = (typeof AUDIO_DIRECTIONS)[number]
export type LogicNodeType = (typeof LOGIC_NODE_TYPES)[number]
export type BranchPort = (typeof BRANCH_PORTS)[number]
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

/** Planning notes for one cinematic shot (not executable engine commands). Times are seconds relative to the scene. */
export const shotSchema = z.object({
  id,
  title: z.string(),
  start: z.number().min(0),
  duration: z.number().positive(),
  framing: z.enum(SHOT_FRAMINGS),
  movement: z.enum(SHOT_MOVEMENTS),
  technique: z.enum(SHOT_TECHNIQUES),
  soundNotes: z.string().default(''),
  visualNotes: z.string().default(''),
})

/**
 * Planning notes for one audio cue (not playable audio or engine commands). Times are seconds relative
 * to the scene; `level` is a descriptive 0–10 planning value, not measured loudness.
 */
export const audioCueSchema = z.object({
  id,
  title: z.string(),
  start: z.number().min(0),
  duration: z.number().positive(),
  type: z.enum(AUDIO_CUE_TYPES),
  origin: z.enum(AUDIO_ORIGINS).default('non-diegetic'),
  direction: z.enum(AUDIO_DIRECTIONS).default('nonspatial'),
  level: z.number().min(0).max(10).default(5),
  fadeIn: z.number().min(0).default(0),
  fadeOut: z.number().min(0).default(0),
  loop: z.boolean().default(false),
  /** Asset path or identifier (free text, never resolved). */
  asset: z.string().default(''),
  notes: z.string().default(''),
  /** Optional text-to-audio generation brief (never sent anywhere). */
  prompt: z.string().default(''),
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
  /** Ordered cinematic shots (authored order). */
  shots: z.array(shotSchema).default([]),
  /** Ordered audio cues (authored order; independent of triggers, ambience and shot sound notes). */
  audioCues: z.array(audioCueSchema).default([]),
  /** Optional custom scene type; `kind` always equals that type's `baseKind`. */
  typeId: id.optional(),
  /** characterId -> characterStateId */
  characterStates: z.record(z.string(), z.string()).default({}),
})

/**
 * Director-authored planning notes for a transition (never executed or evaluated). Shot links must
 * belong to the transition's source / target scene (checked by `validateProject`).
 */
export const transitionDirectionSchema = z.object({
  technique: z.enum(DIRECTION_TECHNIQUES).default('none'),
  /** What the player believes is happening (the illusion). */
  playerBelief: z.string().default(''),
  /** What is actually happening. */
  reality: z.string().default(''),
  visualContinuity: z.string().default(''),
  audioContinuity: z.string().default(''),
  /** The reveal moment / contradiction. */
  reveal: z.string().default(''),
  unrealNotes: z.string().default(''),
  sourceShotId: z.string().min(1).nullable().default(null),
  targetShotId: z.string().min(1).nullable().default(null),
})

export const transitionSchema = z.object({
  id,
  source: id,
  target: id,
  label: z.string().default(''),
  style: z.enum(TRANSITION_STYLES).default('cut'),
  condition: z.string().default(''),
  duration: z.number().min(0).default(1),
  /** Optional psychological direction; absent for transitions that have not been designed. */
  direction: transitionDirectionSchema.optional(),
  /** Output pin of the branch node this link leaves (only for links whose source is a branch). */
  sourcePort: z.enum(BRANCH_PORTS).optional(),
})

const position = z.object({ x: z.number(), y: z.number() })

/** Boolean narrative flag. Nodes reference flags by `id` only, so renaming never breaks a connection. */
export const flagSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(''),
  defaultValue: z.boolean().default(false),
})

/**
 * Structured Boolean condition: pure data (no strings are ever parsed or evaluated). Depth and size limits
 * are enforced by `validateProject` (`EXPR_MAX_DEPTH`, `EXPR_MAX_NODES`).
 */
export type Expr =
  | { op: 'flag'; flagId: string; is: boolean }
  | { op: 'not'; arg: Expr }
  | { op: 'and'; args: Expr[] }
  | { op: 'or'; args: Expr[] }
export const EXPR_MAX_DEPTH = 6
export const EXPR_MAX_NODES = 32
export const exprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('flag'), flagId: id, is: z.boolean() }),
    z.object({ op: z.literal('not'), arg: exprSchema }),
    z.object({ op: z.literal('and'), args: z.array(exprSchema).min(1) }),
    z.object({ op: z.literal('or'), args: z.array(exprSchema).min(1) }),
  ]),
)

/**
 * Zero-time logic node. `branch` (IF): `condition` is a human-readable description that is never evaluated;
 * the optional `expression` is evaluated against simulated flags. `setFlag`: assigns `value` to `flagId`
 * (null = not configured yet). `flagId`/`value` are only meaningful for `setFlag`, `expression` only for `branch`.
 */
export const logicNodeSchema = z.object({
  id,
  type: z.enum(LOGIC_NODE_TYPES),
  title: z.string().default(''),
  description: z.string().default(''),
  condition: z.string().default(''),
  expression: exprSchema.optional(),
  flagId: id.nullable().optional(),
  value: z.boolean().optional(),
  position,
})

/** Non-executable note frame for organizing narrative areas. */
export const graphCommentSchema = z.object({
  id,
  title: z.string().default(''),
  text: z.string().default(''),
  color: z.enum(TYPE_COLORS).default(TYPE_COLORS[7]),
  position,
  width: z.number().min(80).max(4000).default(280),
  height: z.number().min(60).max(4000).default(160),
})

export const sceneTypeSchema = z.object({
  id,
  name: z.string().min(1),
  color: z.enum(TYPE_COLORS),
  icon: z.enum(TYPE_ICONS),
  baseKind: z.enum(SCENE_KINDS),
  description: z.string().default(''),
  duration: z.number().positive().optional(),
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
  logicNodes: z.array(logicNodeSchema).default([]),
  comments: z.array(graphCommentSchema).default([]),
  sceneTypes: z.array(sceneTypeSchema).default([]),
  flags: z.array(flagSchema).default([]),
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

export type TransitionDirection = z.infer<typeof transitionDirectionSchema>
export type AudioCue = z.infer<typeof audioCueSchema>
export type LogicNode = z.infer<typeof logicNodeSchema>
export type Flag = z.infer<typeof flagSchema>
export type GraphComment = z.infer<typeof graphCommentSchema>
export type SceneType = z.infer<typeof sceneTypeSchema>
export type Shot = z.infer<typeof shotSchema>
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
