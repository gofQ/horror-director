import { useState } from 'react'
import { Clapperboard, Flag, Trash2, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/store'
import { SCENE_KINDS, TRANSITION_STYLES, crossingOf } from '../lib/schema'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'
import { ShotPlannerDialog } from './ShotPlannerDialog'

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
  const [shotsOpen, setShotsOpen] = useState(false)
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
            value={scene.kind}
            options={SCENE_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
            onChange={(kind) => updateScene(id, { kind })}
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
    </>
  )
}

function EdgeInspector({ id }: { id: string }) {
  const { t } = useT()
  const project = useStore((s) => s.project)
  const tr = project.transitions.find((x) => x.id === id)
  const update = useStore((s) => s.updateTransition)
  const del = useStore((s) => s.deleteTransition)
  if (!tr) return null
  const a = project.scenes.find((s) => s.id === tr.source)
  const b = project.scenes.find((s) => s.id === tr.target)
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
        <strong>{a?.title}</strong> → <strong>{b?.title}</strong>
        <br />
        <span className={`crossing ${crossing.replace('->', '-to-')}`}>{crossingLabel}</span>
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
      ) : selection?.type === 'edge' ? (
        <EdgeInspector key={selection.id} id={selection.id} />
      ) : (
        <ProjectInspector />
      )}
    </aside>
  )
}
