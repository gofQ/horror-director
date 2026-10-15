import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '../i18n/store'

/**
 * Reusable, accessible context menu. Opened by components that own the right-click (graph canvas, nodes,
 * connections, Timeline/Sequence items, library rows) — it never hijacks right-click globally, and
 * `isEditableTarget` keeps the native menu on inputs, textareas, selects and editable fields.
 */
export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  /** Short text shown at the end of the row (shortcut, state). */
  hint?: string
  disabled?: boolean
  danger?: boolean
  /** Extra words matched by the search box. */
  keywords?: string
  /** Category label used by the flat, searchable list. */
  group?: string
  separatorBefore?: boolean
  onSelect?: () => void
  /** Submenu: the menu panel switches to these items (Back / ArrowLeft returns). */
  children?: MenuItem[]
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
  ariaLabel: string
  /** Show a search box and a flat, categorized result list (node picker). */
  search?: boolean
  searchPlaceholder?: string
  emptyText?: string
}

export const isEditableTarget = (t: EventTarget | null): boolean =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')

/** Small state holder: `open` replaces any open menu, `close` is safe to call repeatedly. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const open = useCallback((m: MenuState) => setMenu(m), [])
  const close = useCallback(() => setMenu(null), [])
  return { menu, open, close }
}

/** Opens a menu on touch long-press (≈0.55 s without moving); a plain tap or a drag is untouched. */
export function longPressHandlers(onLongPress: (e: { clientX: number; clientY: number; target: EventTarget | null }) => void, ms = 550) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let start = { x: 0, y: 0 }
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || isEditableTarget(e.target)) return
      start = { x: e.clientX, y: e.clientY }
      const target = e.target
      timer = setTimeout(() => {
        timer = null
        onLongPress({ clientX: start.x, clientY: start.y, target })
      }, ms)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  }
}

type Flat = { item: MenuItem; path: string[] }
const flatten = (items: MenuItem[], path: string[] = []): Flat[] =>
  items.flatMap((item) => (item.children ? flatten(item.children, [...path, item.label]) : [{ item, path }]))

export function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const { t } = useT()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<Element | null>(null)
  const [pos, setPos] = useState({ left: state.x, top: state.y })
  const [stack, setStack] = useState<MenuItem[]>([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const level = stack.length ? stack[stack.length - 1].children! : state.items
  const q = query.trim().toLowerCase()
  const rows: { item: MenuItem; path: string[] }[] = useMemo(() => {
    if (state.search && q)
      return flatten(state.items).filter(({ item, path }) => `${item.label} ${item.keywords ?? ''} ${path.join(' ')}`.toLowerCase().includes(q))
    if (state.search && !stack.length) return flatten(state.items)
    return level.map((item) => ({ item, path: [] as string[] }))
  }, [state.items, state.search, q, level, stack.length])

  // Close on outside pointer, scroll, wheel, resize and window blur; restore focus on unmount.
  useEffect(() => {
    returnFocus.current = document.activeElement
    const outside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    const away = (e?: Event) => {
      if (e?.target instanceof Node && rootRef.current?.contains(e.target)) return // scrolling the menu itself
      onClose()
    }
    document.addEventListener('pointerdown', outside, true)
    const bare = () => away()
    window.addEventListener('resize', bare)
    window.addEventListener('blur', bare)
    window.addEventListener('wheel', away, { passive: true })
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', bare)
      window.removeEventListener('blur', bare)
      window.removeEventListener('wheel', away)
      window.removeEventListener('scroll', away, true)
      const el = returnFocus.current
      if (el instanceof HTMLElement && document.contains(el)) el.focus({ preventScroll: true })
    }
  }, [onClose])

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const m = 8
    setPos({
      left: Math.max(m, Math.min(state.x, window.innerWidth - r.width - m)),
      top: Math.max(m, Math.min(state.y, window.innerHeight - r.height - m)),
    })
  }, [state.x, state.y, rows.length, stack.length])

  // Focus the search box (picker) or the first enabled item.
  useEffect(() => {
    if (state.search) searchRef.current?.focus()
    else rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
  }, [state.search, stack.length])
  useEffect(() => setActive(0), [q, stack.length])

  const enabled = rows.map((r, i) => (r.item.disabled ? -1 : i)).filter((i) => i >= 0)
  const focusRow = (i: number) => {
    setActive(i)
    rootRef.current?.querySelector<HTMLElement>(`[data-row="${i}"]`)?.focus()
    if (state.search) rootRef.current?.querySelector<HTMLElement>(`[data-row="${i}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }
  const choose = (item: MenuItem) => {
    if (item.disabled) return
    if (item.children) {
      setStack((s) => [...s, item])
      setQuery('')
      return
    }
    onClose()
    item.onSelect?.()
  }
  const move = (delta: number) => {
    if (!enabled.length) return
    const at = enabled.indexOf(active)
    const next = enabled[(at + delta + enabled.length) % enabled.length] ?? enabled[0]
    focusRow(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const inSearch = e.target === searchRef.current
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose()
        break
      case 'ArrowDown':
        e.preventDefault()
        if (inSearch && enabled.length) focusRow(enabled[0])
        else move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Home':
        if (!inSearch) {
          e.preventDefault()
          if (enabled.length) focusRow(enabled[0])
        }
        break
      case 'End':
        if (!inSearch) {
          e.preventDefault()
          if (enabled.length) focusRow(enabled[enabled.length - 1])
        }
        break
      case 'ArrowRight': {
        const row = rows[active]
        if (!inSearch && row?.item.children) {
          e.preventDefault()
          choose(row.item)
        }
        break
      }
      case 'ArrowLeft':
      case 'Backspace':
        if (!inSearch && stack.length) {
          e.preventDefault()
          setStack((s) => s.slice(0, -1))
        }
        break
      case 'Enter':
        if (inSearch && enabled.length) {
          e.preventDefault()
          choose(rows[enabled[0]].item)
        }
        break
      case 'Tab':
        e.preventDefault()
        move(e.shiftKey ? -1 : 1)
        break
    }
  }

  let lastGroup: string | undefined
  return createPortal(
    <div
      ref={rootRef}
      className="ctx-menu"
      data-testid="context-menu"
      role="menu"
      aria-label={state.ariaLabel}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stack.length > 0 && (
        <button type="button" className="ctx-back" data-testid="ctx-back" onClick={() => setStack((s) => s.slice(0, -1))}>
          <ChevronLeft size={14} /> {stack[stack.length - 1].label}
        </button>
      )}
      {state.search && (
        <input
          ref={searchRef}
          className="input ctx-search"
          data-testid="ctx-search"
          type="search"
          role="searchbox"
          aria-label={state.searchPlaceholder ?? t('ctx.search')}
          placeholder={state.searchPlaceholder ?? t('ctx.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="ctx-list">
        {rows.length === 0 && <div className="ctx-empty muted">{state.emptyText ?? t('ctx.noResults')}</div>}
        {rows.map(({ item, path }, i) => {
          const group = state.search ? (path[0] ?? item.group) : undefined
          const header = group && group !== lastGroup ? group : null
          lastGroup = group
          return (
            <div key={item.id} role="none">
              {header && <div className="ctx-group" role="presentation">{header}</div>}
              {!state.search && item.separatorBefore && i > 0 && <div className="ctx-sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                data-row={i}
                data-testid="ctx-item"
                data-id={item.id}
                tabIndex={i === active ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                aria-haspopup={item.children ? 'menu' : undefined}
                className={`ctx-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
                onMouseMove={() => !item.disabled && i !== active && setActive(i)}
                onClick={() => choose(item)}
              >
                <span className="ctx-icon" aria-hidden="true">{item.icon}</span>
                <span className="ctx-label">{item.label}</span>
                {item.hint && <span className="ctx-hint muted">{item.hint}</span>}
                {item.children && <ChevronRight size={14} aria-hidden="true" />}
              </button>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
