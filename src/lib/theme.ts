import type { SceneKind, TriggerKind } from './schema'

/** Colors only. Display labels are localized via the i18n dictionary (`kind.*`, `trigger.*`, `style.*`). */
export const KIND_COLOR: Record<SceneKind, string> = {
  reality: '#7aa2f7',
  dream: '#bb9af7',
  nightmare: '#e0334c',
  memory: '#e0af68',
  ending: '#9ece6a',
}

export const TRIGGER_COLOR: Record<TriggerKind, string> = {
  jumpscare: '#ff4d6a',
  audio: '#7dcfff',
  visual: '#bb9af7',
  ai: '#ff9e64',
  environment: '#e0af68',
  narrative: '#9ece6a',
}
