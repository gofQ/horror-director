import { useState } from 'react'
import { useEffect, useRef } from 'react'
import { Clapperboard, Copy, Drama, Flag, Plus, Trash2, Volume2, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { SCENE_KINDS, TRANSITION_STYLES, TYPE_COLORS, TYPE_ICONS, crossingOf, type SceneKind } from '../lib/schema'
import { sceneTypeUsage } from '../lib/sceneTypes'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'
import { AudioPlannerDialog } from './AudioPlannerDialog'
import { ShotPlannerDialog } from './ShotPlannerDialog'
import { TransitionDesignerDialog } from './TransitionDesignerDialog'

function SceneInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const scene = project.scenes.find((s) => s.id === id)
  const updateScene = useStore((s) => s.updateScene)
  const deleteScene = useStore((s) => s.deleteScene)
  const setStart = useStore((s) => s.setStart)
  const setView = useStore((s) => s.setView)
  const setTimelineScene = useStore((s) => s.setTimelineScene)
  const setCharState = useStore((s) => s.setSceneCharacterState)
  const applyType = useStore((s) => s.applySceneType)
  const [shotsOpen, setShotsOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  if (!scene) return null
  const isStart = project.startSceneId === id

  return (
    <>
      <div className="insp-head">
        <h3>{t('insp.scene')}</h3>
        <button className="btn small danger" onClick={() => deleteScene(id)} title={t('tip.deleteScene')}>
          <Trash2 size={14} /> {t('btn.delete')}
        </button>
      </div>
      <Field label={t('field.title')}>
        <TextInput value={scene.title} onChange={(title) => updateScene(id, { title })} />
      </Field>
      <div className="row">
        <Field label={t('field.type')}>
          <Select
            value={scene.typeId && project.sceneTypes.some((x) => x.id === scene.typeId) ? `type:${scene.typeId}` : `kind:${scene.kind}`}
            options={[
              ...SCENE_KINDS.map((k) => ({ value: `kind:${k}`, label: t(`kind.${k}`) })),
              ...project.sceneTypes.map((ty) => ({ value: `type:${ty.id}`, label: `${ty.name} (${t(`kind.${ty.baseKind}`)})` })),
            ]}
            onChange={(v) => {
              if (v.startsWith('type:')) applyType(id, v.slice(5))
              else applyType(id, null, v.slice(5) as SceneKind)
            }}
          />
        </Field>
        <Field label={t('field.duration')}>
          <NumberInput value={scene.duration} min={1} onChange={(duration) => updateScene(id, { duration })} />
        </Field>
      </div>
      <button className={`btn${isStart ? ' active' : ''}`} onClick={() => setStart(id)} disabled={isStart}>
        <Flag size={14} /> {isStart ? t('btn.isStart') : t('btn.setStart')}
      </button>
      <Field label={t('field.description')}>
        <TextArea value={scene.description} rows={4} onChange={(description) => updateScene(id, { description })} />
      </Field>
      <Field label={t('field.unrealLevel')} hint={t('hint.unrealLevel')}>
        <TextInput value={scene.unrealLevel} onChange={(unrealLevel) => updateScene(id, { unrealLevel })} />
      </Field>
      <Field label={t('field.ambience')}>
        <TextInput value={scene.ambience} onChange={(ambience) => updateScene(id, { ambience })} />
      </Field>

      <div className="section-title">{t('section.looping')}</div>
      <label className="check">
        <input
          type="checkbox"
          checked={scene.loop.enabled}
          onChange={(e) => updateScene(id, { loop: { ...scene.loop, enabled: e.target.checked } })}
        />
        {t('check.canLoop')}
      </label>
      {scene.loop.enabled && (
        <>
          <Field label={t('field.maxIterations')} hint={t('hint.unlimited')}>
            <NumberInput
              value={scene.loop.maxIterations}
              min={0}
              onChange={(maxIterations) => updateScene(id, { loop: { ...scene.loop, maxIterations: Math.round(maxIterations) } })}
            />
          </Field>
          <Field label={t('field.exitCondition')}>
            <TextInput
              value={scene.loop.exitCondition}
              onChange={(exitCondition) => updateScene(id, { loop: { ...scene.loop, exitCondition } })}
            />
          </Field>
        </>
      )}

      <div className="section-title">{t('section.charStates')}</div>
      {project.characters.length === 0 && <p className="muted">{t('empty.noCharsInspector')}</p>}
      {project.characters.map((c) => (
        <Field key={c.id} label={c.name}>
          <select
            className="input"
            value={scene.characterStates[c.id] ?? ''}
            onChange={(e) => setCharState(id, c.id, e.target.value || null)}
          >
            <option value="">{t('opt.notPresent')}</option>
            {c.states.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </Field>
      ))}

      <div className="section-title">{t('section.triggers', { n: scene.triggers.length })}</div>
      <button
        className="btn"
        onClick={() => {
          setTimelineScene(id)
          setView('timeline')
        }}
      >
        {t('btn.editTimeline')}
      </button>

      <div className="section-title">{t('shot.open', { n: scene.shots.length })}</div>
      <button className="btn" data-testid="open-shots" onClick={() => setShotsOpen(true)} title={t('shot.openTip')}>
        <Clapperboard size={14} /> {t('shot.open', { n: scene.shots.length })}
      </button>
      {shotsOpen && <ShotPlannerDialog sceneId={id} onClose={() => setShotsOpen(false)} />}

      <div className="section-title">{t('audio.open', { n: scene.audioCues.length })}</div>
      <button className="btn" data-testid="open-audio" onClick={() => setAudioOpen(true)} title={t('audio.openTip')}>
        <Volume2 size={14} /> {t('audio.open', { n: scene.audioCues.length })}
      </button>
      {audioOpen && <AudioPlannerDialog sceneId={id} onClose={() => setAudioOpen(false)} />}
    </>
  )
}

function EdgeInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const tr = project.transitions.find((x) => x.id === id)
  const update = useStore((s) => s.updateTransition)
  const del = useStore((s) => s.deleteTransition)
  const [designOpen, setDesignOpen] = useState(false)
  if (!tr) return null
  const a = project.scenes.find((s) => s.id === tr.source)
  const b = project.scenes.find((s) => s.id === tr.target)
  const logicA = project.logicNodes.find((n) => n.id === tr.source)
  const logicB = project.logicNodes.find((n) => n.id === tr.target)
  const touchesLogic = !!logicA || !!logicB
  const crossing = a && b ? crossingOf(a.kind, b.kind) : 'same-layer'
  const crossingLabel =
    crossing === 'reality->dream'
      ? t('crossing.downLong')
      : crossing === 'dream->reality'
        ? t('crossing.upLong')
        : tr.source === tr.target
          ? t('crossing.self')
          : t('crossing.same')

  return (
    <>
      <div className="insp-head">
        <h3>{t('insp.transition')}</h3>
        <button className="btn small danger" onClick={() => del(id)}>
          <Trash2 size={14} /> {t('btn.delete')}
        </button>
      </div>
      <p className="muted">
        <strong>{a?.title ?? logicA?.title}</strong>
        {tr.sourcePort && <span className="badge" data-testid="edge-port" style={{ marginLeft: 6 }}>{t(`pin.${tr.sourcePort}`)}</span>} → <strong>{b?.title ?? logicB?.title}</strong>
        <br />
        {touchesLogic ? <span>{t('edge.logicNote')}</span> : <span className={`crossing ${crossing.replace('->', '-to-')}`}>{crossingLabel}</span>}
      </p>
      <Field label={t('field.label')}>
        <TextInput value={tr.label} onChange={(label) => update(id, { label })} />
      </Field>
      <div className="row">
        <Field label={t('field.style')}>
          <Select
            value={tr.style}
            options={TRANSITION_STYLES.map((s) => ({ value: s, label: t(`style.${s}`) }))}
            onChange={(style) => update(id, { style })}
          />
        </Field>
        <Field label={t('field.duration')}>
          <NumberInput value={tr.duration} min={0} step={0.5} onChange={(duration) => update(id, { duration })} />
        </Field>
      </div>
      <Field label={t('field.condition')} hint={t('hint.transitionCondition')}>
        <TextArea value={tr.condition} rows={3} onChange={(condition) => update(id, { condition })} />
      </Field>

      {!touchesLogic && (
        <>
      <div className="section-title">{t('direction.section')}</div>
      <p className="muted" data-testid="direction-summary">
        {tr.direction
          ? `${t('direction.summary.some', { technique: t(`technique.${tr.direction.technique}`) })}${
              tr.direction.sourceShotId || tr.direction.targetShotId
                ? ` · ${t('direction.summary.shots', { n: (tr.direction.sourceShotId ? 1 : 0) + (tr.direction.targetShotId ? 1 : 0) })}`
                : ''
            }`
          : t('direction.summary.none')}
      </p>
      <button className="btn" data-testid="open-direction" onClick={() => setDesignOpen(true)} title={t('direction.openTip')}>
        <Drama size={14} /> {t('direction.open')}
      </button>
      {designOpen && <TransitionDesignerDialog transitionId={id} onClose={() => setDesignOpen(false)} />}
        </>
      )}
    </>
  )
}

function BranchInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const node = project.logicNodes.find((n) => n.id === id)
  const update = useStore((s) => s.updateLogicNode)
  const duplicate = useStore((s) => s.duplicateNode)
  const del = useStore((s) => s.deleteScenes)
  const focusReq = useStore((s) => s.inspectorFocus)
  const condRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusReq !== id) return
    condRef.current?.querySelector<HTMLElement>('textarea')?.focus()
    useStore.getState().requestInspectorFocus(null)
  }, [focusReq, id])
  if (!node) return null
  const titleOf = (tid: string) => project.scenes.find((s) => s.id === tid)?.title ?? project.logicNodes.find((n) => n.id === tid)?.title ?? tid
  const out = (port: 'true' | 'false') => project.transitions.find((x) => x.source === id && x.sourcePort === port)
  return (
    <>
      <div className="insp-head">
        <h3>{t('insp.branch')}</h3>
        <span>
          <button className="btn small" data-testid="branch-duplicate" onClick={() => duplicate(id)} title={t('ctx.duplicate')}>
            <Copy size={14} />
          </button>{' '}
          <button className="btn small danger" data-testid="branch-delete" onClick={() => del([id])}>
            <Trash2 size={14} /> {t('btn.delete')}
          </button>
        </span>
      </div>
      <Field label={t('field.title')}>
        <TextInput value={node.title} onChange={(title) => update(id, { title })} />
      </Field>
      <div ref={condRef}>
        <Field label={t('field.condition')} hint={t('branch.conditionHint')}>
          <TextArea value={node.condition} rows={3} onChange={(condition) => update(id, { condition })} />
        </Field>
      </div>
      <Field label={t('field.description')}>
        <TextArea value={node.description} rows={3} onChange={(description) => update(id, { description })} />
      </Field>
      <div className="section-title">{t('branch.outputs')}</div>
      <ul className="branch-outs" data-testid="branch-outs">
        {(['true', 'false'] as const).map((port) => {
          const link = out(port)
          return (
            <li key={port} data-port={port}>
              <strong style={{ color: port === 'true' ? '#6ee7a1' : '#ff6b7d' }}>{t(`pin.${port}`)}</strong> → {link ? titleOf(link.target) : <span className="muted">{t('branch.unconnected')}</span>}
            </li>
          )
        })}
      </ul>
      <p className="muted">{t('branch.incoming', { n: project.transitions.filter((x) => x.target === id).length })}</p>
    </>
  )
}

function CommentInspector({ id }: { id: string }) {
  const { t } = useT()
  const comment = useStore((s) => s.project.comments.find((c) => c.id === id))
  const update = useStore((s) => s.updateComment)
  const duplicate = useStore((s) => s.duplicateNode)
  const del = useStore((s) => s.deleteScenes)
  if (!comment) return null
  return (
    <>
      <div className="insp-head">
        <h3>{t('insp.comment')}</h3>
        <span>
          <button className="btn small" onClick={() => duplicate(id)} title={t('ctx.duplicate')}>
            <Copy size={14} />
          </button>{' '}
          <button className="btn small danger" data-testid="comment-delete" onClick={() => del([id])}>
            <Trash2 size={14} /> {t('btn.delete')}
          </button>
        </span>
      </div>
      <Field label={t('field.title')}>
        <TextInput value={comment.title} onChange={(title) => update(id, { title })} />
      </Field>
      <Field label={t('field.text')}>
        <TextArea value={comment.text} rows={4} onChange={(text) => update(id, { text })} />
      </Field>
      <ColorPicker value={comment.color} label={t('field.color')} onChange={(color) => update(id, { color })} />
      <p className="muted">{t('comment.note')}</p>
    </>
  )
}

function ColorPicker({ value, label, onChange }: { value: string; label: string; onChange: (c: (typeof TYPE_COLORS)[number]) => void }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="swatches">
        {TYPE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            data-color={c}
            className={`swatch${value === c ? ' on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  )
}

function SceneTypesManager() {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const add = useStore((s) => s.addSceneType)
  const update = useStore((s) => s.updateSceneType)
  const del = useStore((s) => s.deleteSceneType)
  const [confirm, setConfirm] = useState<string | null>(null)
  return (
    <>
      <div className="section-title">{t('types.title')}</div>
      <p className="muted">{t('types.intro')}</p>
      {project.sceneTypes.length === 0 && <p className="muted" data-testid="types-empty">{t('types.empty')}</p>}
      {project.sceneTypes.map((ty) => {
        const used = sceneTypeUsage(project, ty.id)
        return (
          <div key={ty.id} className="scene-type-card" data-testid="scene-type" data-type-id={ty.id}>
            <Field label={t('types.name')}>
              <TextInput value={ty.name} onChange={(name) => update(ty.id, { name })} />
            </Field>
            <div className="row">
              <Field label={t('types.base')} hint={used ? t('types.baseLocked', { n: used }) : undefined}>
                <select
                  className="input"
                  aria-label={t('types.base')}
                  data-testid="scene-type-base"
                  value={ty.baseKind}
                  disabled={used > 0}
                  onChange={(e) => update(ty.id, { baseKind: e.target.value as SceneKind })}
                >
                  {SCENE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kind.${k}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('types.icon')}>
                <Select value={ty.icon} options={TYPE_ICONS.map((i) => ({ value: i, label: i }))} onChange={(icon) => update(ty.id, { icon })} />
              </Field>
            </div>
            <ColorPicker value={ty.color} label={t('types.color')} onChange={(color) => update(ty.id, { color })} />
            <Field label={t('types.defaultDescription')}>
              <TextArea value={ty.description} rows={2} onChange={(description) => update(ty.id, { description })} />
            </Field>
            <Field label={t('types.defaultDuration')} hint={t('types.defaultDurationHint')}>
              <NumberInput value={ty.duration ?? 0} min={0} onChange={(d) => update(ty.id, { duration: d > 0 ? d : undefined })} />
            </Field>
            <p className="muted">{t('types.usedBy', { n: used })}</p>
            {confirm === ty.id ? (
              <div className="issue warning" role="alert" data-testid="scene-type-confirm">
                <p>{t('types.deleteConfirm', { name: ty.name, n: used })}</p>
                <div className="modal-actions">
                  <button className="btn small" onClick={() => setConfirm(null)}>{t('btn.cancel')}</button>
                  <button className="btn small danger" data-testid="scene-type-detach" onClick={() => { del(ty.id, { detach: true }); setConfirm(null) }}>{t('types.deleteDetach')}</button>
                </div>
              </div>
            ) : (
              <button className="btn small danger" data-testid="scene-type-delete" onClick={() => (used > 0 ? setConfirm(ty.id) : del(ty.id))}>
                <Trash2 size={14} /> {t('types.delete')}
              </button>
            )}
          </div>
        )
      })}
      <button className="btn" data-testid="scene-type-add" onClick={() => add('reality')}>
        <Plus size={14} /> {t('types.add')}
      </button>
    </>
  )
}

function ProjectInspector() {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const update = useStore((s) => s.updateProject)
  return (
    <>
      <div className="insp-head">
        <h3>{t('insp.project')}</h3>
      </div>
      <Field label={t('field.name')}>
        <TextInput value={project.name} onChange={(name) => update({ name })} />
      </Field>
      <Field label={t('field.premise')}>
        <TextArea value={project.description} rows={5} onChange={(description) => update({ description })} />
      </Field>
      <p className="muted">{t('help.graph')}</p>
      <SceneTypesManager />
    </>
  )
}

export function Inspector({ onClose }: { onClose?: () => void }) {
  const { t } = useT()
  const selection = useStore((s) => s.selection)
  return (
    <aside className="inspector" aria-label={t('insp.aria')}>
      {onClose && (
        <button className="btn icon sheet-close" onClick={onClose} aria-label={t('insp.close')}>
          <X size={16} />
        </button>
      )}
      {selection?.type === 'scene' ? (
        <SceneInspector key={selection.id} id={selection.id} />
      ) : selection?.type === 'node' ? (
        <BranchInspector key={selection.id} id={selection.id} />
      ) : selection?.type === 'comment' ? (
        <CommentInspector key={selection.id} id={selection.id} />
      ) : selection?.type === 'edge' ? (
        <EdgeInspector key={selection.id} id={selection.id} />
      ) : (
        <ProjectInspector />
      )}
    </aside>
  )
}
