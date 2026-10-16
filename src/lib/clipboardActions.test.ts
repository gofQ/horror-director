import { describe, expect, it, vi } from 'vitest'
import { canReadClipboard, canWriteClipboard, fieldState, readClipboard, spliceSelection, writeClipboard } from './clipboardActions'

describe('clipboard outcomes', () => {
  it('reports ok / denied / unsupported explicitly', async () => {
    const written: string[] = []
    const ok = { clipboard: { writeText: async (s: string) => void written.push(s), readText: async () => 'hello' } }
    expect(await writeClipboard('x', ok)).toBe('ok')
    expect(written).toEqual(['x'])
    expect(await readClipboard(ok)).toEqual({ outcome: 'ok', text: 'hello' })

    const denied = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowed')), readText: vi.fn().mockRejectedValue(new Error('NotAllowed')) } }
    expect(await writeClipboard('x', denied)).toBe('denied')
    expect(await readClipboard(denied)).toEqual({ outcome: 'denied' })

    expect(await writeClipboard('x', {})).toBe('unsupported')
    expect(await readClipboard(undefined)).toEqual({ outcome: 'unsupported' })
    expect(canWriteClipboard({})).toBe(false)
    expect(canReadClipboard(ok)).toBe(true)
  })
})

describe('text field helpers', () => {
  it('snapshots the selection and editability', () => {
    expect(fieldState({ value: 'abcdef', selectionStart: 4, selectionEnd: 1 })).toMatchObject({ start: 1, end: 4, selected: 'bcd', hasSelection: true, editable: true })
    expect(fieldState({ value: 'abc', selectionStart: 2, selectionEnd: 2, readOnly: true })).toMatchObject({ hasSelection: false, editable: false })
    expect(fieldState({ value: 'a@b', selectionStart: null, selectionEnd: null })).toMatchObject({ start: 0, end: 3, hasSelection: false })
  })

  it('splices the selection and reports the caret', () => {
    expect(spliceSelection('hello world', 6, 11, 'there')).toEqual({ value: 'hello there', caret: 11 })
    expect(spliceSelection('abc', 1, 1, 'XY')).toEqual({ value: 'aXYbc', caret: 3 })
    expect(spliceSelection('abc', 0, 3, '')).toEqual({ value: '', caret: 0 })
  })
})
