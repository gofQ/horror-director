import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Redo2, Trash2, Undo2, X, TriangleAlert } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { AUDIO_CUE_TYPES, AUDIO_DIRECTIONS, AUDIO_ORIGINS } from '../lib/schema'
import { analyzeAudioCues, assignLanes } from '../lib/audio'
import { formatClock } from '../lib/simulate'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'

/**
 * Audio planner for one scene: ordered audio cue planning notes with a layered timeline. Overlaps are
 * normal layers, silence is an authored intention (it mutes nothing), and authored timing is never
 * modified automatically.
 */
export function AudioPlannerDialog({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const { t, formatNumber } = useT()
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId))
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { addAudioCue, updateAudioCue, deleteAudioCue, duplicateAudioCue, moveAudioCue, undo, redo } = useStore.getState()
  const ref = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

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
    const card = ref.current?.querySelector<HTMLElement>(`li[data-cue-id="${focusId}"]`)
    card?.scrollIntoView?.({ block: 'nearest' })
    card?.querySelector<HTMLElement>('[data-cue-title] input')?.focus()
    setFocusId(null)
  }, [focusId])

  if (!scene) return null
  const cues = scene.audioCues
  const a = analyzeAudioCues(scene)
  const { lanes, count } = assignLanes(cues)
  const num = (n: number) => formatNumber(Math.round(n * 100) / 100)
  const aria = (action: string, title: string) => t('audio.actionAria', { action, title })
  // The axis covers the scene, extended when a cue runs past its end so overruns stay visible.
  const span = Math.max(scene.duration, ...cues.map((c) => c.start + c.duration))
  const pct = (v: number) => (v / span) * 100
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * span)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal shot-planner audio-planner" data-testid="audio-planner" role="dialog" aria-modal="true" aria-labelledby="audio-title">
        <div className="insp-head">
          <h3 id="audio-title">{t('audio.title', { scene: scene.title || t('scene.untitled') })}</h3>
          <div className="shot-head-actions">
            <button className="btn icon" data-testid="audio-undo" onClick={undo} disabled={!canUndo} title={t('tip.undo')} aria-label={t('btn.undo')}>
              <Undo2 size={15} />
            </button>
            <button className="btn icon" data-testid="audio-redo" onClick={redo} disabled={!canRedo} title={t('tip.redo')} aria-label={t('btn.redo')}>
              <Redo2 size={15} />
            </button>
            <button className="btn icon" data-testid="audio-close" data-autofocus onClick={onClose} aria-label={t('btn.close')}>
              <X size={15} />
            </button>
          </div>
        </div>
        <p className="muted">{t('audio.intro')}</p>
        <p className="muted">{t('audio.example')}</p>
        <p className="muted">{t('audio.sceneDuration', { duration: formatClock(scene.duration) })}</p>

        <div className="shot-toolbar">
          <button className="btn primary" data-testid="audio-add" onClick={() => setFocusId(addAudioCue(sceneId))}>
            <Plus size={14} /> {t('audio.add')}
          </button>
        </div>

        {(a.exceeding > 0 || a.fadeTooLong > 0) && (
          <div className="issue warning" role="status" data-testid="audio-warnings">
            <TriangleAlert size={14} className="inline-icon" /> <strong>{t('audio.warn.title')}</strong>
            <ul>
              {a.exceeding > 0 && <li>{t('audio.warn.summary.exceeds', { n: a.exceeding })}</li>}
              {a.fadeTooLong > 0 && <li>{t('audio.warn.summary.fade', { n: a.fadeTooLong })}</li>}
            </ul>
          </div>
        )}

        {cues.length === 0 ? (
          <p className="muted" data-testid="audio-empty">{t('audio.empty')}</p>
        ) : (
          <>
            <div className="audio-timeline-scroll">
              <div className="audio-timeline" data-testid="audio-timeline" role="group" aria-label={t('audio.timeline.aria')}>
                <div className="audio-axis" aria-hidden="true">
                  {ticks.map((tk, i) => (
                    <span key={i} style={{ left: `${pct(tk)}%` }}>{formatClock(tk)}</span>
                  ))}
                </div>
                <div className="audio-lanes" style={{ height: count * 30 }}>
                  <i className="audio-scene-end" style={{ left: `${pct(scene.duration)}%` }} aria-hidden="true" />
                  {cues.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`audio-bar type-${c.type}${a.byId[c.id].exceeds ? ' over' : ''}`}
                      data-testid="audio-bar"
                      data-cue-id={c.id}
                      data-lane={lanes[c.id]}
                      title={c.title}
                      style={{ left: `${pct(c.start)}%`, width: `${Math.max(0.8, pct(c.duration))}%`, top: lanes[c.id] * 30 }}
                      aria-label={t('audio.timeline.cueAria', {
                        n: i + 1,
                        title: c.title || t('audio.n', { n: i + 1 }),
                        type: t(`audioType.${c.type}`),
                        start: formatClock(c.start),
                        end: formatClock(c.start + c.duration),
                      })}
                      onClick={() => setFocusId(c.id)}
                    >
                      <span>{i + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <ol className="shot-list" aria-label={t('audio.listAria')}>
              {cues.map((c, i) => {
                const info = a.byId[c.id]
                const label = t('audio.n', { n: i + 1 })
                const over = info.exceeds ? info.end - scene.duration : 0
                const upd = (patch: Parameters<typeof updateAudioCue>[2]) => updateAudioCue(sceneId, c.id, patch)
                return (
                  <li key={c.id} className={`shot-card audio-card type-${c.type}${info.exceeds || info.fadeTooLong ? ' warn' : ''}`} data-testid="audio-cue" data-cue-id={c.id}>
                    <div className="shot-card-head">
                      <strong>{label}</strong>
                      <span className={`badge audio-type type-${c.type}`} data-testid="audio-type-badge">{t(`audioType.${c.type}`)}</span>
                      <span className="shot-timing muted" data-testid="audio-timing">
                        {t('audio.timing', { start: formatClock(c.start), end: formatClock(info.end), total: formatClock(scene.duration) })}
                      </span>
                      <span className="shot-actions">
                        <button className="btn icon small" data-testid="audio-up" disabled={i === 0} onClick={() => moveAudioCue(sceneId, c.id, -1)} title={t('audio.moveUp')} aria-label={aria(t('audio.moveUp'), c.title || label)}>
                          <ArrowUp size={14} />
                        </button>
                        <button className="btn icon small" data-testid="audio-down" disabled={i === cues.length - 1} onClick={() => moveAudioCue(sceneId, c.id, 1)} title={t('audio.moveDown')} aria-label={aria(t('audio.moveDown'), c.title || label)}>
                          <ArrowDown size={14} />
                        </button>
                        <button
                          className="btn icon small"
                          data-testid="audio-duplicate"
                          onClick={() => {
                            const id = duplicateAudioCue(sceneId, c.id, `${c.title} ${t('audio.copySuffix')}`.trim())
                            if (id) setFocusId(id)
                          }}
                          title={t('audio.duplicate')}
                          aria-label={aria(t('audio.duplicate'), c.title || label)}
                        >
                          <Copy size={14} />
                        </button>
                        <button className="btn icon small danger" data-testid="audio-delete" onClick={() => deleteAudioCue(sceneId, c.id)} title={t('audio.delete')} aria-label={aria(t('audio.delete'), c.title || label)}>
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </div>

                    {(info.exceeds || info.fadeTooLong) && (
                      <div className="shot-chips" data-testid="audio-chips">
                        {info.exceeds && <span className="badge pacing-dep" data-warn="exceeds">{t('audio.warn.exceeds', { n: num(over) })}</span>}
                        {info.fadeTooLong && <span className="badge pacing-dep" data-warn="fade">{t('audio.warn.fade')}</span>}
                      </div>
                    )}
                    {c.type === 'silence' && <p className="muted audio-silence-note">{t('audio.silenceNote')}</p>}

                    <div className="shot-fields">
                      <div className="shot-title-field" data-cue-title>
                        <Field label={t('audio.field.title')}>
                          <TextInput value={c.title} onChange={(title) => upd({ title })} />
                        </Field>
                      </div>
                      <Field label={t('audio.field.start')}>
                        <NumberInput value={c.start} min={0} step={0.5} onChange={(start) => upd({ start })} />
                      </Field>
                      <Field label={t('audio.field.duration')}>
                        <NumberInput value={c.duration} min={0.1} step={0.5} onChange={(duration) => upd({ duration })} />
                      </Field>
                      <Field label={t('audio.field.type')}>
                        <Select value={c.type} options={AUDIO_CUE_TYPES.map((v) => ({ value: v, label: t(`audioType.${v}`) }))} onChange={(type) => upd({ type })} />
                      </Field>
                      <Field label={t('audio.field.origin')}>
                        <Select value={c.origin} options={AUDIO_ORIGINS.map((v) => ({ value: v, label: t(`audioOrigin.${v}`) }))} onChange={(origin) => upd({ origin })} />
                      </Field>
                      <Field label={t('audio.field.direction')}>
                        <Select value={c.direction} options={AUDIO_DIRECTIONS.map((v) => ({ value: v, label: t(`audioDir.${v}`) }))} onChange={(direction) => upd({ direction })} />
                      </Field>
                      <Field label={t('audio.field.level')} hint={t('audio.field.levelHint')}>
                        <NumberInput value={c.level} min={0} max={10} step={0.5} onChange={(level) => upd({ level })} />
                      </Field>
                      <Field label={t('audio.field.fadeIn')}>
                        <NumberInput value={c.fadeIn} min={0} step={0.5} onChange={(fadeIn) => upd({ fadeIn })} />
                      </Field>
                      <Field label={t('audio.field.fadeOut')}>
                        <NumberInput value={c.fadeOut} min={0} step={0.5} onChange={(fadeOut) => upd({ fadeOut })} />
                      </Field>
                      <label className="check">
                        <input type="checkbox" checked={c.loop} onChange={(e) => upd({ loop: e.target.checked })} />
                        {t('audio.field.loop')}
                      </label>
                      <div className="shot-title-field">
                        <Field label={t('audio.field.asset')}>
                          <TextInput value={c.asset} onChange={(asset) => upd({ asset })} />
                        </Field>
                      </div>
                      <div className="shot-notes">
                        <Field label={t('audio.field.notes')}>
                          <TextArea value={c.notes} rows={2} onChange={(notes) => upd({ notes })} />
                        </Field>
                        <Field label={t('audio.field.prompt')} hint={t('audio.field.promptHint')}>
                          <TextArea value={c.prompt} rows={2} onChange={(prompt) => upd({ prompt })} />
                        </Field>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
