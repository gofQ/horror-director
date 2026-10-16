import type { Character, Flag, GraphComment, LogicNode, Project, Scene, SceneType, Transition } from './schema'
import type { DirectionText } from './showcase.text'
import { au, sc, sh, tg, tr } from './sample'
import { SHOWCASE_EN, type ShowcaseText } from './showcase.text'
import { SHOWCASE_TR } from './showcase.tr'

/**
 * "The Hollow Village" / "Boş Köy": a complete showcase that exercises every authoring feature (all five scene kinds, a
 * custom scene type, characters with states, triggers, shots, spatial audio, transition direction notes, a bounded loop,
 * structured IF, Set Flag, Event, Delay, Random Branch, one complete ordered Sequence, reroute points and comments).
 *
 * One graph, two languages: `buildShowcase` owns the structure (stable ids, positions, kinds, timings, enums, ports,
 * expressions, asset paths) and takes the human-readable authored text from a `ShowcaseText` dictionary. Schema-valid and
 * warning-free in both variants (pinned by `showcase.test.ts` / `showcase.i18n.test.ts`). The legacy `sampleProject()` is unchanged.
 */
export type ShowcaseLang = 'en' | 'tr'
export const SHOWCASE_NAME = SHOWCASE_EN.name
export const SHOWCASE_NAME_TR = SHOWCASE_TR.name
export const SHOWCASE_TEXT: Record<ShowcaseLang, ShowcaseText> = { en: SHOWCASE_EN, tr: SHOWCASE_TR }

const ln = (extra: Partial<LogicNode> & Pick<LogicNode, 'id' | 'type' | 'position'>): LogicNode => ({ title: '', description: '', condition: '', ...extra })

const link = (id: string, source: string, target: string, label: string, extra: Partial<Transition> = {}): Transition => ({
  ...tr(id, source, target, label),
  ...extra,
})

export function buildShowcase(L: ShowcaseText): Project {
  const F = L.flags
  const flags: Flag[] = [
    { id: 'flag_heard_bell', ...F.flag_heard_bell, defaultValue: false },
    { id: 'flag_found_key', ...F.flag_found_key, defaultValue: false },
    { id: 'flag_trusted_child', ...F.flag_trusted_child, defaultValue: false },
    { id: 'flag_reality_broken', ...F.flag_reality_broken, defaultValue: false },
  ]
  const C = L.characters
  const characters: Character[] = [
    {
      id: 'chr_elena',
      name: C.chr_elena.name,
      role: 'player',
      color: '#7dcfff',
      description: C.chr_elena.description,
      states: [
        { id: 'st_calm', ...C.chr_elena.states.st_calm, aggression: 0 },
        { id: 'st_uneasy', ...C.chr_elena.states.st_uneasy, aggression: 0 },
        { id: 'st_panic', ...C.chr_elena.states.st_panic, aggression: 0 },
      ],
    },
    {
      id: 'chr_watcher',
      name: C.chr_watcher.name,
      role: 'entity',
      color: '#c4263d',
      description: C.chr_watcher.description,
      states: [
        { id: 'st_dormant', ...C.chr_watcher.states.st_dormant, aggression: 0 },
        { id: 'st_stalk', ...C.chr_watcher.states.st_stalk, aggression: 5 },
        { id: 'st_hunt', ...C.chr_watcher.states.st_hunt, aggression: 9 },
      ],
    },
    {
      id: 'chr_mara',
      name: C.chr_mara.name,
      role: 'npc',
      color: '#bb9af7',
      description: C.chr_mara.description,
      states: [
        { id: 'st_guide', ...C.chr_mara.states.st_guide, aggression: 0 },
        { id: 'st_mislead', ...C.chr_mara.states.st_mislead, aggression: 2 },
      ],
    },
  ]
  const sceneTypes: SceneType[] = [{ id: 'st_liminal', ...L.sceneType, color: '#7dcfff', icon: 'Wind', baseKind: 'dream' }]

  const S = L.scenes
  const scenes: Scene[] = [
    sc('s_cottage', S.s_cottage.title, 'reality', 0, 200, {
      description: S.s_cottage.description,
      unrealLevel: '/Game/Maps/L_Cottage',
      ambience: S.s_cottage.ambience,
      duration: 90,
      characterStates: { chr_elena: 'st_calm', chr_watcher: 'st_dormant' },
      triggers: [
        tg('tg_kettle', S.s_cottage.triggers.tg_kettle.name, 'environment', 30, 3, S.s_cottage.triggers.tg_kettle.description),
        tg('tg_window', S.s_cottage.triggers.tg_window.name, 'visual', 70, 5, S.s_cottage.triggers.tg_window.description),
      ],
      shots: [
        sh('sh_wake', S.s_cottage.shots.sh_wake.title, 0, 20, 'close-up', 'static', 'none', S.s_cottage.shots.sh_wake.sound, S.s_cottage.shots.sh_wake.visual),
        sh('sh_door', S.s_cottage.shots.sh_door.title, 40, 25, 'wide', 'tracking', 'none', S.s_cottage.shots.sh_door.sound, S.s_cottage.shots.sh_door.visual),
      ],
      audioCues: [
        au('au_birds', S.s_cottage.cues.au_birds.title, 0, 40, 'ambience', 'above', 'diegetic', { level: 4, loop: true, notes: S.s_cottage.cues.au_birds.notes }),
        au('au_hum', S.s_cottage.cues.au_hum.title, 55, 30, 'whisper', 'behind', 'ambiguous', { level: 3, fadeIn: 4, notes: S.s_cottage.cues.au_hum.notes }),
      ],
    }),
    sc('s_square', S.s_square.title, 'reality', 330, 200, {
      description: S.s_square.description,
      unrealLevel: '/Game/Maps/L_Square',
      ambience: S.s_square.ambience,
      duration: 100,
      characterStates: { chr_elena: 'st_uneasy', chr_watcher: 'st_stalk' },
      triggers: [tg('tg_stare', S.s_square.triggers.tg_stare.name, 'narrative', 80, 6, S.s_square.triggers.tg_stare.description)],
      shots: [
        sh('sh_square', S.s_square.shots.sh_square.title, 0, 40, 'medium', 'handheld', 'none', S.s_square.shots.sh_square.sound, S.s_square.shots.sh_square.visual),
        sh('sh_bell', S.s_square.shots.sh_bell.title, 60, 25, 'wide', 'tilt', 'impossible-space', S.s_square.shots.sh_bell.sound, S.s_square.shots.sh_bell.visual),
      ],
      audioCues: [au('au_chime', S.s_square.cues.au_chime.title, 0, 60, 'ambience', 'left', 'diegetic', { level: 4, loop: true })],
    }),
    sc('s_fog', S.s_fog.title, 'dream', 1960, 60, {
      typeId: 'st_liminal',
      description: S.s_fog.description,
      unrealLevel: '/Game/Maps/L_FogRoad',
      ambience: S.s_fog.ambience,
      duration: 120,
      characterStates: { chr_elena: 'st_uneasy', chr_watcher: 'st_stalk' },
      triggers: [
        tg('tg_key', S.s_fog.triggers.tg_key.name, 'narrative', 25, 2, S.s_fog.triggers.tg_key.description),
        tg('tg_follow', S.s_fog.triggers.tg_follow.name, 'audio', 70, 6, S.s_fog.triggers.tg_follow.description),
      ],
      shots: [
        sh('sh_fog', S.s_fog.shots.sh_fog.title, 0, 40, 'pov', 'tracking', 'impossible-space', S.s_fog.shots.sh_fog.sound, S.s_fog.shots.sh_fog.visual),
        sh('sh_turn', S.s_fog.shots.sh_turn.title, 70, 20, 'medium', 'pan', 'false-awakening', S.s_fog.shots.sh_turn.sound, S.s_fog.shots.sh_turn.visual),
      ],
      audioCues: [
        au('au_echo', S.s_fog.cues.au_echo.title, 60, 40, 'sfx', 'moving', 'ambiguous', { level: 6, notes: S.s_fog.cues.au_echo.notes }),
        au('au_dead', S.s_fog.cues.au_dead.title, 40, 10, 'silence', 'nonspatial', 'non-diegetic', { level: 0, notes: S.s_fog.cues.au_dead.notes }),
      ],
    }),
    sc('s_cellar', S.s_cellar.title, 'nightmare', 2260, 60, {
      description: S.s_cellar.description,
      unrealLevel: '/Game/Maps/L_Cellar',
      ambience: S.s_cellar.ambience,
      duration: 140,
      loop: { enabled: true, maxIterations: 3, exitCondition: S.s_cellar.exit ?? '' },
      characterStates: { chr_elena: 'st_panic', chr_watcher: 'st_hunt', chr_mara: 'st_guide' },
      triggers: [
        tg('tg_door', S.s_cellar.triggers.tg_door.name, 'jumpscare', 45, 8, S.s_cellar.triggers.tg_door.description),
        tg('tg_count', S.s_cellar.triggers.tg_count.name, 'audio', 100, 5, S.s_cellar.triggers.tg_count.description),
      ],
      shots: [sh('sh_cellar', S.s_cellar.shots.sh_cellar.title, 0, 50, 'wide', 'handheld', 'impossible-space', S.s_cellar.shots.sh_cellar.sound, S.s_cellar.shots.sh_cellar.visual)],
      audioCues: [
        au('au_heart', S.s_cellar.cues.au_heart.title, 0, 140, 'sfx', 'nonspatial', 'non-diegetic', { level: 5, loop: true, notes: S.s_cellar.cues.au_heart.notes }),
        au('au_count', S.s_cellar.cues.au_count.title, 100, 30, 'voice', 'right', 'ambiguous', { level: 5, fadeIn: 2 }),
      ],
    }),
    sc('s_child', S.s_child.title, 'memory', 2860, 200, {
      description: S.s_child.description,
      unrealLevel: '/Game/Maps/L_ChildRoom',
      ambience: S.s_child.ambience,
      duration: 110,
      characterStates: { chr_elena: 'st_uneasy', chr_mara: 'st_mislead' },
      triggers: [tg('tg_box', S.s_child.triggers.tg_box.name, 'audio', 60, 4, S.s_child.triggers.tg_box.description)],
      shots: [sh('sh_room', S.s_child.shots.sh_room.title, 0, 45, 'medium', 'static', 'match-cut', S.s_child.shots.sh_room.sound, S.s_child.shots.sh_room.visual)],
      audioCues: [au('au_box', S.s_child.cues.au_box.title, 0, 80, 'music', 'front', 'diegetic', { level: 4, loop: true })],
    }),
    sc('s_wake', S.s_wake.title, 'reality', 3460, 100, {
      description: S.s_wake.description,
      unrealLevel: '/Game/Maps/L_Cottage_Wrong',
      ambience: S.s_wake.ambience,
      duration: 80,
      characterStates: { chr_elena: 'st_calm', chr_watcher: 'st_stalk' },
      triggers: [tg('tg_crack', S.s_wake.triggers.tg_crack.name, 'visual', 50, 7, S.s_wake.triggers.tg_crack.description)],
      shots: [sh('sh_wake2', S.s_wake.shots.sh_wake2.title, 0, 30, 'close-up', 'static', 'false-awakening', S.s_wake.shots.sh_wake2.sound, S.s_wake.shots.sh_wake2.visual)],
    }),
    sc('s_end_escape', S.s_end_escape.title, 'ending', 4400, 260, {
      description: S.s_end_escape.description,
      duration: 60,
      characterStates: { chr_elena: 'st_calm' },
      triggers: [tg('tg_dawn', S.s_end_escape.triggers.tg_dawn.name, 'narrative', 20, 2, S.s_end_escape.triggers.tg_dawn.description)],
    }),
    sc('s_end_wake', S.s_end_wake.title, 'ending', 4400, 440, {
      description: S.s_end_wake.description,
      duration: 60,
      triggers: [tg('tg_cut', S.s_end_wake.triggers.tg_cut.name, 'narrative', 40, 3, S.s_end_wake.triggers.tg_cut.description)],
    }),
    sc('s_end_absorbed', S.s_end_absorbed.title, 'ending', 3460, 380, {
      description: S.s_end_absorbed.description,
      duration: 60,
      characterStates: { chr_watcher: 'st_hunt' },
      triggers: [tg('tg_absorb', S.s_end_absorbed.triggers.tg_absorb.name, 'jumpscare', 30, 9, S.s_end_absorbed.triggers.tg_absorb.description)],
    }),
  ]

  const N = L.nodes
  const logicNodes: LogicNode[] = [
    ln({ id: 'evt_bell', type: 'event', title: N.evt_bell.title, description: N.evt_bell.description, eventCategory: 'reveal', position: { x: 660, y: 220 } }),
    ln({ id: 'set_heard', type: 'setFlag', title: N.set_heard.title, flagId: 'flag_heard_bell', value: true, position: { x: 900, y: 220 } }),
    ln({ id: 'dly_wait', type: 'delay', title: N.dly_wait.title, description: N.dly_wait.description, seconds: 8, position: { x: 1140, y: 220 } }),
    ln({ id: 'rnd_door', type: 'random', title: N.rnd_door.title, description: N.rnd_door.description, probabilityA: 60, labelA: N.rnd_door.labelA, labelB: N.rnd_door.labelB, position: { x: 1400, y: 200 } }),
    ln({ id: 'set_key', type: 'setFlag', title: N.set_key.title, flagId: 'flag_found_key', value: true, position: { x: 1700, y: 80 } }),
    ln({ id: 'set_trust', type: 'setFlag', title: N.set_trust.title, flagId: 'flag_trusted_child', value: true, position: { x: 2560, y: 80 } }),
    ln({
      id: 'if_expr',
      type: 'branch',
      title: N.if_expr.title,
      description: N.if_expr.description,
      expression: {
        op: 'or',
        args: [
          { op: 'and', args: [{ op: 'flag', flagId: 'flag_found_key', is: true }, { op: 'not', arg: { op: 'flag', flagId: 'flag_reality_broken', is: true } }] },
          { op: 'flag', flagId: 'flag_trusted_child', is: true },
        ],
      },
      position: { x: 3160, y: 220 },
    }),
    ln({ id: 'seq_break', type: 'sequence', title: N.seq_break.title, description: N.seq_break.description, position: { x: 3760, y: 120 } }),
    ln({ id: 'evt_crack', type: 'event', title: N.evt_crack.title, eventCategory: 'threat', position: { x: 4040, y: -100 } }),
    ln({ id: 'set_broken', type: 'setFlag', title: N.set_broken.title, flagId: 'flag_reality_broken', value: true, position: { x: 4300, y: -100 } }),
    ln({ id: 'ret_0', type: 'seqReturn', title: N.ret_0.title, sequenceId: 'seq_break', stage: 0, position: { x: 4560, y: -100 } }),
    ln({ id: 'dly_beat', type: 'delay', title: N.dly_beat.title, seconds: 3, position: { x: 4040, y: 60 } }),
    ln({ id: 'evt_silence', type: 'event', title: N.evt_silence.title, eventCategory: 'relief', position: { x: 4300, y: 60 } }),
    ln({ id: 'ret_1', type: 'seqReturn', title: N.ret_1.title, sequenceId: 'seq_break', stage: 1, position: { x: 4560, y: 60 } }),
    ln({ id: 'if_free', type: 'branch', title: N.if_free.title, condition: N.if_free.condition ?? '', position: { x: 4040, y: 300 } }),
  ]

  const K = L.links
  const lbl = (id: string) => K[id]?.label ?? ''
  const dir = (id: string, extra: Pick<NonNullable<Transition['direction']>, 'technique' | 'sourceShotId' | 'targetShotId'>): { direction: NonNullable<Transition['direction']> } => ({
    direction: { ...extra, ...(K[id].direction as DirectionText) },
  })
  const transitions: Transition[] = [
    link('e1', 's_cottage', 's_square', lbl('e1'), { style: 'fade', ...dir('e1', { technique: 'match-cut', sourceShotId: 'sh_door', targetShotId: 'sh_square' }) }),
    link('e2', 's_square', 'evt_bell', lbl('e2'), { waypoints: [{ x: 560, y: 160 }] }),
    link('e3', 'evt_bell', 'set_heard', ''),
    link('e4', 'set_heard', 'dly_wait', ''),
    link('e5', 'dly_wait', 'rnd_door', ''),
    link('e6', 'rnd_door', 'set_key', lbl('e6'), { sourcePort: 'a' }),
    link('e7', 'rnd_door', 's_child', lbl('e7'), { sourcePort: 'b', waypoints: [{ x: 1700, y: 420 }, { x: 2700, y: 420 }] }),
    link('e8', 'set_key', 's_fog', ''),
    link('e9', 's_fog', 's_cellar', lbl('e9'), { style: 'glitch', ...dir('e9', { technique: 'impossible-space', sourceShotId: 'sh_turn', targetShotId: 'sh_cellar' }) }),
    link('e10', 's_cellar', 's_cellar', lbl('e10'), { style: 'loopback', condition: K.e10.condition ?? '' }),
    link('e11', 's_cellar', 'set_trust', lbl('e11'), { style: 'fade', condition: K.e11.condition ?? '' }),
    link('e12', 'set_trust', 's_child', ''),
    link('e13', 's_child', 'if_expr', lbl('e13'), { waypoints: [{ x: 3040, y: 140 }] }),
    link('e14', 'if_expr', 's_wake', lbl('e14'), { sourcePort: 'true' }),
    link('e15', 'if_expr', 's_end_absorbed', lbl('e15'), { sourcePort: 'false' }),
    link('e16', 's_wake', 'seq_break', lbl('e16'), { style: 'fade' }),
    link('e17', 'seq_break', 'evt_crack', '', { sourcePort: 'then0' }),
    link('e18', 'evt_crack', 'set_broken', ''),
    link('e19', 'set_broken', 'ret_0', ''),
    link('e20', 'seq_break', 'dly_beat', '', { sourcePort: 'then1' }),
    link('e21', 'dly_beat', 'evt_silence', ''),
    link('e22', 'evt_silence', 'ret_1', ''),
    link('e23', 'seq_break', 'if_free', '', { sourcePort: 'completed' }),
    link('e24', 'if_free', 's_end_escape', lbl('e24'), { sourcePort: 'true', style: 'fade' }),
    link('e25', 'if_free', 's_end_wake', lbl('e25'), { sourcePort: 'false', style: 'blackout' }),
  ]

  const M = L.comments
  const comments: GraphComment[] = [
    { id: 'note_guide', ...M.note_guide, color: '#7dcfff', position: { x: -20, y: 20 }, width: 560, height: 120 },
    { id: 'note_gate', ...M.note_gate, color: '#e0af68', position: { x: 3100, y: 360 }, width: 300, height: 140 },
    { id: 'note_seq', ...M.note_seq, color: '#9ece6a', position: { x: 3980, y: -200 }, width: 700, height: 100 },
  ]

  return {
    name: L.name,
    description: L.description,
    startSceneId: 's_cottage',
    scenes,
    transitions,
    logicNodes,
    comments,
    sceneTypes,
    flags,
    characters,
  }
}

/** The showcase project in the chosen language (a fresh object every call). English is the default. */
export const showcaseProject = (lang: ShowcaseLang = 'en'): Project => buildShowcase(SHOWCASE_TEXT[lang])

const SHOWCASE_IDS = ['s_cottage', 's_square', 's_fog', 's_cellar', 's_child', 's_wake']
/** Is this the showcase (either language)? Stable ids only; no persisted marker. */
export function isShowcase(p: Pick<Project, 'scenes'>): boolean {
  const ids = new Set(p.scenes.map((s) => s.id))
  return SHOWCASE_IDS.every((id) => ids.has(id))
}

/**
 * Which language variant of the showcase is this? Detected from the untouched authored titles (no persisted language
 * field): the project name or the first two scene titles equal the Turkish text. Anything else showcase-shaped is English.
 */
export function showcaseVariant(p: Pick<Project, 'scenes'> & { name?: string }): ShowcaseLang | null {
  if (!isShowcase(p)) return null
  const title = (id: string) => p.scenes.find((s) => s.id === id)?.title
  const tr = SHOWCASE_TR
  return p.name === tr.name || title('s_cottage') === tr.scenes.s_cottage.title || title('s_square') === tr.scenes.s_square.title ? 'tr' : 'en'
}
