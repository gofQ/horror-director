import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Redo2, Trash2, Undo2, X, ArrowUpDown, TriangleAlert } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { SHOT_FRAMINGS, SHOT_MOVEMENTS, SHOT_TECHNIQUES } from '../lib/schema'
import { analyzeShots, shotReferences } from '../lib/shots'
import { formatClock } from '../lib/simulate'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'

/**
 * Shot planner for one scene: an ordered list of cinematic planning notes. Timing warnings are
 * informational — authored timing is never modified automatically.
 */
export function ShotPlannerDialog({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const { t, formatNumber } = useT()
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId))
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { addShot, updateShot, deleteShot, duplicateShot, moveShot, sortShotsByTime, undo, redo } = useStore.getState()
  const transitions = useStore((s) => s.project.transitions)
  const scenes = useStore((s) => s.project.scenes)
  const ref = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])
  useEffect(() => {
    if (!focusId) return
    ref.current?.querySelector<HTMLElement>(`[data-shot-title="${focusId}"] input`)?.focus()
    setFocusId(null)
  }, [focusId])

  if (!scene) return null
  const a = analyzeShots(scene)
  const shots = scene.shots
  const transitionName = (id: string) => {
    const tr = transitions.find((x) => x.id === id)
    const title = (sid?: string) => scenes.find((x) => x.id === sid)?.title || t('scene.untitled')
    return tr ? `${title(tr.source)} → ${title(tr.target)}${tr.label ? ` (${tr.label})` : ''}` : id
  }
  const numberOf = (id: string) => shots.findIndex((s) => s.id === id) + 1
  const num = (n: number) => formatNumber(Math.round(n * 100) / 100)
  const aria = (action: string, title: string) => t('shot.actionAria', { action, title })

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal shot-planner" data-testid="shot-planner" role="dialog" aria-modal="true" aria-labelledby="shot-title">
        <div className="insp-head">
          <h3 id="shot-title">{t('shot.title', { scene: scene.title || t('scene.untitled') })}</h3>
          <div className="shot-head-actions">
            <button className="btn icon" data-testid="shot-undo" onClick={undo} disabled={!canUndo} title={t('tip.undo')} aria-label={t('btn.undo')}>
              <Undo2 size={15} />
            </button>
            <button className="btn icon" data-testid="shot-redo" onClick={redo} disabled={!canRedo} title={t('tip.redo')} aria-label={t('btn.redo')}>
              <Redo2 size={15} />
            </button>
            <button className="btn icon" data-testid="shot-close" data-autofocus onClick={onClose} aria-label={t('btn.close')}>
              <X size={15} />
            </button>
          </div>
        </div>
        <p className="muted">{t('shot.intro')}</p>
        <p className="muted">{t('shot.sceneDuration', { duration: formatClock(scene.duration) })}</p>

        <div className="shot-toolbar">
          <button className="btn primary" data-testid="shot-add" onClick={() => setFocusId(addShot(sceneId))}>
            <Plus size={14} /> {t('shot.add')}
          </button>
          <button className="btn" data-testid="shot-sort" onClick={() => sortShotsByTime(sceneId)} disabled={a.outOfOrder === 0} title={t('shot.sortTip')}>
            <ArrowUpDown size={14} /> {t('shot.sort')}
          </button>
        </div>

        {(a.overlapPairs > 0 || a.exceeding > 0 || a.outOfOrder > 0) && (
          <div className="issue warning" role="status" data-testid="shot-warnings">
            <TriangleAlert size={14} className="inline-icon" /> <strong>{t('shot.warn.title')}</strong>
            <ul>
              {a.overlapPairs > 0 && <li>{t('shot.warn.summary.overlap', { n: a.overlapPairs })}</li>}
              {a.exceeding > 0 && <li>{t('shot.warn.summary.exceeds', { n: a.exceeding })}</li>}
              {a.outOfOrder > 0 && <li>{t('shot.warn.summary.order', { n: a.outOfOrder })}</li>}
            </ul>
          </div>
        )}

        {shots.length === 0 ? (
          <p className="muted" data-testid="shot-empty">{t('shot.empty')}</p>
        ) : (
          <ol className="shot-list" aria-label={t('shot.listAria')}>
            {shots.map((s, i) => {
              const info = a.byId[s.id]
              const p = (v: number) => Math.min(100, Math.max(0, (v / scene.duration) * 100))
              const label = t('shot.n', { n: i + 1 })
              const over = info.exceeds ? info.end - scene.duration : 0
              const refs = shotReferences({ transitions }, sceneId, s.id)
              return (
                <li key={s.id} className={`shot-card${info.overlaps.length || info.exceeds || info.outOfOrder ? ' warn' : ''}`} data-testid="shot" data-shot-id={s.id}>
                  <div className="shot-card-head">
                    <strong>{label}</strong>
                    <span className="shot-timing muted" data-testid="shot-timing">
                      {t('shot.timing', { start: formatClock(s.start), end: formatClock(info.end), total: formatClock(scene.duration) })}
                    </span>
                    <span className="shot-actions">
                      <button className="btn icon small" data-testid="shot-up" disabled={i === 0} onClick={() => moveShot(sceneId, s.id, -1)} title={t('shot.moveUp')} aria-label={aria(t('shot.moveUp'), s.title || label)}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="btn icon small" data-testid="shot-down" disabled={i === shots.length - 1} onClick={() => moveShot(sceneId, s.id, 1)} title={t('shot.moveDown')} aria-label={aria(t('shot.moveDown'), s.title || label)}>
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="btn icon small"
                        data-testid="shot-duplicate"
                        onClick={() => {
                          const id = duplicateShot(sceneId, s.id, `${s.title} ${t('shot.copySuffix')}`.trim())
                          if (id) setFocusId(id)
                        }}
                        title={t('shot.duplicate')}
                        aria-label={aria(t('shot.duplicate'), s.title || label)}
                      >
                        <Copy size={14} />
                      </button>
                      <button className="btn icon small danger" data-testid="shot-delete" onClick={() => (refs.length > 0 ? setConfirmId(s.id) : deleteShot(sceneId, s.id))} title={t('shot.delete')} aria-label={aria(t('shot.delete'), s.title || label)}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>

                  <div className="shot-bar" role="img" aria-label={t('shot.barAria')}>
                    <i style={{ left: `${p(s.start)}%`, width: `${Math.max(0.8, p(info.end) - p(s.start))}%` }} className={info.exceeds ? 'over' : ''} />
                  </div>

                  {refs.length > 0 && (
                    <div className="shot-chips">
                      <span className="badge" data-testid="shot-refs-chip">{t('shot.refs.chip', { n: new Set(refs.map((r) => r.transitionId)).size })}</span>
                    </div>
                  )}
                  {confirmId === s.id && refs.length > 0 && (
                    <div className="shot-refs" role="alertdialog" aria-label={t('shot.refs.title', { shot: s.title || label })} data-testid="shot-refs-confirm">
                      <strong>{t('shot.refs.title', { shot: s.title || label })}</strong>
                      <ul>
                        {refs.map((r, k) => (
                          <li key={k}>{t('shot.refs.item', { name: transitionName(r.transitionId), role: t(`shot.refs.role.${r.role}`) })}</li>
                        ))}
                      </ul>
                      <p className="muted">{t('shot.refs.body')}</p>
                      <div className="modal-actions">
                        <button className="btn" data-testid="shot-refs-cancel" onClick={() => setConfirmId(null)}>
                          {t('btn.cancel')}
                        </button>
                        <button
                          className="btn danger"
                          data-testid="shot-refs-delete"
                          onClick={() => {
                            deleteShot(sceneId, s.id, { clearReferences: true })
                            setConfirmId(null)
                          }}
                        >
                          {t('shot.refs.confirm')}
                        </button>
                      </div>
                    </div>
                  )}

                  {(info.overlaps.length > 0 || info.exceeds || info.outOfOrder) && (
                    <div className="shot-chips" data-testid="shot-chips">
                      {info.overlaps.length > 0 && (
                        <span className="badge pacing-dep" data-warn="overlap">
                          {t('shot.warn.overlap', { list: info.overlaps.map(numberOf).sort((x, y) => x - y).join(', ') })}
                        </span>
                      )}
                      {info.exceeds && (
                        <span className="badge pacing-dep" data-warn="exceeds">
                          {t('shot.warn.exceeds', { n: num(over) })}
                        </span>
                      )}
                      {info.outOfOrder && (
                        <span className="badge pacing-dep" data-warn="order">
                          {t('shot.warn.order')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="shot-fields">
                    <div className="shot-title-field" data-shot-title={s.id}>
                      <Field label={t('shot.field.title')}>
                        <TextInput value={s.title} onChange={(title) => updateShot(sceneId, s.id, { title })} />
                      </Field>
                    </div>
                    <Field label={t('shot.field.start')}>
                      <NumberInput value={s.start} min={0} step={0.5} onChange={(start) => updateShot(sceneId, s.id, { start: Math.max(0, start) })} />
                    </Field>
                    <Field label={t('shot.field.duration')}>
                      <NumberInput value={s.duration} min={0.1} step={0.5} onChange={(duration) => duration > 0 && updateShot(sceneId, s.id, { duration })} />
                    </Field>
                    <Field label={t('shot.field.framing')}>
                      <Select value={s.framing} options={SHOT_FRAMINGS.map((v) => ({ value: v, label: t(`framing.${v}`) }))} onChange={(framing) => updateShot(sceneId, s.id, { framing })} />
                    </Field>
                    <Field label={t('shot.field.movement')}>
                      <Select value={s.movement} options={SHOT_MOVEMENTS.map((v) => ({ value: v, label: t(`movement.${v}`) }))} onChange={(movement) => updateShot(sceneId, s.id, { movement })} />
                    </Field>
                    <Field label={t('shot.field.technique')}>
                      <Select value={s.technique} options={SHOT_TECHNIQUES.map((v) => ({ value: v, label: t(`technique.${v}`) }))} onChange={(technique) => updateShot(sceneId, s.id, { technique })} />
                    </Field>
                    <div className="shot-notes">
                      <Field label={t('shot.field.sound')}>
                        <TextArea value={s.soundNotes} rows={2} onChange={(soundNotes) => updateShot(sceneId, s.id, { soundNotes })} />
                      </Field>
                      <Field label={t('shot.field.visual')}>
                        <TextArea value={s.visualNotes} rows={2} onChange={(visualNotes) => updateShot(sceneId, s.id, { visualNotes })} />
                      </Field>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
