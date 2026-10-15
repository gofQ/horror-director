import { Flag, Trash2, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { SCENE_KINDS, TRANSITION_STYLES, crossingOf } from '../lib/schema'
import { KIND_META, STYLE_LABEL } from '../lib/theme'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'

function SceneInspector({ id }: { id: string }) {
  const project = useStore((s) => s.project)
  const scene = project.scenes.find((s) => s.id === id)
  const updateScene = useStore((s) => s.updateScene)
  const deleteScene = useStore((s) => s.deleteScene)
  const setStart = useStore((s) => s.setStart)
  const setView = useStore((s) => s.setView)
  const setTimelineScene = useStore((s) => s.setTimelineScene)
  const setCharState = useStore((s) => s.setSceneCharacterState)
  if (!scene) return null
  const isStart = project.startSceneId === id

  return (
    <>
      <div className="insp-head">
        <h3>Scene</h3>
        <button className="btn small danger" onClick={() => deleteScene(id)} title="Delete scene (Del)">
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <Field label="Title">
        <TextInput value={scene.title} onChange={(title) => updateScene(id, { title })} />
      </Field>
      <div className="row">
        <Field label="Type">
          <Select
            value={scene.kind}
            options={SCENE_KINDS.map((k) => ({ value: k, label: KIND_META[k].label }))}
            onChange={(kind) => updateScene(id, { kind })}
          />
        </Field>
        <Field label="Duration (s)">
          <NumberInput value={scene.duration} min={1} onChange={(duration) => updateScene(id, { duration })} />
        </Field>
      </div>
      <button className={`btn${isStart ? ' active' : ''}`} onClick={() => setStart(id)} disabled={isStart}>
        <Flag size={14} /> {isStart ? 'Start scene' : 'Set as start scene'}
      </button>
      <Field label="Description / beats">
        <TextArea value={scene.description} rows={4} onChange={(description) => updateScene(id, { description })} />
      </Field>
      <Field label="Unreal level / asset path" hint="e.g. /Game/Maps/L_Hallway">
        <TextInput value={scene.unrealLevel} onChange={(unrealLevel) => updateScene(id, { unrealLevel })} />
      </Field>
      <Field label="Ambience / sound">
        <TextInput value={scene.ambience} onChange={(ambience) => updateScene(id, { ambience })} />
      </Field>

      <div className="section-title">Looping</div>
      <label className="check">
        <input
          type="checkbox"
          checked={scene.loop.enabled}
          onChange={(e) => updateScene(id, { loop: { ...scene.loop, enabled: e.target.checked } })}
        />
        This scene can repeat
      </label>
      {scene.loop.enabled && (
        <>
          <Field label="Max iterations" hint="0 = unlimited">
            <NumberInput
              value={scene.loop.maxIterations}
              min={0}
              onChange={(maxIterations) => updateScene(id, { loop: { ...scene.loop, maxIterations: Math.round(maxIterations) } })}
            />
          </Field>
          <Field label="Exit condition">
            <TextInput
              value={scene.loop.exitCondition}
              onChange={(exitCondition) => updateScene(id, { loop: { ...scene.loop, exitCondition } })}
            />
          </Field>
        </>
      )}

      <div className="section-title">Character states</div>
      {project.characters.length === 0 && <p className="muted">No characters yet. Add some in the Characters tab.</p>}
      {project.characters.map((c) => (
        <Field key={c.id} label={c.name}>
          <select
            className="input"
            value={scene.characterStates[c.id] ?? ''}
            onChange={(e) => setCharState(id, c.id, e.target.value || null)}
          >
            <option value="">— not present —</option>
            {c.states.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </Field>
      ))}

      <div className="section-title">Triggers ({scene.triggers.length})</div>
      <button
        className="btn"
        onClick={() => {
          setTimelineScene(id)
          setView('timeline')
        }}
      >
        Edit on timeline
      </button>
    </>
  )
}

function EdgeInspector({ id }: { id: string }) {
  const project = useStore((s) => s.project)
  const t = project.transitions.find((x) => x.id === id)
  const update = useStore((s) => s.updateTransition)
  const del = useStore((s) => s.deleteTransition)
  if (!t) return null
  const a = project.scenes.find((s) => s.id === t.source)
  const b = project.scenes.find((s) => s.id === t.target)
  const crossing = a && b ? crossingOf(a.kind, b.kind) : 'same-layer'
  const crossingLabel = {
    'reality->dream': 'Reality → Dream (descent)',
    'dream->reality': 'Dream → Reality (awakening)',
    'same-layer': t.source === t.target ? 'Self loop' : 'Same layer',
  }[crossing]

  return (
    <>
      <div className="insp-head">
        <h3>Transition</h3>
        <button className="btn small danger" onClick={() => del(id)}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <p className="muted">
        <strong>{a?.title}</strong> → <strong>{b?.title}</strong>
        <br />
        <span className={`crossing ${crossing.replace('->', '-to-')}`}>{crossingLabel}</span>
      </p>
      <Field label="Label">
        <TextInput value={t.label} onChange={(label) => update(id, { label })} />
      </Field>
      <div className="row">
        <Field label="Style">
          <Select
            value={t.style}
            options={TRANSITION_STYLES.map((s) => ({ value: s, label: STYLE_LABEL[s] }))}
            onChange={(style) => update(id, { style })}
          />
        </Field>
        <Field label="Duration (s)">
          <NumberInput value={t.duration} min={0} step={0.5} onChange={(duration) => update(id, { duration })} />
        </Field>
      </div>
      <Field label="Condition" hint="Gameplay condition required to take this transition">
        <TextArea value={t.condition} rows={3} onChange={(condition) => update(id, { condition })} />
      </Field>
    </>
  )
}

function ProjectInspector() {
  const project = useStore((s) => s.project)
  const update = useStore((s) => s.updateProject)
  return (
    <>
      <div className="insp-head">
        <h3>Project</h3>
      </div>
      <Field label="Name">
        <TextInput value={project.name} onChange={(name) => update({ name })} />
      </Field>
      <Field label="Premise / notes">
        <TextArea value={project.description} rows={5} onChange={(description) => update({ description })} />
      </Field>
      <p className="muted">
        Click a scene or transition to edit it. Drag from a node’s right handle to another node’s left handle to
        connect scenes; connect a node to itself to create a loop. Press <kbd>Del</kbd> to delete the selection.
      </p>
    </>
  )
}

export function Inspector({ onClose }: { onClose?: () => void }) {
  const selection = useStore((s) => s.selection)
  return (
    <aside className="inspector" aria-label="Inspector">
      {onClose && (
        <button className="btn icon sheet-close" onClick={onClose} aria-label="Close inspector">
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
