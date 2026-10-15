import { uid } from './id'
import type { Character, Project, Scene, SceneKind, Transition, Trigger } from './schema'

export function newScene(kind: SceneKind = 'reality', position = { x: 0, y: 0 }): Scene {
  return {
    id: uid('scene'),
    title: kind === 'ending' ? 'New Ending' : 'New Scene',
    kind,
    position,
    description: '',
    unrealLevel: '',
    ambience: '',
    duration: 120,
    loop: { enabled: false, maxIterations: 0, exitCondition: '' },
    triggers: [],
    characterStates: {},
  }
}

export function newTrigger(time = 0): Trigger {
  return {
    id: uid('trg'),
    name: 'New trigger',
    kind: 'audio',
    time,
    intensity: 5,
    description: '',
    condition: '',
    once: true,
  }
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

export function newCharacter(): Character {
  const stateId = uid('st')
  return {
    id: uid('chr'),
    name: 'New Character',
    role: 'entity',
    color: '#c4263d',
    description: '',
    states: [{ id: stateId, name: 'Idle', behavior: '', aggression: 0 }],
  }
}

export function emptyProject(name = 'Untitled Nightmare'): Project {
  const start = newScene('reality', { x: 80, y: 120 })
  start.title = 'Opening'
  return {
    name,
    description: '',
    startSceneId: start.id,
    scenes: [start],
    transitions: [],
    characters: [],
  }
}
