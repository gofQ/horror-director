import type { Character, Flag, GraphComment, LogicNode, Project, Scene, SceneType, Transition } from './schema'
import { au, sc, sh, tg, tr } from './sample'

/**
 * "The Hollow Village": a complete showcase that exercises every authoring feature (all five scene kinds, a custom
 * scene type, characters with states, triggers, shots, spatial audio, transition direction notes, a bounded loop,
 * structured IF, Set Flag, Event, Delay, Random Branch, one complete ordered Sequence, reroute points and comments).
 * Stable ids; schema-valid and warning-free (pinned by `showcase.test.ts`). The legacy `sampleProject()` is unchanged.
 */
export const SHOWCASE_NAME = 'The Hollow Village (Showcase)'

const flags: Flag[] = [
  { id: 'flag_heard_bell', name: 'heardBell', description: 'The player heard the church bell.', defaultValue: false },
  { id: 'flag_found_key', name: 'foundKey', description: 'The player took the iron key from the fog.', defaultValue: false },
  { id: 'flag_trusted_child', name: 'trustedChild', description: 'The player followed the child’s counting game.', defaultValue: false },
  { id: 'flag_reality_broken', name: 'realityBroken', description: 'The false awakening has shattered.', defaultValue: false },
]

const characters: Character[] = [
  {
    id: 'chr_elena',
    name: 'Elena',
    role: 'player',
    color: '#7dcfff',
    description: 'A returning villager who cannot remember leaving.',
    states: [
      { id: 'st_calm', name: 'Calm', behavior: 'Walks normally, trusts what she sees.', aggression: 0 },
      { id: 'st_uneasy', name: 'Uneasy', behavior: 'Slower pace, glances over her shoulder.', aggression: 0 },
      { id: 'st_panic', name: 'Panicking', behavior: 'Sprints, camera shakes, breathing audible.', aggression: 0 },
    ],
  },
  {
    id: 'chr_watcher',
    name: 'The Watcher',
    role: 'entity',
    color: '#c4263d',
    description: 'A figure that is only ever seen at the edge of vision.',
    states: [
      { id: 'st_dormant', name: 'Dormant', behavior: 'Standing still far away, never approaches.', aggression: 0 },
      { id: 'st_stalk', name: 'Stalking', behavior: 'Moves only while the player looks away.', aggression: 5 },
      { id: 'st_hunt', name: 'Hunting', behavior: 'Direct pursuit along the nearest path.', aggression: 9 },
    ],
  },
  {
    id: 'chr_mara',
    name: 'Mara',
    role: 'npc',
    color: '#bb9af7',
    description: 'A child from a memory who guides or misleads.',
    states: [
      { id: 'st_guide', name: 'Guiding', behavior: 'Hums a lullaby and leads toward the exit.', aggression: 0 },
      { id: 'st_mislead', name: 'Misleading', behavior: 'Points the wrong way, laughs out of sync.', aggression: 2 },
    ],
  },
]

const sceneTypes: SceneType[] = [
  { id: 'st_liminal', name: 'Liminal', color: '#7dcfff', icon: 'Wind', baseKind: 'dream', description: 'Half-real spaces where geometry quietly disagrees with itself.' },
]

const ln = (extra: Partial<LogicNode> & Pick<LogicNode, 'id' | 'type' | 'position'>): LogicNode => ({ title: '', description: '', condition: '', ...extra })

const link = (id: string, source: string, target: string, label: string, extra: Partial<Transition> = {}): Transition => ({
  ...tr(id, source, target, label),
  ...extra,
})

export function showcaseProject(): Project {
  const scenes: Scene[] = [
    sc('s_cottage', 'Cottage Morning', 'reality', 0, 200, {
      description: 'Elena wakes in her childhood cottage. Everything is exactly where she left it.',
      unrealLevel: '/Game/Maps/L_Cottage',
      ambience: 'Wood creaks, a kettle ticks as it cools',
      duration: 90,
      characterStates: { chr_elena: 'st_calm', chr_watcher: 'st_dormant' },
      triggers: [
        tg('tg_kettle', 'Kettle whistles with no heat', 'environment', 30, 3, 'The kettle sings although the stove is cold.'),
        tg('tg_window', 'Figure in the window', 'visual', 70, 5, 'A still silhouette stands at the end of the lane.'),
      ],
      shots: [
        sh('sh_wake', 'Eyes open', 0, 20, 'close-up', 'static', 'none', 'Birdsong that loops too evenly.', 'Soft morning light across a pillow.'),
        sh('sh_door', 'Out of the door', 40, 25, 'wide', 'tracking', 'none', 'Door latch, then silence.', 'The lane is empty; every window is dark.'),
      ],
      audioCues: [
        au('au_birds', 'Looping birdsong', 0, 40, 'ambience', 'above', 'diegetic', { level: 4, loop: true, notes: 'The loop point should be just audible.' }),
        au('au_hum', 'Lullaby under the floor', 55, 30, 'whisper', 'behind', 'ambiguous', { level: 3, fadeIn: 4, notes: 'Mara’s voice, too quiet to be sure.' }),
      ],
    }),
    sc('s_square', 'Village Square', 'reality', 330, 200, {
      description: 'The square is full of villagers who do not turn their heads. The church bell is about to ring.',
      unrealLevel: '/Game/Maps/L_Square',
      ambience: 'Wind, distant chimes, no voices',
      duration: 100,
      characterStates: { chr_elena: 'st_uneasy', chr_watcher: 'st_stalk' },
      triggers: [tg('tg_stare', 'Villagers turn together', 'narrative', 80, 6, 'Every head turns at once when the bell starts.')],
      shots: [
        sh('sh_square', 'Crowd that does not react', 0, 40, 'medium', 'handheld', 'none', 'Shuffling steps, no speech.', 'Faces just out of focus.'),
        sh('sh_bell', 'Bell tower', 60, 25, 'wide', 'tilt', 'impossible-space', 'The bell rings once, a half-tone flat.', 'The tower is taller than it should be.'),
      ],
      audioCues: [au('au_chime', 'Distant chimes', 0, 60, 'ambience', 'left', 'diegetic', { level: 4, loop: true })],
    }),
    sc('s_fog', 'Fog Road', 'dream', 1960, 60, {
      typeId: 'st_liminal',
      description: 'A road that was not there. The fog hides the edges; the key is lying in the middle of it.',
      unrealLevel: '/Game/Maps/L_FogRoad',
      ambience: 'Muffled footsteps, low drone',
      duration: 120,
      characterStates: { chr_elena: 'st_uneasy', chr_watcher: 'st_stalk' },
      triggers: [
        tg('tg_key', 'The iron key', 'narrative', 25, 2, 'A glint on the ground; picking it up is the player’s choice.'),
        tg('tg_follow', 'Footsteps that match hers', 'audio', 70, 6, 'The echo continues one step after Elena stops.'),
      ],
      shots: [
        sh('sh_fog', 'Walking into the fog', 0, 40, 'pov', 'tracking', 'impossible-space', 'Footsteps echo without a surface.', 'The road bends where no bend exists.'),
        sh('sh_turn', 'Turning back', 70, 20, 'medium', 'pan', 'false-awakening', 'Sudden silence, then breath.', 'The cottage stands where the road should be.'),
      ],
      audioCues: [
        au('au_echo', 'Echo that follows', 60, 40, 'sfx', 'moving', 'ambiguous', { level: 6, notes: 'Pans from behind to the left.' }),
        au('au_dead', 'Dead air', 40, 10, 'silence', 'nonspatial', 'non-diegetic', { level: 0, notes: 'Everything cuts out before the echo starts.' }),
      ],
    }),
    sc('s_cellar', 'Church Cellar', 'nightmare', 2260, 60, {
      description: 'Doors repeat. A wrong turn walks Elena back into the same cellar; counting with Mara is the way out.',
      unrealLevel: '/Game/Maps/L_Cellar',
      ambience: 'Dripping, stone echo, a slow heartbeat',
      duration: 140,
      loop: { enabled: true, maxIterations: 3, exitCondition: 'Elena closes her eyes and counts to ten with Mara.' },
      characterStates: { chr_elena: 'st_panic', chr_watcher: 'st_hunt', chr_mara: 'st_guide' },
      triggers: [
        tg('tg_door', 'The door that leads back', 'jumpscare', 45, 8, 'The correct-looking door opens onto the same cellar.'),
        tg('tg_count', 'Mara starts counting', 'audio', 100, 5, 'A small voice counts down from ten.'),
      ],
      shots: [sh('sh_cellar', 'Doors in a row', 0, 50, 'wide', 'handheld', 'impossible-space', 'Heartbeat under dripping water.', 'A corridor of identical doors.')],
      audioCues: [
        au('au_heart', 'Heartbeat', 0, 140, 'sfx', 'nonspatial', 'non-diegetic', { level: 5, loop: true, notes: 'Speeds up on every loop iteration.' }),
        au('au_count', 'Child counting', 100, 30, 'voice', 'right', 'ambiguous', { level: 5, fadeIn: 2 }),
      ],
    }),
    sc('s_child', 'Child’s Room', 'memory', 2860, 200, {
      description: 'A memory of the room Elena grew up in. Mara sits on the bed and asks her to remember what happened.',
      unrealLevel: '/Game/Maps/L_ChildRoom',
      ambience: 'Music box, warm tungsten hum',
      duration: 110,
      characterStates: { chr_elena: 'st_uneasy', chr_mara: 'st_mislead' },
      triggers: [tg('tg_box', 'Music box stops', 'audio', 60, 4, 'The tune stops one note short of the end.')],
      shots: [sh('sh_room', 'Mara on the bed', 0, 45, 'medium', 'static', 'match-cut', 'Music box, off-key.', 'Warm light that does not match the rest of the village.')],
      audioCues: [au('au_box', 'Music box', 0, 80, 'music', 'front', 'diegetic', { level: 4, loop: true })],
    }),
    sc('s_wake', 'False Awakening', 'reality', 3460, 100, {
      description: 'Elena wakes in the cottage again. The world looks right. It is not.',
      unrealLevel: '/Game/Maps/L_Cottage_Wrong',
      ambience: 'Room tone, too quiet',
      duration: 80,
      characterStates: { chr_elena: 'st_calm', chr_watcher: 'st_stalk' },
      triggers: [tg('tg_crack', 'A crack in the plaster', 'visual', 50, 7, 'A thin crack runs across the ceiling and keeps growing.')],
      shots: [sh('sh_wake2', 'Second waking', 0, 30, 'close-up', 'static', 'false-awakening', 'Same birdsong, one bar later.', 'The pillow is still warm from the first morning.')],
    }),
    sc('s_end_escape', 'Ending: Escape', 'ending', 4400, 260, {
      description: 'Elena accepts the truth and walks out through the broken wall.',
      duration: 60,
      characterStates: { chr_elena: 'st_calm' },
      triggers: [tg('tg_dawn', 'Real dawn', 'narrative', 20, 2, 'Genuine daylight, no loops.')],
    }),
    sc('s_end_wake', 'Ending: Awakening', 'ending', 4400, 440, {
      description: 'Elena refuses the truth and wakes — outside the village, years later.',
      duration: 60,
      triggers: [tg('tg_cut', 'Cut to black', 'narrative', 40, 3, 'The cottage is gone from the horizon.')],
    }),
    sc('s_end_absorbed', 'Ending: Absorbed', 'ending', 3460, 380, {
      description: 'Without the key or Mara’s trust, the village closes around Elena.',
      duration: 60,
      characterStates: { chr_watcher: 'st_hunt' },
      triggers: [tg('tg_absorb', 'The village closes in', 'jumpscare', 30, 9, 'Every door in the square opens at once.')],
    }),
  ]

  const logicNodes: LogicNode[] = [
    ln({ id: 'evt_bell', type: 'event', title: 'Bell tolls', description: 'Planning milestone: the church bell rings and the crowd turns.', eventCategory: 'reveal', position: { x: 660, y: 220 } }),
    ln({ id: 'set_heard', type: 'setFlag', title: 'Remember the bell', flagId: 'flag_heard_bell', value: true, position: { x: 900, y: 220 } }),
    ln({ id: 'dly_wait', type: 'delay', title: 'Walk to the door', description: 'Time passes between the square and the door.', seconds: 8, position: { x: 1140, y: 220 } }),
    ln({ id: 'rnd_door', type: 'random', title: 'Does the door open?', description: 'Authored design intent: the door usually opens.', probabilityA: 60, labelA: 'Door opens', labelB: 'Door stays shut', position: { x: 1400, y: 200 } }),
    ln({ id: 'set_key', type: 'setFlag', title: 'Take the key', flagId: 'flag_found_key', value: true, position: { x: 1700, y: 80 } }),
    ln({ id: 'set_trust', type: 'setFlag', title: 'Trust Mara', flagId: 'flag_trusted_child', value: true, position: { x: 2560, y: 80 } }),
    ln({
      id: 'if_expr',
      type: 'branch',
      title: 'Did Elena earn the way out?',
      description: 'Structured condition: (foundKey AND NOT realityBroken) OR trustedChild.',
      expression: {
        op: 'or',
        args: [
          { op: 'and', args: [{ op: 'flag', flagId: 'flag_found_key', is: true }, { op: 'not', arg: { op: 'flag', flagId: 'flag_reality_broken', is: true } }] },
          { op: 'flag', flagId: 'flag_trusted_child', is: true },
        ],
      },
      position: { x: 3160, y: 220 },
    }),
    ln({ id: 'seq_break', type: 'sequence', title: 'Reality Break', description: 'Stage 0: the walls crack. Stage 1: silence falls. Then the story continues.', position: { x: 3760, y: 120 } }),
    ln({ id: 'evt_crack', type: 'event', title: 'Walls breathe', eventCategory: 'threat', position: { x: 4040, y: -100 } }),
    ln({ id: 'set_broken', type: 'setFlag', title: 'Reality breaks', flagId: 'flag_reality_broken', value: true, position: { x: 4300, y: -100 } }),
    ln({ id: 'ret_0', type: 'seqReturn', title: 'Return 0', sequenceId: 'seq_break', stage: 0, position: { x: 4560, y: -100 } }),
    ln({ id: 'dly_beat', type: 'delay', title: 'Held breath', seconds: 3, position: { x: 4040, y: 60 } }),
    ln({ id: 'evt_silence', type: 'event', title: 'Silence falls', eventCategory: 'relief', position: { x: 4300, y: 60 } }),
    ln({ id: 'ret_1', type: 'seqReturn', title: 'Return 1', sequenceId: 'seq_break', stage: 1, position: { x: 4560, y: 60 } }),
    ln({ id: 'if_free', type: 'branch', title: 'Does Elena accept the truth?', condition: 'Free-text design assumption: player accepts Mara’s story (not evaluated).', position: { x: 4040, y: 300 } }),
  ]

  const dir = (extra: NonNullable<Transition['direction']>) => ({ direction: extra })
  const transitions: Transition[] = [
    link('e1', 's_cottage', 's_square', 'Step outside', {
      style: 'fade',
      ...dir({
        technique: 'match-cut',
        playerBelief: 'Elena believes she is simply leaving home.',
        reality: 'She has never left the village; the lane loops back.',
        visualContinuity: 'Door frame matches the arch of the square.',
        audioContinuity: 'Latch sound bridges into the chimes.',
        reveal: 'The window silhouette is already in the square.',
        unrealNotes: '',
        sourceShotId: 'sh_door',
        targetShotId: 'sh_square',
      }),
    }),
    link('e2', 's_square', 'evt_bell', 'Bell rings', {
      waypoints: [{ x: 560, y: 160 }],
    }),
    link('e3', 'evt_bell', 'set_heard', ''),
    link('e4', 'set_heard', 'dly_wait', ''),
    link('e5', 'dly_wait', 'rnd_door', ''),
    link('e6', 'rnd_door', 'set_key', 'Door opens', { sourcePort: 'a' }),
    link('e7', 'rnd_door', 's_child', 'Door stays shut', { sourcePort: 'b', waypoints: [{ x: 1700, y: 420 }, { x: 2700, y: 420 }] }),
    link('e8', 'set_key', 's_fog', ''),
    link('e9', 's_fog', 's_cellar', 'Follow the echo', {
      style: 'glitch',
      ...dir({
        technique: 'impossible-space',
        playerBelief: 'Elena thinks she is retracing her steps.',
        reality: 'The road ends in the church cellar.',
        visualContinuity: 'Fog thins into cellar steam.',
        audioContinuity: 'The echo becomes dripping water.',
        reveal: 'The cellar door is the cottage door.',
        unrealNotes: 'Reuse the cottage door asset (TBD).',
        sourceShotId: 'sh_turn',
        targetShotId: 'sh_cellar',
      }),
    }),
    link('e10', 's_cellar', 's_cellar', 'Wrong door', { style: 'loopback', condition: 'Fail the counting step' }),
    link('e11', 's_cellar', 'set_trust', 'Close eyes & count', { style: 'fade', condition: 'Exit condition met' }),
    link('e12', 'set_trust', 's_child', ''),
    link('e13', 's_child', 'if_expr', 'Mara asks you to remember', { waypoints: [{ x: 3040, y: 140 }] }),
    link('e14', 'if_expr', 's_wake', 'Way out earned', { sourcePort: 'true' }),
    link('e15', 'if_expr', 's_end_absorbed', 'No key, no trust', { sourcePort: 'false' }),
    link('e16', 's_wake', 'seq_break', 'The crack grows', { style: 'fade' }),
    link('e17', 'seq_break', 'evt_crack', '', { sourcePort: 'then0' }),
    link('e18', 'evt_crack', 'set_broken', ''),
    link('e19', 'set_broken', 'ret_0', ''),
    link('e20', 'seq_break', 'dly_beat', '', { sourcePort: 'then1' }),
    link('e21', 'dly_beat', 'evt_silence', ''),
    link('e22', 'evt_silence', 'ret_1', ''),
    link('e23', 'seq_break', 'if_free', '', { sourcePort: 'completed' }),
    link('e24', 'if_free', 's_end_escape', 'Accept the truth', { sourcePort: 'true', style: 'fade' }),
    link('e25', 'if_free', 's_end_wake', 'Refuse the truth', { sourcePort: 'false', style: 'blackout' }),
  ]

  const comments: GraphComment[] = [
    { id: 'note_guide', title: 'Start here', text: 'Cottage → Square → Event → Delay → Random door. Hover nodes and open the Inspector.', color: '#7dcfff', position: { x: -20, y: 20 }, width: 560, height: 120 },
    { id: 'note_gate', title: 'Flag gate', text: 'The IF reads foundKey, realityBroken and trustedChild. Take the Door-opens path to see it pass.', color: '#e0af68', position: { x: 3100, y: 360 }, width: 300, height: 140 },
    { id: 'note_seq', title: 'Ordered Sequence', text: 'Then 0 runs fully, returns, then Then 1 runs. Completed continues the story.', color: '#9ece6a', position: { x: 3980, y: -200 }, width: 700, height: 100 },
  ]

  return {
    name: SHOWCASE_NAME,
    description: 'A village, a false awakening and a reality-breaking event. Demonstrates every authoring feature.',
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

/** Is this the showcase? (stable ids only; no persisted marker) */
export function isShowcase(p: Pick<Project, 'scenes'>): boolean {
  const ids = new Set(p.scenes.map((s) => s.id))
  return ['s_cottage', 's_square', 's_fog', 's_cellar', 's_child', 's_wake'].every((id) => ids.has(id))
}
