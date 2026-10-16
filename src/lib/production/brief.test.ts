import { describe, expect, it } from 'vitest'
import { makeT } from '../../i18n'
import { buildPlan, ENGINES } from './plan'
import { buildBrief, briefFileName } from './brief'
import { buildAgentPrompt } from './prompt'
import { asPT } from './render'
import { showcaseProject } from '../showcase'
import { sampleProject } from '../sample'

const show = showcaseProject()
const plan = buildPlan(show)
const tEn = asPT(makeT('en'))
const tTr = asPT(makeT('tr'))
const brief = (id: string, engine: 'unreal' | 'unity' = 'unreal', t = tEn) => buildBrief(plan, id, engine, t)!.markdown
const SECTIONS = ['project', 'goal', 'facts', 'inputs', 'proposed', 'approach', 'steps', 'deps', 'expected', 'edge', 'acceptance', 'limits', 'exclusions']

describe('implementation brief', () => {
  it('exists for every task, in both engines and both languages, with all required sections and no raw placeholders', () => {
    for (const e of ENGINES)
      for (const t of [tEn, tTr])
        for (const task of plan.tasks) {
          const b = buildBrief(plan, task.id, e, t)!
          expect(b.sections.map((s) => s.id)).toEqual(SECTIONS)
          expect(b.markdown).not.toMatch(/\{[a-zA-Z]+\}/)
          expect(b.markdown).toContain(task.id)
          for (const s of b.sections) expect(s.lines.length).toBeGreaterThan(0)
        }
    expect(buildBrief(plan, 'T-nope', 'unreal', tEn)).toBeNull()
  })

  it('is deterministic and does not mutate the plan', () => {
    const before = JSON.stringify(plan)
    const a = brief('T-sequence-seq_break')
    expect(brief('T-sequence-seq_break')).toBe(a)
    expect(JSON.stringify(plan)).toBe(before)
    expect(briefFileName('unity', 'T-level-s_a/b c')).toBe('brief-unity-T-level-s_a_b_c.md')
  })

  it('uses engine-specific vocabulary without cross-contamination', () => {
    const u = brief('T-level-s_cottage', 'unreal')
    const y = brief('T-level-s_cottage', 'unity')
    expect(u).toMatch(/Level/)
    expect(u).toContain('/Game/Maps/L_Cottage (authored reference, existence unverified)')
    expect(u).not.toMatch(/SceneManager|ScriptableObject|Assets\/Scenes/)
    expect(y).toMatch(/SceneManager/)
    expect(y).toContain('Assets/Scenes/SCottage.unity')
    expect(y).not.toMatch(/\/Game\/|Blueprint|GameInstance/)
    const ua = brief('T-audio-s_cottage', 'unreal')
    const ya = brief('T-audio-s_cottage', 'unity')
    expect(ua).toMatch(/MetaSound/)
    expect(ya).toMatch(/AudioMixer/)
    expect(ya).not.toMatch(/MetaSound/)
  })

  it('carries the exact authored data of a Sequence (stage order, Delay seconds, flag effects, Completed)', () => {
    const md = brief('T-sequence-seq_break')
    expect(md).toContain('Then 0: Event "Walls breathe" (evt_crack) [Threat] → Set Flag "Reality breaks" (set_broken) realityBroken = TRUE → Return 0')
    expect(md).toContain('Then 1: Delay "Held breath" (dly_beat) 3 s → Event "Silence falls" (evt_silence) [Relief] → Return 1')
    expect(md).toContain('Completed → Does Elena accept the truth? (if_free); followed only after Return 1, never earlier')
    expect(md.indexOf('Then 0:')).toBeLessThan(md.indexOf('Then 1:'))
    expect(md).toContain('never alternative branches')
  })

  it('carries Random probabilities, structured IF text, Delay and Event data', () => {
    const r = brief('T-random-rnd_door')
    expect(r).toContain('A 60% (Door opens) / B 40% (Door stays shut)')
    expect(r).toContain('design intent, not a guaranteed outcome')
    expect(r).toMatch(/Output A → Fog Road \(s_fog\)|Output A → Take the key/)
    const iff = brief('T-branch-if_expr')
    expect(iff).toContain('(foundKey is TRUE AND NOT (realityBroken is TRUE)) OR trustedChild is TRUE')
    expect(iff).toMatch(/Output TRUE → False Awakening \(s_wake\)/)
    expect(iff).toMatch(/Output FALSE → Ending: Absorbed \(s_end_absorbed\)/)
    expect(brief('T-branch-if_free')).toContain('Free-text note (assumption, not evaluated): Free-text design assumption')
    const d = brief('T-delay-dly_wait')
    expect(d).toContain('8 s of extra time between scenes (not an in-scene timer)')
    expect(brief('T-event-evt_bell')).toContain('Planning milestone, not an existing callback')
  })

  it('carries cinematic shots with direction notes, audio timing/space/fades/silence/assets, characters and triggers', () => {
    const c = brief('T-cinematic-s_cottage')
    expect(c).toContain('Shot Eyes open (sh_wake): starts 0:00, lasts 20 s, Close-up, Static')
    expect(c).toContain('player believes: Elena believes she is simply leaving home.')
    expect(c).toContain('actually: She has never left the village; the lane loops back.')
    const a = brief('T-audio-s_fog')
    expect(a).toContain('Cue Echo that follows (au_echo): SFX, Ambiguous, direction Moving, starts 1:00, lasts 40 s, level 6/10')
    expect(a).toContain('Dead air (au_dead): Silence')
    expect(a).toContain('authored silence')
    const aa = brief('T-assetAudio-s_cottage')
    expect(aa).toContain('fade in 4 s / out 0 s')
    expect(aa).toContain('asset: TBD — audio asset reference')
    const ch = brief('T-character-chr_watcher')
    expect(ch).toContain('State Hunting (st_hunt): aggression 9/10; behavior: Direct pursuit along the nearest path.')
    const tr = brief('T-trigger-s_cellar')
    expect(tr).toContain('Trigger The door that leads back (tg_door): Jumpscare, at 0:45 from the scene start, intensity 8/10, fires once')
  })

  it('lists dependencies with readiness, dependents, and missing vs confirm information', () => {
    const md = brief('T-audio-s_cottage')
    expect(md).toContain('T-assetAudio-s_cottage')
    expect(md).toContain('(Needs information)')
    const a = buildBrief(plan, 'T-assetAudio-s_cottage', 'unity', tEn)!
    expect(a.readiness.readiness).toBe('needsInfo')
    expect(a.markdown).toMatch(/Missing \(blocks readiness\)\*\*\n- TBD — audio asset reference/)
    expect(buildBrief(plan, 'T-level-s_cottage', 'unity', tEn)!.markdown).toMatch(/To confirm\*\*\n- TBD — the Unity scene path is a proposal/)
  })

  it('distinguishes authored facts, proposals and unresolved requirements and never claims existence', () => {
    const md = brief('T-level-s_cottage', 'unity')
    expect(md).toContain('## Authored facts (authoritative)')
    expect(md).toContain('## Proposed assets and classes (not existing)')
    expect(md).toContain('none of these names, folders or assets is known to exist')
    expect(md).toContain('Horror Director has no access to your engine project')
    expect(md).not.toMatch(/(has been|was) (implemented|completed)|(this|it) is (already )?(implemented|done)/i)
    expect(md).toContain('Implementation status: unknown')
  })

  it('includes every alternate ending, unreachable scene and incomplete branch in the verification briefs', () => {
    expect(plan.tasks.filter((t) => t.kind === 'verifyEnding').map((t) => t.id)).toEqual(expect.arrayContaining(['T-verifyEnding-s_end_absorbed', 'T-verifyEnding-s_end_escape', 'T-verifyEnding-s_end_wake']))
    const v = brief('T-verify-project')
    for (const e of ['s_end_absorbed', 's_end_escape', 's_end_wake']) expect(v).toContain(e)
    const p = structuredClone(show)
    p.scenes.push({ ...structuredClone(p.scenes[0]), id: 's_lost', title: 'Lost', triggers: [], shots: [], audioCues: [] })
    const q = buildPlan(p)
    expect(buildBrief(q, 'T-verify-project', 'unreal', tEn)!.markdown).toContain('Lost')
    expect(buildBrief(q, 'T-level-s_lost', 'unreal', tEn)!.markdown).toContain('not reachable from the start scene')
  })

  it('works for the legacy sample (no logic nodes, no flags)', () => {
    const q = buildPlan(sampleProject())
    for (const e of ENGINES) for (const t of q.tasks) expect(buildBrief(q, t.id, e, tEn)!.markdown.length).toBeGreaterThan(200)
  })
})

describe('coding agent prompt', () => {
  const b = buildBrief(plan, 'T-assetAudio-s_cottage', 'unreal', tEn)!
  const prompt = buildAgentPrompt(b, tEn)

  it('instructs the six steps and says Horror Director cannot see the engine project', () => {
    expect(prompt).toContain('inside the TARGET Unreal Engine 5.x')
    expect(prompt).toContain('cannot see or change this project')
    expect(prompt).toMatch(/1\. Inspect the existing .* project and its architecture first/)
    expect(prompt).toMatch(/2\. Verify the engine version and which assets, classes, scenes and paths really exist/)
    expect(prompt).toMatch(/3\. Implement ONLY this task/)
    expect(prompt).toMatch(/4\. Preserve the authored Horror Director behavior exactly/)
    expect(prompt).toMatch(/5\. Run the relevant engine-side tests or checks/)
    expect(prompt).toMatch(/6\. Finish with a report: changed files, assumptions you made, unresolved items/)
  })

  it('lists missing essential inputs instead of fabricating them, and only this task', () => {
    expect(prompt).toContain('Missing essential inputs (do NOT fabricate them')
    expect(prompt).toContain('TBD — audio asset reference')
    expect(prompt).toContain('T-assetAudio-s_cottage')
    expect(prompt).not.toContain('T-assetAudio-s_fog')
    expect(prompt).not.toContain('Church Cellar')
    expect(prompt).toContain('whether anything is already implemented in this project is unknown')
    expect(prompt).toContain('PROPOSAL')
  })

  it('says nothing is missing when the task is complete and renders in Turkish', () => {
    const ready = buildAgentPrompt(buildBrief(plan, 'T-level-s_cottage', 'unity', tEn)!, tEn)
    expect(ready).toContain('No essential authored input is missing')
    const tr = buildAgentPrompt(buildBrief(plan, 'T-random-rnd_door', 'unity', tTr)!, tTr)
    expect(tr).toContain('HEDEF Unity 6')
    expect(tr).not.toMatch(/\{[a-zA-Z]+\}/)
  })
})
