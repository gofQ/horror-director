import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { CHARACTER_ROLES } from '../lib/schema'
import { KIND_META } from '../lib/theme'
import { Field, NumberInput, Select, TextArea, TextInput } from './fields'

export function CharactersView() {
  const project = useStore((s) => s.project)
  const add = useStore((s) => s.addCharacter)
  const update = useStore((s) => s.updateCharacter)
  const del = useStore((s) => s.deleteCharacter)
  const addState = useStore((s) => s.addCharacterState)
  const updateState = useStore((s) => s.updateCharacterState)
  const delState = useStore((s) => s.deleteCharacterState)
  const setCharState = useStore((s) => s.setSceneCharacterState)
  const focusScene = useStore((s) => s.focusScene)
  const [selId, setSelId] = useState<string | null>(null)
  const chr = project.characters.find((c) => c.id === selId) ?? project.characters[0]

  return (
    <div className="view-pad characters-view">
      <div className="characters-top">
        <div className="card char-list">
          <div className="insp-head">
            <h3>Characters</h3>
            <button className="btn small primary" onClick={() => setSelId(add())}>
              <Plus size={14} /> Add
            </button>
          </div>
          {project.characters.length === 0 && <p className="muted">No characters yet.</p>}
          {project.characters.map((c) => (
            <button
              key={c.id}
              className={`char-row${c.id === chr?.id ? ' selected' : ''}`}
              onClick={() => setSelId(c.id)}
            >
              <i style={{ background: c.color }} />
              <span>{c.name}</span>
              <small>{c.role}</small>
            </button>
          ))}
        </div>

        <div className="card char-editor">
          {chr ? (
            <>
              <div className="insp-head">
                <h3>{chr.name}</h3>
                <button
                  className="btn small danger"
                  onClick={() => {
                    del(chr.id)
                    setSelId(null)
                  }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
              <div className="row">
                <Field label="Name">
                  <TextInput value={chr.name} onChange={(name) => update(chr.id, { name })} />
                </Field>
                <Field label="Role">
                  <Select
                    value={chr.role}
                    options={CHARACTER_ROLES.map((r) => ({ value: r, label: r }))}
                    onChange={(role) => update(chr.id, { role })}
                  />
                </Field>
                <Field label="Color">
                  <input
                    className="input color"
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(chr.color) ? chr.color : '#9aa0b4'}
                    onChange={(e) => update(chr.id, { color: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Description">
                <TextArea value={chr.description} onChange={(description) => update(chr.id, { description })} />
              </Field>
              <div className="insp-head">
                <div className="section-title">Behavior states</div>
                <button className="btn small" onClick={() => addState(chr.id)}>
                  <Plus size={14} /> State
                </button>
              </div>
              {chr.states.map((st) => (
                <div key={st.id} className="state-card">
                  <div className="row">
                    <Field label="State">
                      <TextInput value={st.name} onChange={(name) => updateState(chr.id, st.id, { name })} />
                    </Field>
                    <Field label="Aggression (0–10)">
                      <NumberInput
                        value={st.aggression}
                        min={0}
                        max={10}
                        onChange={(v) => updateState(chr.id, st.id, { aggression: Math.min(10, Math.max(0, v)) })}
                      />
                    </Field>
                    <button className="btn icon danger" aria-label="Delete state" onClick={() => delState(chr.id, st.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Field label="Behavior">
                    <TextArea rows={2} value={st.behavior} onChange={(behavior) => updateState(chr.id, st.id, { behavior })} />
                  </Field>
                </div>
              ))}
            </>
          ) : (
            <p className="muted">Create a character to track its states across scenes.</p>
          )}
        </div>
      </div>

      {project.characters.length > 0 && (
        <div className="card matrix-card">
          <div className="section-title">State tracking across scenes</div>
          <div className="matrix-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>Scene</th>
                  {project.characters.map((c) => (
                    <th key={c.id}>
                      <i style={{ background: c.color }} /> {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.scenes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button className="link" onClick={() => focusScene(s.id)}>
                        <i style={{ background: KIND_META[s.kind].color }} /> {s.title}
                      </button>
                    </td>
                    {project.characters.map((c) => (
                      <td key={c.id}>
                        <select
                          className="input compact"
                          aria-label={`${c.name} state in ${s.title}`}
                          value={s.characterStates[c.id] ?? ''}
                          onChange={(e) => setCharState(s.id, c.id, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {c.states.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
