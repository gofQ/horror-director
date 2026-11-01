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

describe('fallback edits reach React-controlled fields (audit fix)', () => {
  // Mimics React: the instance carries its own `value` property (React's tracker), the real DOM setter lives on the prototype.
  class FakeField {
    protoWrites: string[] = []
    trackerWrites: string[] = []
    events: string[] = []
    selectionStart: number | null = 0
    v = 'hello world'
    focus() {}
    setSelectionRange() {}
    dispatchEvent(e: Event) {
      this.events.push(e.type)
      return true
    }
  }
  Object.defineProperty(FakeField.prototype, 'value', {
    get(this: FakeField) {
      return this.v
    },
    set(this: FakeField, x: string) {
      this.protoWrites.push(x)
      this.v = x
    },
    configurable: true,
  })
  const make = () => {
    const f = new FakeField()
    Object.defineProperty(f, 'value', {
      get: () => Object.getOwnPropertyDescriptor(FakeField.prototype, 'value')!.get!.call(f),
      set: (x: string) => {
        f.trackerWrites.push(x)
        Object.getOwnPropertyDescriptor(FakeField.prototype, 'value')!.set!.call(f, x)
      },
      configurable: true,
    })
    return f as unknown as HTMLInputElement & FakeField
  }

  it('insertIntoField and deleteFromField write through the prototype setter, then fire input', async () => {
    const { insertIntoField, deleteFromField, setNativeValue } = await import('./clipboardActions')
    const a = make()
    insertIntoField(a, 0, 5, 'HELLO')
    expect(a.protoWrites).toEqual(['HELLO world'])
    expect(a.trackerWrites).toEqual([]) // React's tracker is not bypassed-updated, so onChange will fire
    expect(a.events).toEqual(['input'])
    const b = make()
    deleteFromField(b, 5, 11)
    expect(b.protoWrites).toEqual(['hello'])
    expect(b.trackerWrites).toEqual([])
    const c = make()
    setNativeValue(c, 'x')
    expect(c.protoWrites).toEqual(['x'])
  })
})
