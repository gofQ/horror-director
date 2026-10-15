import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'

beforeEach(() => useStore.getState().loadSample())

describe('store', () => {
  it('deleting a scene removes its transitions and reassigns start', () => {
    const s = useStore.getState()
    s.deleteScene('s_hall')
    const p = useStore.getState().project
    expect(p.scenes.some((x) => x.id === 's_hall')).toBe(false)
    expect(p.transitions.some((t) => t.source === 's_hall' || t.target === 's_hall')).toBe(false)
    expect(p.startSceneId).not.toBe('s_hall')
  })
  it('rejects duplicate transitions and marks self-links as loopback', () => {
    const s = useStore.getState()
    expect(s.addTransition('s_hall', 's_living')).toBeNull()
    const id = s.addTransition('s_hall', 's_hall')!
    expect(useStore.getState().project.transitions.find((t) => t.id === id)?.style).toBe('loopback')
  })
  it('deleting a character state clears scene references', () => {
    useStore.getState().deleteCharacterState('chr_watcher', 'st_hunt')
    const p = useStore.getState().project
    expect(p.scenes.find((s) => s.id === 's_loop')?.characterStates.chr_watcher).toBeUndefined()
  })
  it('adds, edits and deletes triggers', () => {
    const s = useStore.getState()
    const id = s.addTrigger('s_hall', 10.4)
    s.updateTrigger('s_hall', id, { intensity: 9 })
    const t = useStore.getState().project.scenes.find((x) => x.id === 's_hall')!.triggers.find((x) => x.id === id)!
    expect(t.time).toBe(10)
    expect(t.intensity).toBe(9)
    s.deleteTrigger('s_hall', id)
    expect(useStore.getState().project.scenes[0].triggers.some((x) => x.id === id)).toBe(false)
  })
})
