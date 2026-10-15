import { useEffect, useRef } from 'react'
import { ArrowRight, Redo2, Trash2, Undo2, X, TriangleAlert } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { DIRECTION_TECHNIQUES, type Scene, type Shot, type TransitionDirection } from '../lib/schema'
import { formatClock } from '../lib/simulate'
import { Field, Select, TextArea } from './fields'

/**
 * Psychological transition designer: director-authored notes for one transition. Nothing here is
 * evaluated or executed, and it never touches the transition's style, condition or duration.
 */
export function TransitionDesignerDialog({ transitionId, onClose }: { transitionId: string; onClose: () => void }) {
  const { t } = useT()
  const tr = useStore((s) => s.project.transitions.find((x) => x.id === transitionId))
  const source = useStore((s) => s.project.scenes.find((x) => x.id === tr?.source))
  const target = useStore((s) => s.project.scenes.find((x) => x.id === tr?.target))
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { updateDirection, clearDirection, undo, redo } = useStore.getState()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  if (!tr || !source || !target) return null
  const d = tr.direction
  const untitled = t('direction.untitled')
  const selfLoop = tr.source === tr.target
  const style = tr.label || t(`style.${tr.style}`)
  const shotLabel = (s: Shot, i: number) =>
    t('direction.shotOption', { n: i + 1, title: s.title || untitled, start: formatClock(s.start), end: formatClock(s.start + s.duration) })

  const shotSelect = (scene: Scene, id: string | null, key: 'sourceShotId' | 'targetShotId', label: string) => {
    const missing = id !== null && !scene.shots.some((s) => s.id === id)
    return (
      <>
        <Field label={label}>
          <Select
            value={id ?? ''}
            options={[
              { value: '', label: t('direction.shotNone') },
              ...scene.shots.map((s, i) => ({ value: s.id, label: shotLabel(s, i) })),
              ...(missing ? [{ value: id!, label: `⚠ ${id}` }] : []),
            ]}
            onChange={(v) => updateDirection(transitionId, { [key]: v === '' ? null : v })}
          />
        </Field>
        {missing && (
          <p className="issue warning" role="alert" data-testid="direction-missing-shot">
            <TriangleAlert size={14} className="inline-icon" /> {t('direction.missingShot', { id: id! })}
          </p>
        )}
      </>
    )
  }

  const shotCard = (scene: Scene, id: string | null) => {
    const shot = id ? scene.shots.find((s) => s.id === id) : undefined
    return (
      <>
        <strong>{scene.title || untitled}</strong>
        {shot ? (
          <div className="dir-shot" data-testid="direction-shot">
            <div>{shot.title || untitled}</div>
            <div className="muted">{t('direction.shotMeta', { framing: t(`framing.${shot.framing}`), movement: t(`movement.${shot.movement}`), technique: t(`technique.${shot.technique}`) })}</div>
            <div className="muted">{formatClock(shot.start)}–{formatClock(shot.start + shot.duration)}</div>
          </div>
        ) : (
          <div className="muted" data-testid="direction-noshot">{t('direction.noShot')}</div>
        )}
      </>
    )
  }
  const block = (cls: string, title: string, text: string | undefined, testid: string) => (
    <section className={`dir-block ${cls}`} data-testid={testid}>
      <h4>{title}</h4>
      {text?.trim() ? <p>{text}</p> : <p className="muted">{t('direction.unwritten')}</p>}
    </section>
  )
  const text = (key: keyof TransitionDirection, label: string, rows = 2) => (
    <Field label={label}>
      <TextArea value={(d?.[key] as string) ?? ''} rows={rows} onChange={(v) => updateDirection(transitionId, { [key]: v })} />
    </Field>
  )

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal shot-planner direction-designer" data-testid="direction-designer" role="dialog" aria-modal="true" aria-labelledby="direction-title">
        <div className="insp-head">
          <h3 id="direction-title">{t('direction.title', { from: source.title || untitled, to: target.title || untitled })}</h3>
          <div className="shot-head-actions">
            <button className="btn icon" data-testid="direction-undo" onClick={undo} disabled={!canUndo} title={t('tip.undo')} aria-label={t('btn.undo')}>
              <Undo2 size={15} />
            </button>
            <button className="btn icon" data-testid="direction-redo" onClick={redo} disabled={!canRedo} title={t('tip.redo')} aria-label={t('btn.redo')}>
              <Redo2 size={15} />
            </button>
            <button className="btn icon" data-testid="direction-close" data-autofocus onClick={onClose} aria-label={t('btn.close')}>
              <X size={15} />
            </button>
          </div>
        </div>
        <p className="muted">{t('direction.intro')}</p>
        {selfLoop && <p className="issue info" data-testid="direction-selfloop">{t('direction.selfLoop')}</p>}

        {!d ? (
          <>
            <p className="muted" data-testid="direction-empty">{t('direction.empty')}</p>
            <div className="shot-toolbar">
              <button className="btn primary" data-testid="direction-start" onClick={() => updateDirection(transitionId, {})}>
                {t('direction.start')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="section-title">{t('direction.preview')}</div>
            <div className="dir-preview" data-testid="direction-preview" role="group" aria-label={t('direction.preview')}>
              <div className="dir-col" data-col="before">
                <div className="dir-col-title">{t('direction.before')}</div>
                {shotCard(source, d.sourceShotId)}
              </div>
              <ArrowRight size={18} className="dir-arrow" aria-hidden />
              <div className="dir-col dir-mid" data-col="transition">
                <div className="dir-col-title">{t('direction.transition')}</div>
                <strong>{style}</strong>
                <div className="muted">{t(`style.${tr.style}`)} · {t('unit.seconds', { n: tr.duration })}</div>
                <div className="dir-technique" data-testid="direction-technique">{t(`technique.${d.technique}`)}</div>
                {tr.condition.trim() && <div className="muted">{t('direction.condition', { text: tr.condition.trim() })}</div>}
              </div>
              <ArrowRight size={18} className="dir-arrow" aria-hidden />
              <div className="dir-col" data-col="after">
                <div className="dir-col-title">{t('direction.after')}</div>
                {shotCard(target, d.targetShotId)}
              </div>
            </div>
            <div className="dir-blocks">
              {block('illusion', t('direction.illusion'), d.playerBelief, 'direction-illusion')}
              {block('reality', t('direction.realityBlock'), d.reality, 'direction-reality')}
              {block('reveal', t('direction.revealBlock'), d.reveal, 'direction-reveal')}
            </div>

            <div className="shot-fields">
              <Field label={t('direction.field.technique')}>
                <Select value={d.technique} options={DIRECTION_TECHNIQUES.map((v) => ({ value: v, label: t(`technique.${v}`) }))} onChange={(technique) => updateDirection(transitionId, { technique })} />
              </Field>
              {shotSelect(source, d.sourceShotId, 'sourceShotId', t('direction.field.sourceShot'))}
              {shotSelect(target, d.targetShotId, 'targetShotId', t('direction.field.targetShot'))}
              <div className="shot-notes">
                {text('playerBelief', t('direction.field.playerBelief'), 3)}
                {text('reality', t('direction.field.reality'), 3)}
              </div>
              <div className="shot-title-field">{text('reveal', t('direction.field.reveal'), 3)}</div>
              <div className="shot-notes">
                {text('visualContinuity', t('direction.field.visual'))}
                {text('audioContinuity', t('direction.field.audio'))}
              </div>
              <div className="shot-title-field">{text('unrealNotes', t('direction.field.unreal'))}</div>
            </div>
            <div className="shot-toolbar">
              <button className="btn danger" data-testid="direction-clear" onClick={() => clearDirection(transitionId)}>
                <Trash2 size={14} /> {t('direction.clear')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
