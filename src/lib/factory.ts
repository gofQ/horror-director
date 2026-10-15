import { uid } from './id'
import type { AudioCue, Character, GraphComment, LogicNode, SceneType, Project, Scene, SceneKind, Shot, Transition, Trigger } from './schema'

/** Display names given to newly created items. The UI passes the current language's set. */
export interface DefaultNames {
  project: string
  opening: string
  scene: string
  ending: string
  trigger: string
  shot: string
  audioCue: string
  branch: string
  comment: string
  sceneType: string
  character: string
  state: string
  stateIdle: string
}
export const ENGLISH_NAMES: DefaultNames = {
  project: 'Untitled Nightmare',
  opening: 'Opening',
  scene: 'New Scene',
  ending: 'New Ending',
  trigger: 'New trigger',
  shot: 'New shot',
  audioCue: 'New audio cue',
  branch: 'IF',
  comment: 'Comment',
  sceneType: 'New scene type',
  character: 'New Character',
  state: 'New state',
  stateIdle: 'Idle',
}

export function newScene(
  kind: SceneKind = 'reality',
  position = { x: 0, y: 0 },
  names: DefaultNames = ENGLISH_NAMES,
): Scene {
  return {
    id: uid('scene'),
    title: kind === 'ending' ? names.ending : names.scene,
    kind,
    position,
    description: '',
    unrealLevel: '',
    ambience: '',
    duration: 120,
    loop: { enabled: false, maxIterations: 0, exitCondition: '' },
    triggers: [],
    shots: [],
    audioCues: [],
    characterStates: {},
  }
}

export function newTrigger(time = 0, names: DefaultNames = ENGLISH_NAMES): Trigger {
  return {
    id: uid('trg'),
    name: names.trigger,
    kind: 'audio',
    time,
    intensity: 5,
    description: '',
    condition: '',
    once: true,
  }
}

export const DEFAULT_SHOT_DURATION = 5

export function newShot(start = 0, names: DefaultNames = ENGLISH_NAMES): Shot {
  return {
    id: uid('shot'),
    title: names.shot,
    start,
    duration: DEFAULT_SHOT_DURATION,
    framing: 'medium',
    movement: 'static',
    technique: 'none',
    soundNotes: '',
    visualNotes: '',
  }
}

export const DEFAULT_CUE_DURATION = 5

export function newAudioCue(start = 0, names: DefaultNames = ENGLISH_NAMES): AudioCue {
  return {
    id: uid('cue'),
    title: names.audioCue,
    start,
    duration: DEFAULT_CUE_DURATION,
    type: 'sfx',
    origin: 'non-diegetic',
    direction: 'nonspatial',
    level: 5,
    fadeIn: 0,
    fadeOut: 0,
    loop: false,
    asset: '',
    notes: '',
    prompt: '',
  }
}

export function newLogicNode(position = { x: 0, y: 0 }, names: DefaultNames = ENGLISH_NAMES): LogicNode {
  return { id: uid('if'), type: 'branch', title: names.branch, description: '', condition: '', position }
}

export function newComment(position = { x: 0, y: 0 }, names: DefaultNames = ENGLISH_NAMES): GraphComment {
  return { id: uid('note'), title: names.comment, text: '', color: '#9aa0b4', position, width: 280, height: 160 }
}

export function newSceneType(baseKind: SceneKind = 'reality', names: DefaultNames = ENGLISH_NAMES): SceneType {
  return { id: uid('stype'), name: names.sceneType, color: '#c4263d', icon: 'Skull', baseKind, description: '' }
}

export function newTransition(source: string, target: string): Transition {
  return {
    id: uid('tr'),
    source,
    target,
    label: '',
    style: 'cut',
    condition: '',
    duration: 1,
  }
}

export function newCharacter(names: DefaultNames = ENGLISH_NAMES): Character {
  const stateId = uid('st')
  return {
    id: uid('chr'),
    name: names.character,
    role: 'entity',
    color: '#c4263d',
    description: '',
    states: [{ id: stateId, name: names.stateIdle, behavior: '', aggression: 0 }],
  }
}

export function emptyProject(names: DefaultNames = ENGLISH_NAMES, name = names.project): Project {
  const start = newScene('reality', { x: 80, y: 120 }, names)
  start.title = names.opening
  return {
    name,
    description: '',
    startSceneId: start.id,
    scenes: [start],
    transitions: [],
    logicNodes: [],
    comments: [],
    sceneTypes: [],
    characters: [],
  }
}
