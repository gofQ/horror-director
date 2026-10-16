/**
 * Clipboard and text-field actions behind the app-owned context menu. The browser clipboard is permission
 * gated, so every operation reports an explicit outcome; callers show that to the user (never a silent no-op).
 */
export type ClipOutcome = 'ok' | 'unsupported' | 'denied'

export interface ClipboardLike {
  writeText?: (s: string) => Promise<void>
  readText?: () => Promise<string>
}

const clip = (nav: { clipboard?: ClipboardLike } | undefined): ClipboardLike | undefined => nav?.clipboard

export const canWriteClipboard = (nav: { clipboard?: ClipboardLike } | undefined = globalThis.navigator): boolean => typeof clip(nav)?.writeText === 'function'
export const canReadClipboard = (nav: { clipboard?: ClipboardLike } | undefined = globalThis.navigator): boolean => typeof clip(nav)?.readText === 'function'

export async function writeClipboard(text: string, nav: { clipboard?: ClipboardLike } | undefined = globalThis.navigator): Promise<ClipOutcome> {
  const c = clip(nav)
  if (!c?.writeText) return 'unsupported'
  try {
    await c.writeText(text)
    return 'ok'
  } catch {
    return 'denied'
  }
}

export async function readClipboard(nav: { clipboard?: ClipboardLike } | undefined = globalThis.navigator): Promise<{ outcome: 'ok'; text: string } | { outcome: 'unsupported' | 'denied' }> {
  const c = clip(nav)
  if (!c?.readText) return { outcome: 'unsupported' }
  try {
    return { outcome: 'ok', text: await c.readText() }
  } catch {
    return { outcome: 'denied' }
  }
}

/** The part of an input / textarea these helpers need (kept structural so it is testable without a DOM). */
export interface TextFieldLike {
  value: string
  selectionStart: number | null
  selectionEnd: number | null
  readOnly?: boolean
  disabled?: boolean
}

export interface FieldState {
  start: number
  end: number
  selected: string
  hasSelection: boolean
  editable: boolean
}

/** Selection snapshot; fields without a selection API (number, email) report their whole value as selectable text. */
export function fieldState(f: TextFieldLike): FieldState {
  const hasApi = f.selectionStart !== null && f.selectionEnd !== null
  const start = hasApi ? Math.min(f.selectionStart!, f.selectionEnd!) : 0
  const end = hasApi ? Math.max(f.selectionStart!, f.selectionEnd!) : f.value.length
  return {
    start,
    end,
    selected: hasApi ? f.value.slice(start, end) : '',
    hasSelection: hasApi && end > start,
    editable: !f.readOnly && !f.disabled,
  }
}

/** Pure result of replacing the selection (used when the browser's own insertText command is unavailable). */
export function spliceSelection(value: string, start: number, end: number, insert: string): { value: string; caret: number } {
  return { value: value.slice(0, start) + insert + value.slice(end), caret: start + insert.length }
}

/** Is this element a text field these helpers can drive? */
export function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset', 'image', 'hidden'].includes(el.type)
  return false
}

/** Replace the selection like a user would (keeps the browser's native undo stack when `insertText` works). */
export function insertIntoField(el: HTMLInputElement | HTMLTextAreaElement, start: number, end: number, text: string): void {
  el.focus()
  try {
    el.setSelectionRange(start, end)
  } catch {
    /* number / email inputs have no selection API */
  }
  if (typeof document !== 'undefined' && document.execCommand?.('insertText', false, text)) return
  const hasApi = el.selectionStart !== null
  const r = spliceSelection(el.value, hasApi ? start : 0, hasApi ? end : el.value.length, text)
  el.value = r.value
  try {
    el.setSelectionRange(r.caret, r.caret)
  } catch {
    /* ignore */
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function selectAllInField(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.focus()
  el.select()
}

/** Delete the selected range (the second half of Cut) keeping the browser's native undo stack when possible. */
export function deleteFromField(el: HTMLInputElement | HTMLTextAreaElement, start: number, end: number): void {
  el.focus()
  try {
    el.setSelectionRange(start, end)
  } catch {
    /* no selection API */
  }
  if (typeof document !== 'undefined' && document.execCommand?.('delete')) return
  const r = spliceSelection(el.value, start, end, '')
  el.value = r.value
  try {
    el.setSelectionRange(r.caret, r.caret)
  } catch {
    /* ignore */
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Legacy copy path for browsers or contexts without the async Clipboard API (must run inside a user gesture). */
export function execCopy(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.execCommand?.('copy')
  } catch {
    return false
  }
}
