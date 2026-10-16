import { useEffect, useRef } from 'react'
import { ContextMenu, isEditableTarget, useContextMenu, type MenuItem } from './ContextMenu'
import { useStore, type View } from '../store/useStore'
import { useLang, useT } from '../i18n/store'
import { LANGS, type Lang } from '../i18n'
import {
  canReadClipboard,
  deleteFromField,
  execCopy,
  fieldState,
  insertIntoField,
  isTextField,
  readClipboard,
  selectAllInField,
  writeClipboard,
  type FieldState,
} from '../lib/clipboardActions'

const VIEWS: readonly View[] = ['graph', 'timeline', 'characters', 'analysis', 'simulator', 'production']
const LANG_NAMES: Record<Lang, string> = { tr: 'Türkçe', en: 'English' }
const LONG_PRESS_MS = 550
let lastNativeMenuAt = 0

interface Props {
  onBackup: () => void
  onProjects: () => void
  /** Short user feedback (toast). */
  notify: (text: string, error?: boolean) => void
}

/**
 * The single fallback for right-click, the Menu key / Shift+F10 and touch long-press. Specialised menus (graph, timeline,
 * sequence, library) call `preventDefault()` first and are left alone; everything else inside the app gets a themed menu so
 * the browser's native one never appears. Only targets inside the app (#root, dialogs, the menu itself) are handled.
 */
export function GlobalContextMenu({ onBackup, onProjects, notify }: Props) {
  const { t } = useT()
  const { menu, open, close } = useContextMenu()
  const setView = useStore((s) => s.setView)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const setLang = useLang((s) => s.setLang)
  const lang = useLang((s) => s.lang)

  const build = (target: Element | null, x: number, y: number) => {
    if (isTextField(target)) {
      const st = fieldState(target)
      open({ x, y, items: textItems(target, st), ariaLabel: t('gctx.menu.text') })
    } else open({ x, y, items: appItems(), ariaLabel: t('gctx.menu.app') })
  }

  const fail = (r: 'denied' | 'unsupported') => notify(r === 'denied' ? t('clip.denied') : t('clip.unsupported'), true)

  const textItems = (el: HTMLInputElement | HTMLTextAreaElement, st: FieldState): MenuItem[] => {
    const restore = () => {
      el.focus()
      try {
        el.setSelectionRange(st.start, st.end)
      } catch {
        /* no selection API */
      }
    }
    const copy = async (): Promise<boolean> => {
      const text = st.hasSelection ? st.selected : ''
      if (!text) return false
      const r = await writeClipboard(text)
      if (r === 'ok') return true
      restore()
      if (execCopy()) return true
      fail(r)
      return false
    }
    const canPaste = canReadClipboard() && st.editable
    return [
      { id: 'cut', label: t('gctx.cut'), hint: 'Ctrl/Cmd+X', disabled: !st.editable || !st.hasSelection, onSelect: async () => { if (await copy()) deleteFromField(el, st.start, st.end) } },
      { id: 'copy', label: t('gctx.copy'), hint: 'Ctrl/Cmd+C', disabled: !st.hasSelection, onSelect: async () => { await copy(); restore() } },
      {
        id: 'paste',
        label: canReadClipboard() ? t('gctx.paste') : t('gctx.pasteManual'),
        hint: canReadClipboard() ? 'Ctrl/Cmd+V' : undefined,
        disabled: !canPaste,
        onSelect: async () => {
          const r = await readClipboard()
          if (r.outcome !== 'ok') return fail(r.outcome)
          if (!r.text) return notify(t('clip.empty'), true)
          insertIntoField(el, st.start, st.end, r.text)
        },
      },
      { id: 'selectAll', label: t('gctx.selectAll'), hint: 'Ctrl/Cmd+A', separatorBefore: true, onSelect: () => selectAllInField(el) },
    ]
  }

  const appItems = (): MenuItem[] => {
    const selected = window.getSelection()?.toString() ?? ''
    const s = useStore.getState()
    return [
      {
        id: 'copyText',
        label: t('gctx.copyText'),
        hint: 'Ctrl/Cmd+C',
        disabled: !selected,
        onSelect: async () => {
          const r = await writeClipboard(selected)
          if (r !== 'ok' && !execCopy()) fail(r)
        },
      },
      { id: 'undo', label: t('gctx.undo'), hint: 'Ctrl/Cmd+Z', disabled: s.past.length === 0, separatorBefore: true, onSelect: undo },
      { id: 'redo', label: t('gctx.redo'), hint: 'Ctrl/Cmd+Y', disabled: s.future.length === 0, onSelect: redo },
      { id: 'goto', label: t('gctx.goto'), separatorBefore: true, children: VIEWS.map((v) => ({ id: `go-${v}`, label: t(`tab.${v}`), disabled: s.view === v, onSelect: () => setView(v) })) },
      { id: 'backup', label: t('gctx.backup'), hint: 'Ctrl/Cmd+S', onSelect: onBackup },
      { id: 'projects', label: t('gctx.projects'), onSelect: onProjects },
      { id: 'language', label: t('gctx.language'), separatorBefore: true, children: LANGS.map((l) => ({ id: `lang-${l}`, label: LANG_NAMES[l], disabled: l === lang, onSelect: () => setLang(l) })) },
    ]
  }

  // Document listeners are registered once and always call the latest closure.
  const latest = useRef(build)
  latest.current = build

  useEffect(() => {
    const owns = (el: Element | null): el is Element =>
      !!el && (el === document.body || el === document.documentElement || !!el.closest('#root, .ctx-menu, .modal-backdrop'))

    const onContextMenu = (e: MouseEvent) => {
      lastNativeMenuAt = Date.now()
      if (e.defaultPrevented) return // a specialised menu already took it
      const el = e.target instanceof Element ? e.target : null
      if (!owns(el)) return
      e.preventDefault()
      if (el!.closest('.ctx-menu')) return
      latest.current(el, e.clientX, e.clientY)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return
      const el = e.target instanceof Element ? e.target : null
      if (!owns(el) || el!.closest('.ctx-menu') || document.querySelector('.ctx-menu')) return
      e.preventDefault()
      const box = (el === document.body ? document.documentElement : el!).getBoundingClientRect()
      latest.current(el, Math.max(8, box.left + Math.min(box.width / 2, 40)), Math.max(8, box.top + Math.min(box.height, 40)))
    }

    // Touch long-press: mobile browsers without a native contextmenu event (iOS) still get the menu.
    let timer: ReturnType<typeof setTimeout> | null = null
    let start = { x: 0, y: 0 }
    const cancel = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const onDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (e.pointerType !== 'touch' || !owns(el) || isEditableTarget(el) || el!.closest('.ctx-menu, .graph-wrap')) return
      start = { x: e.clientX, y: e.clientY }
      const startedAt = Date.now()
      timer = setTimeout(() => {
        timer = null
        if (lastNativeMenuAt >= startedAt) return // the browser (or a specialised menu) already handled this press
        latest.current(el, start.x, start.y)
      }, LONG_PRESS_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel()
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', cancel)
    document.addEventListener('pointercancel', cancel)
    return () => {
      cancel()
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', cancel)
      document.removeEventListener('pointercancel', cancel)
    }
  }, [])

  return menu ? <ContextMenu state={menu} onClose={close} /> : null
}
