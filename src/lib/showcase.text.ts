/**
 * Human-readable authored text of the showcase project, keyed by the stable ids used in `showcase.ts`. The graph
 * structure (ids, positions, kinds, timings, enums, ports, expressions, asset paths) lives only in the factory, so every
 * language variant shares one graph; a variant is just another `ShowcaseText`.
 */
export interface DirectionText {
  playerBelief: string
  reality: string
  visualContinuity: string
  audioContinuity: string
  reveal: string
  unrealNotes: string
}
export interface SceneText {
  title: string
  description: string
  ambience: string
  /** Loop exit condition (only scenes with a loop). */
  exit?: string
  triggers: Record<string, { name: string; description: string }>
  shots: Record<string, { title: string; sound: string; visual: string }>
  cues: Record<string, { title: string; notes: string }>
}
export interface NodeText {
  title: string
  description: string
  condition?: string
  labelA?: string
  labelB?: string
}
export interface LinkText {
  label: string
  condition?: string
  direction?: DirectionText
}
export interface ShowcaseText {
  name: string
  description: string
  flags: Record<'flag_heard_bell' | 'flag_found_key' | 'flag_trusted_child' | 'flag_reality_broken', { name: string; description: string }>
  characters: Record<
    'chr_elena' | 'chr_watcher' | 'chr_mara',
    { name: string; description: string; states: Record<string, { name: string; behavior: string }> }
  >
  sceneType: { name: string; description: string }
  scenes: Record<'s_cottage' | 's_square' | 's_fog' | 's_cellar' | 's_child' | 's_wake' | 's_end_escape' | 's_end_wake' | 's_end_absorbed', SceneText>
  nodes: Record<
    | 'evt_bell' | 'set_heard' | 'dly_wait' | 'rnd_door' | 'set_key' | 'set_trust' | 'if_expr' | 'seq_break' | 'evt_crack' | 'set_broken'
    | 'ret_0' | 'dly_beat' | 'evt_silence' | 'ret_1' | 'if_free',
    NodeText
  >
  links: Record<string, LinkText>
  comments: Record<'note_guide' | 'note_gate' | 'note_seq', { title: string; text: string }>
}


export const SHOWCASE_EN: ShowcaseText = {
  name: 'The Hollow Village (Showcase)',
  description: 'A village, a false awakening and a reality-breaking event. Demonstrates every authoring feature.',
  flags: {
    flag_heard_bell: { name: 'heardBell', description: 'The player heard the church bell.' },
    flag_found_key: { name: 'foundKey', description: 'The player took the iron key from the fog.' },
    flag_trusted_child: { name: 'trustedChild', description: 'The player followed the child’s counting game.' },
    flag_reality_broken: { name: 'realityBroken', description: 'The false awakening has shattered.' },
  },
  characters: {
    chr_elena: {
      name: 'Elena',
      description: 'A returning villager who cannot remember leaving.',
      states: {
        st_calm: { name: 'Calm', behavior: 'Walks normally, trusts what she sees.' },
        st_uneasy: { name: 'Uneasy', behavior: 'Slower pace, glances over her shoulder.' },
        st_panic: { name: 'Panicking', behavior: 'Sprints, camera shakes, breathing audible.' },
      },
    },
    chr_watcher: {
      name: 'The Watcher',
      description: 'A figure that is only ever seen at the edge of vision.',
      states: {
        st_dormant: { name: 'Dormant', behavior: 'Standing still far away, never approaches.' },
        st_stalk: { name: 'Stalking', behavior: 'Moves only while the player looks away.' },
        st_hunt: { name: 'Hunting', behavior: 'Direct pursuit along the nearest path.' },
      },
    },
    chr_mara: {
      name: 'Mara',
      description: 'A child from a memory who guides or misleads.',
      states: {
        st_guide: { name: 'Guiding', behavior: 'Hums a lullaby and leads toward the exit.' },
        st_mislead: { name: 'Misleading', behavior: 'Points the wrong way, laughs out of sync.' },
      },
    },
  },
  sceneType: { name: 'Liminal', description: 'Half-real spaces where geometry quietly disagrees with itself.' },
  scenes: {
    s_cottage: {
      title: 'Cottage Morning',
      description: 'Elena wakes in her childhood cottage. Everything is exactly where she left it.',
      ambience: 'Wood creaks, a kettle ticks as it cools',
      triggers: {
        tg_kettle: { name: 'Kettle whistles with no heat', description: 'The kettle sings although the stove is cold.' },
        tg_window: { name: 'Figure in the window', description: 'A still silhouette stands at the end of the lane.' },
      },
      shots: {
        sh_wake: { title: 'Eyes open', sound: 'Birdsong that loops too evenly.', visual: 'Soft morning light across a pillow.' },
        sh_door: { title: 'Out of the door', sound: 'Door latch, then silence.', visual: 'The lane is empty; every window is dark.' },
      },
      cues: {
        au_birds: { title: 'Looping birdsong', notes: 'The loop point should be just audible.' },
        au_hum: { title: 'Lullaby under the floor', notes: 'Mara’s voice, too quiet to be sure.' },
      },
    },
    s_square: {
      title: 'Village Square',
      description: 'The square is full of villagers who do not turn their heads. The church bell is about to ring.',
      ambience: 'Wind, distant chimes, no voices',
      triggers: { tg_stare: { name: 'Villagers turn together', description: 'Every head turns at once when the bell starts.' } },
      shots: {
        sh_square: { title: 'Crowd that does not react', sound: 'Shuffling steps, no speech.', visual: 'Faces just out of focus.' },
        sh_bell: { title: 'Bell tower', sound: 'The bell rings once, a half-tone flat.', visual: 'The tower is taller than it should be.' },
      },
      cues: { au_chime: { title: 'Distant chimes', notes: '' } },
    },
    s_fog: {
      title: 'Fog Road',
      description: 'A road that was not there. The fog hides the edges; the key is lying in the middle of it.',
      ambience: 'Muffled footsteps, low drone',
      triggers: {
        tg_key: { name: 'The iron key', description: 'A glint on the ground; picking it up is the player’s choice.' },
        tg_follow: { name: 'Footsteps that match hers', description: 'The echo continues one step after Elena stops.' },
      },
      shots: {
        sh_fog: { title: 'Walking into the fog', sound: 'Footsteps echo without a surface.', visual: 'The road bends where no bend exists.' },
        sh_turn: { title: 'Turning back', sound: 'Sudden silence, then breath.', visual: 'The cottage stands where the road should be.' },
      },
      cues: {
        au_echo: { title: 'Echo that follows', notes: 'Pans from behind to the left.' },
        au_dead: { title: 'Dead air', notes: 'Everything cuts out before the echo starts.' },
      },
    },
    s_cellar: {
      title: 'Church Cellar',
      description: 'Doors repeat. A wrong turn walks Elena back into the same cellar; counting with Mara is the way out.',
      ambience: 'Dripping, stone echo, a slow heartbeat',
      exit: 'Elena closes her eyes and counts to ten with Mara.',
      triggers: {
        tg_door: { name: 'The door that leads back', description: 'The correct-looking door opens onto the same cellar.' },
        tg_count: { name: 'Mara starts counting', description: 'A small voice counts down from ten.' },
      },
      shots: { sh_cellar: { title: 'Doors in a row', sound: 'Heartbeat under dripping water.', visual: 'A corridor of identical doors.' } },
      cues: {
        au_heart: { title: 'Heartbeat', notes: 'Speeds up on every loop iteration.' },
        au_count: { title: 'Child counting', notes: '' },
      },
    },
    s_child: {
      title: 'Child’s Room',
      description: 'A memory of the room Elena grew up in. Mara sits on the bed and asks her to remember what happened.',
      ambience: 'Music box, warm tungsten hum',
      triggers: { tg_box: { name: 'Music box stops', description: 'The tune stops one note short of the end.' } },
      shots: { sh_room: { title: 'Mara on the bed', sound: 'Music box, off-key.', visual: 'Warm light that does not match the rest of the village.' } },
      cues: { au_box: { title: 'Music box', notes: '' } },
    },
    s_wake: {
      title: 'False Awakening',
      description: 'Elena wakes in the cottage again. The world looks right. It is not.',
      ambience: 'Room tone, too quiet',
      triggers: { tg_crack: { name: 'A crack in the plaster', description: 'A thin crack runs across the ceiling and keeps growing.' } },
      shots: { sh_wake2: { title: 'Second waking', sound: 'Same birdsong, one bar later.', visual: 'The pillow is still warm from the first morning.' } },
      cues: {},
    },
    s_end_escape: {
      title: 'Ending: Escape',
      description: 'Elena accepts the truth and walks out through the broken wall.',
      ambience: '',
      triggers: { tg_dawn: { name: 'Real dawn', description: 'Genuine daylight, no loops.' } },
      shots: {},
      cues: {},
    },
    s_end_wake: {
      title: 'Ending: Awakening',
      description: 'Elena refuses the truth and wakes — outside the village, years later.',
      ambience: '',
      triggers: { tg_cut: { name: 'Cut to black', description: 'The cottage is gone from the horizon.' } },
      shots: {},
      cues: {},
    },
    s_end_absorbed: {
      title: 'Ending: Absorbed',
      description: 'Without the key or Mara’s trust, the village closes around Elena.',
      ambience: '',
      triggers: { tg_absorb: { name: 'The village closes in', description: 'Every door in the square opens at once.' } },
      shots: {},
      cues: {},
    },
  },
  nodes: {
    evt_bell: { title: 'Bell tolls', description: 'Planning milestone: the church bell rings and the crowd turns.' },
    set_heard: { title: 'Remember the bell', description: '' },
    dly_wait: { title: 'Walk to the door', description: 'Time passes between the square and the door.' },
    rnd_door: { title: 'Does the door open?', description: 'Authored design intent: the door usually opens.', labelA: 'Door opens', labelB: 'Door stays shut' },
    set_key: { title: 'Take the key', description: '' },
    set_trust: { title: 'Trust Mara', description: '' },
    if_expr: { title: 'Did Elena earn the way out?', description: 'Structured condition: (foundKey AND NOT realityBroken) OR trustedChild.' },
    seq_break: { title: 'Reality Break', description: 'Stage 0: the walls crack. Stage 1: silence falls. Then the story continues.' },
    evt_crack: { title: 'Walls breathe', description: '' },
    set_broken: { title: 'Reality breaks', description: '' },
    ret_0: { title: 'Return 0', description: '' },
    dly_beat: { title: 'Held breath', description: '' },
    evt_silence: { title: 'Silence falls', description: '' },
    ret_1: { title: 'Return 1', description: '' },
    if_free: { title: 'Does Elena accept the truth?', description: '', condition: 'Free-text design assumption: player accepts Mara’s story (not evaluated).' },
  },
  links: {
    e1: {
      label: 'Step outside',
      direction: {
        playerBelief: 'Elena believes she is simply leaving home.',
        reality: 'She has never left the village; the lane loops back.',
        visualContinuity: 'Door frame matches the arch of the square.',
        audioContinuity: 'Latch sound bridges into the chimes.',
        reveal: 'The window silhouette is already in the square.',
        unrealNotes: '',
      },
    },
    e2: { label: 'Bell rings' },
    e6: { label: 'Door opens' },
    e7: { label: 'Door stays shut' },
    e9: {
      label: 'Follow the echo',
      direction: {
        playerBelief: 'Elena thinks she is retracing her steps.',
        reality: 'The road ends in the church cellar.',
        visualContinuity: 'Fog thins into cellar steam.',
        audioContinuity: 'The echo becomes dripping water.',
        reveal: 'The cellar door is the cottage door.',
        unrealNotes: 'Reuse the cottage door asset (TBD).',
      },
    },
    e10: { label: 'Wrong door', condition: 'Fail the counting step' },
    e11: { label: 'Close eyes & count', condition: 'Exit condition met' },
    e13: { label: 'Mara asks you to remember' },
    e14: { label: 'Way out earned' },
    e15: { label: 'No key, no trust' },
    e16: { label: 'The crack grows' },
    e24: { label: 'Accept the truth' },
    e25: { label: 'Refuse the truth' },
  },
  comments: {
    note_guide: { title: 'Start here', text: 'Cottage → Square → Event → Delay → Random door. Hover nodes and open the Inspector.' },
    note_gate: { title: 'Flag gate', text: 'The IF reads foundKey, realityBroken and trustedChild. Take the Door-opens path to see it pass.' },
    note_seq: { title: 'Ordered Sequence', text: 'Then 0 runs fully, returns, then Then 1 runs. Completed continues the story.' },
  },
}
