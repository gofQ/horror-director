import type { Character, Project, Scene, SceneKind, Transition, Trigger } from './schema'

const sc = (
  id: string,
  title: string,
  kind: SceneKind,
  x: number,
  y: number,
  extra: Partial<Scene> = {},
): Scene => ({
  id,
  title,
  kind,
  position: { x, y },
  description: '',
  unrealLevel: '',
  ambience: '',
  duration: 120,
  loop: { enabled: false, maxIterations: 0, exitCondition: '' },
  triggers: [],
  characterStates: {},
  ...extra,
})

const tr = (
  id: string,
  source: string,
  target: string,
  label: string,
  style: Transition['style'] = 'cut',
  condition = '',
): Transition => ({ id, source, target, label, style, condition, duration: 1 })

const tg = (
  id: string,
  name: string,
  kind: Trigger['kind'],
  time: number,
  intensity: number,
  description = '',
): Trigger => ({ id, name, kind, time, intensity, description, condition: '', once: true })

const characters: Character[] = [
  {
    id: 'chr_player',
    name: 'Elena',
    role: 'player',
    color: '#7aa2f7',
    description: 'Insomniac night-shift nurse returning to her childhood apartment.',
    states: [
      { id: 'st_calm', name: 'Composed', behavior: 'Normal movement, steady breathing.', aggression: 0 },
      { id: 'st_uneasy', name: 'Uneasy', behavior: 'Camera sway, quickened breath, flashlight flicker.', aggression: 0 },
      { id: 'st_panic', name: 'Panicked', behavior: 'Sprint drain, tunnel vision, audio muffling.', aggression: 0 },
    ],
  },
  {
    id: 'chr_watcher',
    name: 'The Watcher',
    role: 'entity',
    color: '#e0334c',
    description: 'A tall figure seen only at the edge of vision. Mirrors Elena’s mother.',
    states: [
      { id: 'st_dormant', name: 'Dormant', behavior: 'Absent; only environmental hints.', aggression: 0 },
      { id: 'st_stalk', name: 'Stalking', behavior: 'Appears at distance, vanishes when looked at.', aggression: 4 },
      { id: 'st_hunt', name: 'Hunting', behavior: 'Pursues on sound, teleports behind on blackout.', aggression: 9 },
    ],
  },
  {
    id: 'chr_child',
    name: 'Little Mara',
    role: 'npc',
    color: '#bb9af7',
    description: 'Childhood memory of Elena’s sister; guides or misleads.',
    states: [
      { id: 'st_guide', name: 'Guiding', behavior: 'Hums a lullaby, leads toward the exit.', aggression: 0 },
      { id: 'st_mislead', name: 'Misleading', behavior: 'Points the wrong way, laughs out of sync.', aggression: 2 },
    ],
  },
]

export function sampleProject(): Project {
  const scenes: Scene[] = [
    sc('s_hall', 'Apartment Hallway', 'reality', 60, 180, {
      description: 'Elena arrives. The corridor lights buzz; her door is ajar.',
      unrealLevel: '/Game/Maps/L_Hallway',
      ambience: 'Distant TV static, fluorescent hum',
      duration: 90,
      characterStates: { chr_player: 'st_calm', chr_watcher: 'st_dormant' },
      triggers: [
        tg('t1', 'Lights flicker', 'environment', 20, 3, 'Hall lights stutter once.'),
        tg('t2', 'Door creak', 'audio', 55, 4, 'Apartment door swings open on its own.'),
      ],
    }),
    sc('s_living', 'Living Room', 'reality', 380, 80, {
      description: 'Dust sheets over furniture. A lullaby music box plays somewhere.',
      unrealLevel: '/Game/Maps/L_Living',
      ambience: 'Music box, creaking floorboards',
      characterStates: { chr_player: 'st_uneasy', chr_watcher: 'st_dormant' },
      triggers: [
        tg('t3', 'Music box starts', 'audio', 15, 3),
        tg('t4', 'Figure in window', 'visual', 60, 6, 'The Watcher glimpsed in reflection.'),
        tg('t5', 'Sheet falls', 'jumpscare', 95, 8, 'Dust sheet drops, revealing a chair facing the wall.'),
      ],
    }),
    sc('s_bed', 'Childhood Bedroom', 'dream', 700, 60, {
      description: 'The room is too large. Wallpaper breathes. Mara sits on the bed.',
      unrealLevel: '/Game/Maps/L_DreamBedroom',
      ambience: 'Slowed lullaby, heartbeat',
      duration: 150,
      characterStates: { chr_player: 'st_uneasy', chr_child: 'st_guide', chr_watcher: 'st_stalk' },
      triggers: [
        tg('t6', 'Room stretches', 'visual', 10, 4),
        tg('t7', 'Mara whispers', 'narrative', 40, 5, 'Reveals the closet is not safe.'),
        tg('t8', 'Closet bursts open', 'jumpscare', 110, 9),
      ],
    }),
    sc('s_loop', 'Endless Corridor', 'nightmare', 700, 330, {
      description: 'The hallway repeats. Door numbers shift. Only counting steps breaks the loop.',
      unrealLevel: '/Game/Maps/L_Loop',
      ambience: 'Footsteps that are not yours',
      loop: { enabled: true, maxIterations: 4, exitCondition: 'Player turns around and closes eyes for 5s' },
      characterStates: { chr_player: 'st_panic', chr_child: 'st_mislead', chr_watcher: 'st_hunt' },
      triggers: [
        tg('t9', 'Footsteps behind', 'audio', 12, 5),
        tg('t10', 'Watcher at far end', 'ai', 45, 7, 'Watcher spawns at corridor end, advances when unobserved.'),
        tg('t11', 'Blackout', 'environment', 80, 8, 'All light cut for 3s; Watcher repositions.'),
      ],
    }),
    sc('s_memory', 'Hospital Memory', 'memory', 1020, 200, {
      description: 'Flashback: Mara’s final night. The truth about the lullaby.',
      unrealLevel: '/Game/Maps/L_Memory',
      ambience: 'Monitor beeps, muffled voices',
      characterStates: { chr_player: 'st_uneasy', chr_child: 'st_guide', chr_watcher: 'st_stalk' },
      triggers: [tg('t12', 'Monitor flatline', 'audio', 70, 7)],
    }),
    sc('s_wake', 'Wake on the Couch', 'reality', 380, 330, {
      description: 'Elena jolts awake. Something has been moved.',
      unrealLevel: '/Game/Maps/L_Living',
      ambience: 'Silence, ringing ears',
      duration: 60,
      characterStates: { chr_player: 'st_panic', chr_watcher: 'st_stalk' },
      triggers: [tg('t13', 'Chair now faces her', 'visual', 30, 6)],
    }),
    sc('s_end_free', 'Ending: Let Go', 'ending', 1340, 120, {
      description: 'Elena forgives herself. Dawn. The Watcher fades.',
      unrealLevel: '/Game/Maps/L_EndDawn',
      duration: 60,
    }),
    sc('s_end_trapped', 'Ending: Forever Asleep', 'ending', 1340, 320, {
      description: 'The loop closes. Elena never wakes.',
      unrealLevel: '/Game/Maps/L_EndLoop',
      duration: 45,
    }),
  ]
  const transitions: Transition[] = [
    tr('e1', 's_hall', 's_living', 'Enter apartment'),
    tr('e2', 's_living', 's_bed', 'Follow the lullaby', 'fade', 'Music box inspected'),
    tr('e3', 's_living', 's_wake', 'Fall asleep / blackout', 'blackout'),
    tr('e4', 's_wake', 's_bed', 'Drift back under', 'morph'),
    tr('e5', 's_bed', 's_loop', 'Open the closet', 'glitch', 'Closet jumpscare seen'),
    tr('e6', 's_loop', 's_loop', 'Wrong door', 'loopback', 'Fail step count'),
    tr('e7', 's_loop', 's_memory', 'Close eyes & count', 'fade', 'Exit condition met'),
    tr('e8', 's_memory', 's_end_free', 'Accept the truth', 'fade', 'Hold hand with Mara'),
    tr('e9', 's_memory', 's_end_trapped', 'Refuse the truth', 'blackout'),
    tr('e10', 's_bed', 's_wake', 'Wake up', 'cut', 'Survive Mara’s warning'),
  ]
  return {
    name: 'The Hollow Apartment (Sample)',
    description: 'Sample psychological horror flow: dream/reality layers, a loop, and two endings.',
    startSceneId: 's_hall',
    scenes,
    transitions,
    characters,
  }
}
