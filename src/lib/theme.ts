import type { SceneKind, TransitionStyle, TriggerKind } from './schema'

export const KIND_META: Record<SceneKind, { label: string; color: string; hint: string }> = {
  reality: { label: 'Reality', color: '#7aa2f7', hint: 'Waking world' },
  dream: { label: 'Dream', color: '#bb9af7', hint: 'Dream layer' },
  nightmare: { label: 'Nightmare', color: '#e0334c', hint: 'Hostile dream layer' },
  memory: { label: 'Memory', color: '#e0af68', hint: 'Flashback / recollection' },
  ending: { label: 'Ending', color: '#9ece6a', hint: 'Terminal scene' },
}

export const TRIGGER_META: Record<TriggerKind, { label: string; color: string }> = {
  jumpscare: { label: 'Jumpscare', color: '#ff4d6a' },
  audio: { label: 'Audio', color: '#7dcfff' },
  visual: { label: 'Visual', color: '#bb9af7' },
  ai: { label: 'AI / Entity', color: '#ff9e64' },
  environment: { label: 'Environment', color: '#e0af68' },
  narrative: { label: 'Narrative', color: '#9ece6a' },
}

export const STYLE_LABEL: Record<TransitionStyle, string> = {
  cut: 'Hard cut',
  fade: 'Fade',
  glitch: 'Glitch',
  blackout: 'Blackout',
  morph: 'Morph / dissolve',
  loopback: 'Loop-back',
}
